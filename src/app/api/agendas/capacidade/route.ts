/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { listarGruposDistribuicao } from "@/lib/agendas/capacidade";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const ESTRATEGIAS = new Set([
  "rodizio",
  "menor_carga",
  "primeiro_disponivel",
]);

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

async function validarCalendarios(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  empresaId: string;
  agendaIds: string[];
}) {
  if (params.agendaIds.length < 2) {
    return {
      ok: false as const,
      error: "Selecione pelo menos dois calendários para distribuir agendamentos.",
    };
  }

  const { data, error } = await params.supabase
    .from("calendarios")
    .select("id, status")
    .eq("empresa_id", params.empresaId)
    .in("id", params.agendaIds);

  if (error) {
    return {
      ok: false as const,
      error: `Erro ao validar calendários: ${error.message}`,
    };
  }

  const validos = new Set(
    (data || [])
      .filter((item: any) => item.status !== "arquivado")
      .map((item: any) => String(item.id)),
  );

  if (params.agendaIds.some((id) => !validos.has(id))) {
    return {
      ok: false as const,
      error:
        "Todos os calendários do grupo precisam pertencer à empresa e não podem estar arquivados.",
    };
  }

  return { ok: true as const };
}

async function contextoComPermissao(
  permissao: "agendas.visualizar" | "agendas.editar",
) {
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

  const bloqueio = bloquearSemPermissao(resultado.usuario, permissao);
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
    const contexto = await contextoComPermissao("agendas.visualizar");
    if (!contexto.ok) return contexto.response;

    const supabase = getSupabaseAdmin();
    const empresaId = contexto.usuario.empresa_id!;

    const [{ data: usuarios, error: usuariosError }, grupos] =
      await Promise.all([
        supabase
          .from("usuarios")
          .select("id, nome, email, status")
          .eq("empresa_id", empresaId)
          .eq("status", "ativo")
          .order("nome", { ascending: true }),
        listarGruposDistribuicao({
          supabase,
          empresaId,
          somenteAtivos: false,
        }),
      ]);

    if (usuariosError) {
      throw new Error(
        `Erro ao buscar responsáveis: ${usuariosError.message}`,
      );
    }

    return NextResponse.json(
      {
        ok: true,
        responsaveis: usuarios || [],
        grupos_distribuicao: grupos,
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
            : "Erro interno ao carregar capacidade da agenda.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const contexto = await contextoComPermissao("agendas.editar");
    if (!contexto.ok) return contexto.response;

    const body = await request.json();
    const nome = String(body?.nome || "").trim();
    const estrategia = String(body?.estrategia || "rodizio").trim();
    const agendaIds = normalizarAgendaIds(body?.agenda_ids);

    if (!nome) {
      return NextResponse.json(
        { ok: false, error: "Informe o nome do grupo de distribuição." },
        { status: 400 },
      );
    }

    if (!ESTRATEGIAS.has(estrategia)) {
      return NextResponse.json(
        { ok: false, error: "Estratégia de distribuição inválida." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const empresaId = contexto.usuario.empresa_id!;
    const validacao = await validarCalendarios({
      supabase,
      empresaId,
      agendaIds,
    });

    if (!validacao.ok) {
      return NextResponse.json(
        { ok: false, error: validacao.error },
        { status: 400 },
      );
    }

    const { data: grupo, error: grupoError } = await supabase
      .from("agenda_grupos_distribuicao")
      .insert({
        empresa_id: empresaId,
        nome,
        estrategia,
        ativo: body?.ativo !== false,
        created_by: contexto.usuario.id,
        updated_by: contexto.usuario.id,
      })
      .select(
        "id, empresa_id, nome, estrategia, ativo, ultimo_agenda_id, created_at, updated_at",
      )
      .single();

    if (grupoError || !grupo) {
      throw new Error(
        `Erro ao criar grupo de distribuição: ${grupoError?.message || "sem retorno"}`,
      );
    }

    const { error: membrosError } = await supabase
      .from("agenda_grupos_distribuicao_calendarios")
      .insert(
        agendaIds.map((agendaId, index) => ({
          empresa_id: empresaId,
          grupo_id: grupo.id,
          agenda_id: agendaId,
          ordem: index,
          ativo: true,
        })),
      );

    if (membrosError) {
      await supabase
        .from("agenda_grupos_distribuicao")
        .delete()
        .eq("empresa_id", empresaId)
        .eq("id", grupo.id);

      throw new Error(
        `Erro ao vincular calendários ao grupo: ${membrosError.message}`,
      );
    }

    return NextResponse.json({
      ok: true,
      grupo: { ...grupo, agenda_ids: agendaIds },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao criar grupo de distribuição.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const contexto = await contextoComPermissao("agendas.editar");
    if (!contexto.ok) return contexto.response;

    const body = await request.json();
    const id = String(body?.id || "").trim();
    const nome = String(body?.nome || "").trim();
    const estrategia = String(body?.estrategia || "rodizio").trim();
    const agendaIds = normalizarAgendaIds(body?.agenda_ids);

    if (!id || !nome) {
      return NextResponse.json(
        { ok: false, error: "Grupo de distribuição inválido." },
        { status: 400 },
      );
    }

    if (!ESTRATEGIAS.has(estrategia)) {
      return NextResponse.json(
        { ok: false, error: "Estratégia de distribuição inválida." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const empresaId = contexto.usuario.empresa_id!;
    const validacao = await validarCalendarios({
      supabase,
      empresaId,
      agendaIds,
    });

    if (!validacao.ok) {
      return NextResponse.json(
        { ok: false, error: validacao.error },
        { status: 400 },
      );
    }

    const { data: grupo, error: grupoError } = await supabase
      .from("agenda_grupos_distribuicao")
      .update({
        nome,
        estrategia,
        ativo: body?.ativo !== false,
        updated_by: contexto.usuario.id,
        updated_at: new Date().toISOString(),
      })
      .eq("empresa_id", empresaId)
      .eq("id", id)
      .select(
        "id, empresa_id, nome, estrategia, ativo, ultimo_agenda_id, created_at, updated_at",
      )
      .single();

    if (grupoError || !grupo) {
      throw new Error(
        `Erro ao atualizar grupo de distribuição: ${grupoError?.message || "sem retorno"}`,
      );
    }

    const { error: deleteError } = await supabase
      .from("agenda_grupos_distribuicao_calendarios")
      .delete()
      .eq("empresa_id", empresaId)
      .eq("grupo_id", id);

    if (deleteError) {
      throw new Error(
        `Erro ao atualizar membros do grupo: ${deleteError.message}`,
      );
    }

    const { error: membrosError } = await supabase
      .from("agenda_grupos_distribuicao_calendarios")
      .insert(
        agendaIds.map((agendaId, index) => ({
          empresa_id: empresaId,
          grupo_id: id,
          agenda_id: agendaId,
          ordem: index,
          ativo: true,
        })),
      );

    if (membrosError) {
      throw new Error(
        `Erro ao salvar calendários do grupo: ${membrosError.message}`,
      );
    }

    return NextResponse.json({
      ok: true,
      grupo: { ...grupo, agenda_ids: agendaIds },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao atualizar grupo de distribuição.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const contexto = await contextoComPermissao("agendas.editar");
    if (!contexto.ok) return contexto.response;

    const id = String(request.nextUrl.searchParams.get("id") || "").trim();
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Informe o grupo de distribuição." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("agenda_grupos_distribuicao")
      .delete()
      .eq("empresa_id", contexto.usuario.empresa_id!)
      .eq("id", id);

    if (error) {
      throw new Error(
        `Erro ao excluir grupo de distribuição: ${error.message}`,
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao excluir grupo de distribuição.",
      },
      { status: 500 },
    );
  }
}
