import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizarHorarioAtendimento } from "@/lib/agentes-ia/horario-atendimento";

const supabaseAdmin = getSupabaseAdmin();

export async function PATCH(request: Request) {
  try {
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
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const agenteId = String(body.id || "").trim();
    if (!agenteId) {
      return NextResponse.json({ ok: false, error: "id é obrigatório." }, { status: 400 });
    }

    const horario = normalizarHorarioAtendimento(body.horarios);
    if (horario.ativo && horario.dias.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Selecione pelo menos um dia de atendimento." },
        { status: 400 }
      );
    }
    if (horario.ativo && horario.inicio === horario.fim) {
      return NextResponse.json(
        { ok: false, error: "O horário inicial e final precisam ser diferentes." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("agentes_ia")
      .update({
        horarios: horario,
        updated_by: contexto.usuario.id,
        updated_at: new Date().toISOString(),
      })
      .eq("empresa_id", empresaId)
      .eq("id", agenteId)
      .neq("status", "arquivado")
      .select("id, horarios")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Agente não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, agente: data });
  } catch (error) {
    console.error("[AGENTES_IA_HORARIO] PATCH:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro ao salvar horário do agente.",
      },
      { status: 500 }
    );
  }
}
