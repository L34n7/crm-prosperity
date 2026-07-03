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
  extractCoexistenceHistoryMessages,
  extractCoexistenceHistoryStates,
  extractCoexistenceMessageEchoes,
  extractWhatsAppAccountUpdates,
  type ExtractedCoexistenceHistoryMessage,
  type ExtractedCoexistenceEcho,
  type WhatsAppWebhookBody,
} from "@/lib/whatsapp/meta";
import { normalizeWhatsAppIntegrationMode } from "@/lib/whatsapp/integration-mode";

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

function mapHistoryStatus(value?: string | null) {
  switch (String(value || "").toUpperCase()) {
    case "READ":
    case "PLAYED":
      return "lida";
    case "DELIVERED":
      return "entregue";
    case "ERROR":
      return "falha";
    case "PENDING":
      return "pendente";
    case "SENT":
    default:
      return "enviada";
  }
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

async function findHistoryConversation(params: {
  integration: WhatsAppIntegration;
  contactId: string;
  firstMessageAt: string;
}) {
  const { data: existing, error: existingError } = await supabase
    .from("conversas")
    .select("*")
    .eq("empresa_id", params.integration.empresa_id)
    .eq("contato_id", params.contactId)
    .eq("integracao_whatsapp_id", params.integration.id)
    .eq("canal", "whatsapp")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(
      `Erro ao localizar conversa para o histórico: ${existingError.message}`
    );
  }

  if (existing) return existing;

  const now = new Date().toISOString();
  const { data: created, error: createError } = await supabase
    .from("conversas")
    .insert({
      empresa_id: params.integration.empresa_id,
      contato_id: params.contactId,
      setor_id: null,
      responsavel_id: null,
      integracao_whatsapp_id: params.integration.id,
      status: "encerrada",
      canal: "whatsapp",
      origem_atendimento: "historico_coexistence",
      prioridade: "media",
      assunto: "Histórico importado do WhatsApp Business",
      started_at: params.firstMessageAt,
      last_message_at: params.firstMessageAt,
      closed_at: now,
      bot_ativo: false,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (createError) {
    if (createError.code === "23505") {
      const { data: concurrent } = await supabase
        .from("conversas")
        .select("*")
        .eq("empresa_id", params.integration.empresa_id)
        .eq("contato_id", params.contactId)
        .eq("integracao_whatsapp_id", params.integration.id)
        .eq("canal", "whatsapp")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (concurrent) return concurrent;
    }

    throw new Error(
      `Erro ao criar conversa para o histórico: ${createError.message}`
    );
  }

  return created;
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
  message: ExtractedCoexistenceHistoryMessage | ExtractedCoexistenceEcho;
  direction: "inbound" | "outbound";
  source: "history" | "business_app";
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
    if (
      params.source === "history" &&
      params.message.type !== "media_placeholder" &&
      (existing.metadata_json as Record<string, unknown> | null)
        ?.tipo_original_whatsapp ===
        "media_placeholder"
    ) {
      await supabase
        .from("mensagens")
        .update({
          conteudo: params.message.conteudo,
          tipo_mensagem: params.message.tipoMensagem,
          metadata_json: {
            ...(existing.metadata_json || {}),
            ...(params.message.metadataJson || {}),
            coex_media_historica_atualizada: true,
          },
        })
        .eq("id", existing.id);
    }

    return {
      id: existing.id,
      duplicated: true,
      messageAt,
    };
  }

  const historyMessage =
    "phase" in params.message ? params.message : null;
  const status =
    params.source === "history"
      ? mapHistoryStatus(historyMessage?.status)
      : "enviada";
  const { data: inserted, error: insertError } = await supabase
    .from("mensagens")
    .insert({
      empresa_id: params.integration.empresa_id,
      conversa_id: params.conversation.id,
      conversa_protocolo_id: params.protocolId || null,
      remetente_tipo:
        params.direction === "inbound" ? "contato" : "usuario",
      remetente_id: null,
      conteudo: params.message.conteudo,
      tipo_mensagem: params.message.tipoMensagem,
      origem:
        params.direction === "inbound" ? "recebida" : "enviada",
      status_envio: status,
      mensagem_externa_id: params.message.messageId,
      metadata_json: {
        ...(params.message.metadataJson || {}),
        coex: true,
        coex_source: params.source,
        coex_history: params.source === "history",
        coex_direction: params.direction,
        automacao_processada: true,
        automacao_resultado: {
          ok: true,
          status:
            params.source === "history"
              ? "ignorado_historico_coex"
              : "ignorado_echo_business_app",
        },
        ...(historyMessage
          ? {
              coex_history_phase: historyMessage.phase,
              coex_history_chunk_order: historyMessage.chunkOrder,
              coex_history_progress: historyMessage.progress,
              coex_history_thread_id: historyMessage.threadId,
              coex_history_thread_context:
                historyMessage.threadContext,
              coex_history_status: historyMessage.status,
            }
          : {}),
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

async function markHistoryAsReadForCompany(params: {
  empresaId: string;
  conversationId: string;
  latestHistoryAt: string;
}) {
  const { data: users, error: usersError } = await supabase
    .from("usuarios")
    .select("id")
    .eq("empresa_id", params.empresaId)
    .eq("status", "ativo");

  if (usersError || !users?.length) return;

  const now = new Date().toISOString();
  await supabase.from("conversa_leituras").upsert(
    users.map((user) => ({
      empresa_id: params.empresaId,
      conversa_id: params.conversationId,
      usuario_id: user.id,
      ultima_mensagem_lida_at: params.latestHistoryAt,
      updated_at: now,
    })),
    {
      onConflict: "conversa_id,usuario_id",
      ignoreDuplicates: true,
    }
  );
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
      direction: "outbound",
      source: "business_app",
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
  const messages = extractCoexistenceHistoryMessages(body);
  const latestByConversation = new Map<
    string,
    { empresaId: string; latest: string }
  >();

  for (const message of messages) {
    const integration =
      await findWhatsAppIntegrationByPhoneNumberId(
        message.phoneNumberId
      );
    if (
      !integration ||
      normalizeWhatsAppIntegrationMode(integration.modo_integracao) !==
        "coexistence"
    ) {
      continue;
    }

    const contextName =
      typeof message.threadContext?.username === "string"
        ? message.threadContext.username
        : null;
    const contact = await findOrCreateWhatsAppContact({
      empresaId: integration.empresa_id,
      phone: message.contactPhone,
      profileName: contextName,
      salvarProfileNameWhatsapp: false,
    });
    const messageAt = timestampToIso(message.timestamp);
    const conversation = await findHistoryConversation({
      integration,
      contactId: contact.id,
      firstMessageAt: messageAt,
    });
    const protocolId = await findActiveProtocolId(conversation.id).catch(
      () => null
    );

    await saveCoexistenceMessage({
      integration,
      conversation,
      protocolId,
      message,
      direction: message.direction,
      source: "history",
    });

    const current = latestByConversation.get(conversation.id);
    if (
      !current ||
      new Date(messageAt).getTime() > new Date(current.latest).getTime()
    ) {
      latestByConversation.set(conversation.id, {
        empresaId: integration.empresa_id,
        latest: messageAt,
      });
    }
  }

  for (const [conversationId, item] of latestByConversation) {
    await markHistoryAsReadForCompany({
      empresaId: item.empresaId,
      conversationId,
      latestHistoryAt: item.latest,
    });
  }

  return messages.length;
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
        : completed
          ? "concluido"
          : "processando";
    const now = new Date().toISOString();

    const { error } = await supabase
      .from("whatsapp_coex_sync_jobs")
      .update({
        status,
        progresso: declined ? 100 : state.progress || 0,
        fase: state.phase,
        chunk_order: state.chunkOrder,
        erro_codigo: state.errorCode
          ? String(state.errorCode)
          : null,
        erro_mensagem: state.errorMessage,
        concluido_em:
          declined || completed ? now : null,
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
    const { data: jobs } = await supabase
      .from("whatsapp_coex_sync_jobs")
      .select("status")
      .eq("integracao_whatsapp_id", integrationId);
    const terminal =
      jobs?.length === 2 &&
      jobs.every((job) =>
        ["concluido", "recusado_usuario"].includes(job.status)
      );

    if (terminal) {
      const { data: integration } = await supabase
        .from("integracoes_whatsapp")
        .select("status")
        .eq("id", integrationId)
        .maybeSingle();

      await supabase
        .from("integracoes_whatsapp")
        .update({
          coex_status:
            integration?.status === "ativa" ? "ativo" : "onboarded",
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
