type MediaMessageType = "imagem" | "audio" | "video" | "documento";

export type SendWhatsAppMediaMessageParams = {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  tipoMensagem: MediaMessageType;
  mediaId?: string | null;
  mediaUrl?: string | null;
  caption?: string | null;
  fileName?: string | null;
};

export type SendWhatsAppMediaMessageResult = {
  ok: boolean;
  status: number;
  messageId: string | null;
  raw: unknown;
  error: string | null;
};

function mapTipoMensagem(tipoMensagem: MediaMessageType) {
  switch (tipoMensagem) {
    case "imagem":
      return "image";
    case "audio":
      return "audio";
    case "video":
      return "video";
    case "documento":
      return "document";
    default:
      throw new Error("tipoMensagem inválido");
  }
}

export async function sendWhatsAppMediaMessage({
  phoneNumberId,
  accessToken,
  to,
  tipoMensagem,
  mediaId = null,
  mediaUrl = null,
  caption = null,
  fileName = null,
}: SendWhatsAppMediaMessageParams): Promise<SendWhatsAppMediaMessageResult> {
  if (!phoneNumberId) {
    throw new Error("phoneNumberId é obrigatório");
  }

  if (!accessToken) {
    throw new Error("accessToken é obrigatório");
  }

  if (!to) {
    throw new Error("Número de destino é obrigatório");
  }

  const id = String(mediaId || "").trim();
  const link = String(mediaUrl || "").trim();

  if (!id && !link) {
    throw new Error("mediaId ou mediaUrl é obrigatório");
  }

  const tipoMeta = mapTipoMensagem(tipoMensagem);
  const mediaPayload: Record<string, unknown> = id ? { id } : { link };
  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: tipoMeta,
    [tipoMeta]: mediaPayload,
  };

  if (tipoMensagem === "imagem" || tipoMensagem === "video") {
    if (caption?.trim()) {
      mediaPayload.caption = caption.trim();
    }
  }

  if (tipoMensagem === "documento") {
    if (caption?.trim()) {
      mediaPayload.caption = caption.trim();
    }

    if (fileName?.trim()) {
      mediaPayload.filename = fileName.trim();
    }
  }

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
      ? "Erro ao enviar mídia ao WhatsApp"
      : null;

  return {
    ok: response.ok,
    status: response.status,
    messageId,
    raw,
    error,
  };
}
