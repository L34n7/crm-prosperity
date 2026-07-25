/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function botoesDoTemplate(payload: unknown) {
  const componentes = Array.isArray((payload as any)?.components)
    ? (payload as any).components
    : [];
  const componente = componentes.find(
    (item: any) => String(item?.type || "").toUpperCase() === "BUTTONS"
  );

  return Array.isArray(componente?.buttons)
    ? componente.buttons
        .map((item: any) => String(item?.text || "").trim())
        .filter(Boolean)
    : [];
}

export async function GET() {
  try {
    const resultado = await getUsuarioContexto();
    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const empresaId = resultado.usuario.empresa_id;
    if (!empresaId) {
      return NextResponse.json(
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const [integracoesResult, templatesResult, fluxosResult] = await Promise.all([
      supabase
        .from("integracoes_whatsapp")
        .select("id, nome_conexao, status, provider, modo_integracao")
        .eq("empresa_id", empresaId)
        .eq("status", "ativa")
        .order("nome_conexao", { ascending: true }),
      supabase
        .from("whatsapp_templates")
        .select("id, nome, idioma, categoria, status, integracao_whatsapp_id, payload")
        .eq("empresa_id", empresaId)
        .ilike("status", "approved")
        .ilike("categoria", "utility")
        .order("nome", { ascending: true }),
      supabase
        .from("automacao_fluxos")
        .select("id, nome, status")
        .eq("empresa_id", empresaId)
        .neq("status", "arquivado")
        .order("nome", { ascending: true }),
    ]);

    if (integracoesResult.error) {
      throw new Error(`Erro ao buscar integrações: ${integracoesResult.error.message}`);
    }
    if (templatesResult.error) {
      throw new Error(`Erro ao buscar templates: ${templatesResult.error.message}`);
    }
    if (fluxosResult.error) {
      throw new Error(`Erro ao buscar fluxos: ${fluxosResult.error.message}`);
    }

    return NextResponse.json({
      ok: true,
      integracoes: integracoesResult.data || [],
      templates: (templatesResult.data || []).map((template: any) => ({
        id: template.id,
        nome: template.nome,
        idioma: template.idioma,
        categoria: template.categoria,
        status: template.status,
        integracao_whatsapp_id: template.integracao_whatsapp_id,
        botoes: botoesDoTemplate(template.payload),
      })),
      fluxos: fluxosResult.data || [],
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
