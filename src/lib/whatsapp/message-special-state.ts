export type WhatsAppMessageReactionState = {
  emoji: string;
  count: number;
};

export type WhatsAppMessageSpecialState = {
  reactions: WhatsAppMessageReactionState[];
  edited: boolean;
  revoked: boolean;
  previousContent: string | null;
  currentContent: string;
  deletedContent: string | null;
};

type MessageWithWhatsAppMetadata = {
  conteudo?: string | null;
  metadata_json?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function contentValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function booleanValue(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeReactions(value: unknown): WhatsAppMessageReactionState[] {
  if (!Array.isArray(value)) return [];

  const grouped = new Map<string, number>();

  for (const item of value) {
    if (!isRecord(item)) continue;

    const emoji = textValue(item.emoji);
    if (!emoji) continue;

    grouped.set(emoji, (grouped.get(emoji) || 0) + 1);
  }

  return Array.from(grouped, ([emoji, count]) => ({ emoji, count }));
}

function previousEditedContent(value: unknown) {
  if (!Array.isArray(value)) return null;

  for (let index = value.length - 1; index >= 0; index -= 1) {
    const item = value[index];
    if (!isRecord(item)) continue;

    const content = contentValue(item.conteudo);
    if (content.trim()) return content;
  }

  return null;
}

export function getWhatsAppMessageSpecialState(
  message: MessageWithWhatsAppMetadata,
): WhatsAppMessageSpecialState {
  const metadata = isRecord(message.metadata_json)
    ? message.metadata_json
    : {};
  const currentContent = contentValue(message.conteudo);
  const edited = booleanValue(metadata.mensagem_editada_whatsapp);
  const revoked = booleanValue(metadata.mensagem_revogada_whatsapp);

  return {
    reactions: normalizeReactions(metadata.reacoes_whatsapp),
    edited,
    revoked,
    previousContent: edited
      ? previousEditedContent(metadata.historico_edicoes_whatsapp)
      : null,
    currentContent,
    deletedContent: revoked
      ? contentValue(metadata.conteudo_antes_revogacao) || currentContent || null
      : null,
  };
}
