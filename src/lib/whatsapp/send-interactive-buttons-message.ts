export type BotaoRespostaWhatsApp = {
  id: string;
  titulo: string;
};

type SendWhatsAppInteractiveButtonsMessageParams = {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  body: string;
  buttons: BotaoRespostaWhatsApp[];
};

export type SendWhatsAppInteractiveButtonsMessageResult = {
  ok: boolean;
  status: number;
  messageId: string | null;
  raw: unknown;
  error: string | null;
};

function extractMessageId(raw: unknown) {
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

export async function sendWhatsAppInteractiveButtonsMessage({
  phoneNumberId,
  accessToken,
  to,
  body,
  buttons,
}: SendWhatsAppInteractiveButtonsMessageParams): Promise<SendWhatsAppInteractiveButtonsMessageResult> {
  const mensagem = String(body || "").trim();
  const botoes = (Array.isArray(buttons) ? buttons : [])
    .map((button, index) => ({
      id: String(button.id || `opcao_${index + 1}`).trim().slice(0, 256),
      titulo: String(button.titulo || "").trim().slice(0, 20),
    }))
    .filter((button) => button.id && button.titulo)
    .slice(0, 3);

  if (!phoneNumberId) throw new Error("phoneNumberId é obrigatório");
  if (!accessToken) throw new Error("accessToken é obrigatório");
  if (!to) throw new Error("Número de destino é obrigatório");
  if (!mensagem) throw new Error("Texto da mensagem é obrigatório");
  if (botoes.length === 0) throw new Error("Informe ao menos um botão");

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: mensagem },
      action: {
        buttons: botoes.map((button) => ({
          type: "reply",
          reply: {
            id: button.id,
            title: button.titulo,
          },
        })),
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
      raw: { test_mode: true, payload },
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
    messageId: extractMessageId(raw),
    raw,
    error:
      response.ok
        ? null
        : raw && typeof raw === "object" && "error" in raw
        ? JSON.stringify((raw as { error?: unknown }).error)
        : "Erro ao enviar botões ao WhatsApp",
  };
}
