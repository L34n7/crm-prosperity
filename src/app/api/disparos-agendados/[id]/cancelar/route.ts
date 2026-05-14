import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID do disparo não informado." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: agendamento, error: buscarError } = await supabase
      .from("automacao_agendamentos")
      .select("id, status, tipo_agendamento, payload_json")
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id)
      .eq("tipo_agendamento", "disparo_template")
      .maybeSingle();

    if (buscarError) {
      return NextResponse.json(
        { ok: false, error: "Erro ao buscar disparo." },
        { status: 500 }
      );
    }

    if (!agendamento) {
      return NextResponse.json(
        { ok: false, error: "Disparo agendado não encontrado." },
        { status: 404 }
      );
    }

    if (agendamento.status !== "pendente") {
      return NextResponse.json(
        { ok: false, error: "Apenas disparos pendentes podem ser cancelados." },
        { status: 400 }
      );
    }

    const agora = new Date().toISOString();

    const { data, error } = await supabase
      .from("automacao_agendamentos")
      .update({
        status: "cancelado",
        payload_json: {
          ...(agendamento.payload_json || {}),
          cancelado_em: agora,
          cancelado_por: usuario.id || null,
          origem_cancelamento: "pagina_disparos_agendados",
        },
      })
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id)
      .eq("status", "pendente")
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Erro ao cancelar disparo." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      disparo: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro ao cancelar disparo.",
      },
      { status: 500 }
    );
  }
}