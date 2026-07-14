import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listarIntegracoesWhatsappPermitidas } from "@/lib/whatsapp/integracoes-multiplas";

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

    const [opcoesResult, integracoesResult, atendentesResult] =
      await Promise.all([
        supabase.rpc("listar_opcoes_filtros_contatos", {
          p_empresa_id: usuario.empresa_id,
        }),
        listarIntegracoesWhatsappPermitidas({
          usuario,
          empresaId: usuario.empresa_id,
        }),
        supabase
          .from("usuarios")
          .select("id, nome")
          .eq("empresa_id", usuario.empresa_id)
          .eq("status", "ativo")
          .order("nome", { ascending: true }),
      ]);

    const { data, error } = opcoesResult;

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message || "Erro ao buscar opcoes." },
        { status: 400 }
      );
    }

    if (atendentesResult.error) {
      return NextResponse.json(
        {
          ok: false,
          error:
            atendentesResult.error.message || "Erro ao buscar atendentes.",
        },
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
      integracoes_whatsapp: integracoesResult.integracoes.map(
        (integracao) => ({
          id: integracao.id,
          nome_conexao: integracao.nome_conexao,
          numero: integracao.numero,
          status: integracao.status,
          posicao: integracao.posicao,
        })
      ),
      atendentes: atendentesResult.data || [],
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro interno.",
      },
      { status: 500 }
    );
  }
}
