import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const MERCADO_PAGO_AUTHORIZATION_URL =
  "https://auth.mercadopago.com/authorization";
const MERCADO_PAGO_TOKEN_URL = "https://api.mercadopago.com/oauth/token";
const MERCADO_PAGO_OAUTH_STATE_TTL_MS = 10 * 60_000;

export const MERCADO_PAGO_OAUTH_STATE_COOKIE = "mercado_pago_oauth_state";
export const MERCADO_PAGO_OAUTH_CODE_VERIFIER_COOKIE =
  "mercado_pago_oauth_code_verifier";
export const MERCADO_PAGO_OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60;

export type MercadoPagoOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type MercadoPagoOAuthState = {
  empresaId: string;
  usuarioId: string;
};

export type MercadoPagoOAuthTokens = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  scope: string | null;
  userId: string;
  publicKey: string | null;
  liveMode: boolean;
};

function lerVariavelObrigatoria(nome: string) {
  const valor = String(process.env[nome] || "").trim();

  if (!valor) {
    throw new Error(`[MERCADO_PAGO] Variavel de ambiente ausente: ${nome}`);
  }

  return valor;
}

export function usarTokenTesteMercadoPago() {
  return String(process.env.MERCADOPAGO_TEST_TOKEN || "")
    .trim()
    .toLowerCase() === "true";
}

function chaveStateOAuthMercadoPago() {
  const segredo =
    process.env.MERCADOPAGO_TOKEN_ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!segredo) {
    throw new Error("[MERCADO_PAGO] Chave para proteger o OAuth nao configurada");
  }

  return createHash("sha256").update(segredo).digest();
}

function assinarStateOAuthMercadoPago(payload: string) {
  return createHmac("sha256", chaveStateOAuthMercadoPago())
    .update(payload)
    .digest("base64url");
}

function compararTextoSeguro(valor: string, esperado: string) {
  if (!valor || !esperado) return false;

  const atualBuffer = Buffer.from(valor);
  const esperadoBuffer = Buffer.from(esperado);

  return (
    atualBuffer.length === esperadoBuffer.length &&
    timingSafeEqual(atualBuffer, esperadoBuffer)
  );
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
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

export function gerarStateOAuthMercadoPago(input: MercadoPagoOAuthState) {
  const payload = Buffer.from(
    JSON.stringify({
      empresaId: input.empresaId,
      usuarioId: input.usuarioId,
      nonce: randomBytes(18).toString("base64url"),
      exp: Date.now() + MERCADO_PAGO_OAUTH_STATE_TTL_MS,
    })
  ).toString("base64url");

  return `${payload}.${assinarStateOAuthMercadoPago(payload)}`;
}

export function validarStateOAuthMercadoPago(state: string): MercadoPagoOAuthState {
  const [payload, assinatura, extra] = String(state || "").split(".");

  if (!payload || !assinatura || extra) {
    throw new Error("Estado OAuth do Mercado Pago invalido");
  }

  const assinaturaEsperada = assinarStateOAuthMercadoPago(payload);

  if (!compararTextoSeguro(assinatura, assinaturaEsperada)) {
    throw new Error("Estado OAuth do Mercado Pago invalido");
  }

  let dados: Record<string, unknown>;

  try {
    dados = objeto(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
  } catch {
    throw new Error("Estado OAuth do Mercado Pago invalido");
  }

  const empresaId = String(dados.empresaId || "").trim();
  const usuarioId = String(dados.usuarioId || "").trim();
  const exp = Number(dados.exp);

  if (!empresaId || !usuarioId || !Number.isFinite(exp) || exp < Date.now()) {
    throw new Error("Estado OAuth do Mercado Pago expirado");
  }

  return { empresaId, usuarioId };
}

export function validarStateCookieOAuthMercadoPago(
  stateRecebido: string,
  stateCookie: string
) {
  return compararTextoSeguro(stateRecebido, stateCookie);
}

export function validarCodeVerifierOAuthMercadoPago(codeVerifier: string) {
  return codeVerifier.length >= 43 && codeVerifier.length <= 128;
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

export async function trocarCodigoPorTokensMercadoPago(input: {
  code: string;
  codeVerifier: string;
}): Promise<MercadoPagoOAuthTokens> {
  const code = String(input.code || "").trim();
  const codeVerifier = String(input.codeVerifier || "").trim();

  if (!code) {
    throw new Error("Mercado Pago nao retornou o codigo de autorizacao");
  }

  if (!validarCodeVerifierOAuthMercadoPago(codeVerifier)) {
    throw new Error("Verificador PKCE do Mercado Pago invalido ou expirado");
  }

  const { clientId, clientSecret, redirectUri } = obterConfigOAuthMercadoPago();
  const testToken = usarTokenTesteMercadoPago();

  console.info("[MERCADO_PAGO] Trocando codigo OAuth", {
    client_id: clientId,
    client_secret_configurado: Boolean(clientSecret),
    client_secret_tamanho: clientSecret.length,
    test_token: testToken,
  });

  const response = await fetch(MERCADO_PAGO_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      test_token: testToken,
    }),
    cache: "no-store",
  });

  const payload = objeto(await response.json().catch(() => ({})));

  if (!response.ok) {
    const erro = String(payload.error || "oauth_error");
    const descricao = String(
      payload.message || payload.error_description || "Mercado Pago recusou a autenticacao"
    );

    console.error("[MERCADO_PAGO] Falha ao trocar codigo OAuth:", {
      status: response.status,
      error: erro,
      error_description: descricao,
      client_id: clientId,
      client_secret_configurado: Boolean(clientSecret),
      client_secret_tamanho: clientSecret.length,
      test_token: testToken,
    });

    throw new Error(descricao);
  }

  const accessToken = String(payload.access_token || "").trim();
  const refreshToken = String(payload.refresh_token || "").trim();
  const tokenType = String(payload.token_type || "bearer").trim() || "bearer";
  const expiresIn = Number(payload.expires_in);
  const userId = String(payload.user_id || "").trim();
  const scope = String(payload.scope || "").trim() || null;
  const publicKey = String(payload.public_key || "").trim() || null;
  const liveMode = payload.live_mode === true;

  if (
    !accessToken ||
    !refreshToken ||
    !userId ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    throw new Error("Resposta OAuth do Mercado Pago incompleta");
  }

  return {
    accessToken,
    refreshToken,
    tokenType,
    expiresIn,
    scope,
    userId,
    publicKey,
    liveMode,
  };
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
