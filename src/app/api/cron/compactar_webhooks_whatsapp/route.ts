import { NextResponse } from "next/server";

import {
  MODO_CONTINGENCIA_SUPABASE_ATIVO,
  respostaContingenciaSupabase,
} from "@/lib/operacional/contingencia-supabase";
import { compactarWebhooksWhatsappProcessados } from "@/lib/whatsapp/webhook-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    if (MODO_CONTINGENCIA_SUPABASE_ATIVO) {
      return respostaContingenciaSupabase(
        "compactar_webhooks_whatsapp"
      );
    }

    const resultado = await compactarWebhooksWhatsappProcessados({
      limite: 500,
      idadeMinimaHoras: 24,
    });

    return NextResponse.json({
      ok: true,
      resultado,
    });
  } catch (error) {
    console.error(
      "[CRON COMPACTACAO WEBHOOK WHATSAPP] Erro geral:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro desconhecido",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
