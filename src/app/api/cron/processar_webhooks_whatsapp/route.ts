import { MODO_CONTINGENCIA_SUPABASE_ATIVO, respostaContingenciaSupabase } from "@/lib/operacional/contingencia-supabase";
import { NextResponse } from "next/server";
import { republicarFilaWebhooksWhatsapp } from "@/lib/whatsapp/webhook-queue";
import { republicarWebhooksIntegracaoPendentes } from "@/lib/rotinas-automacao/webhook-outbox";

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

    const limite = getLimitFromRequest(request);
    const [recuperacao, recuperacaoIntegracoes] = await Promise.all([
      republicarFilaWebhooksWhatsapp({
        limite,
        idadeMinimaSegundos: 90,
      }),
      republicarWebhooksIntegracaoPendentes({
        limite,
        idadeMinimaSegundos: 90,
      }),
    ]);

    // Este cron permanece mínimo: apenas recupera eventos órfãos e os
    // republica no QStash. A retenção histórica roda em cron separado.
    return NextResponse.json({
      ok: true,
      recuperacao,
      recuperacao_integracoes: recuperacaoIntegracoes,
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
