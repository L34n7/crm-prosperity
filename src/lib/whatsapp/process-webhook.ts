import {
  extractIncomingMessages,
  extractMessageStatuses,
  type WhatsAppWebhookBody,
} from "@/lib/whatsapp/meta";
import { findWhatsAppIntegrationByPhoneNumberId } from "@/lib/whatsapp/find-integration";
import { findOrCreateWhatsAppContact } from "@/lib/whatsapp/find-or-create-contact";
import { findOrCreateWhatsAppConversation } from "@/lib/whatsapp/find-or-create-conversation";
import { saveIncomingWhatsAppMessage } from "@/lib/whatsapp/save-incoming-message";
import { processAutomationEngine } from "@/lib/automacoes/process-automation-engine";
import { updateWhatsAppMessageStatus } from "@/lib/whatsapp/update-message-status";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { baixarAudioWhatsApp } from "@/lib/whatsapp/baixar-audio-whatsapp";
import { transcreverAudioComIA } from "@/lib/ia/transcrever-audio";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/send-text-message";

const supabaseAdmin = getSupabaseAdmin();

function perf(label: string, inicio: number, extra?: Record<string, any>) {
  console.log(`[PERF] ${label}`, {
    tempo_ms: Date.now() - inicio,
    ...(extra || {}),
  });
}

function tipoMensagemParaAutomacao(tipoMensagem: string) {
  if (tipoMensagem === "imagem") return "imagem";
  if (tipoMensagem === "documento") return "documento";
  if (tipoMensagem === "audio") return "audio";
  if (tipoMensagem === "video") return "video";
  return "texto";
}

function extrairMediaId(message: any, metadataJson: any) {
  return (
    metadataJson?.media_id ||
    metadataJson?.image?.id ||
    metadataJson?.document?.id ||
    metadataJson?.audio?.id ||
    metadataJson?.video?.id ||
    message.rawMessage?.image?.id ||
    message.rawMessage?.document?.id ||
    message.rawMessage?.audio?.id ||
    message.rawMessage?.video?.id ||
    null
  );
}

function extrairMimeType(message: any, metadataJson: any) {
  return (
    metadataJson?.mime_type ||
    metadataJson?.image?.mime_type ||
    metadataJson?.document?.mime_type ||
    metadataJson?.audio?.mime_type ||
    metadataJson?.video?.mime_type ||
    message.rawMessage?.image?.mime_type ||
    message.rawMessage?.document?.mime_type ||
    message.rawMessage?.audio?.mime_type ||
    message.rawMessage?.video?.mime_type ||
    null
  );
}

function extrairArquivoNome(message: any, metadataJson: any) {
  return (
    metadataJson?.filename ||
    metadataJson?.document?.filename ||
    message.rawMessage?.document?.filename ||
    null
  );
}

function timestampWhatsappParaIso(timestamp?: string | number | null) {
  if (!timestamp) {
    return new Date().toISOString();
  }

  const numero = Number(timestamp);

  if (Number.isFinite(numero)) {
    const milissegundos =
      numero < 100000000000 ? numero * 1000 : numero;

    const data = new Date(milissegundos);

    if (!Number.isNaN(data.getTime())) {
      return data.toISOString();
    }
  }

  const dataTexto = new Date(String(timestamp));

  if (!Number.isNaN(dataTexto.getTime())) {
    return dataTexto.toISOString();
  }

  return new Date().toISOString();
}

async function atualizarUltimaMensagemRecebidaConversa(params: {
  empresaId: string;
  conversaId: string;
  timestamp?: string | number | null;
}) {
  const dataMensagemRecebida = timestampWhatsappParaIso(params.timestamp);
  const agora = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("conversas")
    .update({
      last_message_at: dataMensagemRecebida,
      last_inbound_message_at: dataMensagemRecebida,
      updated_at: agora,
    })
    .eq("empresa_id", params.empresaId)
    .eq("id", params.conversaId);

  if (error) {
    throw new Error(
      `Erro ao atualizar last_inbound_message_at da conversa: ${error.message}`
    );
  }
}

async function buscarMensagemExistentePorExternaId(
  mensagemExternaId: string
) {
  if (!mensagemExternaId) return null;

  const { data, error } = await supabaseAdmin
    .from("mensagens")
    .select("id, conversa_id, metadata_json")
    .eq("mensagem_externa_id", mensagemExternaId)
    .maybeSingle();

  if (error) {
    console.error(
      "[WEBHOOK WHATSAPP] Erro ao buscar mensagem existente:",
      error
    );

    return null;
  }

  return data || null;
}

async function marcarMensagemAutomacaoProcessada(params: {
  mensagemId: string | null | undefined;
  automationResult: any;
}) {
  const { mensagemId, automationResult } = params;

  if (!mensagemId) return;

  const { data: mensagemAtual } = await supabaseAdmin
    .from("mensagens")
    .select("metadata_json")
    .eq("id", mensagemId)
    .maybeSingle();

  const metadataAtual = mensagemAtual?.metadata_json || {};

  await supabaseAdmin
    .from("mensagens")
    .update({
      metadata_json: {
        ...metadataAtual,
        automacao_processada: true,
        automacao_processada_em: new Date().toISOString(),
        automacao_resultado: automationResult || null,
      },
    })
    .eq("id", mensagemId);
}

export async function processWhatsAppWebhookBody(body: WhatsAppWebhookBody) {
  const inicioProcessamentoWebhook = Date.now();
  if (body.object !== "whatsapp_business_account") {
    throw new Error("Evento nao e do WhatsApp.");
  }

  const incomingMessages = extractIncomingMessages(body);
  const incomingStatuses = extractMessageStatuses(body);

  if (incomingMessages.length === 0 && incomingStatuses.length === 0) {
    return {
      success: true,
      message: "Evento recebido sem mensagens nem status processaveis",
      totals: {
        incomingMessages: 0,
        incomingStatuses: 0,
        processed: 0,
        successCount: 0,
        errorCount: 0,
      },
      results: [],
    };
  }

  const processedResults: Array<Record<string, unknown>> = [];

  for (const statusItem of incomingStatuses) {
    try {
      const updateResult = await updateWhatsAppMessageStatus({
        mensagemExternaId: statusItem.mensagemExternaId,
        status: statusItem.status,
        timestamp: statusItem.timestamp,
        metadata: {
          recipient_id: statusItem.recipientId,
          conversation_id: statusItem.conversationId,
          conversation_origin_type: statusItem.conversationOriginType,
          expiration_timestamp: statusItem.expirationTimestamp,
          pricing_category: statusItem.pricingCategory,
          pricing_model: statusItem.pricingModel,
          pricing_billable: statusItem.pricingBillable,
          error_message: statusItem.errorMessage,
          raw_status: statusItem.rawStatus,
        },
      });

      processedResults.push({
        type: "status",
        mensagemExternaId: statusItem.mensagemExternaId,
        status: statusItem.status,
        success: true,
        found: updateResult.found,
        updated: updateResult.updated,
        reason: updateResult.reason ?? null,
        messageIdInterno: updateResult.messageId ?? null,
      });
    } catch (statusError) {
      console.error(
        "[WEBHOOK WHATSAPP] Erro ao processar status individual:",
        statusError
      );

      processedResults.push({
        type: "status",
        mensagemExternaId: statusItem.mensagemExternaId,
        status: statusItem.status,
        success: false,
        reason:
          statusError instanceof Error
            ? statusError.message
            : "Erro desconhecido ao processar status",
      });
    }
  }

  for (const message of incomingMessages) {
    const inicioMensagem = Date.now();
    try {
      const inicioIntegracao = Date.now();

      const integration = await findWhatsAppIntegrationByPhoneNumberId(
        message.phoneNumberId
      );

      perf("PROCESS / buscar integração", inicioIntegracao, {
        phoneNumberId: message.phoneNumberId,
      });

      if (!integration) {
        console.warn(
          "[WEBHOOK WHATSAPP] Integracao nao encontrada para phoneNumberId:",
          message.phoneNumberId
        );

        processedResults.push({
          messageId: message.messageId,
          success: false,
          reason: "integracao nao encontrada",
          phoneNumberId: message.phoneNumberId,
        });

        continue;
      }

      if (integration.status !== "ativa") {
        console.warn(
          "[WEBHOOK WHATSAPP] Integracao encontrada, mas inativa:",
          integration.id
        );

        processedResults.push({
          messageId: message.messageId,
          success: false,
          reason: "integracao inativa",
          integrationId: integration.id,
        });

        continue;
      }

      const inicioContato = Date.now();

      const contact = await findOrCreateWhatsAppContact({
        empresaId: integration.empresa_id,
        phone: message.from,
        profileName: message.profileName,
      });

      perf("PROCESS / buscar ou criar contato", inicioContato, {
        contatoId: contact.id,
      });

      const inicioConversa = Date.now();

      const conversation = await findOrCreateWhatsAppConversation({
        empresaId: integration.empresa_id,
        contatoId: contact.id,
        integracaoWhatsappId: integration.id,
      });

      perf("PROCESS / buscar ou criar conversa", inicioConversa, {
        conversaId: conversation.id,
      });

      await atualizarUltimaMensagemRecebidaConversa({
        empresaId: integration.empresa_id,
        conversaId: conversation.id,
        timestamp: message.timestamp,
      });

      const conversaEmAtendimentoHumano =
        conversation.status === "em_atendimento" &&
        !!conversation.responsavel_id &&
        conversation.bot_ativo !== true;

      const deveTranscreverAudioAutomaticamente = !conversaEmAtendimentoHumano;

      const { data: protocoloAtivo, error: protocoloAtivoError } =
        await supabaseAdmin
          .from("conversa_protocolos")
          .select("id")
          .eq("conversa_id", conversation.id)
          .eq("ativo", true)
          .maybeSingle();

      if (protocoloAtivoError) {
        throw new Error(
          `Erro ao buscar protocolo ativo da conversa: ${protocoloAtivoError.message}`
        );
      }

      const metadataJson = (message.metadataJson || {}) as any;

      let textoAutomacao =
        message.text?.trim() ||
        metadataJson?.interactive?.button_reply?.id ||
        metadataJson?.interactive?.button_reply?.title ||
        "";

      let transcricaoAudio: string | null = null;
      let audioSemTranscricao = false;

      if (message.tipoMensagem === "audio") {
        if (deveTranscreverAudioAutomaticamente) {
          try {
            const mediaId =
              metadataJson?.media_id ||
              metadataJson?.audio?.id ||
              message.rawMessage?.audio?.id;

            if (mediaId) {
              const audioBuffer = await baixarAudioWhatsApp(mediaId);

              transcricaoAudio = await transcreverAudioComIA({
                audioBuffer,
                fileName: `${mediaId}.ogg`,
              });

              if (transcricaoAudio && transcricaoAudio.trim()) {
                textoAutomacao = transcricaoAudio.trim();
              } else {
                textoAutomacao = "";
                audioSemTranscricao = true;

                console.warn("[WEBHOOK WHATSAPP] Audio sem transcricao util:", {
                  mediaId,
                });
              }
            } else {
              textoAutomacao = "";
              audioSemTranscricao = true;

              console.warn("[WEBHOOK WHATSAPP] Audio recebido sem mediaId.");
            }
          } catch (audioError) {
            textoAutomacao = "";
            audioSemTranscricao = true;

            console.error("[WEBHOOK WHATSAPP] Erro ao transcrever audio:", audioError);
          }
        } else {
          textoAutomacao = "";
          transcricaoAudio = null;
          audioSemTranscricao = false;
        }
      }

      const payloadSalvarMensagem: any = {
        empresaId: integration.empresa_id,
        conversaId: conversation.id,
        conteudo: transcricaoAudio || message.conteudo,
        tipoMensagem: message.tipoMensagem,
        statusEnvio: "entregue",
        mensagemExternaId: message.messageId,
        timestamp: message.timestamp,
        metadataJson: {
          ...(message.metadataJson || {}),
          transcricao_audio: transcricaoAudio || null,
          transcricao_modelo: transcricaoAudio ? "gpt-4o-mini-transcribe" : null,
          transcricao_automatica: !!transcricaoAudio,
        },
        conversaProtocoloId: protocoloAtivo?.id ?? null,
      };

      const savedMessage = await saveIncomingWhatsAppMessage(payloadSalvarMensagem);

      const mensagemExistente = savedMessage.duplicated
        ? await buscarMensagemExistentePorExternaId(message.messageId)
        : null;

      const mensagemInternaId =
        savedMessage.messageId || mensagemExistente?.id || null;

      const conversaIdParaProcessar =
        mensagemExistente?.conversa_id || conversation.id;

      const automacaoJaProcessada =
        mensagemExistente?.metadata_json?.automacao_processada === true;


      if (
        deveTranscreverAudioAutomaticamente &&
        audioSemTranscricao &&
        !automacaoJaProcessada
      ) {
        const phoneNumberId =
          integration.phone_number_id ||
          process.env.WHATSAPP_PHONE_NUMBER_ID ||
          "";

        const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || "";

        const mensagemAvisoAudio =
          "Nao consegui entender o audio. Pode enviar novamente falando mais claro ou escrever sua resposta?";

        if (phoneNumberId && accessToken) {
          const envioAviso = await sendWhatsAppTextMessage({
            phoneNumberId,
            accessToken,
            to: message.from,
            body: mensagemAvisoAudio,
          });

          const { data: protocoloMensagemAviso } = await supabaseAdmin
            .from("conversa_protocolos")
            .select("id")
            .eq("conversa_id", conversation.id)
            .eq("ativo", true)
            .maybeSingle();

          await supabaseAdmin.from("mensagens").insert({
            empresa_id: integration.empresa_id,
            conversa_id: conversation.id,
            conversa_protocolo_id:
              protocoloMensagemAviso?.id || protocoloAtivo?.id || null,
            remetente_tipo: "bot",
            conteudo: mensagemAvisoAudio,
            tipo_mensagem: "texto",
            origem: "automatica",
            status_envio: envioAviso.ok ? "enviada" : "falha",
            mensagem_externa_id: envioAviso.messageId,
            metadata_json: {
              tipo: "aviso_audio_sem_transcricao",
              meta_response: envioAviso.raw,
              erro: envioAviso.error,
            },
          });
        } else {
          console.error(
            "[WEBHOOK WHATSAPP] Nao foi possivel enviar aviso de audio invalido: phoneNumberId ou accessToken ausente."
          );
        }
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

      const mediaId = extrairMediaId(message, metadataJson);
      const mimeType = extrairMimeType(message, metadataJson);
      const arquivoNome = extrairArquivoNome(message, metadataJson);

      const ehArquivoParaAutomacao = ["imagem", "documento"].includes(
        message.tipoMensagem
      );

      const podeRodarAutomacao =
        !automacaoJaProcessada &&
        ((["texto", "botao", "audio"].includes(message.tipoMensagem) &&
          !!textoAutomacao.trim()) ||
          (ehArquivoParaAutomacao && !!mediaId));

        if (podeRodarAutomacao) {
          const inicioAutomacao = Date.now();
          automationResult = await processAutomationEngine({
            empresaId: integration.empresa_id,
            conversaId: conversaIdParaProcessar,
          contatoId: contact.id,
          mensagemTexto:
            textoAutomacao ||
            arquivoNome ||
            message.conteudo ||
            "arquivo_recebido",
          numeroDestino: message.from,
          mensagemTipo: tipoMensagemParaAutomacao(message.tipoMensagem),
          mediaId,
          mimeType,
          arquivoNome,
          mensagemId: mensagemInternaId,
        });

        perf("PROCESS / automação total", inicioAutomacao, {
          status: automationResult?.status ?? null,
          execucaoId: automationResult?.execucaoId ?? null,
        });
      }

      if (podeRodarAutomacao) {
        await marcarMensagemAutomacaoProcessada({
          mensagemId: mensagemInternaId,
          automationResult,
        });
      }

      processedResults.push({
        messageId: message.messageId,
        success: true,
        duplicated: savedMessage.duplicated,
        integrationId: integration.id,
        contactId: contact.id,
        conversationId: conversaIdParaProcessar,
        conversaProtocoloId: protocoloAtivo?.id ?? null,
        savedMessageId: mensagemInternaId,
        tipoMensagem: message.tipoMensagem,
        automationOk: automationResult?.ok ?? false,
        automationStatus: automationResult?.status ?? null,
        automationExecucaoId: automationResult?.execucaoId ?? null,
        automationFluxoId: automationResult?.fluxoId ?? null,
        automationError: automationResult?.error ?? null,
      });
    } catch (messageError) {
      console.error(
        "[WEBHOOK WHATSAPP] Erro ao processar mensagem individual:",
        messageError
      );

      perf("PROCESS / mensagem total", inicioMensagem, {
        messageId: message.messageId,
        tipoMensagem: message.tipoMensagem,
      });

      processedResults.push({
        messageId: message.messageId,
        success: false,
        tipoMensagem: message.tipoMensagem,
        reason:
          messageError instanceof Error
            ? messageError.message
            : "Erro desconhecido ao processar mensagem",
      });
    }
  }

  return {
    success: true,
    message: "Webhook processado",
    totals: {
      incomingMessages: incomingMessages.length,
      incomingStatuses: incomingStatuses.length,
      processed: processedResults.length,
      successCount: processedResults.filter((item) => item.success).length,
      errorCount: processedResults.filter((item) => !item.success).length,
    },
    results: processedResults,
  };
}
