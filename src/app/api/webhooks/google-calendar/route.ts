import { NextRequest, NextResponse } from "next/server";
import { processarNotificacaoGoogleCalendar } from "@/lib/agendas/google-calendar";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const resultado = await processarNotificacaoGoogleCalendar(request.headers);

    return NextResponse.json(resultado, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[GOOGLE_CALENDAR_WEBHOOK] Erro:", error);

    /*
     * O Google repete notificações quando recebe falha. Retornamos 500 apenas
     * quando o processamento realmente falhou para permitir uma nova tentativa.
     */
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao processar notificação do Google Calendar.",
      },
      { status: 500 }
    );
  }
}
