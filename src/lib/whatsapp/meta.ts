export type WhatsAppWebhookBody = {
  object?: string;
  entry?: WhatsAppEntry[];
};

export type WhatsAppEntry = {
  id?: string;
  changes?: WhatsAppChange[];
};

export type WhatsAppChange = {
  field?: string;
  value?: {
    messaging_product?: string;
    metadata?: {
      display_phone_number?: string;
      phone_number_id?: string;
    };
    contacts?: Array<{
      profile?: {
        name?: string;
      };
      wa_id?: string;
    }>;
    messages?: Array<{
      from?: string;
      id?: string;
      timestamp?: string;
      type?: string;
      text?: {
        body?: string;
      };
      image?: unknown;
      audio?: unknown;
      video?: unknown;
      document?: unknown;
      button?: {
        text?: string;
        payload?: string;
      };
      interactive?: unknown;
    }>;
    statuses?: Array<unknown>;
  };
};

export type ExtractedIncomingMessage = {
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  from: string;
  waId: string | null;
  profileName: string | null;
  messageId: string;
  timestamp: string | null;
  type: string;
  text: string | null;
  rawMessage: unknown;
};

export function extractIncomingMessages(
  body: WhatsAppWebhookBody
): ExtractedIncomingMessage[] {
  const results: ExtractedIncomingMessage[] = [];

  if (!body?.entry?.length) return results;

  for (const entry of body.entry) {
    if (!entry?.changes?.length) continue;

    for (const change of entry.changes) {
      if (change?.field !== "messages") continue;

      const value = change.value;
      if (!value) continue;

      const phoneNumberId = value.metadata?.phone_number_id ?? "";
      const displayPhoneNumber = value.metadata?.display_phone_number ?? null;

      const firstContact = value.contacts?.[0];
      const profileName = firstContact?.profile?.name ?? null;
      const waId = firstContact?.wa_id ?? null;

      const messages = value.messages ?? [];

      for (const message of messages) {
        results.push({
          phoneNumberId,
          displayPhoneNumber,
          from: message.from ?? "",
          waId,
          profileName,
          messageId: message.id ?? "",
          timestamp: message.timestamp ?? null,
          type: message.type ?? "unknown",
          text: message.text?.body ?? null,
          rawMessage: message,
        });
      }
    }
  }

  return results;
}

export function extractTextMessages(body: WhatsAppWebhookBody) {
  return extractIncomingMessages(body).filter(
    (message) =>
      message.type === "text" &&
      !!message.text &&
      !!message.from &&
      !!message.messageId &&
      !!message.phoneNumberId
  );
}