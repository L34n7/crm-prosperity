/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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

export async function GET() {
  try {
    const result = await getUsuarioContexto();
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status }
      );
    }

    const companyId = result.usuario.empresa_id;
    if (!companyId) {
      return NextResponse.json(
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const [integrationsResult, templatesResult, flowsResult] = await Promise.all([
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
        .select("id, nome, status")
        .eq("empresa_id", companyId)
        .neq("status", "arquivado")
        .order("nome", { ascending: true }),
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

    const integrations = (integrationsResult.data || [])
      .filter((integration: any) => Boolean(integration.phone_number_id))
      .map((integration: any) => ({
        id: integration.id,
        nome_conexao: integrationLabel(integration),
        nome_original: integration.nome_conexao,
        numero: integration.numero,
        modo_integracao: integration.modo_integracao,
      }));

    const templates = (templatesResult.data || [])
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

    return NextResponse.json({
      ok: true,
      integracoes: integrations,
      templates,
      fluxos: flowsResult.data || [],
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
