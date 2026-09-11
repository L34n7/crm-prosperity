import { NextResponse } from "next/server";
import { validarChamadaCron } from "@/lib/cron/auth";
import { processarFilaProcessamentoAutoPendentes } from "@/lib/automacoes/process-automation-engine";
import { processarPendenciasAgenteIaVencidas } from "@/lib/agentes-ia/processar-pendencias-vencidas";

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
    const agora = new Date().toISOString();
    const limite = obterLimite(request);
    const [resultado, agentesIa] = await Promise.all([
      processarFilaProcessamentoAutoPendentes(limite),
      processarPendenciasAgenteIaVencidas(Math.min(limite, 50)),
    ]);

    if (encontrouTrabalho(resultado) || agentesIa.encontrados > 0 || agentesIa.erros > 0) {
      console.log("[CRON FILA PROCESSAMENTO AUTO] Processamento concluido:", {
        agora,
        resultado,
        agentesIa,
      });
    }

    return NextResponse.json({
      ok: true,
      ...resultado,
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
