/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { listarEventosExternosGoogleCalendar } from "@/lib/agendas/google-calendar";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const { searchParams } = new URL(request.url);
    const inicioAt = String(searchParams.get("inicio_at") || "");
    const fimAt = String(searchParams.get("fim_at") || "");

    if (
      Number.isNaN(new Date(inicioAt).getTime()) ||
      Number.isNaN(new Date(fimAt).getTime())
    ) {
      return NextResponse.json(
        { ok: false, error: "Informe um periodo valido." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: agenda } = await supabase
      .from("agenda_calendarios")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("id", id)
      .maybeSingle();

    if (!agenda) {
      return NextResponse.json(
        { ok: false, error: "Agenda nao encontrada." },
        { status: 404 }
      );
    }

    const eventos = await listarEventosExternosGoogleCalendar({
      empresaId,
      agendaId: id,
      inicioAt: new Date(inicioAt).toISOString(),
      fimAt: new Date(fimAt).toISOString(),
    });

    return NextResponse.json({ ok: true, eventos });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro ao buscar eventos do Google." },
      { status: 500 }
    );
  }
}
