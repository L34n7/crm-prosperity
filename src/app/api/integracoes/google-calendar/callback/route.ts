import { NextRequest, NextResponse } from "next/server";
import {
  concluirOAuthGoogleCalendar,
  sincronizarAgendaGoogleCalendar,
  validarStateGoogleCalendar,
} from "@/lib/agendas/google-calendar";

function responderPopup(request: NextRequest, status: string, etapa?: string) {
  const url = new URL("/agendas", request.url);
  const origem = url.origin;
  const sucesso = status === "conectado" || status === "conectado_sync_pendente";
  const titulo = sucesso ? "Conta Google vinculada" : "Nao foi possivel vincular";
  const mensagem =
    status === "conectado"
      ? "A conta foi conectada e a agenda foi sincronizada."
      : status === "conectado_sync_pendente"
        ? "A conta foi conectada. A sincronizacao pode ser repetida na tela de agendas."
        : status === "cancelado"
          ? "A vinculacao com o Google foi cancelada."
          : "Nao foi possivel concluir a vinculacao. Feche esta janela e tente novamente.";
  const payload = JSON.stringify({
    type: "google-calendar-oauth",
    status,
    etapa: etapa || null,
  });
  const fallbackUrl = new URL("/agendas", request.url);

  fallbackUrl.searchParams.set("google_calendar", status);
  if (etapa) fallbackUrl.searchParams.set("google_calendar_etapa", etapa);

  return new NextResponse(
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
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    if (searchParams.get("error")) return responderPopup(request, "cancelado");

    const code = String(searchParams.get("code") || "");
    const state = validarStateGoogleCalendar(String(searchParams.get("state") || ""));

    await concluirOAuthGoogleCalendar({ code, ...state });

    try {
      await sincronizarAgendaGoogleCalendar({
        empresaId: state.empresaId,
        agendaId: state.agendaId,
      });
    } catch (error) {
      console.error("[GOOGLE_CALENDAR] Integracao salva, mas sincronizacao inicial falhou:", error);
      return responderPopup(request, "conectado_sync_pendente");
    }

    return responderPopup(request, "conectado");
  } catch (error) {
    console.error("[GOOGLE_CALENDAR] Erro no callback:", error);
    return responderPopup(request, "erro", "callback");
  }
}
