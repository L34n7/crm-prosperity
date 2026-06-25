import { NextResponse } from "next/server";
import { processarFilaDisparosWhatsapp } from "@/lib/whatsapp/disparo-fila";

export const runtime = "nodejs";

function obterLimite(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "");

  if (!Number.isFinite(limit) || limit <= 0) {
    return undefined;
  }

  return Math.max(1, Math.min(50, Math.floor(limit)));
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
    const resultado = await processarFilaDisparosWhatsapp({
      limite: obterLimite(request),
      apenasSemQstash: true,
    });

    return NextResponse.json(resultado);
  } catch (error) {
    console.error("[CRON WHATSAPP DISPAROS FILA] Erro geral:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
