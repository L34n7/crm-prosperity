import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getUsuarioContexto,
  type UsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";
import { isAdministrador } from "@/lib/auth/authorization";
import { processAutomationEngine } from "@/lib/automacoes/process-automation-engine";
import {
  CONVERSA_HISTORICO_IMPORTADO_MENSAGEM,
  isConversaHistoricoImportado,
} from "@/lib/conversas/historico-importado";
import { usuarioPodeAcessarIntegracaoWhatsapp } from "@/lib/whatsapp/integracoes-multiplas";

const supabaseAdmin = getSupabaseAdmin();

type MensagemAutomacaoTipo = "texto" | "imagem" | "documento" | "audio" | "video";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecordField(
  source: Record<string, unknown>,
  key: string
): Record<string, unknown> | null {
  const value = source[key];
  return isRecord(value) ? value : null;
}

function getStringField(source: Record<string, unknown> | null, key: string) {
  if (!source) return null;

  const value = source[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function tipoMensagemParaAutomacao(
  tipoMensagem: string | null | undefined
): MensagemAutomacaoTipo {
  if (tipoMensagem === "imagem") return "imagem";
  if (tipoMensagem === "documento") return "documento";
  if (tipoMensagem === "audio") return "audio";
  if (tipoMensagem === "video") return "video";
  return "texto";
}

function extrairMediaId(metadataJson: unknown) {
  const metadata = isRecord(metadataJson) ? metadataJson : {};

  return (
    getStringField(metadata, "media_id") ||
    getStringField(getRecordField(metadata, "image"), "id") ||
    getStringField(getRecordField(metadata, "document"), "id") ||
    getStringField(getRecordField(metadata, "audio"), "id") ||
    getStringField(getRecordField(metadata, "video"), "id")
  );
}

function extrairMimeType(metadataJson: unknown) {
  const metadata = isRecord(metadataJson) ? metadataJson : {};

  return (
    getStringField(metadata, "mime_type") ||
    getStringField(getRecordField(metadata, "image"), "mime_type") ||
    getStringField(getRecordField(metadata, "document"), "mime_type") ||
    getStringField(getRecordField(metadata, "audio"), "mime_type") ||
    getStringField(getRecordField(metadata, "video"), "mime_type")
  );
}

function extrairArquivoNome(metadataJson: unknown) {
  const metadata = isRecord(metadataJson) ? metadataJson : {};

  return (
    getStringField(metadata, "filename") ||
    getStringField(getRecordField(metadata, "document"), "filename")
  );
}

function usuarioPodeResetarConversa(
  usuario: UsuarioContexto,
  conversa: {
    empresa_id: string;
    setor_id: string | null;
    responsavel_id: string | null;
    integracao_whatsapp_id?: string | null;
  }
) {
  if (!usuario.empresa_id || conversa.empresa_id !== usuario.empresa_id) {
    return false;
  }

  if (isAdministrador(usuario)) {
    return true;
  }

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
    .select("id, empresa_id, setor_id, responsavel_id, contato_id, origem_atendimento, historico_importado, integracao_whatsapp_id")
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
      { ok: false, error: "Conversa nao encontrada" },
      { status: 404 }
    );
  }

  if (!usuarioPodeResetarConversa(usuario, conversa)) {
    return NextResponse.json(
      { ok: false, error: "Voce nao pode resetar esta conversa" },
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
      { ok: false, error: "Sem acesso a esta integracao WhatsApp." },
      { status: 403 }
    );
  }

  if (isConversaHistoricoImportado(conversa)) {
    return NextResponse.json(
      { ok: false, error: CONVERSA_HISTORICO_IMPORTADO_MENSAGEM },
      { status: 400 }
    );
  }

  const { data: contato, error: contatoError } = await supabaseAdmin
    .from("contatos")
    .select("id, telefone")
    .eq("id", conversa.contato_id)
    .eq("empresa_id", conversa.empresa_id)
    .maybeSingle();

  if (contatoError) {
    return NextResponse.json(
      { ok: false, error: contatoError.message },
      { status: 500 }
    );
  }

  if (!contato?.telefone) {
    return NextResponse.json(
      { ok: false, error: "Contato da conversa nao encontrado" },
      { status: 404 }
    );
  }

  const { data: ultimaMensagemRecebida, error: ultimaMensagemError } =
    await supabaseAdmin
      .from("mensagens")
      .select("id, conteudo, tipo_mensagem, metadata_json, created_at")
      .eq("empresa_id", conversa.empresa_id)
      .eq("conversa_id", id)
      .eq("remetente_tipo", "contato")
      .eq("origem", "recebida")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (ultimaMensagemError) {
    return NextResponse.json(
      { ok: false, error: ultimaMensagemError.message },
      { status: 500 }
    );
  }

  const { data: conversaResetada, error } = await supabaseAdmin
    .from("conversas")
    .update({
      setor_id: null,
      responsavel_id: null,
      status: "aberta",
      origem_atendimento: "entrada_cliente",
      bot_ativo: false,
      aguardando_atendente: false,
      closed_at: null,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  let automationResult:
    | {
        ok: boolean;
        status?: string;
        execucaoId?: string;
        fluxoId?: string;
        error?: string;
      }
    | null = null;

  if (ultimaMensagemRecebida) {
    const metadataAtual = isRecord(ultimaMensagemRecebida.metadata_json)
      ? ultimaMensagemRecebida.metadata_json
      : {};
    const mediaId = extrairMediaId(metadataAtual);
    const mimeType = extrairMimeType(metadataAtual);
    const arquivoNome = extrairArquivoNome(metadataAtual);
    const mensagemTexto =
      String(ultimaMensagemRecebida.conteudo || "").trim() ||
      arquivoNome ||
      "mensagem_recebida";

    automationResult = await processAutomationEngine({
      empresaId: conversa.empresa_id,
      conversaId: id,
      contatoId: conversa.contato_id,
      mensagemTexto,
      numeroDestino: contato.telefone,
      integracaoWhatsappId: conversa.integracao_whatsapp_id,
      mensagemTipo: tipoMensagemParaAutomacao(
        ultimaMensagemRecebida.tipo_mensagem
      ),
      mediaId,
      mimeType,
      arquivoNome,
      mensagemId: ultimaMensagemRecebida.id,
    });

    const { error: mensagemUpdateError } = await supabaseAdmin
      .from("mensagens")
      .update({
        automacao_execucao_id: automationResult?.execucaoId || null,
        metadata_json: {
          ...metadataAtual,
          automacao_processada: true,
          automacao_processada_em: new Date().toISOString(),
          automacao_resultado: automationResult,
          automacao_reprocessada_por_reset_bot: true,
        },
      })
      .eq("id", ultimaMensagemRecebida.id)
      .eq("empresa_id", conversa.empresa_id);

    if (mensagemUpdateError) {
      console.error(
        "[RESET_BOT] Erro ao marcar ultima mensagem como processada:",
        mensagemUpdateError
      );
    }
  }

  let conversaResposta = conversaResetada;

  if (automationResult) {
    const { data: conversaAtualizada } = await supabaseAdmin
      .from("conversas")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    conversaResposta = conversaAtualizada || conversaResetada;
  }

  return NextResponse.json({
    ok: true,
    message: ultimaMensagemRecebida
      ? "Bot ativado e automacao iniciada com a ultima mensagem recebida."
      : "Conversa resetada com sucesso. A proxima mensagem entrara como novo fluxo.",
    conversa: conversaResposta,
    automationStatus: automationResult?.status ?? null,
    automationExecucaoId: automationResult?.execucaoId ?? null,
    automationFluxoId: automationResult?.fluxoId ?? null,
    automationError: automationResult?.error ?? null,
  });
}
