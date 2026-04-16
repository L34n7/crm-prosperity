type MediaMessageType = "imagem" | "audio" | "video" | "documento";

export type SendWhatsAppMediaMessageParams = {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  tipoMensagem: MediaMessageType;
  mediaId: string;
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
  mediaId,
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

  if (!mediaId) {
    throw new Error("mediaId é obrigatório");
  }

  const tipoMeta = mapTipoMensagem(tipoMensagem);

  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: tipoMeta,
    [tipoMeta]: {
      id: mediaId,
    },
  };

  if (tipoMensagem === "imagem" || tipoMensagem === "video") {
    if (caption?.trim()) {
      (payload[tipoMeta] as Record<string, unknown>).caption = caption.trim();
    }
  }

  if (tipoMensagem === "documento") {
    if (caption?.trim()) {
      (payload[tipoMeta] as Record<string, unknown>).caption = caption.trim();
    }

    if (fileName?.trim()) {
      (payload[tipoMeta] as Record<string, unknown>).filename = fileName.trim();
    }
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