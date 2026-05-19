/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
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
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("agenda_calendarios")
      .select("id, nome, timezone, duracao_minutos, intervalo_minutos, janela_dias, status")
      .eq("empresa_id", usuario.empresa_id)
      .eq("status", "ativo")
      .order("nome", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao buscar agendas: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      agendas: data || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno ao buscar agendas." },
      { status: 500 }
    );
  }
}
