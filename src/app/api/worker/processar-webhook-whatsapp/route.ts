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

  const resultado = await processarWebhookWhatsappPorId(body.eventoId);

  return NextResponse.json({
    ok: true,
    resultado,
  });
}