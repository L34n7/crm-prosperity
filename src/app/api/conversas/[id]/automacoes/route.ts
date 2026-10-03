import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { podeEditarContatoPelaConversa } from "@/lib/auth/authorization";
import {
  automacoesContatoEstaoDesabilitadas,
  definirAutomacoesContatoIntegracao,
} from "@/lib/contatos/automacoes";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { usuarioPodeAcessarIntegracaoWhatsapp } from "@/lib/whatsapp/integracoes-multiplas";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

const supabaseAdmin = getSupabaseAdmin();

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
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
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 }
    );
  }

  if (!(await podeEditarContatoPelaConversa(usuario))) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Sem permissão para alterar automações do contato pela conversa.",
      },
      { status: 403 }
    );
  }

  const { id: conversaId } = await context.params;

  const { data: conversa, error: conversaError } = await supabaseAdmin
    .from("conversas")
    .select("id, empresa_id, contato_id, integracao_whatsapp_id")
    .eq("empresa_id", usuario.empresa_id)
    .eq("id", conversaId)
    .maybeSingle();

  if (conversaError) {
    return NextResponse.json(
      { ok: false, error: conversaError.message },
      { status: 500 }
    );
  }

  if (
    !conversa?.contato_id ||
    !conversa.integracao_whatsapp_id
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Conversa sem contato ou integração WhatsApp vinculada.",
      },
      { status: 404 }
    );
  }

  const podeAcessarIntegracao =
    await usuarioPodeAcessarIntegracaoWhatsapp({
      usuario,
      empresaId: usuario.empresa_id,
      integracaoId: conversa.integracao_whatsapp_id,
    });

  if (!podeAcessarIntegracao) {
    return NextResponse.json(
      { ok: false, error: "Sem acesso a esta integração WhatsApp." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const desabilitadas = body?.desabilitadas;

  if (typeof desabilitadas !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "Status de automações inválido." },
      { status: 400 }
    );
  }

  const antes = await automacoesContatoEstaoDesabilitadas({
    empresaId: usuario.empresa_id,
    contatoId: conversa.contato_id,
    conversaId: conversa.id,
    integracaoWhatsappId: conversa.integracao_whatsapp_id,
  });

  try {
    const resultadoAtualizacao =
      await definirAutomacoesContatoIntegracao({
        empresaId: usuario.empresa_id,
        contatoId: conversa.contato_id,
        integracaoWhatsappId: conversa.integracao_whatsapp_id,
        usuarioId: usuario.id,
        desabilitadas,
      });

    const auditMeta = getRequestAuditMetadata(request);

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "contatos",
      entidade: "contato",
      entidade_id: conversa.contato_id,
      acao: desabilitadas
        ? "automacoes_integracao_desabilitadas"
        : "automacoes_integracao_habilitadas",
      descricao: desabilitadas
        ? "Automações desabilitadas para o contato nesta integração WhatsApp."
        : "Automações habilitadas para o contato nesta integração WhatsApp.",
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      antes: {
        automacoes_desabilitadas: antes,
        integracao_whatsapp_id: conversa.integracao_whatsapp_id,
      },
      depois: {
        automacoes_desabilitadas: desabilitadas,
        integracao_whatsapp_id: conversa.integracao_whatsapp_id,
      },
      metadata: {
        origem: "conversas",
        conversa_id: conversa.id,
        integracao_whatsapp_id: conversa.integracao_whatsapp_id,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      message: desabilitadas
        ? "Automações desabilitadas para este contato nesta integração."
        : "Automações habilitadas para este contato nesta integração.",
      automacoes_desabilitadas: desabilitadas,
      automacoes_desabilitadas_em:
        resultadoAtualizacao.configuracao.desabilitadas_em || null,
      automacoes_interrompidas:
        resultadoAtualizacao.interrupcoes || null,
    });
  } catch (error) {
    console.error(
      "[CONVERSAS] Falha ao alterar automações do contato na integração:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao alterar automações do contato nesta integração.",
      },
      { status: 500 }
    );
  }
}
