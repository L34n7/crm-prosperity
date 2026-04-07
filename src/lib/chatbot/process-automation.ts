import { processIncomingChatbotMessage } from "@/lib/chatbot/engine";
import { getActiveWhatsAppAutomation } from "@/lib/chatbot/repository";
import {
  updateConversationAutomationState,
} from "@/lib/chatbot/conversation-repository";
import { createMensagem } from "@/lib/chatbot/message-repository";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/send-text";
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

  return {
    replied: true,
    decision,
  };
}