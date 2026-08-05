/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { excluirEventosVinculadosGoogleCalendar } from "@/lib/agendas/google-calendar";
import { normalizeIntegrationIds, withCalendarIntegrationIds } from "@/lib/agendas/integration-scope";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const TIMEZONE_PADRAO = "America/Sao_Paulo";

function normalizarInteiro(valor: unknown, padrao: number, minimo: number, maximo: number) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return padrao;
  return Math.max(minimo, Math.min(maximo, Math.round(numero)));
}

async function validarIntegracoes(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  empresaId: string,
  value: unknown
) {
  const ids = normalizeIntegrationIds(value);
  if (ids.length === 0) {
    return { ids, error: "Selecione ao menos uma integração do WhatsApp para o calendário." };
  }
  const { data, error } = await supabase
    .from("integracoes_whatsapp")
    .select("id, status, coex_status, phone_number_id")
    .eq("empresa_id", empresaId)
    .in("id", ids);
  if (error) return { ids: [], error: `Erro ao validar integrações: ${error.message}` };
  const active = new Set(
    (data || [])
      .filter((item: any) =>
        Boolean(item.phone_number_id) &&
        (item.status === "ativa" || item.coex_status === "ativo")
      )
      .map((item: any) => String(item.id))
  );
  if (ids.some((id) => !active.has(id))) {
    return { ids: [], error: "Uma integração selecionada não está ativa ou não pertence à empresa." };
  }
  return { ids, error: "" };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const resultado = await getUsuarioContexto();
    if (!resultado.ok) {
      return NextResponse.json({ ok: false, error: resultado.error }, { status: resultado.status });
    }
    const { usuario } = resultado;
    if (!usuario.empresa_id) {
      return NextResponse.json({ ok: false, error: "Usuario sem empresa vinculada." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: agenda, error } = await supabase
      .from("calendarios")
      .select("*")
      .eq("empresa_id", usuario.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (error || !agenda) {
      return NextResponse.json({ ok: false, error: "Agenda nao encontrada." }, { status: 404 });
    }

    const { data: disponibilidades } = await supabase
      .from("agenda_disponibilidades")
      .select("*")
      .eq("empresa_id", usuario.empresa_id)
      .eq("agenda_id", id)
      .order("dia_semana", { ascending: true });

    return NextResponse.json({ ok: true, agenda, disponibilidades: disponibilidades || [] });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Erro interno ao buscar agenda." }, { status: 500 });
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
      return NextResponse.json({ ok: false, error: resultado.error }, { status: resultado.status });
    }
    const { usuario } = resultado;
    if (!usuario.empresa_id) {
      return NextResponse.json({ ok: false, error: "Usuario sem empresa vinculada." }, { status: 400 });
    }

    const body = await request.json();
    const supabase = getSupabaseAdmin();
    const { data: current, error: currentError } = await supabase
      .from("calendarios")
      .select("id, metadata_json")
      .eq("empresa_id", usuario.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (currentError || !current) {
      return NextResponse.json({ ok: false, error: "Agenda nao encontrada." }, { status: 404 });
    }

    const atualizacao: Record<string, any> = {
      timezone: TIMEZONE_PADRAO,
      updated_at: new Date().toISOString(),
      updated_by: usuario.id,
    };

    if (body?.nome !== undefined) {
      const nome = String(body.nome || "").trim();
      if (!nome) {
        return NextResponse.json({ ok: false, error: "Nome da agenda e obrigatorio." }, { status: 400 });
      }
      atualizacao.nome = nome;
    }
    if (body?.descricao !== undefined) {
      const descricao = String(body.descricao || "").trim();
      atualizacao.descricao = descricao || null;
    }
    if (body?.duracao_minutos !== undefined) {
      atualizacao.duracao_minutos = normalizarInteiro(body.duracao_minutos, 60, 5, 1440);
    }
    if (body?.intervalo_minutos !== undefined) {
      atualizacao.intervalo_minutos = normalizarInteiro(body.intervalo_minutos, 30, 5, 1440);
    }
    if (body?.antecedencia_minutos !== undefined) {
      atualizacao.antecedencia_minutos = normalizarInteiro(body.antecedencia_minutos, 120, 0, 525600);
    }
    if (body?.janela_dias !== undefined) {
      atualizacao.janela_dias = normalizarInteiro(body.janela_dias, 14, 1, 180);
    }
    if (body?.status !== undefined) {
      const status = String(body.status || "ativo");
      atualizacao.status = ["ativo", "inativo", "arquivado"].includes(status) ? status : "ativo";
    }
    if (body?.integracao_whatsapp_ids !== undefined) {
      const validation = await validarIntegracoes(
        supabase,
        usuario.empresa_id,
        body.integracao_whatsapp_ids
      );
      if (validation.error) {
        return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
      }
      atualizacao.metadata_json = withCalendarIntegrationIds(
        current.metadata_json,
        validation.ids
      );
    }

    const { data, error } = await supabase
      .from("calendarios")
      .update(atualizacao)
      .eq("empresa_id", usuario.empresa_id)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: `Erro ao atualizar agenda: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ ok: true, agenda: data });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Erro interno ao atualizar agenda." }, { status: 500 });
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
      return NextResponse.json({ ok: false, error: resultado.error }, { status: resultado.status });
    }
    const { usuario } = resultado;
    if (!usuario.empresa_id) {
      return NextResponse.json({ ok: false, error: "Usuario sem empresa vinculada." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: agenda, error: agendaError } = await supabase
      .from("calendarios")
      .select("id, status")
      .eq("empresa_id", usuario.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (agendaError || !agenda) {
      return NextResponse.json({ ok: false, error: "Agenda nao encontrada." }, { status: 404 });
    }
    if (agenda.status !== "arquivado") {
      return NextResponse.json({ ok: false, error: "Arquive a agenda antes de exclui-la permanentemente." }, { status: 409 });
    }

    await excluirEventosVinculadosGoogleCalendar({ empresaId: usuario.empresa_id, agendaId: id });
    const { error } = await supabase
      .from("calendarios")
      .delete()
      .eq("empresa_id", usuario.empresa_id)
      .eq("id", id);
    if (error) {
      return NextResponse.json({ ok: false, error: `Erro ao excluir agenda: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Erro interno ao excluir agenda." }, { status: 500 });
  }
}
