import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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

  const usos = data ?? [];
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
