import { getWhatsAppGraphUrl } from "@/lib/whatsapp/graph-api";

export class WhatsAppMediaAuthenticationError extends Error {
  readonly code = "WHATSAPP_MEDIA_AUTH";

  constructor(
    public readonly etapa: "token" | "metadados" | "download",
    public readonly statusHttp: number | null,
    public readonly codigoMeta: number | null = null
  ) {
    super("Não foi possível autenticar o acesso à mídia no WhatsApp. Verifique a integração e o token da Meta.");
    this.name = "WhatsAppMediaAuthenticationError";
  }
}

function erroDeAutenticacaoMeta(
  statusHttp: number,
  codigoMeta: number | null,
  mensagem: string
) {
  return statusHttp === 401 || statusHttp === 403 ||
    codigoMeta === 190 || codigoMeta === 10 ||
    /authentication error|invalid oauth|invalid access token|expired token|token expirado/i.test(mensagem);
}

export async function baixarAudioWhatsApp(
  mediaId: string,
  integrationAccessToken: string | null | undefined
) {
  const accessToken = String(integrationAccessToken || "").trim();
  if (!accessToken) {
    // Nao tentar um token global de outra empresa como fallback.
    throw new WhatsAppMediaAuthenticationError("token", null);
  }

  const mediaRes = await fetch(getWhatsAppGraphUrl(mediaId), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const mediaJson = await mediaRes.json().catch(() => null);

  if (!mediaRes.ok || !mediaJson?.url) {
    const codigoMeta = Number.isFinite(Number(mediaJson?.error?.code))
      ? Number(mediaJson.error.code)
      : null;
    const mensagem = String(mediaJson?.error?.message || "");
    if (erroDeAutenticacaoMeta(mediaRes.status, codigoMeta, mensagem)) {
      throw new WhatsAppMediaAuthenticationError("metadados", mediaRes.status, codigoMeta);
    }
    throw new Error(
      `Erro ao buscar URL do áudio no WhatsApp (HTTP ${mediaRes.status}, Meta ${codigoMeta ?? "n/a"}).`
    );
  }

  const audioRes = await fetch(mediaJson.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!audioRes.ok) {
    if (erroDeAutenticacaoMeta(audioRes.status, null, "")) {
      throw new WhatsAppMediaAuthenticationError("download", audioRes.status);
    }
    throw new Error(`Erro ao baixar áudio do WhatsApp (HTTP ${audioRes.status}).`);
  }

  return Buffer.from(await audioRes.arrayBuffer());
}
