type SendWhatsAppInteractiveCtaUrlMessageParams = {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  body: string;
  buttonText: string;
  url: string;
};

export type SendWhatsAppInteractiveCtaUrlMessageResult = {
  ok: boolean;
  status: number;
  messageId: string | null;
  raw: unknown;
  error: string | null;
};

function assertHttpUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function extractMetaMessageId(raw: unknown) {
  if (
    raw &&
    typeof raw === "object" &&
    "messages" in raw &&
    Array.isArray((raw as { messages?: Array<{ id?: string }> }).messages)
  ) {
    return (raw as { messages: Array<{ id?: string }> }).messages[0]?.id ?? null;
  }

  return null;
}

function extractMetaError(responseOk: boolean, raw: unknown) {
  if (responseOk) return null;

  if (raw && typeof raw === "object" && "error" in raw) {
    return JSON.stringify((raw as { error?: unknown }).error);
  }

  return "Erro ao enviar botao CTA URL ao WhatsApp";
}

export async function sendWhatsAppInteractiveCtaUrlMessage({
  phoneNumberId,
  accessToken,
  to,
  body,
  buttonText,
  url,
}: SendWhatsAppInteractiveCtaUrlMessageParams): Promise<SendWhatsAppInteractiveCtaUrlMessageResult> {
  const bodyText = body.trim();
  const displayText = buttonText.trim();
  const destinationUrl = url.trim();

  if (!phoneNumberId) {
    throw new Error("phoneNumberId e obrigatorio");
  }

  if (!accessToken) {
    throw new Error("accessToken e obrigatorio");
  }

  if (!to) {
    throw new Error("Numero de destino e obrigatorio");
  }

  if (!bodyText) {
    throw new Error("Texto da mensagem e obrigatorio");
  }

  if (!displayText) {
    throw new Error("Texto do botao e obrigatorio");
  }

  if (displayText.length > 20) {
    throw new Error("Texto do botao CTA URL deve ter no maximo 20 caracteres");
  }

  if (!assertHttpUrl(destinationUrl)) {
    throw new Error("URL de destino deve comecar com http:// ou https://");
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "cta_url",
      body: {
        text: bodyText,
      },
      action: {
        name: "cta_url",
        parameters: {
          display_text: displayText,
          url: destinationUrl,
        },
      },
    },
  };

  if (process.env.WHATSAPP_TEST_MODE === "true") {
    const delaySimulado = Number(process.env.WHATSAPP_TEST_META_DELAY_MS || 700);

    await new Promise((resolve) => setTimeout(resolve, delaySimulado));

    return {
      ok: true,
      status: 200,
      messageId: `test_wamid_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`,
      raw: {
        test_mode: true,
        payload,
      },
      error: null,
    };
  }

  const response = await fetch(
    `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const raw = await response.json().catch(() => null);

  return {
    ok: response.ok,
    status: response.status,
    messageId: extractMetaMessageId(raw),
    raw,
    error: extractMetaError(response.ok, raw),
  };
}
