/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listarSlotsDisponiveis } from "@/lib/agendas/agenda-service";

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

    const { usuario } = resultado;

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const supabase = getSupabaseAdmin();
    const resultadoSlots = await listarSlotsDisponiveis({
      supabase,
      empresaId: usuario.empresa_id,
      agendaId: id,
      data: searchParams.get("data"),
      janelaDias: Number(searchParams.get("janela_dias") || 14),
      limite: Number(searchParams.get("limite") || 12),
    });

    return NextResponse.json({
      ok: true,
      agenda: resultadoSlots.agenda,
      slots: resultadoSlots.slots,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno ao buscar horarios." },
      { status: 500 }
    );
  }
}
