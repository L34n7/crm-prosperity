import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { obterLimitesPlanoPorIdentificador } from "@/lib/planos/limites";

const supabaseAdmin = getSupabaseAdmin();

export async function GET() {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("planos")
    .select("id, nome, slug")
    .eq("status", "ativo")
    .order("nome", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    planos: (data ?? []).map((plano) => {
      const limites =
        obterLimitesPlanoPorIdentificador(plano.slug) ??
        obterLimitesPlanoPorIdentificador(plano.nome);

      return {
        ...plano,
        limite_usuarios: limites?.limiteUsuarios ?? null,
        limite_tokens_ia: limites?.limiteTokensIa ?? null,
      };
    }),
  });
}
