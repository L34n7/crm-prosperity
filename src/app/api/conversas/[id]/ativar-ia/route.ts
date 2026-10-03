import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getUsuarioContexto,
  type UsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";
import { isAdministrador } from "@/lib/auth/authorization";
import { usuarioPodeAcessarIntegracaoWhatsapp } from "@/lib/whatsapp/integracoes-multiplas";
import {
  CONVERSA_HISTORICO_IMPORTADO_MENSAGEM,
  isConversaHistoricoImportado,
} from "@/lib/conversas/historico-importado";
import { ativarAgenteIaManualmente } from "@/lib/agentes-ia/ativacao-manual";
import { automacoesContatoEstaoDesabilitadas } from "@/lib/contatos/automacoes";

const supabaseAdmin = getSupabaseAdmin();

function usuarioPodeAtivarIa(
  usuario: UsuarioContexto,
  conversa: {
    empresa_id: string;
    setor_id: string | null;
    responsavel_id: string | null;
  }
) {
  if (!usuario.empresa_id || conversa.empresa_id !== usuario.empresa_id) {
    return false;
  }

  if (isAdministrador(usuario)) return true;

  const setoresDoUsuario = Array.isArray(usuario.setores_ids)
    ? usuario.setores_ids
    : [];
  const pertenceAoSetor =
    conversa.setor_id !== null && setoresDoUsuario.includes(conversa.setor_id);
  const ehResponsavel = conversa.responsavel_id === usuario.id;

  return ehResponsavel || pertenceAoSetor;
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const resultado = await getUsuarioContexto();

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const { usuario } = resultado;

    const { data: conversa, error: conversaError } = await supabaseAdmin
      .from("conversas")
      .select(
        "id, empresa_id, contato_id, setor_id, responsavel_id, integracao_whatsapp_id, status, bot_ativo, agente_ia_id, historico_importado"
      )
      .eq("id", id)
      .maybeSingle();

    if (conversaError) {
      return NextResponse.json(
        { ok: false, error: conversaError.message },
        { status: 500 }
      );
    }
    if (!conversa) {
      return NextResponse.json(
        { ok: false, error: "Conversa não encontrada." },
        { status: 404 }
      );
    }

    if (!usuarioPodeAtivarIa(usuario, conversa)) {
      return NextResponse.json(
        { ok: false, error: "Você não pode ativar a IA nesta conversa." },
        { status: 403 }
      );
    }

    const podeAcessarIntegracao = await usuarioPodeAcessarIntegracaoWhatsapp({
      usuario,
      empresaId: conversa.empresa_id,
      integracaoId: conversa.integracao_whatsapp_id,
    });

    if (!podeAcessarIntegracao) {
      return NextResponse.json(
        { ok: false, error: "Sem acesso a esta integração WhatsApp." },
        { status: 403 }
      );
    }

    if (isConversaHistoricoImportado(conversa)) {
      return NextResponse.json(
        { ok: false, error: CONVERSA_HISTORICO_IMPORTADO_MENSAGEM },
        { status: 400 }
      );
    }

    if (
      await automacoesContatoEstaoDesabilitadas({
        empresaId: conversa.empresa_id,
        contatoId: conversa.contato_id,
        conversaId: conversa.id,
        integracaoWhatsappId: conversa.integracao_whatsapp_id,
      })
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "As automações estão desabilitadas para este contato nesta integração. Habilite-as antes de ativar a IA.",
        },
        { status: 409 }
      );
    }

    if (
      ["encerrado_manual", "encerrado_24h", "encerrado_aut"].includes(
        String(conversa.status || "")
      )
    ) {
      return NextResponse.json(
        { ok: false, error: "Reabra a conversa antes de ativar a IA." },
        { status: 400 }
      );
    }

    const ativacao = await ativarAgenteIaManualmente({
      conversa,
      usuarioId: usuario.id,
    });

    if (!ativacao.ok) {
      return NextResponse.json(
        { ok: false, error: ativacao.error },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: ativacao.respondeuAgora
        ? `IA ${ativacao.agente.nome} ativada e continuando a conversa com o histórico existente.`
        : `IA ${ativacao.agente.nome} ativada. A próxima mensagem será atendida com o histórico existente como contexto.`,
      agente: {
        id: ativacao.agente.id,
        nome: ativacao.agente.nome,
      },
      respondeu_agora: ativacao.respondeuAgora,
      pendencia_id: ativacao.despacho?.pendenciaId || null,
    });
  } catch (error) {
    console.error("[ATIVAR_IA_CONVERSA] Erro:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao ativar a IA.",
      },
      { status: 500 }
    );
  }
}
