export type WhatsAppWebhookBody = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
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
        }>;
        statuses?: Array<unknown>;
      };
    }>;
  }>;
};

export type ExtractedWhatsAppMessage = {
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  from: string;
  profileName: string | null;
  waId: string | null;
  messageId: string;
  timestamp: string | null;
  messageType: string;
  text: string | null;
};

export function extractIncomingMessages(
  body: WhatsAppWebhookBody
): ExtractedWhatsAppMessage[] {
  const results: ExtractedWhatsAppMessage[] = [];

  if (!body.entry?.length) {
    return results;
  }

  for (const entry of body.entry) {
    if (!entry.changes?.length) continue;

    for (const change of entry.changes) {
      if (change.field !== "messages") continue;

      const value = change.value;
      if (!value) continue;

      const phoneNumberId = value.metadata?.phone_number_id;
      const displayPhoneNumber = value.metadata?.display_phone_number ?? null;

      if (!phoneNumberId) continue;
      if (!value.messages?.length) continue;

      for (const message of value.messages) {
        if (!message.id || !message.from || !message.type) continue;

        const firstContact = value.contacts?.[0];

        results.push({
          phoneNumberId,
          displayPhoneNumber,
          from: message.from,
          profileName: firstContact?.profile?.name ?? null,
          waId: firstContact?.wa_id ?? null,
          messageId: message.id,
          timestamp: message.timestamp ?? null,
          messageType: message.type,
          text: message.text?.body ?? null,
        });
      }
    }
  }

  return results;
}

export function extractTextMessages(
  body: WhatsAppWebhookBody
): ExtractedWhatsAppMessage[] {
  const allMessages = extractIncomingMessages(body);

  return allMessages.filter(
    (message) => message.messageType === "text" && !!message.text?.trim()
  );
}