/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const DIAS_UTEIS_PADRAO = [1, 2, 3, 4, 5];
const TIMEZONE_PADRAO = "America/Sao_Paulo";

function normalizarInteiro(valor: unknown, padrao: number, minimo: number, maximo: number) {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) return padrao;

  return Math.max(minimo, Math.min(maximo, Math.round(numero)));
}

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "todos";
    const busca = String(searchParams.get("busca") || "").trim();
    const supabase = getSupabaseAdmin();

    let query = supabase
      .from("agenda_calendarios")
      .select(
        "id, empresa_id, nome, descricao, timezone, duracao_minutos, intervalo_minutos, antecedencia_minutos, janela_dias, status, metadata_json, created_at, updated_at"
      )
      .eq("empresa_id", usuario.empresa_id)
      .order("created_at", { ascending: false });

    if (["ativo", "inativo", "arquivado"].includes(status)) {
      query = query.eq("status", status);
    }

    if (busca) {
      query = query.ilike("nome", `%${busca}%`);
    }

    const { data: agendas, error } = await query;

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao buscar agendas: ${error.message}` },
        { status: 500 }
      );
    }

    const agendaIds = (agendas || []).map((agenda: any) => agenda.id);
    const proximosPorAgenda = new Map<string, any>();

    if (agendaIds.length > 0) {
      const { data: proximos } = await supabase
        .from("agenda_agendamentos")
        .select("id, agenda_id, inicio_at, status, nome_cliente, telefone_cliente")
        .eq("empresa_id", usuario.empresa_id)
        .in("agenda_id", agendaIds)
        .in("status", ["agendado", "confirmado"])
        .gte("inicio_at", new Date().toISOString())
        .order("inicio_at", { ascending: true });

      for (const agendamento of proximos || []) {
        if (!proximosPorAgenda.has(agendamento.agenda_id)) {
          proximosPorAgenda.set(agendamento.agenda_id, agendamento);
        }
      }
    }

    const prioridadeStatus: Record<string, number> = {
      ativo: 0,
      inativo: 1,
      arquivado: 2,
    };
    const agendasOrdenadas = [...(agendas || [])].sort((a: any, b: any) => {
      const prioridade =
        (prioridadeStatus[a.status] ?? 99) - (prioridadeStatus[b.status] ?? 99);

      if (prioridade !== 0) return prioridade;

      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });

    return NextResponse.json({
      ok: true,
      agendas: agendasOrdenadas.map((agenda: any) => ({
        ...agenda,
        proximo_agendamento: proximosPorAgenda.get(agenda.id) || null,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno ao buscar agendas." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const nome = String(body?.nome || "").trim();
    const descricao = String(body?.descricao || "").trim();
    const supabase = getSupabaseAdmin();

    if (!nome) {
      return NextResponse.json(
        { ok: false, error: "Nome da agenda e obrigatorio." },
        { status: 400 }
      );
    }

    const { data: agenda, error } = await supabase
      .from("agenda_calendarios")
      .insert({
        empresa_id: usuario.empresa_id,
        nome,
        descricao: descricao || null,
        timezone: TIMEZONE_PADRAO,
        duracao_minutos: normalizarInteiro(body?.duracao_minutos, 60, 5, 1440),
        intervalo_minutos: normalizarInteiro(body?.intervalo_minutos, 30, 5, 1440),
        antecedencia_minutos: normalizarInteiro(
          body?.antecedencia_minutos,
          120,
          0,
          525600
        ),
        janela_dias: normalizarInteiro(body?.janela_dias, 14, 1, 180),
        status: body?.status === "inativo" ? "inativo" : "ativo",
        created_by: usuario.id,
        updated_by: usuario.id,
      })
      .select("*")
      .single();

    if (error || !agenda) {
      return NextResponse.json(
        { ok: false, error: `Erro ao criar agenda: ${error?.message}` },
        { status: 500 }
      );
    }

    const disponibilidades = DIAS_UTEIS_PADRAO.map((dia) => ({
      empresa_id: usuario.empresa_id,
      agenda_id: agenda.id,
      dia_semana: dia,
      hora_inicio: "09:00",
      hora_fim: "18:00",
      ativo: true,
    }));

    const { error: disponibilidadeError } = await supabase
      .from("agenda_disponibilidades")
      .insert(disponibilidades);

    if (disponibilidadeError) {
      return NextResponse.json(
        {
          ok: false,
          error: `Agenda criada, mas houve erro ao criar horarios: ${disponibilidadeError.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      agenda,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno ao criar agenda." },
      { status: 500 }
    );
  }
}
