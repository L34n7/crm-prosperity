import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { processarItemDisparoPorId } from "@/lib/whatsapp/disparo-fila";

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
      itemId?: string;
    };

    if (!body.itemId) {
      return NextResponse.json(
        { ok: false, error: "itemId ausente" },
        { status: 400 }
      );
    }

    const resultado = await processarItemDisparoPorId(body.itemId);

    if (resultado.ok !== true) {
      return NextResponse.json(
        {
          ok: false,
          error: "Item processado com erro interno.",
          resultado,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      resultado,
    });
  } catch (error) {
    console.error("[QSTASH WHATSAPP DISPARO] Erro fatal", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro fatal no worker de disparo.",
      },
      { status: 500 }
    );
  }
}
