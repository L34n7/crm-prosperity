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
        .select("id, nome_conexao, status, provider, modo_integracao")
        .eq("empresa_id", companyId)
        .eq("status", "ativa")
        .not("phone_number_id", "is", null)
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

    return NextResponse.json({
      ok: true,
      integracoes: integrationsResult.data || [],
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
