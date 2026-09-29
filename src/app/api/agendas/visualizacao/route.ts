/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function normalizarAgendaIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );
}

async function obterContexto() {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status },
      ),
    };
  }

  const bloqueio = bloquearSemPermissao(resultado.usuario, "agendas.visualizar");
  if (bloqueio) return { ok: false as const, response: bloqueio };

  if (!resultado.usuario.empresa_id) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 },
      ),
    };
  }

  return { ok: true as const, usuario: resultado.usuario };
}

export async function GET() {
  try {
    const contexto = await obterContexto();
    if (!contexto.ok) return contexto.response;

    const supabase = getSupabaseAdmin();
    const empresaId = contexto.usuario.empresa_id!;

    const { data: preferencias, error } = await supabase
      .from("agenda_visualizacao_usuario_calendarios")
      .select("agenda_id, ordem")
      .eq("empresa_id", empresaId)
      .eq("usuario_id", contexto.usuario.id)
      .order("ordem", { ascending: true });

    if (error) {
      throw new Error(
        `Erro ao carregar visualização da agenda: ${error.message}`,
      );
    }

    const ids = (preferencias || []).map((item: any) => String(item.agenda_id));
    if (ids.length === 0) {
      return NextResponse.json(
        { ok: true, agenda_ids: [] },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const { data: calendarios, error: calendariosError } = await supabase
      .from("calendarios")
      .select("id, status")
      .eq("empresa_id", empresaId)
      .in("id", ids);

    if (calendariosError) {
      throw new Error(
        `Erro ao validar visualização da agenda: ${calendariosError.message}`,
      );
    }

    const validos = new Set(
      (calendarios || [])
        .filter((item: any) => item.status !== "arquivado")
        .map((item: any) => String(item.id)),
    );

    return NextResponse.json(
      {
        ok: true,
        agenda_ids: ids.filter((id: string) => validos.has(id)),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao carregar a visualização da agenda.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const contexto = await obterContexto();
    if (!contexto.ok) return contexto.response;

    const body = await request.json();
    const agendaIds = normalizarAgendaIds(body?.agenda_ids);
    const supabase = getSupabaseAdmin();
    const empresaId = contexto.usuario.empresa_id!;

    if (agendaIds.length > 0) {
      const { data: calendarios, error } = await supabase
        .from("calendarios")
        .select("id, status")
        .eq("empresa_id", empresaId)
        .in("id", agendaIds);

      if (error) {
        throw new Error(`Erro ao validar calendários: ${error.message}`);
      }

      const validos = new Set(
        (calendarios || [])
          .filter((item: any) => item.status !== "arquivado")
          .map((item: any) => String(item.id)),
      );

      if (agendaIds.some((id) => !validos.has(id))) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Os calendários fixados precisam pertencer à empresa e estar ativos.",
          },
          { status: 400 },
        );
      }
    }

    const { error: deleteError } = await supabase
      .from("agenda_visualizacao_usuario_calendarios")
      .delete()
      .eq("empresa_id", empresaId)
      .eq("usuario_id", contexto.usuario.id);

    if (deleteError) {
      throw new Error(
        `Erro ao atualizar calendários fixados: ${deleteError.message}`,
      );
    }

    if (agendaIds.length > 0) {
      const { error: insertError } = await supabase
        .from("agenda_visualizacao_usuario_calendarios")
        .insert(
          agendaIds.map((agendaId, ordem) => ({
            empresa_id: empresaId,
            usuario_id: contexto.usuario.id,
            agenda_id: agendaId,
            ordem,
          })),
        );

      if (insertError) {
        throw new Error(
          `Erro ao salvar calendários fixados: ${insertError.message}`,
        );
      }
    }

    return NextResponse.json(
      { ok: true, agenda_ids: agendaIds },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao salvar a visualização da agenda.",
      },
      { status: 500 },
    );
  }
}
