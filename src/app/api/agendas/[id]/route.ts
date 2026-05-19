/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const TIMEZONE_PADRAO = "America/Sao_Paulo";

function normalizarInteiro(valor: unknown, padrao: number, minimo: number, maximo: number) {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) return padrao;

  return Math.max(minimo, Math.min(maximo, Math.round(numero)));
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

    const { data: agenda, error } = await supabase
      .from("agenda_calendarios")
      .select("*")
      .eq("empresa_id", usuario.empresa_id)
      .eq("id", id)
      .maybeSingle();

    if (error || !agenda) {
      return NextResponse.json(
        { ok: false, error: "Agenda nao encontrada." },
        { status: 404 }
      );
    }

    const { data: disponibilidades } = await supabase
      .from("agenda_disponibilidades")
      .select("*")
      .eq("empresa_id", usuario.empresa_id)
      .eq("agenda_id", id)
      .order("dia_semana", { ascending: true });

    return NextResponse.json({
      ok: true,
      agenda,
      disponibilidades: disponibilidades || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno ao buscar agenda." },
      { status: 500 }
    );
  }
}

export async function PATCH(
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
    const atualizacao: Record<string, any> = {
      timezone: TIMEZONE_PADRAO,
      updated_at: new Date().toISOString(),
      updated_by: usuario.id,
    };

    if (body?.nome !== undefined) {
      const nome = String(body.nome || "").trim();

      if (!nome) {
        return NextResponse.json(
          { ok: false, error: "Nome da agenda e obrigatorio." },
          { status: 400 }
        );
      }

      atualizacao.nome = nome;
    }

    if (body?.descricao !== undefined) {
      const descricao = String(body.descricao || "").trim();
      atualizacao.descricao = descricao || null;
    }

    if (body?.duracao_minutos !== undefined) {
      atualizacao.duracao_minutos = normalizarInteiro(
        body.duracao_minutos,
        60,
        5,
        1440
      );
    }

    if (body?.intervalo_minutos !== undefined) {
      atualizacao.intervalo_minutos = normalizarInteiro(
        body.intervalo_minutos,
        30,
        5,
        1440
      );
    }

    if (body?.antecedencia_minutos !== undefined) {
      atualizacao.antecedencia_minutos = normalizarInteiro(
        body.antecedencia_minutos,
        120,
        0,
        525600
      );
    }

    if (body?.janela_dias !== undefined) {
      atualizacao.janela_dias = normalizarInteiro(body.janela_dias, 14, 1, 180);
    }

    if (body?.status !== undefined) {
      const status = String(body.status || "ativo");
      atualizacao.status = ["ativo", "inativo", "arquivado"].includes(status)
        ? status
        : "ativo";
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("agenda_calendarios")
      .update(atualizacao)
      .eq("empresa_id", usuario.empresa_id)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao atualizar agenda: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      agenda: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno ao atualizar agenda." },
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

    const { error } = await supabase
      .from("agenda_calendarios")
      .update({
        status: "arquivado",
        updated_at: new Date().toISOString(),
        updated_by: usuario.id,
      })
      .eq("empresa_id", usuario.empresa_id)
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao arquivar agenda: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno ao arquivar agenda." },
      { status: 500 }
    );
  }
}
