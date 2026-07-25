import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const contexto = await getUsuarioContexto();

    if (!contexto.ok) {
      return NextResponse.json(
        { ok: false, error: contexto.error },
        { status: contexto.status }
      );
    }

    const empresaId = contexto.usuario.empresa_id;
    if (!empresaId) {
      return NextResponse.json(
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: agenda } = await supabase
      .from("agenda_calendarios")
      .select("id")
      .eq("id", id)
      .eq("empresa_id", empresaId)
      .maybeSingle();

    if (!agenda) {
      return NextResponse.json(
        { ok: false, error: "Agenda nao encontrada." },
        { status: 404 }
      );
    }

    const { data: vinculos, error } = await supabase
      .from("agenda_google_eventos")
      .select(
        "agendamento_id, google_event_id, google_html_link, conflito_status, conflito_detalhes, google_updated_at, updated_at"
      )
      .eq("empresa_id", empresaId)
      .eq("agenda_id", id);

    if (error) {
      throw new Error(`Erro ao listar vínculos do Google: ${error.message}`);
    }

    const ids = (vinculos || []).map((item: { agendamento_id: string }) => item.agendamento_id);
    const agendamentosPorId = new Map<string, Record<string, unknown>>();

    if (ids.length > 0) {
      const { data: agendamentos, error: agendamentosError } = await supabase
        .from("agenda_agendamentos")
        .select("id, titulo, inicio_at, fim_at, status")
        .eq("empresa_id", empresaId)
        .eq("agenda_id", id)
        .in("id", ids);

      if (agendamentosError) {
        throw new Error(
          `Erro ao listar agendamentos vinculados: ${agendamentosError.message}`
        );
      }

      for (const agendamento of agendamentos || []) {
        agendamentosPorId.set(agendamento.id, agendamento);
      }
    }

    return NextResponse.json({
      ok: true,
      vinculos: (vinculos || [])
        .map((vinculo: Record<string, unknown> & { agendamento_id: string }) => ({
          ...vinculo,
          agendamento: agendamentosPorId.get(vinculo.agendamento_id) || null,
        }))
        .filter((vinculo: { agendamento: unknown }) => vinculo.agendamento),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao consultar eventos vinculados ao Google.",
      },
      { status: 500 }
    );
  }
}
