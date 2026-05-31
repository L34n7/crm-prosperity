import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";

const supabaseAdmin = getSupabaseAdmin();

function getLimit(valor: string | null) {
  const limit = Number(valor || "25");
  if (!Number.isFinite(limit)) return 25;
  return Math.min(Math.max(Math.trunc(limit), 1), 500);
}

function getPagina(valor: string | null) {
  const pagina = Number(valor || "1");
  if (!Number.isFinite(pagina)) return 1;
  return Math.max(Math.trunc(pagina), 1);
}

function getBuscaAcao(valor: string) {
  const termos = valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[%_]/g, " ")
    .split(/\s+/)
    .map((termo) => termo.trim())
    .filter(Boolean)
    .map((termo) => {
      if (termo.length <= 4) return termo;
      return termo.replace(/(as|os|a|o)$/i, "");
    });

  return termos.length > 0 ? `%${termos.join("%")}%` : "";
}

function ocultarDadosPessoaisRedundantes(detalhes: unknown) {
  if (!detalhes || Array.isArray(detalhes) || typeof detalhes !== "object") {
    return detalhes;
  }

  const detalhesPublicos = {
    ...(detalhes as Record<string, unknown>),
  };
  delete detalhesPublicos.usuario_email;

  return detalhesPublicos;
}

export async function GET(request: Request) {
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
        { ok: false, error: "Usuario sem empresa vinculada" },
        { status: 400 }
      );
    }

    if (!can(usuario.permissoes, "auditoria.visualizar")) {
      return NextResponse.json(
        { ok: false, error: "Sem permissao para visualizar auditoria" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const categoria = searchParams.get("categoria");
    const entidade = searchParams.get("entidade");
    const entidadeId = searchParams.get("entidade_id");
    const usuarioId = searchParams.get("usuario_id");
    const acao = searchParams.get("acao");
    const dataDe = searchParams.get("data_de");
    const dataAte = searchParams.get("data_ate");
    const limit = getLimit(searchParams.get("limit"));
    const pagina = getPagina(searchParams.get("pagina"));
    const inicio = (pagina - 1) * limit;
    const fim = inicio + limit - 1;

    let query = supabaseAdmin
      .from("logs_auditoria")
      .select(
        `
        id,
        categoria,
        entidade,
        entidade_id,
        acao,
        descricao,
        usuario_id,
        usuario_nome,
        detalhes,
        antes,
        depois,
        metadata,
        created_at
      `,
        { count: "exact" }
      )
      .eq("empresa_id", usuario.empresa_id);

    if (categoria) query = query.eq("categoria", categoria);
    if (entidade) query = query.eq("entidade", entidade);
    if (entidadeId) query = query.eq("entidade_id", entidadeId);
    if (usuarioId) query = query.eq("usuario_id", usuarioId);
    if (acao) {
      const buscaAcao = getBuscaAcao(acao);
      if (buscaAcao) query = query.ilike("acao", buscaAcao);
    }
    if (dataDe) query = query.gte("created_at", dataDe);
    if (dataAte) query = query.lte("created_at", dataAte);

    const [
      { data, error, count },
      { data: usuarios, error: usuariosError },
    ] = await Promise.all([
      query.order("created_at", { ascending: false }).range(inicio, fim),
      supabaseAdmin
        .from("usuarios")
        .select("id, nome, email")
        .eq("empresa_id", usuario.empresa_id)
        .order("nome", { ascending: true }),
    ]);

    if (error || usuariosError) {
      return NextResponse.json(
        { ok: false, error: error?.message || usuariosError?.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      logs: (data || []).map((log) => ({
        ...log,
        detalhes: ocultarDadosPessoaisRedundantes(log.detalhes),
      })),
      usuarios: usuarios || [],
      paginacao: {
        pagina,
        limite: limit,
        total: count || 0,
        total_paginas: Math.max(1, Math.ceil((count || 0) / limit)),
      },
    });
  } catch (error) {
    console.error("Erro ao carregar auditoria:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao carregar auditoria" },
      { status: 500 }
    );
  }
}
