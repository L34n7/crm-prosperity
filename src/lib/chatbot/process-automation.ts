import { processIncomingChatbotMessage } from "@/lib/chatbot/engine";
import { getActiveWhatsAppAutomation } from "@/lib/chatbot/repository";
import {
  updateConversationAutomationState,
} from "@/lib/chatbot/conversation-repository";
import { createMensagem } from "@/lib/chatbot/message-repository";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/send-text";
import { routeConversationToSector } from "@/lib/chatbot/route-conversation";
import type { ConversaAutomacaoEstado } from "@/lib/chatbot/types";

type ProcessAutomationParams = {
  empresaId: string;
  integracaoWhatsappId: string | null;
  conversa: ConversaAutomacaoEstado;
  mensagemCliente: string;
  numeroDestino: string;
};

export async function processChatbotAutomation(
  params: ProcessAutomationParams
) {
  const automacaoCompleta = await getActiveWhatsAppAutomation({
    empresaId: params.empresaId,
    integracaoWhatsappId: params.integracaoWhatsappId,
  });

  const decision = processIncomingChatbotMessage({
    mensagem: params.mensagemCliente,
    conversa: params.conversa,
    automacaoCompleta,
    isMensagemCliente: true,
    isHorarioAtendimento: true,
  });

  if (!decision.shouldReply || decision.messages.length === 0) {
    if (Object.keys(decision.updates).length > 0) {
      await updateConversationAutomationState({
        conversaId: params.conversa.id,
        updates: decision.updates,
      });
    }

    return {
      replied: false,
      decision,
      routed: null,
    };
  }

  if (!params.integracaoWhatsappId) {
    throw new Error("integracaoWhatsappId não informado para envio da automação.");
  }

  for (const texto of decision.messages) {
    const envio = await sendWhatsAppTextMessage({
      integracaoId: params.integracaoWhatsappId,
      to: params.numeroDestino,
      text: texto,
    });

    await createMensagem({
      empresaId: params.empresaId,
      conversaId: params.conversa.id,
      remetenteTipo: "bot",
      conteudo: texto,
      tipoMensagem: "texto",
      origem: "automatica",
      statusEnvio: envio.ok ? "enviada" : "falha",
      mensagemExternaId: envio.mensagemExternaId ?? null,
      metadataJson: envio.ok
        ? { tipo: "automacao_whatsapp", action: decision.action }
        : {
            tipo: "automacao_whatsapp",
            action: decision.action,
            erro: envio.error ?? "Erro desconhecido",
            response: envio.data ?? null,
          },
    });
  }

  if (Object.keys(decision.updates).length > 0) {
    await updateConversationAutomationState({
      conversaId: params.conversa.id,
      updates: decision.updates,
    });
  }

  let routed: {
    mode: "usuario_auto" | "fila_setor";
    responsavelId: string | null;
  } | null = null;

  const needsRouting =
    decision.action === "transferir_setor" ||
    decision.action === "transferir_humano" ||
    decision.action === "limite_tentativas";

  if (needsRouting) {
    const setorDestinoId =
      decision.matchedOption?.setor_id ??
      decision.matchedKeyword?.setor_id ??
      automacaoCompleta?.automacao?.setor_padrao_id ??
      null;

    if (!setorDestinoId) {
      throw new Error(
        `A ação "${decision.action}" exige um setor de destino, mas nenhum setor foi definido na opção/palavra-chave nem no setor_padrao_id da automação.`
      );
    }

    const routeResult = await routeConversationToSector({
      conversaId: params.conversa.id,
      empresaId: params.empresaId,
      setorId: setorDestinoId,
      preferSingleUserAutoAssign: true,
    });

    routed = {
      mode: routeResult.mode,
      responsavelId: routeResult.responsavelId,
    };
  }

  return {
    replied: true,
    decision,
    routed,
  };
}