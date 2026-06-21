import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { processarFilaProcessamentoAutoPorId } from "@/lib/automacoes/process-automation-engine";

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
        { ok: false, error: "Assinatura invalida" },
        { status: 401 }
      );
    }

    const body = JSON.parse(bodyText) as {
      jobId?: string;
    };

    if (!body.jobId) {
      return NextResponse.json(
        { ok: false, error: "jobId ausente" },
        { status: 400 }
      );
    }

    const resultado = await processarFilaProcessamentoAutoPorId(
      body.jobId
    );

    if (resultado?.ok !== true) {
      return NextResponse.json(
        {
          ok: false,
          error: "Job processado com erro interno.",
          resultado,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      resultado,
    });
  } catch (error: unknown) {
    console.error("[QSTASH FILA AUTO] Erro fatal", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro fatal no worker da fila.",
      },
      { status: 500 }
    );
  }
}
