import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function nomesUnicos(valores: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      valores.map((valor) => String(valor || "").trim()).filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export async function GET() {
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
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const [{ data: contatosData, error: contatosError }, { data: origensRastreamentoData }, { data: campanhasRastreamentoData }] =
      await Promise.all([
        supabase
          .from("contatos")
          .select("origem, campanha")
          .eq("empresa_id", usuario.empresa_id),
        supabase
          .from("rastreamento_origens")
          .select("nome")
          .eq("empresa_id", usuario.empresa_id)
          .order("nome", { ascending: true }),
        supabase
          .from("rastreamento_campanhas")
          .select(
            `
              id,
              nome,
              codigo,
              status,
              origem_id,
              rastreamento_origens (
                id,
                nome
              )
            `
          )
          .eq("empresa_id", usuario.empresa_id)
          .order("created_at", { ascending: false }),
      ]);

    if (contatosError) {
      return NextResponse.json(
        { ok: false, error: contatosError.message || "Erro ao buscar opcoes." },
        { status: 400 }
      );
    }

    const origens = nomesUnicos([
      ...(contatosData || []).map((item) => item.origem),
      ...(origensRastreamentoData || []).map((item) => item.nome),
    ]);

    const campanhas = nomesUnicos([
      ...(contatosData || []).map((item) => item.campanha),
      ...(campanhasRastreamentoData || []).map((item) => item.nome),
    ]);

    return NextResponse.json({
      ok: true,
      origens,
      campanhas,
      campanhas_rastreamento: campanhasRastreamentoData || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno." },
      { status: 500 }
    );
  }
}
