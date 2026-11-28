import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { isAdministrador } from "@/lib/auth/authorization";
import { INSTAGRAM_OAUTH_COOKIE, instagramOAuthConfig, podeAcessarInstagram } from "@/lib/instagram/config";

export async function GET(request: NextRequest) {
  const auth = await getUsuarioContexto();
  if (!auth.ok) return NextResponse.redirect(new URL("/login", request.url));
  if (!podeAcessarInstagram(auth.usuario.empresa_id) || !isAdministrador(auth.usuario)) {
    return NextResponse.redirect(new URL("/instagram?erro=permissao", request.url));
  }
  let config: ReturnType<typeof instagramOAuthConfig>;
  try {
    config = instagramOAuthConfig();
  } catch {
    return NextResponse.redirect(new URL("/instagram?erro=configuracao", request.url));
  }
  const state = randomBytes(24).toString("base64url");
  const authorize = new URL("https://www.instagram.com/oauth/authorize");
  authorize.searchParams.set("client_id", config.id);
  authorize.searchParams.set("redirect_uri", config.redirect);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "instagram_business_basic,instagram_business_manage_messages");
  authorize.searchParams.set("state", state);
  const res = NextResponse.redirect(authorize);
  res.cookies.set(INSTAGRAM_OAUTH_COOKIE, `${auth.usuario.id}:${state}`, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/api/integracoes-instagram", maxAge: 600
  });
  return res;
}
