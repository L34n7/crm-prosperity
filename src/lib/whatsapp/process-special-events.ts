import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { findWhatsAppIntegrationByPhoneNumberId } from "@/lib/whatsapp/find-integration";
import type {
  WhatsAppIncomingRawMessage,
  WhatsAppWebhookBody,
} from "@/lib/whatsapp/meta";

type WhatsAppReaction = {
  emoji?: string;
  message_id?: string;
};

type WhatsAppRevoke = {
  original_message_id?: string;
};

type WhatsAppEdit = {
  original_message_id?: string;
  message?: {
    type?: string;
    text?: {
      body?: string;
    };
  };
};

type WhatsAppSticker = {
  id?: string;
  mime_type?: string;
  sha256?: string;
  url?: string;
  animated?: boolean;
};

type WhatsAppSpecialMessage = WhatsAppIncomingRawMessage & {
  reaction?: WhatsAppReaction;
  revoke?: WhatsAppRevoke;
  edit?: WhatsAppEdit;
  sticker?: WhatsAppSticker;
};

type StoredMessage = {
  id: string;
  conversa_id: string;
  conteudo: string;
  tipo_mensagem: string;
  metadata_json: Record<string, unknown> | null;
};

type ReactionMetadata = {
  emoji: string;
  remetente: string;
  evento_id: string | null;
  timestamp: string | null;
};

export type WhatsAppSpecialEventsResult = {
  reactions: number;
  revokes: number;
  edits: number;
  stickers: number;
  unsupportedNormalized: number;
  targetNotFound: number;
  errors: number;
  totalMutations: number;
};

const MUTATION_TYPES = new Set(["reaction", "revoke", "edit"]);
const SUPPORTED_MESSAGE_TYPES = new Set([
  "text",
  "image",
  "audio",
  "video",
  "document",
  "contacts",
  "location",
  "button",
  "interactive",
  "unsupported",
  "media_placeholder",
  "errors",
]);

function timestampToIso(timestamp?: string | null) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return new Date().toISOString();

  const date = new Date(value < 100000000000 ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function metadataObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function reactionList(value: unknown): ReactionMetadata[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is ReactionMetadata =>
      !!item &&
      typeof item === "object" &&
      typeof (item as ReactionMetadata).emoji === "string" &&
      typeof (item as ReactionMetadata).remetente === "string",
  );
}

async function findTargetMessage(params: {
  empresaId: string;
  externalId: string;
}): Promise<StoredMessage | null> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("mensagens")
    .select("id, conversa_id, conteudo, tipo_mensagem, metadata_json")
    .eq("empresa_id", params.empresaId)
    .eq("mensagem_externa_id", params.externalId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao localizar mensagem original: ${error.message}`);
  }

  return (data as StoredMessage | null) ?? null;
}

async function handleReaction(params: {
  empresaId: string;
  message: WhatsAppSpecialMessage;
}) {
  const originalMessageId = String(params.message.reaction?.message_id || "").trim();
  if (!originalMessageId) return { found: false };

  const target = await findTargetMessage({
    empresaId: params.empresaId,
    externalId: originalMessageId,
  });
  if (!target) return { found: false };

  const supabaseAdmin = getSupabaseAdmin();
  const metadata = metadataObject(target.metadata_json);
  const from = String(params.message.from || "").trim();
  const emoji = String(params.message.reaction?.emoji || "").trim();
  const eventId = String(params.message.id || "").trim() || null;
  const eventTimestamp = timestampToIso(params.message.timestamp);
  const current = reactionList(metadata.reacoes_whatsapp);

  const withoutSender = from
    ? current.filter((reaction) => reaction.remetente !== from)
    : current.filter((reaction) => reaction.evento_id !== eventId);

  const next = emoji
    ? [
        ...withoutSender,
        {
          emoji,
          remetente: from,
          evento_id: eventId,
          timestamp: eventTimestamp,
        },
      ]
    : withoutSender;

  const { error } = await supabaseAdmin
    .from("mensagens")
    .update({
      metadata_json: {
        ...metadata,
        reacoes_whatsapp: next,
        ultima_reacao_whatsapp: {
          emoji: emoji || null,
          removida: !emoji,
          remetente: from || null,
          evento_id: eventId,
          timestamp: eventTimestamp,
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", target.id)
    .eq("empresa_id", params.empresaId);

  if (error) {
    throw new Error(`Erro ao atualizar reação da mensagem: ${error.message}`);
  }

  return { found: true };
}

async function handleRevoke(params: {
  empresaId: string;
  message: WhatsAppSpecialMessage;
}) {
  const originalMessageId = String(
    params.message.revoke?.original_message_id || "",
  ).trim();
  if (!originalMessageId) return { found: false };

  const target = await findTargetMessage({
    empresaId: params.empresaId,
    externalId: originalMessageId,
  });
  if (!target) return { found: false };

  const metadata = metadataObject(target.metadata_json);
  const eventId = String(params.message.id || "").trim() || null;
  if (eventId && metadata.revogacao_evento_id === eventId) {
    return { found: true };
  }

  const supabaseAdmin = getSupabaseAdmin();
  const eventTimestamp = timestampToIso(params.message.timestamp);
  const { error } = await supabaseAdmin
    .from("mensagens")
    .update({
      conteudo: "Mensagem apagada pelo contato",
      tipo_mensagem: "texto",
      metadata_json: {
        ...metadata,
        mensagem_revogada_whatsapp: true,
        revogada_em: eventTimestamp,
        revogacao_evento_id: eventId,
        conteudo_antes_revogacao:
          metadata.conteudo_antes_revogacao ?? target.conteudo,
        tipo_mensagem_antes_revogacao:
          metadata.tipo_mensagem_antes_revogacao ?? target.tipo_mensagem,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", target.id)
    .eq("empresa_id", params.empresaId);

  if (error) {
    throw new Error(`Erro ao marcar mensagem como apagada: ${error.message}`);
  }

  return { found: true };
}

async function handleEdit(params: {
  empresaId: string;
  message: WhatsAppSpecialMessage;
}) {
  const originalMessageId = String(
    params.message.edit?.original_message_id || "",
  ).trim();
  if (!originalMessageId) return { found: false };

  const target = await findTargetMessage({
    empresaId: params.empresaId,
    externalId: originalMessageId,
  });
  if (!target) return { found: false };

  const newText = String(params.message.edit?.message?.text?.body || "").trim();
  if (!newText) return { found: true };

  const metadata = metadataObject(target.metadata_json);
  const eventId = String(params.message.id || "").trim() || null;
  if (eventId && metadata.ultima_edicao_evento_id === eventId) {
    return { found: true };
  }

  const historyRaw = Array.isArray(metadata.historico_edicoes_whatsapp)
    ? metadata.historico_edicoes_whatsapp
    : [];
  const history = historyRaw.filter(
    (item) => !!item && typeof item === "object" && !Array.isArray(item),
  );
  const eventTimestamp = timestampToIso(params.message.timestamp);

  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin
    .from("mensagens")
    .update({
      conteudo: newText,
      tipo_mensagem: "texto",
      metadata_json: {
        ...metadata,
        mensagem_editada_whatsapp: true,
        editada_em: eventTimestamp,
        ultima_edicao_evento_id: eventId,
        historico_edicoes_whatsapp: [
          ...history,
          {
            conteudo: target.conteudo,
            tipo_mensagem: target.tipo_mensagem,
            substituido_em: eventTimestamp,
            evento_id: eventId,
          },
        ].slice(-10),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", target.id)
    .eq("empresa_id", params.empresaId);

  if (error) {
    throw new Error(`Erro ao atualizar mensagem editada: ${error.message}`);
  }

  return { found: true };
}

function normalizeSticker(message: WhatsAppSpecialMessage) {
  const sticker = message.sticker;
  if (!sticker?.id) return false;

  message.type = "image";
  message.image = {
    id: sticker.id,
    mime_type: sticker.mime_type || "image/webp",
    sha256: sticker.sha256,
    url: sticker.url,
  };

  return true;
}

function normalizeUnknownType(message: WhatsAppSpecialMessage) {
  const type = String(message.type || "unknown").trim() || "unknown";
  if (SUPPORTED_MESSAGE_TYPES.has(type)) return false;

  message.type = "unsupported";
  message.unsupported = {
    type,
  };
  return true;
}

function sanitizeNonLiveMessages(messages: WhatsAppIncomingRawMessage[] | undefined) {
  if (!messages?.length) return;

  const normalized: WhatsAppIncomingRawMessage[] = [];
  for (const raw of messages) {
    const message = raw as WhatsAppSpecialMessage;
    const type = String(message.type || "unknown");

    if (MUTATION_TYPES.has(type)) continue;
    if (type === "sticker") normalizeSticker(message);
    else normalizeUnknownType(message);

    normalized.push(message);
  }

  messages.splice(0, messages.length, ...normalized);
}

export async function treatWhatsAppSpecialEvents(
  body: WhatsAppWebhookBody,
): Promise<WhatsAppSpecialEventsResult> {
  const result: WhatsAppSpecialEventsResult = {
    reactions: 0,
    revokes: 0,
    edits: 0,
    stickers: 0,
    unsupportedNormalized: 0,
    targetNotFound: 0,
    errors: 0,
    totalMutations: 0,
  };

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== "messages") {
        if (change.field === "smb_message_echoes") {
          sanitizeNonLiveMessages(change.value?.message_echoes);
        } else if (change.field === "history") {
          for (const history of change.value?.history || []) {
            for (const thread of history.threads || []) {
              sanitizeNonLiveMessages(thread.messages);
            }
          }
        }
        continue;
      }

      const phoneNumberId = String(change.value?.metadata?.phone_number_id || "").trim();
      const messages = change.value?.messages || [];
      if (!messages.length) continue;

      let empresaId = "";
      const processable: WhatsAppIncomingRawMessage[] = [];

      for (const raw of messages) {
        const message = raw as WhatsAppSpecialMessage;
        const type = String(message.type || "unknown");

        if (type === "sticker") {
          if (normalizeSticker(message)) result.stickers += 1;
          processable.push(message);
          continue;
        }

        if (!MUTATION_TYPES.has(type)) {
          if (normalizeUnknownType(message)) result.unsupportedNormalized += 1;
          processable.push(message);
          continue;
        }

        result.totalMutations += 1;

        try {
          if (!empresaId && phoneNumberId) {
            const integration = await findWhatsAppIntegrationByPhoneNumberId(phoneNumberId);
            empresaId = integration?.empresa_id || "";
          }

          if (!empresaId) {
            result.errors += 1;
            console.warn("[WHATSAPP EVENT] Integração não encontrada para mutação de mensagem", {
              phoneNumberId,
              type,
              eventId: message.id || null,
            });
            continue;
          }

          const handled =
            type === "reaction"
              ? await handleReaction({ empresaId, message })
              : type === "revoke"
                ? await handleRevoke({ empresaId, message })
                : await handleEdit({ empresaId, message });

          if (!handled.found) {
            result.targetNotFound += 1;
            console.warn("[WHATSAPP EVENT] Mensagem original não encontrada", {
              empresaId,
              type,
              eventId: message.id || null,
            });
          }

          if (type === "reaction") result.reactions += 1;
          else if (type === "revoke") result.revokes += 1;
          else result.edits += 1;
        } catch (error) {
          result.errors += 1;
          console.error("[WHATSAPP EVENT] Erro ao tratar mutação de mensagem", {
            type,
            eventId: message.id || null,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      change.value!.messages = processable;
    }
  }

  return result;
}
