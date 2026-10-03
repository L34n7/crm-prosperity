import { MODO_CONTINGENCIA_SUPABASE_ATIVO, respostaContingenciaSupabase } from "@/lib/operacional/contingencia-supabase";
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

    if (MODO_CONTINGENCIA_SUPABASE_ATIVO) {
      // A assinatura QStash já foi validada. Encerramos esta tentativa com
      // sucesso sem consultar o banco; a pendência será reconciliada depois.
      return respostaContingenciaSupabase("processar-webhook-whatsapp");
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

    if (resultado?.ok === true) {
      // Se outro worker/cron já concluiu ou travou o mesmo evento, o QStash
      // deve considerar a entrega concluída e não repetir a chamada.
      return NextResponse.json({
        ok: true,
        resultado,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error: "Webhook processado com erro interno.",
        resultado,
      },
      { status: 500 }
    );
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