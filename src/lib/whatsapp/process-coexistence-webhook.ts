import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  findWhatsAppIntegrationByPhoneNumberId,
  findWhatsAppIntegrationByWabaId,
  type WhatsAppIntegration,
} from "@/lib/whatsapp/find-integration";
import { findOrCreateWhatsAppContact } from "@/lib/whatsapp/find-or-create-contact";
import { findOrCreateWhatsAppConversation } from "@/lib/whatsapp/find-or-create-conversation";
import {
  extractCoexistenceContacts,
  extractCoexistenceHistoryStates,
  extractCoexistenceMessageEchoes,
  extractWhatsAppAccountUpdates,
  type ExtractedCoexistenceEcho,
  type WhatsAppWebhookBody,
} from "@/lib/whatsapp/meta";
import { normalizeWhatsAppIntegrationMode } from "@/lib/whatsapp/integration-mode";
import { isCoexistenceSyncTerminalStatus } from "@/lib/whatsapp/coexistence-sync-policy";
import {
  enqueueCoexistenceHistory,
  finishCoexistenceIntegrationIfReady,
  refreshCoexistenceHistoryStats,
} from "@/lib/whatsapp/coexistence-history-queue";

const supabase = getSupabaseAdmin();

function timestampToIso(value?: string | null) {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) {
    const date = new Date(number < 100000000000 ? number * 1000 : number);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  if (value) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  return new Date().toISOString();
}

function normalizeCoexistenceMessageType(value?: string | null) {
  const allowedTypes = new Set([
    "audio",
    "botao",
    "imagem",
    "template",
    "texto",
    "video",
    "documento",
    "contato",
    "localizacao",
    "lista",
    "unsupported",
  ]);

  const normalized = String(value || "").toLowerCase().trim();

  return allowedTypes.has(normalized) ? normalized : "texto";
}

async function findActiveProtocolId(conversationId: string) {
  const { data, error } = await supabase
    .from("conversa_protocolos")
    .select("id")
    .eq("conversa_id", conversationId)
    .eq("ativo", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Erro ao buscar protocolo da conversa: ${error.message}`
    );
  }

  return data?.id || null;
}

async function updateConversationLastMessage(
  conversation: { id: string; last_message_at?: string | null },
  messageAt: string
) {
  const current = conversation.last_message_at
    ? new Date(conversation.last_message_at).getTime()
    : 0;
  const incoming = new Date(messageAt).getTime();

  if (Number.isNaN(incoming) || incoming <= current) return;

  const { error } = await supabase
    .from("conversas")
    .update({
      last_message_at: messageAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversation.id);

  if (error) {
    throw new Error(
      `Erro ao atualizar data da conversa: ${error.message}`
    );
  }

  conversation.last_message_at = messageAt;
}

async function saveCoexistenceMessage(params: {
  integration: WhatsAppIntegration;
  conversation: { id: string; last_message_at?: string | null };
  protocolId?: string | null;
  message: ExtractedCoexistenceEcho;
}) {
  const messageAt = timestampToIso(params.message.timestamp);
  const { data: existing, error: existingError } = await supabase
    .from("mensagens")
    .select("id, metadata_json")
    .eq("mensagem_externa_id", params.message.messageId)
    .maybeSingle();

  if (existingError) {
    throw new Error(
      `Erro ao verificar mensagem Coexistence: ${existingError.message}`
    );
  }

  if (existing) {
    return {
      id: existing.id,
      duplicated: true,
      messageAt,
    };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("mensagens")
    .insert({
      empresa_id: params.integration.empresa_id,
      conversa_id: params.conversation.id,
      conversa_protocolo_id: params.protocolId || null,
      remetente_tipo: "usuario",
      remetente_id: null,
      conteudo:
        String(params.message.conteudo || "").trim() ||
        "⚠️ Conteúdo enviado pelo WhatsApp Business indisponível.",
      tipo_mensagem: normalizeCoexistenceMessageType(
        params.message.tipoMensagem
      ),
      tipo_original_meta:
        params.message.metadataJson?.tipo_original_whatsapp ||
        params.message.type ||
        null,
      origem: "enviada",
      status_envio: "enviada",
      mensagem_externa_id: params.message.messageId,
      metadata_json: {
        ...(params.message.metadataJson || {}),
        coex: true,
        coex_source: "business_app",
        coex_history: false,
        coex_direction: "outbound",
        automacao_processada: true,
        automacao_resultado: {
          ok: true,
          status: "ignorado_echo_business_app",
        },
        timestamp_original_whatsapp:
          params.message.timestamp || null,
      },
      created_at: messageAt,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return {
        id: null,
        duplicated: true,
        messageAt,
      };
    }

    throw new Error(
      `Erro ao salvar mensagem Coexistence: ${insertError.message}`
    );
  }

  await updateConversationLastMessage(params.conversation, messageAt);

  return {
    id: inserted.id,
    duplicated: false,
    messageAt,
  };
}

async function processMessageEchoes(body: WhatsAppWebhookBody) {
  const echoes = extractCoexistenceMessageEchoes(body);

  for (const echo of echoes) {
    const integration =
      await findWhatsAppIntegrationByPhoneNumberId(echo.phoneNumberId);
    if (
      !integration ||
      normalizeWhatsAppIntegrationMode(integration.modo_integracao) !==
        "coexistence"
    ) {
      continue;
    }

    const contact = await findOrCreateWhatsAppContact({
      empresaId: integration.empresa_id,
      phone: echo.to,
      salvarProfileNameWhatsapp: false,
    });
    const conversation = await findOrCreateWhatsAppConversation({
      empresaId: integration.empresa_id,
      contatoId: contact.id,
      integracaoWhatsappId: integration.id,
    });
    const protocolId = await findActiveProtocolId(conversation.id);

    await saveCoexistenceMessage({
      integration,
      conversation,
      protocolId,
      message: echo,
    });

    await supabase
      .from("conversas")
      .update({
        bot_ativo: false,
        origem_atendimento: "whatsapp_business_app",
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversation.id)
      .eq("empresa_id", integration.empresa_id);
  }

  return echoes.length;
}

async function processHistory(body: WhatsAppWebhookBody) {
  const result = await enqueueCoexistenceHistory(body);
  return result.received;
}

async function processContacts(body: WhatsAppWebhookBody) {
  const contacts = extractCoexistenceContacts(body);
  const affectedIntegrations = new Set<string>();

  for (const item of contacts) {
    const integration =
      await findWhatsAppIntegrationByPhoneNumberId(item.phoneNumberId);
    if (
      !integration ||
      normalizeWhatsAppIntegrationMode(integration.modo_integracao) !==
        "coexistence"
    ) {
      continue;
    }

    let contactId: string | null = null;
    if (item.action === "add") {
      const contact = await findOrCreateWhatsAppContact({
        empresaId: integration.empresa_id,
        phone: item.phone,
        profileName: item.fullName || item.firstName,
        salvarProfileNameWhatsapp: false,
      });
      contactId = contact.id;
    } else {
      const { data: existingSyncContact } = await supabase
        .from("whatsapp_coex_contatos")
        .select("contato_id")
        .eq("integracao_whatsapp_id", integration.id)
        .eq("telefone", item.phone)
        .maybeSingle();
      contactId = existingSyncContact?.contato_id || null;
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("whatsapp_coex_contatos")
      .upsert(
        {
          empresa_id: integration.empresa_id,
          integracao_whatsapp_id: integration.id,
          contato_id: contactId,
          telefone: item.phone,
          nome: item.fullName || item.firstName,
          acao_ultima: item.action,
          removido_em: item.action === "remove" ? now : null,
          meta_timestamp: item.timestamp,
          metadata_json: {
            phone_number_id: item.phoneNumberId,
          },
          updated_at: now,
        },
        {
          onConflict: "integracao_whatsapp_id,telefone",
        }
      );

    if (error) {
      throw new Error(
        `Erro ao sincronizar contato Coexistence: ${error.message}`
      );
    }

    affectedIntegrations.add(integration.id);
  }

  for (const integrationId of affectedIntegrations) {
    await supabase
      .from("whatsapp_coex_sync_jobs")
      .update({
        status: "concluido",
        progresso: 100,
        concluido_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("integracao_whatsapp_id", integrationId)
      .eq("tipo", "contacts");

    await finishCoexistenceIntegrationIfReady(integrationId);
  }

  return contacts.length;
}

async function updateHistorySyncState(body: WhatsAppWebhookBody) {
  const states = extractCoexistenceHistoryStates(body);
  const affectedIntegrations = new Set<string>();

  for (const state of states) {
    const integration =
      await findWhatsAppIntegrationByPhoneNumberId(state.phoneNumberId);
    if (!integration) continue;

    const declined = state.errorCode === 2593109;
    const completed = state.progress === 100;
    const status = declined
      ? "recusado_usuario"
      : state.errorCode
        ? "erro"
        : "processando";
    const now = new Date().toISOString();

    const { error } = await supabase
      .from("whatsapp_coex_sync_jobs")
      .update({
        status,
        progresso: declined ? 100 : state.progress || 0,
        meta_concluido:
          declined || completed || state.errorCode !== null,
        fase: state.phase,
        chunk_order: state.chunkOrder,
        erro_codigo: state.errorCode
          ? String(state.errorCode)
          : null,
        erro_mensagem: state.errorMessage,
        concluido_em: declined ? now : null,
        updated_at: now,
      })
      .eq("integracao_whatsapp_id", integration.id)
      .eq("tipo", "history");

    if (error) {
      throw new Error(
        `Erro ao atualizar progresso do histórico: ${error.message}`
      );
    }

    affectedIntegrations.add(integration.id);
  }

  for (const integrationId of affectedIntegrations) {
    await refreshCoexistenceHistoryStats(integrationId);

    const { data: jobs } = await supabase
      .from("whatsapp_coex_sync_jobs")
      .select("status")
      .eq("integracao_whatsapp_id", integrationId);
    const terminal =
      jobs?.length === 2 &&
      jobs.every((job) =>
        isCoexistenceSyncTerminalStatus(job.status)
      );

    if (terminal) {
      await supabase
        .from("integracoes_whatsapp")
        .update({
          coex_sync_completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", integrationId);
    }
  }

  return states.length;
}

async function processAccountUpdates(body: WhatsAppWebhookBody) {
  const updates = extractWhatsAppAccountUpdates(body);

  for (const update of updates) {
    if (update.event !== "PARTNER_REMOVED") continue;

    const integration = await findWhatsAppIntegrationByWabaId(
      update.wabaId
    );
    if (
      !integration ||
      normalizeWhatsAppIntegrationMode(integration.modo_integracao) !==
        "coexistence"
    ) {
      continue;
    }

    await supabase
      .from("integracoes_whatsapp")
      .update({
        status: "desconectada",
        coex_status: "desconectado",
        onboarding_status: "erro",
        onboarding_erro:
          update.reason === "PRIMARY_INACTIVITY"
            ? "A Meta desconectou a Coexistência por inatividade do WhatsApp Business App."
            : `A parceria do Coexistence foi removida pela Meta${
                update.reason ? `: ${update.reason}` : "."
              }`,
        config_json: {
          ...(integration.config_json || {}),
          coex_last_disconnection: update,
          coex_last_disconnection_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration.id)
      .eq("empresa_id", integration.empresa_id);
  }

  return updates.length;
}

export async function processCoexistenceWebhookBody(
  body: WhatsAppWebhookBody
) {
  const messageEchoes = await processMessageEchoes(body);
  const historyMessages = await processHistory(body);
  const contacts = await processContacts(body);
  const historyStates = await updateHistorySyncState(body);
  const accountUpdates = await processAccountUpdates(body);

  return {
    processed:
      messageEchoes +
      historyMessages +
      contacts +
      historyStates +
      accountUpdates,
    messageEchoes,
    historyMessages,
    contacts,
    historyStates,
    accountUpdates,
  };
}
