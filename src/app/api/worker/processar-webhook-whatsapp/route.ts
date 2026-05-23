import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { processarWebhookWhatsappPorId } from "@/lib/whatsapp/webhook-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

export async function POST(request: Request) {
  try {
    const bodyText = await request.text();

    const isValid = await receiver.verify({
      signature: request.headers.get("upstash-signature") || "",
      body: bodyText,
    });

    if (!isValid) {
      return NextResponse.json(
        { ok: false, error: "Assinatura inválida" },
        { status: 401 }
      );
    }

    const body = JSON.parse(bodyText) as {
      eventoId?: string;
    };

    if (!body.eventoId) {
      return NextResponse.json(
        { ok: false, error: "eventoId ausente" },
        { status: 400 }
      );
    }

    const resultado: any = await processarWebhookWhatsappPorId(
      body.eventoId
    );

    const errorCount = Number(
      resultado?.totals?.errorCount || 0
    );

    const resultadoOk =
      resultado?.success === true &&
      errorCount === 0;

    if (!resultadoOk) {
      console.error("[QSTASH WORKER] Processamento com erro", {
        eventoId: body.eventoId,
        resultado,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "Webhook processado com erro interno.",
          resultado,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      resultado,
    });
  } catch (error: any) {
    console.error("[QSTASH WORKER] Erro fatal", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro fatal no worker.",
      },
      { status: 500 }
    );
  }
}