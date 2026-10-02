import {
  MODO_CONTINGENCIA_SUPABASE_ATIVO,
  respostaContingenciaSupabase,
} from "@/lib/operacional/contingencia-supabase";
import { NextResponse } from "next/server";
import { validarChamadaCron } from "@/lib/cron/auth";
import { processarFilaDesconexoesWhatsapp } from "@/lib/whatsapp/integracao-desconexao-fila";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const auth = validarChamadaCron(request, { exigirVercelCron: true });

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (MODO_CONTINGENCIA_SUPABASE_ATIVO) {
    return respostaContingenciaSupabase("whatsapp_integracoes_desconexao");
  }

  try {
    const resultado = await processarFilaDesconexoesWhatsapp();

    if (resultado.processado || resultado.status !== "sem_trabalho") {
      console.log("[CRON WHATSAPP DESCONEXAO] Fallback executado:", resultado);
    }

    return NextResponse.json(resultado);
  } catch (error) {
    console.error("[CRON WHATSAPP DESCONEXAO] Erro:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
