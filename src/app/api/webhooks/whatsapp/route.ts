import { NextRequest, NextResponse } from "next/server";
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

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const supabaseAdmin = getSupabaseAdmin();

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;

    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    if (!mode || !token || !challenge) {
      return new NextResponse("Parâmetros ausentes", { status: 400 });
    }

    if (mode !== "subscribe") {
      return new NextResponse("Modo inválido", { status: 400 });
    }

    if (!VERIFY_TOKEN) {
      console.error(
        "WHATSAPP_WEBHOOK_VERIFY_TOKEN não definido nas variáveis de ambiente"
      );
      return new NextResponse("Erro interno de configuração", { status: 500 });
    }

    if (token !== VERIFY_TOKEN) {
      return new NextResponse("Token de verificação inválido", { status: 403 });
    }

    return new NextResponse(challenge, { status: 200 });
  } catch (error) {
    console.error("Erro ao validar webhook do WhatsApp:", error);
    return new NextResponse("Erro interno", { status: 500 });
  }
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

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as WhatsAppWebhookBody;

    console.log(
      "[WEBHOOK WHATSAPP] Payload recebido:",
      JSON.stringify(body, null, 2)
    );

    if (body.object !== "whatsapp_business_account") {
      return NextResponse.json(
        { success: false, error: "Evento não é do WhatsApp" },
        { status: 400 }
      );
    }

    const incomingMessages = extractIncomingMessages(body);
    const incomingStatuses = extractMessageStatuses(body);

    console.log(
      "[WEBHOOK WHATSAPP] Status extraídos:",
      JSON.stringify(incomingStatuses, null, 2)
    );

    console.log(
      "[WEBHOOK WHATSAPP] Mensagens extraídas:",
      JSON.stringify(incomingMessages, null, 2)
    );

    if (incomingMessages.length === 0 && incomingStatuses.length === 0) {
      return NextResponse.json(
        {
          success: true,
          message: "Evento recebido sem mensagens nem status processáveis",
        },
        { status: 200 }
      );
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
      try {
        const integration = await findWhatsAppIntegrationByPhoneNumberId(
          message.phoneNumberId
        );

        if (!integration) {
          console.warn(
            "[WEBHOOK WHATSAPP] Integração não encontrada para phoneNumberId:",
            message.phoneNumberId
          );

          processedResults.push({
            messageId: message.messageId,
            success: false,
            reason: "integração não encontrada",
            phoneNumberId: message.phoneNumberId,
          });

          continue;
        }

        if (integration.status !== "ativa") {
          console.warn(
            "[WEBHOOK WHATSAPP] Integração encontrada, mas inativa:",
            integration.id
          );

          processedResults.push({
            messageId: message.messageId,
            success: false,
            reason: "integração inativa",
            integrationId: integration.id,
          });

          continue;
        }

        const contact = await findOrCreateWhatsAppContact({
          empresaId: integration.empresa_id,
          phone: message.from,
          profileName: message.profileName,
        });

        const conversation = await findOrCreateWhatsAppConversation({
          empresaId: integration.empresa_id,
          contatoId: contact.id,
          integracaoWhatsappId: integration.id,
        });

        const conversaEmAtendimentoHumano =
          conversation.status === "em_atendimento" &&
          !!conversation.responsavel_id &&
          conversation.bot_ativo !== true;

        const deveTranscreverAudioAutomaticamente =
          !conversaEmAtendimentoHumano;
          
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

                  console.warn("[WEBHOOK WHATSAPP] Áudio sem transcrição útil:", {
                    mediaId,
                  });
                }

                console.log("[WEBHOOK WHATSAPP] Áudio transcrito automaticamente:", {
                  mediaId,
                  conversaId: conversation.id,
                  texto: transcricaoAudio,
                });
              } else {
                textoAutomacao = "";
                audioSemTranscricao = true;

                console.warn("[WEBHOOK WHATSAPP] Áudio recebido sem mediaId.");
              }
            } catch (audioError) {
              textoAutomacao = "";
              audioSemTranscricao = true;

              console.error("[WEBHOOK WHATSAPP] Erro ao transcrever áudio:", audioError);
            }
          } else {
            textoAutomacao = "";
            transcricaoAudio = null;
            audioSemTranscricao = false;

            console.log(
              "[WEBHOOK WHATSAPP] Áudio em atendimento humano. Transcrição automática ignorada.",
              {
                conversaId: conversation.id,
                status: conversation.status,
                responsavelId: conversation.responsavel_id,
              }
            );
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

        const savedMessage = await saveIncomingWhatsAppMessage(
          payloadSalvarMensagem
        );

        if (
          deveTranscreverAudioAutomaticamente &&
          audioSemTranscricao &&
          !savedMessage.duplicated
        ) {
          const phoneNumberId =
            integration.phone_number_id ||
            process.env.WHATSAPP_PHONE_NUMBER_ID ||
            "";

          const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || "";

          const mensagemAvisoAudio =
            "Não consegui entender o áudio. Pode enviar novamente falando mais claro ou escrever sua resposta?";

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
              "[WEBHOOK WHATSAPP] Não foi possível enviar aviso de áudio inválido: phoneNumberId ou accessToken ausente."
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
          !savedMessage.duplicated &&
          (
            (
              ["texto", "botao", "audio"].includes(message.tipoMensagem) &&
              !!textoAutomacao.trim()
            ) ||
            (
              ehArquivoParaAutomacao &&
              !!mediaId
            )
          );

        if (podeRodarAutomacao) {
          automationResult = await processAutomationEngine({
            empresaId: integration.empresa_id,
            conversaId: conversation.id,
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
            mensagemId: savedMessage.messageId,
          });
        }

        processedResults.push({
          messageId: message.messageId,
          success: true,
          duplicated: savedMessage.duplicated,
          integrationId: integration.id,
          contactId: contact.id,
          conversationId: conversation.id,
          conversaProtocoloId: protocoloAtivo?.id ?? null,
          savedMessageId: savedMessage.messageId,
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

    return NextResponse.json(
      {
        success: true,
        message: "Webhook processado",
        totals: {
          incomingMessages: incomingMessages.length,
          processed: processedResults.length,
          successCount: processedResults.filter((item) => item.success).length,
          errorCount: processedResults.filter((item) => !item.success).length,
        },
        results: processedResults,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao processar webhook do WhatsApp:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao processar webhook" },
      { status: 500 }
    );
  }
}