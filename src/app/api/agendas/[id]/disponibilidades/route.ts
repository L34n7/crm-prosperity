/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function horaValida(valor: string) {
  return /^\d{2}:\d{2}$/.test(valor);
}

export async function GET(
  _request: NextRequest,
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

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("agenda_disponibilidades")
      .select("*")
      .eq("empresa_id", usuario.empresa_id)
      .eq("agenda_id", id)
      .order("dia_semana", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao buscar horarios: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      disponibilidades: data || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno ao buscar horarios." },
      { status: 500 }
    );
  }
}

export async function PUT(
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

    const body = await request.json();
    const disponibilidades = Array.isArray(body?.disponibilidades)
      ? body.disponibilidades
      : [];

    const supabase = getSupabaseAdmin();

    const { data: agenda } = await supabase
      .from("agenda_calendarios")
      .select("id")
      .eq("empresa_id", usuario.empresa_id)
      .eq("id", id)
      .maybeSingle();

    if (!agenda) {
      return NextResponse.json(
        { ok: false, error: "Agenda nao encontrada." },
        { status: 404 }
      );
    }

    const agora = new Date().toISOString();
    const registros = disponibilidades.map((item: any) => {
      const diaSemana = Number(item.dia_semana);
      const horaInicio = String(item.hora_inicio || "09:00").slice(0, 5);
      const horaFim = String(item.hora_fim || "18:00").slice(0, 5);

      if (
        !Number.isInteger(diaSemana) ||
        diaSemana < 0 ||
        diaSemana > 6 ||
        !horaValida(horaInicio) ||
        !horaValida(horaFim) ||
        horaFim <= horaInicio
      ) {
        throw new Error("Disponibilidade invalida.");
      }

      return {
        empresa_id: usuario.empresa_id,
        agenda_id: id,
        dia_semana: diaSemana,
        hora_inicio: horaInicio,
        hora_fim: horaFim,
        ativo: item.ativo !== false,
        updated_at: agora,
      };
    });

    if (registros.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Informe pelo menos um horario de disponibilidade." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("agenda_disponibilidades")
      .upsert(registros, { onConflict: "agenda_id,dia_semana" })
      .select("*");

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao salvar horarios: ${error.message}` },
        { status: 500 }
      );
    }

    await supabase
      .from("agenda_calendarios")
      .update({
        updated_at: agora,
        updated_by: usuario.id,
      })
      .eq("empresa_id", usuario.empresa_id)
      .eq("id", id);

    return NextResponse.json({
      ok: true,
      disponibilidades: data || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno ao salvar horarios." },
      { status: 500 }
    );
  }
}
