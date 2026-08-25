import { createHash, randomBytes } from "crypto";

const MERCADO_PAGO_AUTHORIZATION_URL =
  "https://auth.mercadopago.com/authorization";

export const MERCADO_PAGO_OAUTH_STATE_COOKIE = "mercado_pago_oauth_state";
export const MERCADO_PAGO_OAUTH_CODE_VERIFIER_COOKIE =
  "mercado_pago_oauth_code_verifier";
export const MERCADO_PAGO_OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60;

export type MercadoPagoOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

function lerVariavelObrigatoria(nome: string) {
  const valor = String(process.env[nome] || "").trim();

  if (!valor) {
    throw new Error(`[MERCADO_PAGO] Variavel de ambiente ausente: ${nome}`);
  }

  return valor;
}

export function obterConfigOAuthMercadoPago(): MercadoPagoOAuthConfig {
  const clientId = lerVariavelObrigatoria("MERCADOPAGO_CLIENT_ID");
  const clientSecret = lerVariavelObrigatoria("MERCADOPAGO_CLIENT_SECRET");
  const redirectUri = lerVariavelObrigatoria("MERCADOPAGO_REDIRECT_URI");

  let redirectUrl: URL;

  try {
    redirectUrl = new URL(redirectUri);
  } catch {
    throw new Error("[MERCADO_PAGO] MERCADOPAGO_REDIRECT_URI invalida");
  }

  if (redirectUrl.protocol !== "https:") {
    throw new Error("[MERCADO_PAGO] MERCADOPAGO_REDIRECT_URI deve usar HTTPS");
  }

  return {
    clientId,
    clientSecret,
    redirectUri: redirectUrl.toString(),
  };
}

export function gerarStateOAuthMercadoPago() {
  return randomBytes(32).toString("base64url");
}

export function gerarPkceOAuthMercadoPago() {
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  return {
    codeVerifier,
    codeChallenge,
  };
}

export function criarUrlAutorizacaoMercadoPago(input: {
  state: string;
  codeChallenge: string;
}) {
  const { clientId, redirectUri } = obterConfigOAuthMercadoPago();
  const url = new URL(MERCADO_PAGO_AUTHORIZATION_URL);

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("state", input.state);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return url;
}

export function obterOpcoesCookieOAuthMercadoPago() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/integracoes/mercado-pago",
    maxAge: MERCADO_PAGO_OAUTH_COOKIE_MAX_AGE_SECONDS,
  };
}
