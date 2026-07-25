type QuickReplyTemplateButton = {
  index: number;
  payload: string;
};

type SendWhatsAppTemplateMessageParams = {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  templateName: string;
  languageCode: string;
  bodyParameters?: string[];
  quickReplyButtons?: QuickReplyTemplateButton[];
};

export type SendWhatsAppTemplateMessageResult = {
  ok: boolean;
  status: number;
  messageId: string | null;
  raw: unknown;
  error: string | null;
  transient: boolean;
};

function messageIdFromResponse(raw: unknown) {
  if (!raw || typeof raw !== "object" || !("messages" in raw)) return null;
  const messages = (raw as { messages?: Array<{ id?: string; message_id?: string }> })
    .messages;
  return Array.isArray(messages)
    ? messages[0]?.id || messages[0]?.message_id || null
    : null;
}

function errorFromResponse(raw: unknown) {
  if (!raw || typeof raw !== "object" || !("error" in raw)) {
    return "Erro ao enviar template ao WhatsApp.";
  }

  const error = (raw as {
    error?: { message?: string; error_data?: { details?: string }; code?: number };
  }).error;
  return (
    String(error?.error_data?.details || "").trim() ||
    String(error?.message || "").trim() ||
    "Erro ao enviar template ao WhatsApp."
  );
}

function isTransient(status: number, raw: unknown) {
  const code = Number(
    raw && typeof raw === "object" && "error" in raw
      ? (raw as { error?: { code?: number } }).error?.code || 0
      : 0
  );
  return status >= 500 || status === 408 || status === 429 || [1, 2, 4, 80007].includes(code);
}

export async function sendWhatsAppTemplateMessage({
  phoneNumberId,
  accessToken,
  to,
  templateName,
  languageCode,
  bodyParameters = [],
  quickReplyButtons = [],
}: SendWhatsAppTemplateMessageParams): Promise<SendWhatsAppTemplateMessageResult> {
  const phoneId = String(phoneNumberId || "").trim();
  const token = String(accessToken || "").trim();
  const destination = String(to || "").replace(/\D/g, "");
  const name = String(templateName || "").trim();

  if (!phoneId) throw new Error("phoneNumberId é obrigatório.");
  if (!token) throw new Error("accessToken é obrigatório.");
  if (destination.length < 10) throw new Error("Número de destino inválido.");
  if (!name) throw new Error("Template do WhatsApp é obrigatório.");

  const components: Array<Record<string, unknown>> = [];
  if (bodyParameters.length > 0) {
    components.push({
      type: "body",
      parameters: bodyParameters.map((value) => ({
        type: "text",
        text: String(value || "-").slice(0, 1024),
      })),
    });
  }

  quickReplyButtons
    .filter(
      (button) =>
        Number.isInteger(button.index) &&
        button.index >= 0 &&
        button.index <= 9 &&
        String(button.payload || "").trim()
    )
    .slice(0, 10)
    .forEach((button) => {
      components.push({
        type: "button",
        sub_type: "quick_reply",
        index: String(button.index),
        parameters: [
          {
            type: "payload",
            payload: String(button.payload).trim().slice(0, 256),
          },
        ],
      });
    });

  if (process.env.WHATSAPP_TEST_MODE === "true") {
    const delay = Number(process.env.WHATSAPP_TEST_META_DELAY_MS || 300);
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, delay)));
    return {
      ok: true,
      status: 200,
      messageId: `test_wamid_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      raw: {
        test_mode: true,
        to: destination,
        template: name,
        language: languageCode || "pt_BR",
        components,
      },
      error: null,
      transient: false,
    };
  }

  const response = await fetch(
    `https://graph.facebook.com/v23.0/${encodeURIComponent(phoneId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: destination,
        type: "template",
        template: {
          name,
          language: { code: String(languageCode || "pt_BR").trim() || "pt_BR" },
          ...(components.length > 0 ? { components } : {}),
        },
      }),
    }
  );

  const raw = await response.json().catch(() => null);
  return {
    ok: response.ok,
    status: response.status,
    messageId: messageIdFromResponse(raw),
    raw,
    error: response.ok ? null : errorFromResponse(raw),
    transient: !response.ok && isTransient(response.status, raw),
  };
}
