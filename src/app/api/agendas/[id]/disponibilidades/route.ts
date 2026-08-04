/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const FEATURE_MARKER = "CRM_AGENDA_DAY_BREAKS_REOPEN_LAST_PROTOCOL_V1";

function horaValida(valor: string) {
  return /^\d{2}:\d{2}$/.test(valor);
}

function minutos(valor: string) {
  const [hora, minuto] = valor.split(":").map(Number);
  return hora * 60 + minuto;
}

function normalizarDisponibilidades(raw: any[]) {
  const dias = new Set<number>();
  let ativos = 0;

  return raw.map((item: any) => {
    const diaSemana = Number(item.dia_semana);
    const horaInicio = String(item.hora_inicio || "09:00").slice(0, 5);
    const horaFim = String(item.hora_fim || "18:00").slice(0, 5);
    const ativo = item.ativo !== false;

    if (
      !Number.isInteger(diaSemana) ||
      diaSemana < 0 ||
      diaSemana > 6 ||
      dias.has(diaSemana) ||
      !horaValida(horaInicio) ||
      !horaValida(horaFim) ||
      horaFim <= horaInicio
    ) {
      throw new Error("Disponibilidade inválida ou dia da semana duplicado.");
    }
    dias.add(diaSemana);
    if (ativo) ativos += 1;

    const intervalosRaw = ativo && Array.isArray(item.intervalos) ? item.intervalos : [];
    const intervalosAtivos = intervalosRaw.filter((intervalo: any) => intervalo?.ativo !== false);
    if (intervalosAtivos.length > 5) {
      throw new Error("Cada dia pode possuir no máximo 5 intervalos.");
    }

    const intervalos = intervalosAtivos
      .map((intervalo: any, ordem: number) => {
        const inicio = String(intervalo?.hora_inicio || "").slice(0, 5);
        const fim = String(intervalo?.hora_fim || "").slice(0, 5);
        const nome = String(intervalo?.nome || ("Intervalo " + (ordem + 1))).trim().slice(0, 80);

        if (
          !horaValida(inicio) ||
          !horaValida(fim) ||
          fim <= inicio ||
          inicio < horaInicio ||
          fim > horaFim
        ) {
          throw new Error(
            "Intervalo inválido no dia " + diaSemana + ": ele deve estar dentro do horário do dia."
          );
        }

        return {
          empresa_id: "",
          agenda_id: "",
          dia_semana: diaSemana,
          ordem,
          nome: nome || ("Intervalo " + (ordem + 1)),
          hora_inicio: inicio,
          hora_fim: fim,
          ativo: true,
        };
      })
      .sort((a: any, b: any) => minutos(a.hora_inicio) - minutos(b.hora_inicio));

    for (let index = 1; index < intervalos.length; index++) {
      if (intervalos[index].hora_inicio < intervalos[index - 1].hora_fim) {
        throw new Error("Os intervalos do dia " + diaSemana + " não podem se sobrepor.");
      }
    }

    return {
      disponibilidade: {
        dia_semana: diaSemana,
        hora_inicio: horaInicio,
        hora_fim: horaFim,
        ativo,
      },
      intervalos: intervalos.map((intervalo: any, ordem: number) => ({
        ...intervalo,
        ordem,
      })),
    };
  }).map((item: any) => ({ ...item, _ativos: ativos, _marker: FEATURE_MARKER }));
}

function agruparIntervalos(disponibilidades: any[], intervalos: any[]) {
  const porDia = new Map<number, any[]>();
  for (const intervalo of intervalos || []) {
    const dia = Number(intervalo.dia_semana);
    porDia.set(dia, [...(porDia.get(dia) || []), intervalo]);
  }
  return (disponibilidades || []).map((disponibilidade: any) => ({
    ...disponibilidade,
    intervalos: (porDia.get(Number(disponibilidade.dia_semana)) || []).sort(
      (a: any, b: any) => Number(a.ordem) - Number(b.ordem)
    ),
  }));
}

async function carregar(supabase: any, empresaId: string, agendaId: string) {
  const [disponibilidadesResult, intervalosResult] = await Promise.all([
    supabase
      .from("agenda_disponibilidades")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("agenda_id", agendaId)
      .order("dia_semana", { ascending: true }),
    supabase
      .from("agenda_disponibilidade_intervalos")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("agenda_id", agendaId)
      .eq("ativo", true)
      .order("dia_semana", { ascending: true })
      .order("ordem", { ascending: true }),
  ]);

  if (disponibilidadesResult.error) {
    throw new Error("Erro ao buscar horários: " + disponibilidadesResult.error.message);
  }
  if (intervalosResult.error) {
    throw new Error("Erro ao buscar intervalos: " + intervalosResult.error.message);
  }
  return agruparIntervalos(
    disponibilidadesResult.data || [],
    intervalosResult.data || []
  );
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
    if (!resultado.usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const disponibilidades = await carregar(
      supabase,
      resultado.usuario.empresa_id,
      id
    );
    return NextResponse.json({ ok: true, disponibilidades });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno ao buscar horários." },
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
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const raw = Array.isArray(body?.disponibilidades) ? body.disponibilidades : [];
    if (raw.length === 0 || raw.length > 7) {
      return NextResponse.json(
        { ok: false, error: "Informe a disponibilidade semanal." },
        { status: 400 }
      );
    }

    const normalizadas = normalizarDisponibilidades(raw);
    if (!normalizadas.some((item: any) => item.disponibilidade.ativo)) {
      return NextResponse.json(
        { ok: false, error: "Ative pelo menos um dia da semana." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: agenda } = await supabase
      .from("agenda_calendarios")
      .select("id")
      .eq("empresa_id", usuario.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (!agenda) {
      return NextResponse.json(
        { ok: false, error: "Agenda não encontrada." },
        { status: 404 }
      );
    }

    const agora = new Date().toISOString();
    const registros = normalizadas.map((item: any) => ({
      ...item.disponibilidade,
      empresa_id: usuario.empresa_id,
      agenda_id: id,
      updated_at: agora,
    }));

    const { error: disponibilidadeError } = await supabase
      .from("agenda_disponibilidades")
      .upsert(registros, { onConflict: "agenda_id,dia_semana" });
    if (disponibilidadeError) {
      throw new Error("Erro ao salvar horários: " + disponibilidadeError.message);
    }

    const intervalos = normalizadas.flatMap((item: any) =>
      item.intervalos.map((intervalo: any) => ({
        ...intervalo,
        empresa_id: usuario.empresa_id,
        agenda_id: id,
        updated_at: agora,
      }))
    );

    const { error: excluirError } = await supabase
      .from("agenda_disponibilidade_intervalos")
      .delete()
      .eq("empresa_id", usuario.empresa_id)
      .eq("agenda_id", id);
    if (excluirError) {
      throw new Error("Erro ao atualizar intervalos: " + excluirError.message);
    }

    if (intervalos.length > 0) {
      const { error: intervalosError } = await supabase
        .from("agenda_disponibilidade_intervalos")
        .insert(intervalos);
      if (intervalosError) {
        throw new Error("Erro ao salvar intervalos: " + intervalosError.message);
      }
    }

    await supabase
      .from("agenda_calendarios")
      .update({ updated_at: agora, updated_by: usuario.id })
      .eq("empresa_id", usuario.empresa_id)
      .eq("id", id);

    return NextResponse.json({
      ok: true,
      disponibilidades: await carregar(supabase, usuario.empresa_id, id),
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno ao salvar horários." },
      { status: 500 }
    );
  }
}
