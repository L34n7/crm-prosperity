import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  calcularProximaPosicaoLivre,
  listarIntegracoesWhatsappDaEmpresa,
  listarIntegracoesWhatsappPermitidas,
  obterLimiteIntegracoesWhatsapp,
} from "@/lib/whatsapp/integracoes-multiplas";

export async function GET() {
  try {
    const auth = await getUsuarioContexto();

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status }
      );
    }

    const { usuario } = auth;

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
