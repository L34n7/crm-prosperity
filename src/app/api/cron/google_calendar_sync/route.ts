import { NextResponse } from "next/server";
import {
  processarFilaGoogleCalendar,
  processarIntegracoesPendentesGoogleCalendar,
  renovarCanaisGoogleCalendar,
} from "@/lib/agendas/google-calendar";

function limite(request: Request) {
  const valor = Number(new URL(request.url).searchParams.get("limit") || 30);
  if (!Number.isFinite(valor)) return 30;
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
    const valorLimite = limite(request);
    const notificacoes = await processarIntegracoesPendentesGoogleCalendar(
      Math.min(valorLimite, 20)
    );
    const itens = await processarFilaGoogleCalendar(valorLimite);
    const canais = await renovarCanaisGoogleCalendar(20);

    return NextResponse.json({
      ok: true,
      fila: {
        processados: itens.length,
        sucesso: itens.filter((item: Record<string, unknown>) => item.ok).length,
        falhas: itens.filter((item: Record<string, unknown>) => !item.ok).length,
        itens,
      },
      notificacoes: {
        processados: notificacoes.length,
        sucesso: notificacoes.filter((item: Record<string, unknown>) => item.ok).length,
        falhas: notificacoes.filter((item: Record<string, unknown>) => !item.ok).length,
        itens: notificacoes,
      },
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
            : "Erro ao processar sincronização do Google Calendar.",
      },
      { status: 500 }
    );
  }
}
