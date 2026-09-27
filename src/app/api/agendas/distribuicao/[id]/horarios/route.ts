/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { listarSlotsGrupoDistribuicao } from "@/lib/agendas/distribuicao";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const contexto = await getUsuarioContexto();

    if (!contexto.ok) {
      return NextResponse.json(
        { ok: false, error: contexto.error },
        { status: contexto.status },
      );
    }

    const bloqueio = bloquearSemPermissao(
      contexto.usuario,
      "agendas.visualizar",
    );
    if (bloqueio) return bloqueio;

    if (!contexto.usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 },
      );
    }

    const data = String(request.nextUrl.searchParams.get("data") || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return NextResponse.json(
        { ok: false, error: "Informe uma data válida no formato AAAA-MM-DD." },
        { status: 400 },
      );
    }

    const resultado = await listarSlotsGrupoDistribuicao({
      supabase: getSupabaseAdmin(),
      empresaId: contexto.usuario.empresa_id,
      grupoId: id,
      data,
      janelaDias: 1,
      limite: Number(request.nextUrl.searchParams.get("limite") || 50),
    });

    if (!resultado.grupo) {
      return NextResponse.json(
        { ok: false, error: "Grupo de distribuição não encontrado ou inativo." },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        grupo: resultado.grupo,
        slots: resultado.slots,
      },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao buscar horários do grupo.",
      },
      { status: 500 },
    );
  }
}
