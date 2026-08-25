import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { MercadoPagoOAuthTokens } from "@/lib/mercado-pago/oauth";

function chaveCriptografiaMercadoPago() {
  const segredo =
    process.env.MERCADOPAGO_TOKEN_ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!segredo) {
    throw new Error("[MERCADO_PAGO] Chave de criptografia nao configurada");
  }

  return createHash("sha256").update(segredo).digest();
}

function criptografarCredencialMercadoPago(valor: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    chaveCriptografiaMercadoPago(),
    iv
  );
  const encrypted = Buffer.concat([
    cipher.update(valor, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [iv, tag, encrypted]
    .map((item) => item.toString("base64url"))
    .join(".");
}

export async function salvarIntegracaoMercadoPago(input: {
  empresaId: string;
  usuarioId: string;
  tokens: MercadoPagoOAuthTokens;
}) {
  const supabase = getSupabaseAdmin();
  const empresaId = String(input.empresaId || "").trim();
  const usuarioId = String(input.usuarioId || "").trim();

  if (!empresaId || !usuarioId) {
    throw new Error("Empresa ou usuario invalido para vincular o Mercado Pago");
  }

  const [{ data: empresa, error: empresaError }, { data: usuario, error: usuarioError }] =
    await Promise.all([
      supabase
        .from("empresas")
        .select("id")
        .eq("id", empresaId)
        .maybeSingle(),
      supabase
        .from("usuarios")
        .select("id, empresa_id")
        .eq("id", usuarioId)
        .eq("empresa_id", empresaId)
        .maybeSingle(),
    ]);

  if (empresaError) {
    throw new Error(`Erro ao validar empresa: ${empresaError.message}`);
  }

  if (usuarioError) {
    throw new Error(`Erro ao validar usuario: ${usuarioError.message}`);
  }

  if (!empresa || !usuario) {
    throw new Error("Empresa ou usuario nao pertence ao contexto autenticado");
  }

  const agora = new Date();
  const expiresAt = new Date(
    agora.getTime() + input.tokens.expiresIn * 1000
  ).toISOString();

  const { error } = await supabase.from("mercado_pago_integracoes").upsert(
    {
      empresa_id: empresaId,
      conectado_por: usuarioId,
      mercado_pago_user_id: input.tokens.userId,
      access_token_encrypted: criptografarCredencialMercadoPago(
        input.tokens.accessToken
      ),
      refresh_token_encrypted: criptografarCredencialMercadoPago(
        input.tokens.refreshToken
      ),
      public_key: input.tokens.publicKey,
      token_type: input.tokens.tokenType,
      scope: input.tokens.scope,
      live_mode: input.tokens.liveMode,
      expires_at: expiresAt,
      status: "ativa",
      conectado_em: agora.toISOString(),
      ultimo_refresh_em: null,
      ultimo_erro: null,
      updated_at: agora.toISOString(),
    },
    { onConflict: "empresa_id" }
  );

  if (error) {
    throw new Error(`Erro ao salvar integracao Mercado Pago: ${error.message}`);
  }

  return {
    mercadoPagoUserId: input.tokens.userId,
    liveMode: input.tokens.liveMode,
    expiresAt,
  };
}