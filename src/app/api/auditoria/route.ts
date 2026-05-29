import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";

const supabaseAdmin = getSupabaseAdmin();

function getLimit(valor: string | null) {
  const limit = Number(valor || "100");
  if (!Number.isFinite(limit)) return 100;
  return Math.min(Math.max(Math.trunc(limit), 1), 500);
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
        ip,
        user_agent,
        created_at
      `
      )
      .eq("empresa_id", usuario.empresa_id);

    if (categoria) query = query.eq("categoria", categoria);
    if (entidade) query = query.eq("entidade", entidade);
    if (entidadeId) query = query.eq("entidade_id", entidadeId);
    if (usuarioId) query = query.eq("usuario_id", usuarioId);
    if (acao) query = query.eq("acao", acao);
    if (dataDe) query = query.gte("created_at", dataDe);
    if (dataAte) query = query.lte("created_at", dataAte);

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      logs: data || [],
    });
  } catch (error) {
    console.error("Erro ao carregar auditoria:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao carregar auditoria" },
      { status: 500 }
    );
  }
}
