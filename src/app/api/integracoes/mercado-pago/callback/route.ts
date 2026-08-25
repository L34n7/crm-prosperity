import { NextRequest, NextResponse } from "next/server";
import { getUsuarioBasico } from "@/lib/auth/get-usuario-contexto";
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
  const sucesso = status === "conectado";
  const cancelado = status === "cancelado";
  const sessaoExpirada = status === "sessao_expirada";
  const titulo = sucesso
    ? "Mercado Pago conectado"
    : cancelado
      ? "Conexao cancelada"
      : sessaoExpirada
        ? "Sessao expirada"
        : "Nao foi possivel conectar";
  const mensagem = sucesso
    ? "A conta do Mercado Pago foi vinculada com seguranca ao CRM Prosperity."
    : cancelado
      ? "A autorizacao do Mercado Pago foi cancelada. Nenhuma credencial foi salva."
      : sessaoExpirada
        ? "Entre novamente no CRM e repita a conexao com o Mercado Pago."
        : "Nao foi possivel concluir a vinculacao. Tente novamente pela tela de configuracoes.";
  const fallbackUrl = new URL("/configuracoes", request.url);
  const origem = fallbackUrl.origin;
  const payload = JSON.stringify({
    type: "mercado-pago-oauth",
    status,
  });

  fallbackUrl.searchParams.set("mercado_pago", status);

  const response = new NextResponse(
    `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${titulo}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; font-family: Arial, sans-serif; background: linear-gradient(135deg, #07111f, #0f172a); color: #e2e8f0; }
      main { width: min(420px, 100%); padding: 26px; border: 1px solid rgba(255,255,255,.12); border-radius: 20px; background: rgba(255,255,255,.07); box-shadow: 0 24px 70px rgba(0,0,0,.3); text-align: center; }
      span { display: inline-grid; width: 48px; height: 48px; place-items: center; border-radius: 999px; background: ${sucesso ? "rgba(16,185,129,.18)" : "rgba(239,68,68,.18)"}; color: ${sucesso ? "#86efac" : "#fecaca"}; font-size: 24px; font-weight: 800; }
      h1 { margin: 16px 0 0; color: #fff; font-size: 22px; }
      p { margin: 10px 0 0; color: #cbd5e1; font-size: 14px; line-height: 1.6; }
      button { margin-top: 18px; min-height: 42px; padding: 0 16px; border: 0; border-radius: 12px; background: #2563eb; color: #fff; font-weight: 800; cursor: pointer; }
    </style>
  </head>
  <body>
    <main>
      <span>${sucesso ? "✓" : "!"}</span>
      <h1>${titulo}</h1>
      <p>${mensagem}</p>
      <button type="button" onclick="window.close()">Fechar janela</button>
    </main>
    <script>
      const payload = ${payload};
      const targetOrigin = ${JSON.stringify(origem)};
      const fallbackUrl = ${JSON.stringify(fallbackUrl.toString())};
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, targetOrigin);
        window.close();
      } else {
        window.location.replace(fallbackUrl);
      }
    </script>
  </body>
</html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );

  return limparCookiesOAuthMercadoPago(response);
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
    const resultadoUsuario = await getUsuarioBasico();

    if (!resultadoUsuario.ok) {
      return responderOAuthMercadoPago(request, "sessao_expirada");
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
    console.error("[MERCADO_PAGO] Erro no callback OAuth:",
      error instanceof Error ? error.message : error
    );

    return responderOAuthMercadoPago(request, "erro");
  }
}