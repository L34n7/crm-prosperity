import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { isAdministrador } from "@/lib/auth/authorization";
import { salvarIntegracaoMercadoPago } from "@/lib/mercado-pago/integracao";
import {
  MERCADO_PAGO_OAUTH_CODE_VERIFIER_COOKIE,
  MERCADO_PAGO_OAUTH_STATE_COOKIE,
  obterOpcoesCookieOAuthMercadoPago,
  trocarCodigoPorTokensMercadoPago,
  validarCodeVerifierOAuthMercadoPago,
  validarStateCookieOAuthMercadoPago,
  validarStateOAuthMercadoPago,
} from "@/lib/mercado-pago/oauth";

export const dynamic = "force-dynamic";

type StatusOAuthMercadoPago =
  | "conectado"
  | "cancelado"
  | "sessao_expirada"
  | "erro";

function limparCookiesOAuthMercadoPago(response: NextResponse) {
  const options = obterOpcoesCookieOAuthMercadoPago();
  const expirado = {
    ...options,
    maxAge: 0,
    expires: new Date(0),
  };

  response.cookies.set(MERCADO_PAGO_OAUTH_STATE_COOKIE, "", expirado);
  response.cookies.set(
    MERCADO_PAGO_OAUTH_CODE_VERIFIER_COOKIE,
    "",
    expirado
  );

  return response;
}

function responderOAuthMercadoPago(
  request: NextRequest,
  status: StatusOAuthMercadoPago
) {
  const retorno = new URL("/configuracoes-gerais", request.url);
  retorno.searchParams.set("aba", "integracoes");
  retorno.searchParams.set("mercado_pago", status);

  return limparCookiesOAuthMercadoPago(NextResponse.redirect(retorno, 303));
}

export async function GET(request: NextRequest) {
  try {
    const stateRecebido = String(
      request.nextUrl.searchParams.get("state") || ""
    );
    const stateCookie = String(
      request.cookies.get(MERCADO_PAGO_OAUTH_STATE_COOKIE)?.value || ""
    );

    if (!validarStateCookieOAuthMercadoPago(stateRecebido, stateCookie)) {
      throw new Error("State OAuth do Mercado Pago nao corresponde ao navegador");
    }

    const state = validarStateOAuthMercadoPago(stateRecebido);
    const resultadoUsuario = await getUsuarioContexto();

    if (!resultadoUsuario.ok) {
      return responderOAuthMercadoPago(request, "sessao_expirada");
    }

    if (!isAdministrador(resultadoUsuario.usuario)) {
      throw new Error("Usuario sem permissao para concluir o OAuth do Mercado Pago");
    }

    if (
      resultadoUsuario.usuario.id !== state.usuarioId ||
      resultadoUsuario.usuario.empresa_id !== state.empresaId
    ) {
      throw new Error("Contexto autenticado diferente do inicio do OAuth");
    }

    if (request.nextUrl.searchParams.get("error")) {
      return responderOAuthMercadoPago(request, "cancelado");
    }

    const code = String(request.nextUrl.searchParams.get("code") || "").trim();
    const codeVerifier = String(
      request.cookies.get(MERCADO_PAGO_OAUTH_CODE_VERIFIER_COOKIE)?.value || ""
    ).trim();

    if (!code) {
      throw new Error("Mercado Pago nao retornou o codigo de autorizacao");
    }

    if (!validarCodeVerifierOAuthMercadoPago(codeVerifier)) {
      throw new Error("Code verifier PKCE ausente ou expirado");
    }

    const tokens = await trocarCodigoPorTokensMercadoPago({
      code,
      codeVerifier,
    });

    await salvarIntegracaoMercadoPago({
      empresaId: state.empresaId,
      usuarioId: state.usuarioId,
      tokens,
    });

    return responderOAuthMercadoPago(request, "conectado");
  } catch (error) {
    console.error(
      "[MERCADO_PAGO] Erro no callback OAuth:",
      error instanceof Error ? error.message : error
    );

    return responderOAuthMercadoPago(request, "erro");
  }
}
