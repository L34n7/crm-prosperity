/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  criarStateGoogleCalendar,
  criarUrlAutorizacaoGoogleCalendar,
  sincronizarAgendaGoogleCalendar,
} from "@/lib/agendas/google-calendar";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

async function contextoAgenda(id: string) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) return resultado;
  if (!resultado.usuario.empresa_id) {
    return { ok: false as const, error: "Usuario sem empresa vinculada.", status: 400 };
  }

  const supabase = getSupabaseAdmin();
  const { data: agenda } = await supabase
    .from("agenda_calendarios")
    .select("id")
    .eq("empresa_id", resultado.usuario.empresa_id)
    .eq("id", id)
    .maybeSingle();

  if (!agenda) return { ok: false as const, error: "Agenda nao encontrada.", status: 404 };

  return { ok: true as const, usuario: resultado.usuario, supabase };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const contexto = await contextoAgenda(id);

    if (!contexto.ok) {
      return NextResponse.json({ ok: false, error: contexto.error }, { status: contexto.status });
    }

    if (new URL(request.url).searchParams.get("acao") === "conectar") {
      const state = criarStateGoogleCalendar({
        agendaId: id,
        empresaId: contexto.usuario.empresa_id!,
        usuarioId: contexto.usuario.id,
      });

      return NextResponse.redirect(criarUrlAutorizacaoGoogleCalendar(state));
    }

    const { data: integracao } = await contexto.supabase
      .from("agenda_google_integracoes")
      .select("google_email, sync_ativo, conectado_em, ultima_sincronizacao_em")
      .eq("empresa_id", contexto.usuario.empresa_id)
      .eq("agenda_id", id)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      integracao: integracao
        ? {
            conectado: true,
            email: integracao.google_email,
            sync_ativo: integracao.sync_ativo,
            conectado_em: integracao.conectado_em,
            ultima_sincronizacao_em: integracao.ultima_sincronizacao_em,
          }
        : { conectado: false },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro ao consultar Google Calendar." },
      { status: 500 }
    );
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const contexto = await contextoAgenda(id);

    if (!contexto.ok) {
      return NextResponse.json({ ok: false, error: contexto.error }, { status: contexto.status });
    }

    await sincronizarAgendaGoogleCalendar({
      empresaId: contexto.usuario.empresa_id!,
      agendaId: id,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro ao sincronizar Google Calendar." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const contexto = await contextoAgenda(id);

    if (!contexto.ok) {
      return NextResponse.json({ ok: false, error: contexto.error }, { status: contexto.status });
    }

    const { error } = await contexto.supabase
      .from("agenda_google_integracoes")
      .delete()
      .eq("empresa_id", contexto.usuario.empresa_id)
      .eq("agenda_id", id);

    if (error) throw new Error(`Erro ao desvincular Google Calendar: ${error.message}`);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro ao desvincular Google Calendar." },
      { status: 500 }
    );
  }
}
