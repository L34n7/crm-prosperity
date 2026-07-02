import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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

    const { data, error } = await supabase.rpc(
      "listar_opcoes_filtros_contatos",
      {
        p_empresa_id: usuario.empresa_id,
      }
    );

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message || "Erro ao buscar opcoes." },
        { status: 400 }
      );
    }

    const opcoes =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};

    return NextResponse.json({
      ok: true,
      origens: Array.isArray(opcoes.origens) ? opcoes.origens : [],
      campanhas: Array.isArray(opcoes.campanhas) ? opcoes.campanhas : [],
      campanhas_rastreamento: Array.isArray(opcoes.campanhas_rastreamento)
        ? opcoes.campanhas_rastreamento
        : [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno." },
      { status: 500 }
    );
  }
}
