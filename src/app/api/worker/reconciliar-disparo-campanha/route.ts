import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";

import {
  MODO_CONTINGENCIA_SUPABASE_ATIVO,
  respostaContingenciaSupabase,
} from "@/lib/operacional/contingencia-supabase";
import { reconciliarCampanhaDisparo } from "@/lib/whatsapp/disparo-fila";

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

    if (MODO_CONTINGENCIA_SUPABASE_ATIVO) {
      return respostaContingenciaSupabase(
        "reconciliar-disparo-campanha"
      );
    }

    const body = JSON.parse(bodyText) as {
      campanhaId?: string;
    };
    const campanhaId = String(body.campanhaId || "").trim();

    if (!campanhaId) {
      return NextResponse.json(
        { ok: false, error: "campanhaId ausente." },
        { status: 400 }
      );
    }

    const resumo = await reconciliarCampanhaDisparo(campanhaId);

    return NextResponse.json({
      ok: true,
      campanhaId,
      resumo,
    });
  } catch (error) {
    console.error(
      "[WHATSAPP DISPARO] Erro no worker de reconciliação agregada:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro fatal ao reconciliar campanha.",
      },
      { status: 500 }
    );
  }
}
