/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function templateButtons(payload: unknown) {
  const components = Array.isArray((payload as any)?.components)
    ? (payload as any).components
    : [];
  const component = components.find(
    (item: any) => String(item?.type || "").toUpperCase() === "BUTTONS"
  );

  return Array.isArray(component?.buttons)
    ? component.buttons
        .filter(
          (item: any) => String(item?.type || "").toUpperCase() === "QUICK_REPLY"
        )
        .map((item: any) => String(item?.text || "").trim())
        .filter(Boolean)
    : [];
}

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
        .ilike("status", "approved")
        .ilike("categoria", "utility")
        .order("nome", { ascending: true }),
      supabase
        .from("automacao_fluxos")
        .select("id, nome, status")
        .eq("empresa_id", companyId)
        .eq("status", "ativo")
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

    return NextResponse.json({
      ok: true,
      integracoes: integrations,
      templates: (templatesResult.data || []).map((template: any) => ({
        id: template.id,
        nome: template.nome,
        idioma: template.idioma,
        categoria: template.categoria,
        status: template.status,
        integracao_whatsapp_id: template.integracao_whatsapp_id,
        botoes: templateButtons(template.payload),
      })),
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
