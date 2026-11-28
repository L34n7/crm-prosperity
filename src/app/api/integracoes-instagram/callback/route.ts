import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAdministrador } from "@/lib/auth/authorization";
import {
  criptografarTokenInstagram, INSTAGRAM_GRAPH_URL, INSTAGRAM_GRAPH_VERSION,
  INSTAGRAM_OAUTH_COOKIE, instagramOAuthConfig, podeAcessarInstagram
} from "@/lib/instagram/config";

type MetaToken = { access_token?: string; user_id?: number; expires_in?: number; error_message?: string };
type MetaProfile = { id?: string; username?: string; profile_picture_url?: string; error?: { message?: string } };

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function redirectResult(request: NextRequest, status: string) {
  const response = NextResponse.redirect(new URL(`/instagram?${status}`, request.url));
  response.cookies.set(INSTAGRAM_OAUTH_COOKIE, "", { path: "/api/integracoes-instagram", maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  const auth = await getUsuarioContexto();
  if (!auth.ok || !podeAcessarInstagram(auth.usuario.empresa_id) || !isAdministrador(auth.usuario)) {
    return redirectResult(request, "erro=permissao");
  }
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state") || "";
  const saved = request.cookies.get(INSTAGRAM_OAUTH_COOKIE)?.value || "";
  if (!code || !state || !safeEqual(saved, `${auth.usuario.id}:${state}`)) {
    return redirectResult(request, "erro=estado");
  }
  try {
    const config = instagramOAuthConfig();
    const body = new URLSearchParams({
      client_id: config.id, client_secret: config.secret,
      grant_type: "authorization_code", redirect_uri: config.redirect, code
    });
    const exchange = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST", body, cache: "no-store"
    });
    const shortToken = (await exchange.json()) as MetaToken;
    if (!exchange.ok || !shortToken.access_token) throw new Error("Troca do código de autorização falhou.");

    const longUrl = new URL("/access_token", INSTAGRAM_GRAPH_URL);
    longUrl.searchParams.set("grant_type", "ig_exchange_token");
    longUrl.searchParams.set("client_secret", config.secret);
    longUrl.searchParams.set("access_token", shortToken.access_token);
    const longRes = await fetch(longUrl, { cache: "no-store" });
    const longToken = (await longRes.json()) as MetaToken;
    if (!longRes.ok || !longToken.access_token) throw new Error("Não foi possível obter o token de longa duração.");

    const profileUrl = `${INSTAGRAM_GRAPH_URL}/${INSTAGRAM_GRAPH_VERSION}/me`;
    const profileHeaders = { Authorization: `Bearer ${longToken.access_token}` };
    let profileRes = await fetch(`${profileUrl}?fields=id,username,profile_picture_url`, {
      headers: profileHeaders, cache: "no-store"
    });
    let profile = (await profileRes.json()) as MetaProfile;
    if (!profileRes.ok || !profile.id || !profile.username) {
      // Foto é opcional; não deve bloquear a conexão.
      profileRes = await fetch(`${profileUrl}?fields=id,username`, {
        headers: profileHeaders, cache: "no-store"
      });
      profile = (await profileRes.json()) as MetaProfile;
    }
    if (!profileRes.ok || !profile.id || !profile.username) throw new Error("Não foi possível identificar o perfil profissional.");

    const subscribed = await fetch(`${INSTAGRAM_GRAPH_URL}/${INSTAGRAM_GRAPH_VERSION}/${encodeURIComponent(profile.id)}/subscribed_apps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${longToken.access_token}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ subscribed_fields: "messages" }), cache: "no-store"
    });
    if (!subscribed.ok) throw new Error("Assinatura do webhook messages não foi aceita pela Meta.");

    const supabase = getSupabaseAdmin();
    const { data: proprietario, error: ownerError } = await supabase.from("integracoes_instagram")
      .select("id,empresa_id").eq("instagram_user_id", profile.id).maybeSingle();
    if (ownerError) throw ownerError;
    if (proprietario && proprietario.empresa_id !== auth.usuario.empresa_id) {
      throw new Error("Conta Instagram já vinculada a outra empresa.");
    }
    const { error } = await supabase.from("integracoes_instagram").upsert({
      ...(proprietario ? { id: proprietario.id } : {}),
      empresa_id: auth.usuario.empresa_id,
      nome_conexao: `@${profile.username}`,
      instagram_user_id: profile.id,
      username: profile.username,
      foto_perfil_url: profile.profile_picture_url || null,
      status: "ativa",
      access_token_encrypted: criptografarTokenInstagram(longToken.access_token),
      token_expires_at: new Date(Date.now() + (longToken.expires_in || 5184000) * 1000).toISOString(),
      webhook_verificado: false,
      ultimo_erro: null,
      conectado_por: auth.usuario.id,
      updated_at: new Date().toISOString()
    }, { onConflict: "instagram_user_id" });
    if (error) throw error;
    return redirectResult(request, "conexao=sucesso");
  } catch (error) {
    console.error("[INSTAGRAM] OAuth callback falhou:", error instanceof Error ? error.message : "erro desconhecido");
    return redirectResult(request, "erro=conexao");
  }
}
