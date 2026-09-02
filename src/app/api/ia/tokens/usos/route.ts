import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { can } from "@/lib/permissoes/frontend";

const supabaseAdmin = getSupabaseAdmin();

function numeroInteiroNaoNegativo(valor: unknown, fallback = 0) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.max(Math.round(numero), 0) : fallback;
}

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
  const limite = Math.min(
    Math.max(Number(searchParams.get("limit") || 200), 1),
    500
  );
  const dataInicio = searchParams.get("data_inicio");
  const dataFim = searchParams.get("data_fim");

  let query = supabaseAdmin
    .from("ia_token_usos")
    .select(
      "id, origem, modelo, tokens_input, tokens_output, tokens_total, metadata_json, created_at"
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
    .limit(limite);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  // O ledger interno pode conter custos e precificação do provider em metadata_json.
  // A API da empresa nunca devolve esses dados econômicos: o cliente enxerga apenas
  // seus tokens Prosperity consumidos e as informações operacionais do uso.
  const usos = (data ?? []).map((uso) => {
    const metadata =
      uso.metadata_json && typeof uso.metadata_json === "object"
        ? (uso.metadata_json as Record<string, unknown>)
        : {};
    const tokensProsperity = numeroInteiroNaoNegativo(
      metadata.tokens_equivalentes,
      numeroInteiroNaoNegativo(uso.tokens_total)
    );

    return {
      id: uso.id,
      origem: uso.origem,
      modelo: uso.modelo,
      tokens_input: uso.tokens_input,
      tokens_output: uso.tokens_output,
      tokens_total: tokensProsperity,
      created_at: uso.created_at,
    };
  });

  const totais = usos.reduce(
    (acc, uso) => {
      acc.tokens_input += Number(uso.tokens_input || 0);
      acc.tokens_output += Number(uso.tokens_output || 0);
      acc.tokens_total += Number(uso.tokens_total || 0);
      return acc;
    },
    {
      tokens_input: 0,
      tokens_output: 0,
      tokens_total: 0,
    }
  );

  return NextResponse.json({
    ok: true,
    usos,
    totais,
    filtros: {
      data_inicio: dataInicio,
      data_fim: dataFim,
      limit: limite,
    },
  });
}
