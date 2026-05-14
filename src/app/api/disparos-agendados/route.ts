import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const resultado = await getUsuarioContexto();

    if (!resultado.ok) {
    return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
    );
    }

    const { usuario } = resultado;

    if (!usuario.empresa_id) {
    return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
    );
    }

    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status") || "todos";
    const busca = String(searchParams.get("busca") || "").trim();

    let query = supabase
      .from("automacao_agendamentos")
      .select(
        `
        id,
        empresa_id,
        execucao_id,
        fluxo_id,
        no_id,
        tipo_agendamento,
        executar_em,
        status,
        payload_json,
        created_at,
        executed_at,
        automacao_fluxos (
          id,
          nome
        ),
        automacao_nos (
          id,
          titulo,
          tipo_no
        )
      `
      )
      .eq("empresa_id", usuario.empresa_id)
      .eq("tipo_agendamento", "disparo_template")
      .order("created_at", { ascending: false });

    if (status !== "todos") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[DISPAROS AGENDADOS] Erro ao listar:", error);

      return NextResponse.json(
        { ok: false, error: "Erro ao buscar disparos agendados." },
        { status: 500 }
      );
    }

    let disparos = data || [];

    const templateIds = Array.from(
      new Set(
        disparos
          .map((item: any) => String(item.payload_json?.template_id || "").trim())
          .filter(Boolean)
      )
    );

    let templatesPorId = new Map<string, any>();

    if (templateIds.length > 0) {
      const { data: templates, error: templatesError } = await supabase
        .from("whatsapp_templates")
        .select("id, nome, idioma, payload")
        .eq("empresa_id", usuario.empresa_id)
        .in("id", templateIds);

      if (!templatesError) {
        templatesPorId = new Map(
          (templates || []).map((template: any) => [template.id, template])
        );
      }
    }

    disparos = disparos.map((item: any) => {
      const payload = item.payload_json || {};
      const templateId = String(payload.template_id || "").trim();
      const template = templatesPorId.get(templateId);

      return {
        ...item,
        payload_json: {
          ...payload,
          template_nome: payload.template_nome || template?.nome || null,
          template_idioma: payload.template_idioma || template?.idioma || null,
          template_payload: payload.template_payload || template?.payload || null,
        },
      };
    });

    if (busca) {
      const buscaLower = busca.toLowerCase();

      disparos = disparos.filter((item: any) => {
        const payload = item.payload_json || {};

        return (
          String(payload.template_nome || "").toLowerCase().includes(buscaLower) ||
          String(payload.numero_destino || "").toLowerCase().includes(buscaLower) ||
          String(payload.contato_nome || "").toLowerCase().includes(buscaLower) ||
          String(item.automacao_fluxos?.nome || "").toLowerCase().includes(buscaLower)
        );
      });
    }

    return NextResponse.json({
      ok: true,
      disparos,
    });
  } catch (error: any) {
    console.error("[DISPAROS AGENDADOS] Erro geral:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro ao buscar disparos agendados.",
      },
      { status: 500 }
    );
  }
}