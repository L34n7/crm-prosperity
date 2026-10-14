import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";
import {
  ErroRenovacaoAssinaturaManual,
  renovarAssinaturaManual,
} from "@/lib/assinaturas/renovar-assinatura-manual";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const resultado = await getUsuarioContexto({ sincronizarAssinatura: false });

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (
    !can(usuario.permissoes, PERMISSAO_INTERNA_EMPRESAS) ||
    !can(usuario.permissoes, "empresas.editar")
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "Sem permissão para renovar mensalidades manualmente.",
      },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const valorCentavos = Number(body?.valor_centavos);
    const confirmado = body?.confirmado === true;

    if (!confirmado) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Confirme que o pagamento foi recebido antes de renovar a mensalidade.",
        },
        { status: 400 }
      );
    }

    const renovacao = await renovarAssinaturaManual({
      empresaId: id,
      valorCentavos,
      operador: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
      },
    });

    await registrarLogAuditoriaSeguro({
      empresa_id: renovacao.empresa.id,
      categoria: "sistema",
      entidade: "empresa",
      entidade_id: renovacao.empresa.id,
      acao: "mensalidade_renovada_manualmente",
      descricao: `Mensalidade renovada manualmente no valor de R$ ${(
        renovacao.valorCentavos / 100
      )
        .toFixed(2)
        .replace(".", ",")}.`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      antes: {
        assinatura_status: renovacao.statusAnterior,
        assinatura_vencimento_em: renovacao.vencimentoAnterior,
        assinatura_gateway: renovacao.gatewayAnterior,
      },
      depois: {
        assinatura_status: "ativa",
        assinatura_renovada_em: renovacao.renovadoEm,
        assinatura_vencimento_em: renovacao.vencimentoEm,
        assinatura_bloqueio_em: renovacao.bloqueioEm,
        assinatura_gateway: "manual",
        assinatura_referencia: renovacao.referencia,
      },
      detalhes: {
        tipo: "renovacao_manual",
        valor_pago_centavos: renovacao.valorCentavos,
        pagamento_id: renovacao.pagamentoId,
        referencia: renovacao.referencia,
        plano_id: renovacao.plano.id,
        plano_nome: renovacao.plano.nome,
        plano_slug: renovacao.plano.slug,
      },
      ...getRequestAuditMetadata(request),
    });

    return NextResponse.json({
      ok: true,
      message: "Mensalidade renovada manualmente com sucesso.",
      renovacao: {
        pagamento_id: renovacao.pagamentoId,
        referencia: renovacao.referencia,
        valor_centavos: renovacao.valorCentavos,
        renovado_em: renovacao.renovadoEm,
        vencimento_em: renovacao.vencimentoEm,
        bloqueio_em: renovacao.bloqueioEm,
      },
    });
  } catch (error) {
    if (error instanceof ErroRenovacaoAssinaturaManual) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status }
      );
    }

    console.error("[EMPRESAS RENOVAR MENSALIDADE]", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível renovar a mensalidade.",
      },
      { status: 500 }
    );
  }
}
