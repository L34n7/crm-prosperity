import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { processarPendenciaAgenteIa } from "@/lib/agentes-ia/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

export async function POST(request: Request) {
  try {
    const bodyText = await request.text();
    const assinatura = request.headers.get("upstash-signature") || "";
    const valido = await receiver.verify({ signature: assinatura, body: bodyText });

    if (!valido) {
      return NextResponse.json({ ok: false, error: "Assinatura inválida" }, { status: 401 });
    }

    const body = JSON.parse(bodyText) as { pendenciaId?: string };
    if (!body.pendenciaId) {
      return NextResponse.json({ ok: false, error: "pendenciaId ausente" }, { status: 400 });
    }

    const resultado = await processarPendenciaAgenteIa(body.pendenciaId);
    return NextResponse.json({ ok: true, resultado });
  } catch (error) {
    console.error("[AGENTE_IA_WORKER] Erro:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro interno" },
      { status: 500 }
    );
  }
}
