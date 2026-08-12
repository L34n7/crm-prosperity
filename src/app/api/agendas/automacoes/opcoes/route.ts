/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  calendarIntegrationIds,
  flowSupportsCalendar,
  readIntegrationScope,
} from "@/lib/agendas/integration-scope";
import {
  extractTemplateBody,
  extractTemplateQuickReplyButtons,
  extractTemplateVariablePositions,
  normalizeText,
} from "@/lib/agendas/template-mapping";

function integrationLabel(integration: any) {
  const name = String(integration?.nome_conexao || "WhatsApp").trim();
  const number = String(integration?.numero || "").trim();
  const mode =
    String(integration?.modo_integracao || "").toLowerCase() === "coexistence"
      ? "Coexistência"
      : "Cloud API";
  return [name, number, mode].filter(Boolean).join(" · ");
}

function variableMetadata(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function GET(request: NextRequest) {
  try {
    const result = await getUsuarioContexto();
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status }
      );
    }
    const bloqueio = bloquearSemPermissao(result.usuario, "agendas.visualizar");
    if (bloqueio) return bloqueio;

    const companyId = result.usuario.empresa_id;
    if (!companyId) {
      return NextResponse.json(
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 }
      );
    }

    const agendaId = String(
      new URL(request.url).searchParams.get("agenda_id") || ""
    ).trim();
    const supabase = getSupabaseAdmin();
    const agendaResult = agendaId
      ? await supabase
          .from("calendarios")
          .select("id, metadata_json")
          .eq("empresa_id", companyId)
          .eq("id", agendaId)
          .maybeSingle()
      : { data: null, error: null };

    if (agendaId && (agendaResult.error || !agendaResult.data)) {
      return NextResponse.json(
        { ok: false, error: "Calendário não encontrado." },
        { status: 404 }
      );
    }

    const [
      integrationsResult,
      templatesResult,
      flowsResult,
      variablesResult,
    ] = await Promise.all([
      supabase
        .from("integracoes_whatsapp")
        .select(
          "id, nome_conexao, numero, status, provider, modo_integracao, coex_status, phone_number_id"
        )
        .eq("empresa_id", companyId)
        .or("status.eq.ativa,coex_status.eq.ativo")
        .order("nome_conexao", { ascending: true }),
      supabase
        .from("whatsapp_templates")
        .select(
          "id, nome, idioma, categoria, status, integracao_whatsapp_id, payload"
        )
        .eq("empresa_id", companyId)
        .in("status", ["approved", "APPROVED", "aprovado"])
        .order("nome", { ascending: true }),
      supabase
        .from("automacao_fluxos")
        .select("id, nome, status, configuracao_json")
        .eq("empresa_id", companyId)
        .eq("status", "ativo")
        .order("nome", { ascending: true }),
      supabase
        .from("automacao_variaveis")
        .select("id, chave, valor, metadata_json, created_at, updated_at")
        .eq("empresa_id", companyId)
        .is("execucao_id", null)
        .is("contato_id", null)
        .eq("metadata_json->>tipo", "global_empresa")
        .eq("metadata_json->>ativo", "true")
        .order("created_at", { ascending: false }),
    ]);

    if (integrationsResult.error) {
      throw new Error(
        `Erro ao buscar integrações: ${integrationsResult.error.message}`
      );
    }
    if (templatesResult.error) {
      throw new Error(`Erro ao buscar templates: ${templatesResult.error.message}`);
    }
    if (flowsResult.error) {
      throw new Error(`Erro ao buscar fluxos: ${flowsResult.error.message}`);
    }
    if (variablesResult.error) {
      throw new Error(`Erro ao buscar variáveis: ${variablesResult.error.message}`);
    }

    const integrations = (integrationsResult.data || [])
      .filter((integration: any) => Boolean(integration.phone_number_id))
      .map((integration: any) => ({
        id: integration.id,
        nome_conexao: integrationLabel(integration),
        nome_original: integration.nome_conexao,
        numero: integration.numero,
        modo_integracao: integration.modo_integracao,
      }));

    const explicitCalendarIds = calendarIntegrationIds(
      agendaResult.data?.metadata_json
    );
    const calendarIds =
      explicitCalendarIds.length > 0
        ? explicitCalendarIds.filter((id) =>
            integrations.some((item: any) => item.id === id)
          )
        : integrations.map((item: any) => String(item.id));

    const allTemplates = (templatesResult.data || [])
      .filter((template: any) =>
        ["utility", "marketing"].includes(normalizeText(template.categoria))
      )
      .map((template: any) => {
        const quickReplies = extractTemplateQuickReplyButtons(template.payload);
        return {
          id: template.id,
          nome: template.nome,
          idioma: template.idioma,
          categoria: String(template.categoria || "").toUpperCase(),
          status: template.status,
          integracao_whatsapp_id: template.integracao_whatsapp_id,
          corpo: extractTemplateBody(template.payload),
          variaveis: extractTemplateVariablePositions(template.payload),
          botoes: quickReplies.map((item) => item.texto),
          botoes_detalhados: quickReplies,
        };
      });

    const allFlows = (flowsResult.data || []).map((flow: any) => {
      const scope = readIntegrationScope(flow.configuracao_json);
      return {
        id: flow.id,
        nome: flow.nome,
        status: flow.status,
        modo_integracoes: scope.modo,
        integracao_whatsapp_ids: scope.ids,
      };
    });

    const variables = (variablesResult.data || []).map((item: any) => {
      const metadata = variableMetadata(item.metadata_json);
      return {
        id: item.id,
        chave: String(item.chave || ""),
        valor: String(item.valor || ""),
        descricao: String(metadata.descricao || ""),
        escopo: String(metadata.escopo || "global"),
        ativo: metadata.ativo !== false,
        created_at: item.created_at,
        updated_at: item.updated_at,
      };
    });

    return NextResponse.json({
      ok: true,
      integracoes: integrations,
      agenda_integracao_whatsapp_ids: calendarIds,
      templates: allTemplates.filter((template: any) =>
        calendarIds.includes(String(template.integracao_whatsapp_id))
      ),
      todos_templates: allTemplates,
      fluxos: allFlows.filter((flow: any) =>
        flowSupportsCalendar(
          {
            integracoes_whatsapp: {
              modo: flow.modo_integracoes,
              ids: flow.integracao_whatsapp_ids,
            },
          },
          calendarIds
        )
      ),
      todos_fluxos: allFlows,
      variaveis: variables,
      execucao_automatica_ativa: true,
      total_integracoes: integrations.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao carregar opções das automações da agenda.",
      },
      { status: 500 }
    );
  }
}
