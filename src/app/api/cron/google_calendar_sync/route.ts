import { MODO_CONTINGENCIA_SUPABASE_ATIVO, respostaContingenciaSupabase } from "@/lib/operacional/contingencia-supabase";
import { NextResponse } from "next/server";
import { renovarCanaisGoogleCalendar } from "@/lib/agendas/google-calendar";

function limite(request: Request) {
  const valor = Number(new URL(request.url).searchParams.get("limit") || 20);
  if (!Number.isFinite(valor)) return 20;
  return Math.min(Math.max(Math.floor(valor), 1), 100);
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    if (MODO_CONTINGENCIA_SUPABASE_ATIVO) {
      return respostaContingenciaSupabase("google_calendar_sync");
    }

    // A fila CRM -> Google e as notificações Google -> CRM são processadas
    // por evento/QStash. Este cron diário existe apenas para renovar canais.
    const canais = await renovarCanaisGoogleCalendar(limite(request));

    return NextResponse.json({
      ok: true,
      canais: {
        processados: canais.length,
        sucesso: canais.filter((item: Record<string, unknown>) => item.ok).length,
        falhas: canais.filter((item: Record<string, unknown>) => !item.ok).length,
        itens: canais,
      },
    });
  } catch (error) {
    console.error("[CRON GOOGLE CALENDAR] Erro:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao renovar canais do Google Calendar.",
      },
      { status: 500 }
    );
  }
}
