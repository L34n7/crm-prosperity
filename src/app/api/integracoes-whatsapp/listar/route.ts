import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  bloquearSemPermissao,
  usuarioTemPermissao,
} from "@/lib/permissoes/servidor";
import {
  calcularProximaPosicaoLivre,
  listarIntegracoesWhatsappDaEmpresa,
  listarIntegracoesWhatsappPermitidas,
  obterLimiteIntegracoesWhatsapp,
} from "@/lib/whatsapp/integracoes-multiplas";

export async function GET(request: Request) {
  try {
    const auth = await getUsuarioContexto();

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status }
      );
    }

    const { usuario } = auth;
    const contexto = new URL(request.url).searchParams.get("contexto");
    const consultaOperacionalConversas =
      contexto === "conversas" &&
      usuarioTemPermissao(usuario, "conversas.visualizar");

    if (!consultaOperacionalConversas) {
      const bloqueio = bloquearSemPermissao(
        usuario,
        "whatsapp.integracao.visualizar",
      );
      if (bloqueio) return bloqueio;
    }

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 }
      );
    }

    const [limite, todasIntegracoes, acesso] = await Promise.all([
      obterLimiteIntegracoesWhatsapp(usuario.empresa_id),
      listarIntegracoesWhatsappDaEmpresa(usuario.empresa_id),
      listarIntegracoesWhatsappPermitidas({
        usuario,
        empresaId: usuario.empresa_id,
      }),
    ]);

    if (consultaOperacionalConversas) {
      return NextResponse.json({
        ok: true,
        data: acesso.integracoes.map((integracao) => ({
          id: integracao.id,
          nome_conexao: integracao.nome_conexao,
          numero: integracao.numero,
          status: integracao.status,
          posicao: integracao.posicao,
        })),
        acesso_restrito_por_integracao: acesso.acessoRestrito,
      });
    }

    const proximaPosicao = calcularProximaPosicaoLivre(
      todasIntegracoes,
      limite
    );

    return NextResponse.json({
      ok: true,
      data: acesso.integracoes,
      limite_integracoes_whatsapp: limite,
      total_integracoes_whatsapp: todasIntegracoes.length,
      proxima_posicao: proximaPosicao,
      pode_cadastrar_nova: Boolean(proximaPosicao),
      acesso_restrito_por_integracao: acesso.acessoRestrito,
    });
  } catch (error) {
    console.error("Erro ao listar integracoes WhatsApp:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao listar integracoes WhatsApp." },
      { status: 500 }
    );
  }
}
