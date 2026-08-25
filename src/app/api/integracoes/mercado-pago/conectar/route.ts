import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { isAdministrador } from "@/lib/auth/authorization";
import {
  criarUrlAutorizacaoMercadoPago,
  gerarPkceOAuthMercadoPago,
  gerarStateOAuthMercadoPago,
  MERCADO_PAGO_OAUTH_CODE_VERIFIER_COOKIE,
  MERCADO_PAGO_OAUTH_STATE_COOKIE,
  obterOpcoesCookieOAuthMercadoPago,
} from "@/lib/mercado-pago/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  const resultadoUsuario = await getUsuarioContexto();

  if (!resultadoUsuario.ok) {
    return NextResponse.json(
      { error: resultadoUsuario.error },
      { status: resultadoUsuario.status }
    );
  }

  if (!isAdministrador(resultadoUsuario.usuario)) {
    return NextResponse.json(
      { error: "Apenas administradores podem conectar o Mercado Pago." },
      { status: 403 }
    );
  }

  if (!resultadoUsuario.usuario.empresa_id) {
    return NextResponse.json(
      { error: "Usuario nao esta vinculado a uma empresa" },
      { status: 400 }
    );
  }

  try {
    const state = gerarStateOAuthMercadoPago({
      empresaId: resultadoUsuario.usuario.empresa_id,
      usuarioId: resultadoUsuario.usuario.id,
    });
    const { codeVerifier, codeChallenge } = gerarPkceOAuthMercadoPago();
    const authorizationUrl = criarUrlAutorizacaoMercadoPago({
      state,
      codeChallenge,
    });
    const cookieOptions = obterOpcoesCookieOAuthMercadoPago();
    const response = NextResponse.redirect(authorizationUrl, 302);

    response.cookies.set(
      MERCADO_PAGO_OAUTH_STATE_COOKIE,
      state,
      cookieOptions
    );
    response.cookies.set(
      MERCADO_PAGO_OAUTH_CODE_VERIFIER_COOKIE,
      codeVerifier,
      cookieOptions
    );
    response.headers.set("Cache-Control", "no-store");

    return response;
  } catch (error) {
    console.error("[MERCADO_PAGO] Erro ao iniciar OAuth:", error);

    return NextResponse.json(
      { error: "Integracao do Mercado Pago nao configurada" },
      { status: 500 }
    );
  }
}
