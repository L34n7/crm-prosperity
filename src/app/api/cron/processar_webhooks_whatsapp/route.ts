import { NextResponse } from "next/server";
import { processarFilaWebhooksWhatsapp } from "@/lib/whatsapp/webhook-queue";

export const runtime = "nodejs";

function getLimitFromRequest(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 20);

  if (!Number.isFinite(limit)) return 20;

  return Math.max(1, Math.min(100, Math.floor(limit)));
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized",
      },
      { status: 401 }
    );
  }

  try {
    const resultado = await processarFilaWebhooksWhatsapp({
      limite: getLimitFromRequest(request),
    });

    return NextResponse.json(resultado);
  } catch (error: any) {
    console.error("[CRON WEBHOOK WHATSAPP] Erro geral:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro desconhecido",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
