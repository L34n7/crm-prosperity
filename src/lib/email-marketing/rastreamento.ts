import { createHmac, timingSafeEqual } from "node:crypto";

function chaveRastreamento(): string {
  const chave =
    process.env.EMAIL_MARKETING_TRACKING_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) throw new Error("Chave de rastreamento de e-mail indisponível.");
  return chave;
}

export function assinaturaLinkRastreado(token: string, destino: string) {
  return createHmac("sha256", chaveRastreamento())
    .update(token + "\n" + destino)
    .digest("base64url");
}

export function validarAssinaturaLink(
  token: string,
  destino: string,
  assinatura: string,
) {
  if (!/^[a-zA-Z0-9_-]{43}$/.test(assinatura)) return false;
  const esperado = Buffer.from(assinaturaLinkRastreado(token, destino));
  const recebido = Buffer.from(assinatura);
  return (
    esperado.length === recebido.length &&
    timingSafeEqual(esperado, recebido)
  );
}

export function destinoHttpSeguro(valor: string): string | null {
  try {
    if (!valor || valor.length > 2048) return null;
    const url = new URL(valor);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (url.username || url.password || !url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function reescreverLinksRastreados(
  html: string,
  params: { basePublica: string; token: string },
) {
  return html.replace(
    /(<a\b[^>]*?\bhref\s*=\s*)(["'])([^"']+)\2/gi,
    (completo, prefixo: string, aspas: string, href: string) => {
      const original = href.replace(/&amp;/gi, "&");
      const destino = destinoHttpSeguro(original);
      if (!destino) return completo;

      const urlOriginal = new URL(destino);
      // Opt-out nunca é métrica comercial nem deve passar por redirecionador.
      if (
        /\/api\/email-marketing\/(?:descadastrar|rastrear)(?:\/|$)/i.test(
          urlOriginal.pathname
        ) ||
        /\/unsubscribe\b/i.test(urlOriginal.pathname)
      ) {
        return completo;
      }

      const url =
        params.basePublica.replace(/\/$/, "") +
        "/api/email-marketing/rastrear/clique?token=" +
        encodeURIComponent(params.token) +
        "&url=" +
        encodeURIComponent(destino) +
        "&sig=" +
        encodeURIComponent(assinaturaLinkRastreado(params.token, destino));
      return prefixo + aspas + url.replace(/&/g, "&amp;") + aspas;
    },
  );
}
