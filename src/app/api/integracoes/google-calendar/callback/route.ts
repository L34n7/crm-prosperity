import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  concluirOAuthGoogleCalendar,
  sincronizarAgendaGoogleCalendar,
  validarStateGoogleCalendar,
} from "@/lib/agendas/google-calendar";

function redirecionar(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/agendas?google_calendar=${status}`, request.url));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    if (searchParams.get("error")) return redirecionar(request, "cancelado");

    const code = String(searchParams.get("code") || "");
    const state = validarStateGoogleCalendar(String(searchParams.get("state") || ""));
    const resultado = await getUsuarioContexto();

    if (
      !resultado.ok ||
      resultado.usuario.id !== state.usuarioId ||
      resultado.usuario.empresa_id !== state.empresaId
    ) {
      return redirecionar(request, "erro");
    }

    await concluirOAuthGoogleCalendar({ code, ...state });
    await sincronizarAgendaGoogleCalendar({
      empresaId: state.empresaId,
      agendaId: state.agendaId,
    });

    return redirecionar(request, "conectado");
  } catch (error) {
    console.error("[GOOGLE_CALENDAR] Erro no callback:", error);
    return redirecionar(request, "erro");
  }
}
