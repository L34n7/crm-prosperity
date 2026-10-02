import {
  MODO_CONTINGENCIA_SUPABASE_ATIVO,
  respostaContingenciaSupabase,
} from "@/lib/operacional/contingencia-supabase";
import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { processarDesconexaoIntegracaoJob } from "@/lib/whatsapp/integracao-desconexao-fila";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

    if (MODO_CONTINGENCIA_SUPABASE_ATIVO) {
      // O job continua persistido no banco e será retomado pelo cron fallback.
      return respostaContingenciaSupabase("whatsapp-integracao-desconectar");
    }

    const body = JSON.parse(bodyText) as { jobId?: string };
    const jobId = String(body.jobId || "").trim();

    if (!jobId) {
      return NextResponse.json(
        { ok: false, error: "jobId ausente" },
        { status: 400 }
      );
    }

    const resultado = await processarDesconexaoIntegracaoJob(jobId);

    // Erros operacionais são persistidos no próprio job para retentativa.
    // Retornamos 200 ao QStash para não criar uma segunda esteira de retries
    // concorrendo com o controle de backoff do banco.
    return NextResponse.json(resultado);
  } catch (error) {
    console.error("[QSTASH WHATSAPP DESCONEXAO] Erro fatal:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro fatal no worker de desconexão.",
      },
      { status: 500 }
    );
  }
}
