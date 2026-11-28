import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const EMPRESA_PILOTO_INSTAGRAM_ID = "4fc69d8c-52e3-4756-aaa1-d86db217c376";
export const INSTAGRAM_GRAPH_VERSION = "v26.0";
export const INSTAGRAM_GRAPH_URL = "https://graph.instagram.com";
export const INSTAGRAM_OAUTH_COOKIE = "crm_instagram_oauth_state";

export function podeAcessarInstagram(empresaId: string | null | undefined) {
  return empresaId === EMPRESA_PILOTO_INSTAGRAM_ID;
}

export function instagramOAuthConfig() {
  const id = process.env.INSTAGRAM_APP_ID?.trim();
  const secret = process.env.INSTAGRAM_APP_SECRET?.trim();
  const redirect = process.env.INSTAGRAM_REDIRECT_URI?.trim();
  if (!id || !secret || !redirect || !redirect.startsWith("https://")) {
    throw new Error("Configure INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET e INSTAGRAM_REDIRECT_URI (HTTPS) na Vercel.");
  }
  return { id, secret, redirect };
}

function encryptionKey() {
  const value = process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY?.trim() || "";
  const decoded = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (decoded.length !== 32) throw new Error("INSTAGRAM_TOKEN_ENCRYPTION_KEY deve conter 32 bytes em base64 ou hex.");
  return decoded;
}

export function criptografarTokenInstagram(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const dados = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), dados.toString("base64url")].join(".");
}

export function descriptografarTokenInstagram(value: string) {
  const [version, iv, tag, cipherText] = value.split(".");
  if (version !== "v1" || !iv || !tag || !cipherText) throw new Error("Formato de token Instagram inválido.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(cipherText, "base64url")), decipher.final()]).toString("utf8");
}

export type IntegracaoInstagram = {
  id: string;
  empresa_id: string;
  instagram_user_id: string;
  username: string;
  status: string;
  access_token_encrypted: string;
  token_expires_at: string | null;
};

export async function buscarIntegracaoInstagram(id: string, empresaId = EMPRESA_PILOTO_INSTAGRAM_ID) {
  const { data, error } = await getSupabaseAdmin().from("integracoes_instagram")
    .select("id,empresa_id,instagram_user_id,username,status,access_token_encrypted,token_expires_at")
    .eq("id", id).eq("empresa_id", empresaId).maybeSingle<IntegracaoInstagram>();
  if (error) throw new Error("Falha ao consultar integração Instagram.");
  return data;
}

export async function tokenInstagramAtivo(integracao: IntegracaoInstagram) {
  const tokenAtual = descriptografarTokenInstagram(integracao.access_token_encrypted);
  if (!integracao.token_expires_at) return tokenAtual;
  const restanteMs = new Date(integracao.token_expires_at).getTime() - Date.now();
  if (restanteMs > 7 * 86400_000) return tokenAtual;
  if (restanteMs <= 0) throw new Error("Token Instagram expirado. Reconecte sua conta.");
  const url = new URL("/refresh_access_token", INSTAGRAM_GRAPH_URL);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", tokenAtual);
  const response = await fetch(url, { method: "GET", cache: "no-store" });
  if (!response.ok) return tokenAtual; // Meta can temporarily refuse early refresh; do not invalidate a usable token.
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return tokenAtual;
  const expiresAt = new Date(Date.now() + (data.expires_in || 5184000) * 1000).toISOString();
  const encrypted = criptografarTokenInstagram(data.access_token);
  const { error } = await getSupabaseAdmin().from("integracoes_instagram")
    .update({ access_token_encrypted: encrypted, token_expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq("id", integracao.id).eq("empresa_id", integracao.empresa_id);
  if (error) throw new Error("Não foi possível armazenar a renovação segura do Instagram.");
  return data.access_token;
}

export async function enviarMensagemInstagram(params: {
  integracao: IntegracaoInstagram;
  destinatario: string;
  texto: string;
}) {
  if (params.integracao.status !== "ativa") throw new Error("Instagram desconectado.");
  const token = await tokenInstagramAtivo(params.integracao);
  const response = await fetch(
    `${INSTAGRAM_GRAPH_URL}/${INSTAGRAM_GRAPH_VERSION}/${encodeURIComponent(params.integracao.instagram_user_id)}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: params.destinatario }, message: { text: params.texto } }),
      cache: "no-store",
    }
  );
  const raw = (await response.json().catch(() => ({}))) as { message_id?: string; error?: { message?: string } };
  if (!response.ok || !raw.message_id) throw new Error(raw.error?.message || "Meta não confirmou o envio ao Instagram.");
  return raw.message_id;
}
