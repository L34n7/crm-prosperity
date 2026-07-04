import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizarTelefoneBrasilParaWhatsApp } from "@/lib/contatos/normalizar-telefone";
import { normalizeContactName } from "@/lib/whatsapp/normalize";
import type { WhatsAppIntegration } from "@/lib/whatsapp/find-integration";
import type { ExtractedCoexistenceHistoryMessage } from "@/lib/whatsapp/meta";

const supabase = getSupabaseAdmin();

type ContactRow = {
  id: string;
  telefone: string;
};

type ConversationRow = {
  id: string;
  contato_id: string;
  last_message_at?: string | null;
};

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

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function maxIso(current: string | null, candidate: string) {
  if (!current) return candidate;
  return new Date(candidate).getTime() > new Date(current).getTime()
    ? candidate
    : current;
}

function minIso(current: string | null, candidate: string) {
  if (!current) return candidate;
  return new Date(candidate).getTime() < new Date(current).getTime()
    ? candidate
    : current;
}

async function loadContacts(
  empresaId: string,
  messages: ExtractedCoexistenceHistoryMessage[]
) {
  const contactMetadata = new Map<
    string,
    { name: string | null }
  >();

  for (const message of messages) {
    const phone = normalizarTelefoneBrasilParaWhatsApp(
      message.contactPhone
    );
    if (!phone) continue;

    const contextName =
      typeof message.threadContext?.username === "string"
        ? normalizeContactName(message.threadContext.username)
        : "";
    const current = contactMetadata.get(phone);
    contactMetadata.set(phone, {
      name: current?.name || contextName || null,
    });
  }

  const phones = [...contactMetadata.keys()];
  const contactsByPhone = new Map<string, ContactRow>();

  for (const phoneChunk of chunk(phones, 200)) {
    const { data, error } = await supabase
      .from("contatos")
      .select("id, telefone")
      .eq("empresa_id", empresaId)
      .in("telefone", phoneChunk);

    if (error) {
      throw new Error(
        `Erro ao buscar contatos do histórico Coex: ${error.message}`
      );
    }

    for (const contact of data || []) {
      contactsByPhone.set(contact.telefone, contact as ContactRow);
    }
  }

  const missingRows = phones
    .filter((phone) => !contactsByPhone.has(phone))
    .map((phone) => {
      const name = contactMetadata.get(phone)?.name;
      return {
        empresa_id: empresaId,
        nome: name || phone,
        whatsapp_profile_name: null,
        telefone: phone,
        origem: "Direto / Nao identificado",
        status_lead: "novo",
        observacoes:
          "Contato criado pela importação de histórico do WhatsApp.",
      };
    });

  for (const rows of chunk(missingRows, 100)) {
    if (!rows.length) continue;

    const { error } = await supabase.from("contatos").upsert(rows, {
      onConflict: "empresa_id,telefone",
      ignoreDuplicates: true,
    });

    if (error) {
      throw new Error(
        `Erro ao criar contatos do histórico Coex: ${error.message}`
      );
    }
  }

  if (missingRows.length) {
    for (const phoneChunk of chunk(phones, 200)) {
      const { data, error } = await supabase
        .from("contatos")
        .select("id, telefone")
        .eq("empresa_id", empresaId)
        .in("telefone", phoneChunk);

      if (error) {
        throw new Error(
          `Erro ao recarregar contatos do histórico Coex: ${error.message}`
        );
      }

      for (const contact of data || []) {
        contactsByPhone.set(contact.telefone, contact as ContactRow);
      }
    }
  }

  return contactsByPhone;
}

async function loadConversations(params: {
  integration: WhatsAppIntegration;
  messages: ExtractedCoexistenceHistoryMessage[];
  contactsByPhone: Map<string, ContactRow>;
}) {
  const contactIds = [
    ...new Set([...params.contactsByPhone.values()].map((item) => item.id)),
  ];
  const conversationsByContact = new Map<string, ConversationRow>();

  for (const contactIdChunk of chunk(contactIds, 200)) {
    const { data, error } = await supabase
      .from("conversas")
      .select("id, contato_id, last_message_at, created_at")
      .eq("empresa_id", params.integration.empresa_id)
      .eq("integracao_whatsapp_id", params.integration.id)
      .eq("canal", "whatsapp")
      .in("contato_id", contactIdChunk)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(
        `Erro ao buscar conversas do histórico Coex: ${error.message}`
      );
    }

    for (const conversation of data || []) {
      if (!conversationsByContact.has(conversation.contato_id)) {
        conversationsByContact.set(
          conversation.contato_id,
          conversation as ConversationRow
        );
      }
    }
  }

  const dateBoundsByContact = new Map<
    string,
    { first: string | null; last: string | null }
  >();

  for (const message of params.messages) {
    const phone = normalizarTelefoneBrasilParaWhatsApp(
      message.contactPhone
    );
    const contact = params.contactsByPhone.get(phone);
    if (!contact) continue;

    const messageAt = timestampToIso(message.timestamp);
    const bounds = dateBoundsByContact.get(contact.id) || {
      first: null,
      last: null,
    };
    bounds.first = minIso(bounds.first, messageAt);
    bounds.last = maxIso(bounds.last, messageAt);
    dateBoundsByContact.set(contact.id, bounds);
  }

  const now = new Date().toISOString();
  const missingRows = contactIds
    .filter((contactId) => !conversationsByContact.has(contactId))
    .map((contactId) => {
      const bounds = dateBoundsByContact.get(contactId);
      return {
        empresa_id: params.integration.empresa_id,
        contato_id: contactId,
        setor_id: null,
        responsavel_id: null,
        integracao_whatsapp_id: params.integration.id,
        status: "encerrada",
        canal: "whatsapp",
        origem_atendimento: "historico_coexistence",
        prioridade: "media",
        assunto: "Histórico importado do WhatsApp Business",
        started_at: bounds?.first || now,
        last_message_at: bounds?.last || bounds?.first || now,
        closed_at: now,
        bot_ativo: false,
        created_at: now,
        updated_at: now,
      };
    });

  for (const rows of chunk(missingRows, 100)) {
    if (!rows.length) continue;

    const { data, error } = await supabase
      .from("conversas")
      .insert(rows)
      .select("id, contato_id, last_message_at");

    if (error) {
      throw new Error(
        `Erro ao criar conversas do histórico Coex: ${error.message}`
      );
    }

    for (const conversation of data || []) {
      conversationsByContact.set(
        conversation.contato_id,
        conversation as ConversationRow
      );
    }
  }

  return conversationsByContact;
}

async function loadActiveProtocols(conversationIds: string[]) {
  const protocolByConversation = new Map<string, string>();

  for (const conversationIdChunk of chunk(conversationIds, 200)) {
    const { data, error } = await supabase
      .from("conversa_protocolos")
      .select("id, conversa_id, created_at")
      .eq("ativo", true)
      .in("conversa_id", conversationIdChunk)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(
        `Erro ao buscar protocolos do histórico Coex: ${error.message}`
      );
    }

    for (const protocol of data || []) {
      if (!protocolByConversation.has(protocol.conversa_id)) {
        protocolByConversation.set(protocol.conversa_id, protocol.id);
      }
    }
  }

  return protocolByConversation;
}

async function loadExistingMessages(messageIds: string[]) {
  const existing = new Map<
    string,
    { id: string; metadata_json: Record<string, unknown> | null }
  >();

  for (const messageIdChunk of chunk(messageIds, 200)) {
    const { data, error } = await supabase
      .from("mensagens")
      .select("id, mensagem_externa_id, metadata_json")
      .in("mensagem_externa_id", messageIdChunk);

    if (error) {
      throw new Error(
        `Erro ao buscar mensagens existentes do histórico Coex: ${error.message}`
      );
    }

    for (const message of data || []) {
      if (message.mensagem_externa_id) {
        existing.set(message.mensagem_externa_id, {
          id: message.id,
          metadata_json:
            message.metadata_json &&
            typeof message.metadata_json === "object" &&
            !Array.isArray(message.metadata_json)
              ? (message.metadata_json as Record<string, unknown>)
              : null,
        });
      }
    }
  }

  return existing;
}

async function markHistoryAsRead(params: {
  empresaId: string;
  latestByConversation: Map<string, string>;
}) {
  if (!params.latestByConversation.size) return;

  const { data: users, error: usersError } = await supabase
    .from("usuarios")
    .select("id")
    .eq("empresa_id", params.empresaId)
    .eq("status", "ativo");

  if (usersError || !users?.length) return;

  const now = new Date().toISOString();
  const rows = [...params.latestByConversation].flatMap(
    ([conversationId, latest]) =>
      users.map((user) => ({
        empresa_id: params.empresaId,
        conversa_id: conversationId,
        usuario_id: user.id,
        ultima_mensagem_lida_at: latest,
        updated_at: now,
      }))
  );

  for (const rowChunk of chunk(rows, 500)) {
    await supabase.from("conversa_leituras").upsert(rowChunk, {
      onConflict: "conversa_id,usuario_id",
      ignoreDuplicates: true,
    });
  }
}

export async function persistCoexistenceHistoryBatch(params: {
  integration: WhatsAppIntegration;
  messages: ExtractedCoexistenceHistoryMessage[];
}) {
  if (!params.messages.length) {
    return { received: 0, inserted: 0, duplicated: 0 };
  }

  const contactsByPhone = await loadContacts(
    params.integration.empresa_id,
    params.messages
  );
  const conversationsByContact = await loadConversations({
    integration: params.integration,
    messages: params.messages,
    contactsByPhone,
  });
  const conversationIds = [
    ...new Set([...conversationsByContact.values()].map((item) => item.id)),
  ];
  const protocolByConversation =
    await loadActiveProtocols(conversationIds);
  const existingMessages = await loadExistingMessages(
    params.messages.map((message) => message.messageId)
  );
  const latestByConversation = new Map<string, string>();
  const rows: Array<Record<string, unknown>> = [];
  const mediaUpdates: Array<{
    id: string;
    message: ExtractedCoexistenceHistoryMessage;
    previousMetadata: Record<string, unknown>;
  }> = [];

  for (const message of params.messages) {
    const existing = existingMessages.get(message.messageId);
    if (existing) {
      if (
        message.type !== "media_placeholder" &&
        existing.metadata_json?.tipo_original_whatsapp ===
          "media_placeholder"
      ) {
        mediaUpdates.push({
          id: existing.id,
          message,
          previousMetadata: existing.metadata_json,
        });
      }
      continue;
    }

    const phone = normalizarTelefoneBrasilParaWhatsApp(
      message.contactPhone
    );
    const contact = contactsByPhone.get(phone);
    const conversation = contact
      ? conversationsByContact.get(contact.id)
      : null;

    if (!contact || !conversation) {
      throw new Error(
        `Contato ou conversa não encontrado para a mensagem ${message.messageId}.`
      );
    }

    const messageAt = timestampToIso(message.timestamp);
    rows.push({
      empresa_id: params.integration.empresa_id,
      conversa_id: conversation.id,
      conversa_protocolo_id:
        protocolByConversation.get(conversation.id) || null,
      remetente_tipo:
        message.direction === "inbound" ? "contato" : "usuario",
      remetente_id: null,
      conteudo: message.conteudo,
      tipo_mensagem: message.tipoMensagem,
      origem:
        message.direction === "inbound" ? "recebida" : "enviada",
      status_envio: mapHistoryStatus(message.status),
      mensagem_externa_id: message.messageId,
      metadata_json: {
        ...(message.metadataJson || {}),
        coex: true,
        coex_source: "history",
        coex_history: true,
        coex_direction: message.direction,
        automacao_processada: true,
        automacao_resultado: {
          ok: true,
          status: "ignorado_historico_coex",
        },
        coex_history_phase: message.phase,
        coex_history_chunk_order: message.chunkOrder,
        coex_history_progress: message.progress,
        coex_history_thread_id: message.threadId,
        coex_history_thread_context: message.threadContext,
        coex_history_status: message.status,
        timestamp_original_whatsapp: message.timestamp || null,
      },
      created_at: messageAt,
    });

    latestByConversation.set(
      conversation.id,
      maxIso(
        latestByConversation.get(conversation.id) || null,
        messageAt
      )
    );
  }

  for (const rowChunk of chunk(rows, 100)) {
    const { error } = await supabase.from("mensagens").upsert(rowChunk, {
      onConflict: "mensagem_externa_id",
      ignoreDuplicates: true,
    });

    if (error) {
      throw new Error(
        `Erro ao inserir lote de mensagens históricas: ${error.message}`
      );
    }
  }

  for (const update of mediaUpdates) {
    const { error } = await supabase
      .from("mensagens")
      .update({
        conteudo: update.message.conteudo,
        tipo_mensagem: update.message.tipoMensagem,
        metadata_json: {
          ...update.previousMetadata,
          ...(update.message.metadataJson || {}),
          coex_media_historica_atualizada: true,
        },
      })
      .eq("id", update.id);

    if (error) {
      throw new Error(
        `Erro ao atualizar mídia histórica: ${error.message}`
      );
    }
  }

  for (const [conversationId, latest] of latestByConversation) {
    const conversation = [...conversationsByContact.values()].find(
      (item) => item.id === conversationId
    );
    const current = conversation?.last_message_at
      ? new Date(conversation.last_message_at).getTime()
      : 0;

    if (new Date(latest).getTime() <= current) continue;

    const { error } = await supabase
      .from("conversas")
      .update({
        last_message_at: latest,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId)
      .eq("empresa_id", params.integration.empresa_id);

    if (error) {
      throw new Error(
        `Erro ao atualizar conversa após histórico: ${error.message}`
      );
    }
  }

  await markHistoryAsRead({
    empresaId: params.integration.empresa_id,
    latestByConversation,
  });

  return {
    received: params.messages.length,
    inserted: rows.length,
    duplicated: params.messages.length - rows.length,
  };
}
