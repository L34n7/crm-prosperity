import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  usarTokenTesteMercadoPago,
  type MercadoPagoOAuthTokens,
} from "@/lib/mercado-pago/oauth";

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

function descriptografarCredencialMercadoPago(valor: string) {
  const partes = String(valor || "").split(".");
  if (partes.length !== 3) {
    throw new Error("[MERCADO_PAGO] Credencial criptografada invalida");
  }

  const [ivBase64, tagBase64, encryptedBase64] = partes;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    chaveCriptografiaMercadoPago(),
    Buffer.from(ivBase64, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagBase64, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function credenciaisAplicacaoMercadoPago() {
  const clientId = String(process.env.MERCADOPAGO_CLIENT_ID || "").trim();
  const clientSecret = String(
    process.env.MERCADOPAGO_CLIENT_SECRET || ""
  ).trim();

  if (!clientId || !clientSecret) {
    throw new Error(
      "[MERCADO_PAGO] MERCADOPAGO_CLIENT_ID ou MERCADOPAGO_CLIENT_SECRET nao configurado"
    );
  }

  return { clientId, clientSecret };
}

async function renovarAccessTokenMercadoPago(integracao: any) {
  const supabase = getSupabaseAdmin();
  const { clientId, clientSecret } = credenciaisAplicacaoMercadoPago();
  const testToken = usarTokenTesteMercadoPago();
  const refreshToken = descriptografarCredencialMercadoPago(
    integracao.refresh_token_encrypted
  );

  console.info("[MERCADO_PAGO] Renovando token OAuth", {
    client_id: clientId,
    client_secret_configurado: Boolean(clientSecret),
    client_secret_tamanho: clientSecret.length,
    test_token: testToken,
  });

  const response = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      test_token: testToken,
    }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload?.access_token || !payload?.refresh_token) {
    const motivo = String(
      payload?.message || payload?.error_description || payload?.error || response.status
    ).slice(0, 500);

    await supabase
      .from("mercado_pago_integracoes")
      .update({
        status: "erro",
        ultimo_erro: `Falha ao renovar credencial: ${motivo}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", integracao.id);

    throw new Error(`Nao foi possivel renovar a conexao Mercado Pago: ${motivo}`);
  }

  const agora = new Date();
  const expiresIn = Math.max(60, Number(payload.expires_in || 0));
  const expiresAt = new Date(agora.getTime() + expiresIn * 1000).toISOString();

  const { error } = await supabase
    .from("mercado_pago_integracoes")
    .update({
      mercado_pago_user_id: String(payload.user_id || integracao.mercado_pago_user_id),
      access_token_encrypted: criptografarCredencialMercadoPago(
        String(payload.access_token)
      ),
      refresh_token_encrypted: criptografarCredencialMercadoPago(
        String(payload.refresh_token)
      ),
      public_key: payload.public_key || integracao.public_key,
      token_type: payload.token_type || integracao.token_type || "bearer",
      scope: payload.scope || integracao.scope,
      live_mode:
        typeof payload.live_mode === "boolean"
          ? payload.live_mode
          : Boolean(integracao.live_mode),
      expires_at: expiresAt,
      status: "ativa",
      ultimo_refresh_em: agora.toISOString(),
      ultimo_erro: null,
      updated_at: agora.toISOString(),
    })
    .eq("id", integracao.id);

  if (error) {
    throw new Error(`Erro ao persistir renovacao Mercado Pago: ${error.message}`);
  }

  return {
    accessToken: String(payload.access_token),
    userId: String(payload.user_id || integracao.mercado_pago_user_id),
    liveMode:
      typeof payload.live_mode === "boolean"
        ? payload.live_mode
        : Boolean(integracao.live_mode),
    expiresAt,
  };
}

export async function obterAccessTokenMercadoPagoEmpresa(empresaId: string) {
  const supabase = getSupabaseAdmin();
  const empresa = String(empresaId || "").trim();

  if (!empresa) {
    throw new Error("Empresa nao informada para o Mercado Pago");
  }

  const { data: integracao, error } = await supabase
    .from("mercado_pago_integracoes")
    .select(
      "id,empresa_id,mercado_pago_user_id,access_token_encrypted,refresh_token_encrypted,public_key,token_type,scope,live_mode,expires_at,status"
    )
    .eq("empresa_id", empresa)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao carregar integracao Mercado Pago: ${error.message}`);
  }

  if (!integracao || integracao.status !== "ativa") {
    throw new Error("Mercado Pago nao esta conectado para esta empresa");
  }

  const expiraEm = new Date(integracao.expires_at).getTime();
  const margemRenovacaoMs = 5 * 60 * 1000;

  if (Number.isFinite(expiraEm) && expiraEm > Date.now() + margemRenovacaoMs) {
    return {
      accessToken: descriptografarCredencialMercadoPago(
        integracao.access_token_encrypted
      ),
      userId: String(integracao.mercado_pago_user_id),
      liveMode: Boolean(integracao.live_mode),
      expiresAt: integracao.expires_at,
    };
  }

  return renovarAccessTokenMercadoPago(integracao);
}

export async function obterEmpresaMercadoPagoPorUserId(userId: string) {
  const supabase = getSupabaseAdmin();
  const id = String(userId || "").trim();

  if (!id) return null;

  const { data, error } = await supabase
    .from("mercado_pago_integracoes")
    .select("empresa_id,mercado_pago_user_id,live_mode,status")
    .eq("mercado_pago_user_id", id)
    .eq("status", "ativa")
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao identificar vendedor Mercado Pago: ${error.message}`);
  }

  return data || null;
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
