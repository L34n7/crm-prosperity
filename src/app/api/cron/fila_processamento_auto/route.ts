import { MODO_CONTINGENCIA_SUPABASE_ATIVO, respostaContingenciaSupabase } from "@/lib/operacional/contingencia-supabase";
import { NextResponse } from "next/server";
import { validarChamadaCron } from "@/lib/cron/auth";
import { processarFilaProcessamentoAutoPendentes } from "@/lib/automacoes/process-automation-engine";
import { processarPendenciasAgenteIaVencidas } from "@/lib/agentes-ia/processar-pendencias-vencidas";
import { processarFilaRecuperacaoFluxoPendentes } from "@/lib/automacoes/recuperacao-fluxo-fila";

function logOperacional(...args: unknown[]) {
  if (String(process.env.LOG_OPERACIONAL_DEBUG || "").toLowerCase() !== "true") {
    return;
  }

  console.log(...args);
}

function obterLimite(request: Request) {
  const valor = Number(new URL(request.url).searchParams.get("limit") || 50);

  if (!Number.isFinite(valor)) return 50;

  return Math.min(Math.max(Math.floor(valor), 1), 100);
}

function encontrouTrabalho(resultado: {
  encontrados: number;
  processados: number;
  ignorados: number;
  erros: number;
}) {
  return (
    resultado.encontrados > 0 ||
    resultado.processados > 0 ||
    resultado.ignorados > 0 ||
    resultado.erros > 0
  );
}

export async function GET(request: Request) {
  const auth = validarChamadaCron(request);

  if (!auth.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized",
      },
      { status: 401 }
    );
  }

  try {
    if (MODO_CONTINGENCIA_SUPABASE_ATIVO) {
      return respostaContingenciaSupabase("fila_processamento_auto");
    }

    const agora = new Date().toISOString();
    const limite = obterLimite(request);
    const [resultado, recuperacaoFluxos, agentesIa] = await Promise.all([
      processarFilaProcessamentoAutoPendentes(limite),
      processarFilaRecuperacaoFluxoPendentes(Math.min(limite, 25)),
      processarPendenciasAgenteIaVencidas(Math.min(limite, 50)),
    ]);

    if (
      encontrouTrabalho(resultado) ||
      encontrouTrabalho(recuperacaoFluxos) ||
      agentesIa.encontrados > 0 ||
      agentesIa.erros > 0
    ) {
      logOperacional("[CRON FILA PROCESSAMENTO AUTO] Processamento concluido:", {
        agora,
        resultado,
        recuperacaoFluxos,
        agentesIa,
      });
    }

    return NextResponse.json({
      ok: true,
      ...resultado,
      recuperacao_fluxos: recuperacaoFluxos,
      agentes_ia: agentesIa,
    });
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "Erro geral no cron.";

    console.error("[CRON FILA PROCESSAMENTO AUTO] Erro geral:", error);

    return NextResponse.json(
      {
        ok: false,
        error: mensagem,
      },
      { status: 500 }
    );
  }
}
