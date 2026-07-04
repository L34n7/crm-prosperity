import { NextResponse } from "next/server";
import { processCoexistenceHistoryFallback } from "@/lib/whatsapp/coexistence-history-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getLimit(request: Request) {
  const value = Number(new URL(request.url).searchParams.get("limit") || 3);
  if (!Number.isFinite(value)) return 3;
  return Math.max(1, Math.min(10, Math.floor(value)));
}

export async function GET(request: Request) {
  if (
    request.headers.get("authorization") !==
    `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const result = await processCoexistenceHistoryFallback({
      integrationLimit: getLimit(request),
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[WHATSAPP COEX HISTORY] Erro no cron:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao processar fila de histórico.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
