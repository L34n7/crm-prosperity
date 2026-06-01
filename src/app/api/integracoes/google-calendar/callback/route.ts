import { NextRequest, NextResponse } from "next/server";
import {
  concluirOAuthGoogleCalendar,
  sincronizarAgendaGoogleCalendar,
  validarStateGoogleCalendar,
} from "@/lib/agendas/google-calendar";

function redirecionar(request: NextRequest, status: string, etapa?: string) {
  const url = new URL("/agendas", request.url);

  url.searchParams.set("google_calendar", status);
  if (etapa) url.searchParams.set("google_calendar_etapa", etapa);

  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    if (searchParams.get("error")) return redirecionar(request, "cancelado");

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
      return redirecionar(request, "conectado_sync_pendente");
    }

    return redirecionar(request, "conectado");
  } catch (error) {
    console.error("[GOOGLE_CALENDAR] Erro no callback:", error);
    return redirecionar(request, "erro", "callback");
  }
}
