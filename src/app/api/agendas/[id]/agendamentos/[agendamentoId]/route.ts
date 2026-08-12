/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sincronizarAgendamentoGoogleCalendar } from "@/lib/agendas/google-calendar";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; agendamentoId: string }> }
) {
  try {
    const { id, agendamentoId } = await params;
    const resultado = await getUsuarioContexto();

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const { usuario } = resultado;
    const bloqueio = bloquearSemPermissao(
      usuario,
      "agendas.gerenciar_agendamentos",
      "Você não tem permissão para alterar agendamentos.",
    );
    if (bloqueio) return bloqueio;

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const status = String(body?.status || "").trim();
    const atualizacao: Record<string, any> = {
      updated_at: new Date().toISOString(),
      updated_by: usuario.id,
    };

    const supabase = getSupabaseAdmin();

    if (status) {
      if (!["agendado", "confirmado", "cancelado", "realizado", "faltou"].includes(status)) {
        return NextResponse.json(
          { ok: false, error: "Status de agendamento invalido." },
          { status: 400 }
        );
      }

      atualizacao.status = status;

      const { data: atual } = await supabase
        .from("agenda_agendamentos")
        .select("status,metadata_json")
        .eq("empresa_id", usuario.empresa_id)
        .eq("agenda_id", id)
        .eq("id", agendamentoId)
        .maybeSingle();

      if (atual && atual.status !== status) {
        atualizacao.metadata_json = {
          ...(atual.metadata_json || {}),
          confirmacao_whatsapp: null,
        };
      }
    }

    if (body?.observacoes !== undefined) {
      const observacoes = String(body.observacoes || "").trim();
      atualizacao.observacoes = observacoes || null;
    }

    const { data, error } = await supabase
      .from("agenda_agendamentos")
      .update(atualizacao)
      .eq("empresa_id", usuario.empresa_id)
      .eq("agenda_id", id)
      .eq("id", agendamentoId)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao atualizar agendamento: ${error.message}` },
        { status: 500 }
      );
    }

    await sincronizarAgendamentoGoogleCalendar({
      empresaId: usuario.empresa_id,
      agendamentoId: data.id,
    }).catch((syncError) =>
      console.error("[GOOGLE_CALENDAR] Erro ao atualizar evento:", syncError)
    );

    return NextResponse.json({
      ok: true,
      agendamento: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro interno ao atualizar agendamento.",
      },
      { status: 500 }
    );
  }
}
