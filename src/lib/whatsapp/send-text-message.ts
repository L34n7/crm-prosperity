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

const ARTEFATOS_ESTRUTURADOS_INTERNOS = new Set([
  "memoria_delta",
  "memory_delta",
  "tipo_negocio",
  "proxima_acao",
  "fatos_confirmados",
]);

function chaveEstruturadaIsolada(valor: string) {
  const normalizado = valor
    .trim()
    .toLowerCase()
    .replace(/["'`\[\]{}:,\s]/g, "");
  return ARTEFATOS_ESTRUTURADOS_INTERNOS.has(normalizado);
}

function prepararTextoParaEnvio(valor: string) {
  const linhas = String(valor || "")
    .trim()
    .split(/\r?\n/)
    .filter((linha) => !chaveEstruturadaIsolada(linha));
  let texto = linhas.join("\n").trim();
  if (!texto) {
    return { texto: "", bloqueado: true, sanitizado: true };
  }

  const semResiduo = texto.replace(/([?!])\s*\]\s*,?\s*$/, "$1").trim();
  return {
    texto: semResiduo,
    bloqueado: false,
    sanitizado: semResiduo !== String(valor || "").trim() || linhas.length !== String(valor || "").trim().split(/\r?\n/).length,
  };
}

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

  const preparado = prepararTextoParaEnvio(body);
  if (preparado.bloqueado || !preparado.texto) {
    console.warn("[WHATSAPP] Mensagem bloqueada por conter somente artefato estruturado interno.");
    return {
      ok: true,
      status: 204,
      messageId: null,
      raw: {
        ignored: true,
        reason: "internal_structured_artifact",
      },
      error: null,
    };
  }

  const bodySeguro = preparado.texto;

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
        to,
        body: bodySeguro,
        sanitized: preparado.sanitizado,
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
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: {
          preview_url: false,
          body: bodySeguro,
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
    raw: preparado.sanitizado
      ? { meta_response: raw, sanitized: true, body_sent: bodySeguro }
      : raw,
    error,
  };
}
