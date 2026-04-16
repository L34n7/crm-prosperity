type SendWhatsAppTextMessageParams = {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  body: string;
};

export type SendWhatsAppTextMessageResult = {
  ok: boolean;
  status: number;
  messageId: string | null;
  raw: unknown;
  error: string | null;
};

export async function sendWhatsAppTextMessage({
  phoneNumberId,
  accessToken,
  to,
  body,
}: SendWhatsAppTextMessageParams): Promise<SendWhatsAppTextMessageResult> {
  if (!phoneNumberId) {
    throw new Error("phoneNumberId é obrigatório");
  }

  if (!accessToken) {
    throw new Error("accessToken é obrigatório");
  }

  if (!to) {
    throw new Error("Número de destino é obrigatório");
  }

  if (!body?.trim()) {
    throw new Error("Texto da mensagem é obrigatório");
  }

  const response = await fetch(
    `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: {
          preview_url: false,
          body: body.trim(),
        },
      }),
    }
  );

  const raw = await response.json().catch(() => null);

  const messageId =
    raw &&
    typeof raw === "object" &&
    "messages" in raw &&
    Array.isArray((raw as { messages?: Array<{ id?: string }> }).messages) &&
    (raw as { messages?: Array<{ id?: string }> }).messages?.[0]?.id
      ? (raw as { messages: Array<{ id?: string }> }).messages[0].id ?? null
      : null;

  const error =
    !response.ok && raw && typeof raw === "object" && "error" in raw
      ? JSON.stringify((raw as { error?: unknown }).error)
      : !response.ok
      ? "Erro ao enviar mensagem ao WhatsApp"
      : null;

  return {
    ok: response.ok,
    status: response.status,
    messageId,
    raw,
    error,
  };
}