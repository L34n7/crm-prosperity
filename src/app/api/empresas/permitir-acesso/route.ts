import { NextResponse } from "next/server";
import {
  ErroLiberacaoAcessoManual,
  liberarAcessoManual,
} from "@/lib/assinaturas/permitir-acesso-manual";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/can";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";

export async function POST(request: Request) {
  const contexto = await getUsuarioContexto();

  if (!contexto.ok) {
    return NextResponse.json(
      { ok: false, error: contexto.error },
      { status: contexto.status }
    );
  }

  const { usuario } = contexto;
  const [podeAcessarEmpresas, podeCriarEmpresas] = await Promise.all([
    can(usuario.id, PERMISSAO_INTERNA_EMPRESAS),
    can(usuario.id, "empresas.criar"),
  ]);

  if (!podeAcessarEmpresas || !podeCriarEmpresas) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para liberar acesso de clientes." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const identificadorLead = String(body?.identificador_lead || "").trim();
    const planoId = String(body?.plano_id || "").trim();

    const resultado = await liberarAcessoManual({
      identificadorLead,
      planoId,
      operador: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
      },
    });

    const auditMetadata = getRequestAuditMetadata(request);
    await registrarLogAuditoriaSeguro({
      empresa_id: resultado.empresa.id,
      categoria: "sistema",
      entidade: "empresa",
      entidade_id: resultado.empresa.id,
      acao: "acesso_manual_liberado",
      descricao: `Acesso liberado manualmente para ${resultado.lead.email} no plano ${resultado.plano.nome}.`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      detalhes: {
        lead_id: resultado.lead.id,
        plano_id: resultado.plano.id,
        plano_slug: resultado.plano.slug,
        pagamento_id: resultado.pagamentoId,
        referencia: resultado.referencia,
        email_primeiro_acesso_enviado: resultado.emailEnviado,
      },
      ...auditMetadata,
    });

    return NextResponse.json({
      ok: true,
      message: resultado.emailEnviado
        ? "Acesso liberado e e-mail de primeiro acesso enviado com sucesso."
        : "Acesso liberado com sucesso, mas o e-mail de primeiro acesso não foi enviado.",
      warning: resultado.emailEnviado ? null : resultado.avisoEmail,
      lead: resultado.lead,
      empresa: resultado.empresa,
      plano: resultado.plano,
      referencia: resultado.referencia,
      email_enviado: resultado.emailEnviado,
    });
  } catch (error) {
    if (error instanceof ErroLiberacaoAcessoManual) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status }
      );
    }

    console.error("[EMPRESAS PERMITIR ACESSO]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao liberar acesso do cliente.",
      },
      { status: 500 }
    );
  }
}
