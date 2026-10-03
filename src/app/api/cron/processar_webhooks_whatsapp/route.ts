import { MODO_CONTINGENCIA_SUPABASE_ATIVO, respostaContingenciaSupabase } from "@/lib/operacional/contingencia-supabase";
import { NextResponse } from "next/server";
import {
  compactarWebhooksWhatsappProcessados,
  republicarFilaWebhooksWhatsapp,
} from "@/lib/whatsapp/webhook-queue";

export const runtime = "nodejs";

function getLimitFromRequest(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 10);

  if (!Number.isFinite(limit)) return 10;

  return Math.max(1, Math.min(25, Math.floor(limit)));
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
    if (MODO_CONTINGENCIA_SUPABASE_ATIVO) {
      return respostaContingenciaSupabase("processar_webhooks_whatsapp");
    }

    const recuperacao = await republicarFilaWebhooksWhatsapp({
      limite: getLimitFromRequest(request),
      idadeMinimaSegundos: 90,
    });

    // O cron não vira um segundo worker pesado. Ele apenas republica órfãos
    // para a fila controlada do QStash. Quando não há nada para recuperar,
    // usa uma pequena fração da execução para compactar histórico antigo.
    const compactacao =
      !recuperacao.pausado && recuperacao.buscados === 0
        ? await compactarWebhooksWhatsappProcessados({
            limite: 50,
            idadeMinimaHoras: 24,
          })
        : null;

    return NextResponse.json({
      ok: true,
      recuperacao,
      compactacao,
    });
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
