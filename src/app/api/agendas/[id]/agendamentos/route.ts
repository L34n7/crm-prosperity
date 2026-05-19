/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { existeConflitoAgenda } from "@/lib/agendas/agenda-service";

function somenteDigitos(valor: string) {
  return String(valor || "").replace(/\D/g, "");
}

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
    const status = searchParams.get("status") || "ativos";
    const supabase = getSupabaseAdmin();

    let query = supabase
      .from("agenda_agendamentos")
      .select(
        `
        id,
        empresa_id,
        agenda_id,
        contato_id,
        conversa_id,
        titulo,
        nome_cliente,
        telefone_cliente,
        email_cliente,
        inicio_at,
        fim_at,
        status,
        origem,
        observacoes,
        metadata_json,
        created_at,
        updated_at,
        contatos (
          id,
          nome,
          telefone,
          email
        )
      `
      )
      .eq("empresa_id", usuario.empresa_id)
      .eq("agenda_id", id)
      .order("inicio_at", { ascending: true });

    if (status === "ativos") {
      query = query.in("status", ["agendado", "confirmado"]);
    } else if (status !== "todos") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao buscar agendamentos: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      agendamentos: data || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno ao buscar agendamentos." },
      { status: 500 }
    );
  }
}

export async function POST(
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
    const supabase = getSupabaseAdmin();

    const { data: agenda, error: agendaError } = await supabase
      .from("agenda_calendarios")
      .select("id, nome, duracao_minutos")
      .eq("empresa_id", usuario.empresa_id)
      .eq("id", id)
      .maybeSingle();

    if (agendaError || !agenda) {
      return NextResponse.json(
        { ok: false, error: "Agenda nao encontrada." },
        { status: 404 }
      );
    }

    const inicioAt = String(body?.inicio_at || "").trim();
    const inicioDate = new Date(inicioAt);

    if (!inicioAt || Number.isNaN(inicioDate.getTime())) {
      return NextResponse.json(
        { ok: false, error: "Informe uma data e hora valida." },
        { status: 400 }
      );
    }

    const fimAt =
      body?.fim_at && !Number.isNaN(new Date(body.fim_at).getTime())
        ? new Date(body.fim_at).toISOString()
        : new Date(
            inicioDate.getTime() + Number(agenda.duracao_minutos || 60) * 60_000
          ).toISOString();

    const inicioIso = inicioDate.toISOString();

    const conflito = await existeConflitoAgenda({
      supabase,
      empresaId: usuario.empresa_id,
      agendaId: id,
      inicioAt: inicioIso,
      fimAt,
    });

    if (conflito) {
      return NextResponse.json(
        { ok: false, error: "Ja existe um agendamento nesse horario." },
        { status: 409 }
      );
    }

    const contatoId = String(body?.contato_id || "").trim() || null;
    const nomeCliente = String(body?.nome_cliente || "").trim();
    const telefoneCliente = somenteDigitos(body?.telefone_cliente || "");
    const emailCliente = String(body?.email_cliente || "").trim().toLowerCase();

    const { data, error } = await supabase
      .from("agenda_agendamentos")
      .insert({
        empresa_id: usuario.empresa_id,
        agenda_id: id,
        contato_id: contatoId,
        titulo: String(body?.titulo || agenda.nome || "Agendamento").trim(),
        nome_cliente: nomeCliente || null,
        telefone_cliente: telefoneCliente || null,
        email_cliente: emailCliente || null,
        inicio_at: inicioIso,
        fim_at: fimAt,
        status: "agendado",
        origem: "manual",
        observacoes: String(body?.observacoes || "").trim() || null,
        created_by: usuario.id,
        updated_by: usuario.id,
        metadata_json: {
          criado_pela_tela: true,
        },
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao criar agendamento: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      agendamento: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno ao criar agendamento." },
      { status: 500 }
    );
  }
}
