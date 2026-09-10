import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { processarMensagemManualAgendadaPorId } from "@/lib/whatsapp/mensagem-agendada";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
      return NextResponse.json({ ok: false, error: "Assinatura inválida" }, { status: 401 });
    }

    const body = JSON.parse(bodyText) as { agendamentoId?: string };
    if (!body.agendamentoId) {
      return NextResponse.json({ ok: false, error: "agendamentoId ausente" }, { status: 400 });
    }

    const resultado = await processarMensagemManualAgendadaPorId(body.agendamentoId);
    if (!resultado.ok) {
      return NextResponse.json({ ok: false, resultado }, { status: 500 });
    }

    return NextResponse.json({ ok: true, resultado });
  } catch (error) {
    console.error("[QSTASH MENSAGEM AGENDADA] Erro fatal", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro fatal no worker de mensagem agendada.",
      },
      { status: 500 }
    );
  }
}
