import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";

const supabaseAdmin = getSupabaseAdmin();

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
        { ok: false, error: "Usuário sem empresa vinculada" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const entidade = searchParams.get("entidade");
    const entidadeId = searchParams.get("entidade_id");

    if (!entidade || !entidadeId) {
      return NextResponse.json(
        { ok: false, error: "entidade e entidade_id são obrigatórios" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("logs_auditoria")
      .select(`
        id,
        entidade,
        entidade_id,
        acao,
        usuario_id,
        usuario_nome,
        detalhes,
        created_at
      `)
      .eq("empresa_id", usuario.empresa_id)
      .eq("entidade", entidade)
      .eq("entidade_id", entidadeId)
      .order("created_at", { ascending: false });

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