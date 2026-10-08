import { Receiver } from "@upstash/qstash";
import { NextResponse } from "next/server";
import {
  MODO_CONTINGENCIA_SUPABASE_ATIVO,
  respostaContingenciaSupabase,
} from "@/lib/operacional/contingencia-supabase";
import { processarWebhookIntegracaoPorId } from "@/lib/rotinas-automacao/webhook-outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

export async function POST(request: Request) {
  try {
    const bodyText = await request.text();
    const valido = await receiver.verify({
      signature: request.headers.get("upstash-signature") || "",
      body: bodyText,
    });

    if (!valido) {
      return NextResponse.json({ ok: false, error: "Assinatura inválida" }, { status: 401 });
    }

    if (MODO_CONTINGENCIA_SUPABASE_ATIVO) {
      return respostaContingenciaSupabase("processar-webhook-integracao");
    }

    const body = JSON.parse(bodyText) as { outboxId?: string };
    if (!body.outboxId) {
      return NextResponse.json({ ok: false, error: "outboxId ausente" }, { status: 400 });
    }

    const resultado = await processarWebhookIntegracaoPorId(body.outboxId);
    return NextResponse.json({ ok: true, resultado });
  } catch (error) {
    console.error("[QSTASH WEBHOOK INTEGRACAO] Erro", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro ao processar webhook externo.",
      },
      { status: 500 },
    );
  }
}
