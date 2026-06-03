import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { can } from "@/lib/permissoes/frontend";

const supabaseAdmin = getSupabaseAdmin();

export async function GET(request: Request) {
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

  if (!can(usuario.permissoes, "ia.tokens.visualizar_extrato")) {
    return NextResponse.json(
      { ok: false, error: "Sem permissao para visualizar tokens de IA." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const dataInicio = searchParams.get("data_inicio");
  const dataFim = searchParams.get("data_fim");

  let query = supabaseAdmin
    .from("ia_token_movimentacoes")
    .select(
      "id, tipo, referencia, quantidade_tokens, saldo_mensal_apos, saldo_avulso_apos, created_at"
    )
    .eq("empresa_id", usuario.empresa_id);

  if (dataInicio) {
    query = query.gte("created_at", `${dataInicio}T00:00:00.000Z`);
  }

  if (dataFim) {
    const fim = new Date(`${dataFim}T00:00:00.000Z`);
    fim.setUTCDate(fim.getUTCDate() + 1);
    query = query.lt("created_at", fim.toISOString());
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    movimentacoes: data ?? [],
  });
}
