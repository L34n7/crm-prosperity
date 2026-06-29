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
import { atribuirCampanhaPorMensagemWhatsApp } from "@/lib/rastreamento/atribuir-campanha-whatsapp";
import { salvarAtribuicaoMetaAnuncio } from "@/lib/whatsapp/meta-attribution";
import { atualizarItemDisparoPeloWebhook } from "@/lib/whatsapp/disparo-fila";

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

  const { data: conversaAtualizada, error } = await supabaseAdmin
    .from("conversas")
    .update({
      last_message_at: dataMensagemRecebida,
      last_inbound_message_at: dataMensagemRecebida,
      updated_at: agora,
    })
    .eq("empresa_id", params.empresaId)
    .eq("id", params.conversaId)
    .select("status")
    .single();

  if (error) {
    throw new Error(
      `Erro ao atualizar last_inbound_message_at da conversa: ${error.message}`
    );
  }

  return conversaAtualizada?.status || null;
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

function extrairErroStatusMeta(statusItem: any) {
  const rawStatus = statusItem?.rawStatus || {};

  const primeiroErro =
    Array.isArray(rawStatus?.errors) && rawStatus.errors.length > 0
      ? rawStatus.errors[0]
      : null;

  const codigo = primeiroErro?.code
    ? Number(primeiroErro.code)
    : null;

  const detalhe =
    primeiroErro?.error_data?.details ||
    primeiroErro?.message ||
    primeiroErro?.title ||
    statusItem?.errorMessage ||
    null;

  let mensagemTraduzida: string | null = detalhe;

  if (codigo === 131026) {
    mensagemTraduzida =
      "Não foi possível entregar a mensagem ao destinatário. Verifique se o número possui WhatsApp ativo e está informado corretamente.";
  } else if (codigo === 131042) {
    mensagemTraduzida =
      "Não foi possível enviar a mensagem devido a uma pendência de pagamento na conta do WhatsApp Business.";
  } else if (codigo === 131047) {
    mensagemTraduzida =
      "Não foi possível enviar a mensagem porque a janela de atendimento de 24 horas foi encerrada.";
  } else if (codigo === 131049) {
    mensagemTraduzida =
      "A mensagem não foi entregue devido aos limites de qualidade ou frequência definidos pela Meta.";
  } else if (!mensagemTraduzida) {
    mensagemTraduzida =
      "A Meta informou uma falha ao entregar a mensagem.";
  }

  return {
    codigo,
    detalhe,
    mensagemTraduzida,
    erroOriginal: primeiroErro,
  };
}

async function atualizarLogDisparoPeloWebhook(statusItem: any) {
  const mensagemExternaId = String(
    statusItem?.mensagemExternaId || ""
  ).trim();

  const statusRecebido = String(
    statusItem?.status ||
    statusItem?.rawStatus?.status ||
    ""
  ).toLowerCase();

  const statusNormalizado =
    statusRecebido === "failed" || statusRecebido === "falha"
      ? "falha"
      : statusRecebido === "delivered" || statusRecebido === "entregue"
        ? "entregue"
        : statusRecebido === "read" || statusRecebido === "lida"
          ? "lida"
          : statusRecebido === "sent" || statusRecebido === "enviada"
            ? "enviada"
            : statusRecebido === "accepted" ||
                statusRecebido === "processando"
              ? "processando"
              : statusRecebido;

  if (!mensagemExternaId) {
    return {
      found: false,
      updated: false,
      reason: "mensagem_externa_id_ausente",
    };
  }

  /*
   * O status "sent" ainda não confirma que a mensagem foi entregue.
   * Nesse caso, mantemos o log como "processando".
   *
   * Somente "delivered", "read" e "failed" alteram o resultado final.
   */
  if (
    statusNormalizado !== "falha" &&
    statusNormalizado !== "enviada" &&
    statusNormalizado !== "entregue" &&
    statusNormalizado !== "lida"
  ) {
    return {
      found: false,
      updated: false,
      reason: "status_sem_atualizacao_definitiva",
      statusRecebido,
      statusNormalizado,
    };
  }

  const { data: logDisparo, error: erroBusca } = await supabaseAdmin
    .from("whatsapp_disparos_logs")
    .select("id, status, erro, metadata_json")
    .eq("message_id", mensagemExternaId)
    .maybeSingle();

  if (erroBusca) {
    throw new Error(
      `Erro ao buscar log do disparo pelo message_id: ${erroBusca.message}`
    );
  }

  if (!logDisparo) {
    return {
      found: false,
      updated: false,
      reason: "log_disparo_nao_encontrado",
    };
  }

  const agora = new Date().toISOString();

  const metadataAnterior =
    logDisparo.metadata_json &&
    typeof logDisparo.metadata_json === "object" &&
    !Array.isArray(logDisparo.metadata_json)
      ? logDisparo.metadata_json
      : {};

  let novoStatus: "sucesso" | "falha";
  let erroDisparo: string | null = null;
  let erroMeta: ReturnType<typeof extrairErroStatusMeta> | null = null;

  if (statusNormalizado === "falha") {
    novoStatus = "falha";
    erroMeta = extrairErroStatusMeta(statusItem);
    erroDisparo = erroMeta.mensagemTraduzida;
  } else {
    novoStatus = "sucesso";
    erroDisparo = null;
  }

  const metadataAtualizada = {
    ...metadataAnterior,
    aguardando_webhook: statusNormalizado === "enviada",
    confirmacao_entrega_pendente: statusNormalizado === "enviada",
    ultimo_status_meta: statusNormalizado,
    status_original_recebido: statusRecebido,
    status_meta_recebido_em: agora,

    erro_meta:
      statusNormalizado === "falha"
        ? {
            codigo: erroMeta?.codigo ?? null,
            detalhe: erroMeta?.detalhe ?? null,
            original: erroMeta?.erroOriginal ?? null,
          }
        : null,

    webhook_status_raw: statusItem?.rawStatus || null,
  };

  const { error: erroAtualizacao } = await supabaseAdmin
    .from("whatsapp_disparos_logs")
    .update({
      status: novoStatus,
      erro: erroDisparo,
      metadata_json: metadataAtualizada,
      updated_at: agora,
    })
    .eq("id", logDisparo.id);

  if (erroAtualizacao) {
    throw new Error(
      `Erro ao atualizar log do disparo: ${erroAtualizacao.message}`
    );
  }

  try {
    await atualizarItemDisparoPeloWebhook({
      messageId: mensagemExternaId,
      statusNormalizado,
      erro: erroDisparo,
      erroCodigoMeta: erroMeta?.codigo ?? null,
      rawStatus: statusItem?.rawStatus || null,
    });
  } catch (itemDisparoError) {
    console.error(
      "[WEBHOOK WHATSAPP] Erro ao atualizar item da campanha pelo webhook:",
      itemDisparoError
    );
  }

  return {
    found: true,
    updated: true,
    status: novoStatus,
    erro: erroDisparo,
  };
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
          pricing_type: statusItem.pricingType,
          pricing_model: statusItem.pricingModel,
          pricing_billable: statusItem.pricingBillable,
          error_message: statusItem.errorMessage,
          raw_status: statusItem.rawStatus,
        },
      });

      let resultadoLogDisparo: {
        found: boolean;
        updated: boolean;
        reason?: string;
        status?: string;
        erro?: string | null;
      } = {
        found: false,
        updated: false,
        reason: "nao_processado",
      };

      try {
        resultadoLogDisparo =
          await atualizarLogDisparoPeloWebhook(statusItem);
      } catch (logDisparoError) {
        console.error(
          "[WEBHOOK WHATSAPP] Erro ao atualizar whatsapp_disparos_logs:",
          {
            mensagemExternaId: statusItem.mensagemExternaId,
            status: statusItem.status,
            erro:
              logDisparoError instanceof Error
                ? logDisparoError.message
                : String(logDisparoError),
          }
        );

        resultadoLogDisparo = {
          found: false,
          updated: false,
          reason:
            logDisparoError instanceof Error
              ? logDisparoError.message
              : "erro_desconhecido",
        };
      }

      try {
        const integration = await findWhatsAppIntegrationByPhoneNumberId(
          statusItem.phoneNumberId
        );

        if (integration) {
          await salvarAtribuicaoMetaAnuncio({
            empresaId: integration.empresa_id,
            integracaoWhatsappId: integration.id,
            mensagemId: updateResult.messageId ?? null,
            mensagemExternaId: statusItem.mensagemExternaId,
            conversationOriginType: statusItem.conversationOriginType,
            pricingType: statusItem.pricingType,
            pricingCategory: statusItem.pricingCategory,
            pricingModel: statusItem.pricingModel,
            pricingBillable: statusItem.pricingBillable,
            payloadTipo: "status",
            payloadJson: statusItem.rawStatus as Record<string, unknown>,
          });
        }
      } catch (attributionError) {
        console.error("[META REFERRAL] Erro ao salvar status de atribuicao", {
          messageId: statusItem.mensagemExternaId,
          erro:
            attributionError instanceof Error
              ? attributionError.message
              : String(attributionError),
        });
      }

      processedResults.push({
        type: "status",
        mensagemExternaId: statusItem.mensagemExternaId,
        status: statusItem.status,
        success: true,

        found: updateResult.found,
        updated: updateResult.updated,
        reason: updateResult.reason ?? null,
        messageIdInterno: updateResult.messageId ?? null,

        logDisparoFound: resultadoLogDisparo.found,
        logDisparoUpdated: resultadoLogDisparo.updated,
        logDisparoStatus: resultadoLogDisparo.status ?? null,
        logDisparoReason: resultadoLogDisparo.reason ?? null,
        logDisparoErro: resultadoLogDisparo.erro ?? null,
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

      let conversation = await findOrCreateWhatsAppConversation({
        empresaId: integration.empresa_id,
        contatoId: contact.id,
        integracaoWhatsappId: integration.id,
      });

      perf("PROCESS / buscar ou criar conversa", inicioConversa, {
        conversaId: conversation.id,
      });

      const atribuicaoCampanhaMensagem = await atribuirCampanhaPorMensagemWhatsApp({
        empresaId: integration.empresa_id,
        contatoId: contact.id,
        conversaId: conversation.id,
        conteudo: message.conteudo || message.text,
      });

      if (message.referral) {
        console.log("[META REFERRAL]", {
          messageId: message.messageId,
          sourceId: message.referral?.source_id ?? null,
          ctwaClid: message.referral?.ctwa_clid ?? null,
        });

        try {
          await salvarAtribuicaoMetaAnuncio({
            empresaId: integration.empresa_id,
            contatoId: contact.id,
            conversaId: conversation.id,
            integracaoWhatsappId: integration.id,
            mensagemExternaId: message.messageId,
            referral: message.referral,
            numeroWhatsapp: integration.numero,
            atribuirRastreamento: !atribuicaoCampanhaMensagem,
            payloadTipo: "message",
            payloadJson: message.rawMessage as Record<string, unknown>,
          });
        } catch (attributionError) {
          console.error("[META REFERRAL] Erro ao salvar atribuicao da mensagem", {
            messageId: message.messageId,
            erro:
              attributionError instanceof Error
                ? attributionError.message
                : String(attributionError),
          });
        }
      }

      const statusAposRegistrarMensagem =
        await atualizarUltimaMensagemRecebidaConversa({
          empresaId: integration.empresa_id,
          conversaId: conversation.id,
          timestamp: message.timestamp,
        });

      if (
        [
          "encerrada",
          "encerrado_manual",
          "encerrado_24h",
          "encerrado_aut",
        ].includes(statusAposRegistrarMensagem || "")
      ) {
        conversation = await findOrCreateWhatsAppConversation({
          empresaId: integration.empresa_id,
          contatoId: contact.id,
          integracaoWhatsappId: integration.id,
        });
      }

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
      let falhaAoTranscreverAudio = false;

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
                empresaId: integration.empresa_id,
                metadata: {
                  origem_evento: "webhook_whatsapp",
                  conversa_id: conversation.id,
                  contato_id: contact.id,
                  media_id: mediaId,
                },
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
            falhaAoTranscreverAudio = true;

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
          whatsapp_profile_name: message.profileName || null,
          whatsapp_wa_id: message.waId || null,
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

      if (message.referral) {
        try {
          await salvarAtribuicaoMetaAnuncio({
            empresaId: integration.empresa_id,
            contatoId: contact.id,
            conversaId: conversation.id,
            mensagemId: mensagemInternaId,
            integracaoWhatsappId: integration.id,
            mensagemExternaId: message.messageId,
            referral: message.referral,
            atribuirRastreamento: false,
            payloadTipo: "message",
            payloadJson: message.rawMessage as Record<string, unknown>,
          });
        } catch (attributionError) {
          console.error("[META REFERRAL] Erro ao salvar atribuicao da mensagem", {
            messageId: message.messageId,
            erro:
              attributionError instanceof Error
                ? attributionError.message
                : String(attributionError),
          });
        }
      }

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

        const mensagemAvisoAudio = falhaAoTranscreverAudio
          ? "No momento não consegui ouvir seu áudio por aqui. Pode me enviar uma mensagem de texto, por favor?"
          : "Nao consegui entender o áudio. Pode enviar novamente falando mais claro ou escrever uma mensagem";

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
              tipo: falhaAoTranscreverAudio
                ? "aviso_falha_transcricao_audio"
                : "aviso_audio_sem_transcricao",
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
