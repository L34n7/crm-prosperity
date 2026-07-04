import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { processCoexistenceHistoryBatch } from "@/lib/whatsapp/coexistence-history-queue";

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
        { ok: false, error: "Assinatura inválida." },
        { status: 401 }
      );
    }

    const body = JSON.parse(bodyText) as {
      integrationId?: string;
    };

    if (!body.integrationId) {
      return NextResponse.json(
        { ok: false, error: "integrationId ausente." },
        { status: 400 }
      );
    }

    const result = await processCoexistenceHistoryBatch({
      integrationId: body.integrationId,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[WHATSAPP COEX HISTORY] Erro no worker:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro fatal no worker de histórico.",
      },
      { status: 500 }
    );
  }
}
