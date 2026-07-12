import { NextResponse } from "next/server";
import { validarChamadaCron } from "@/lib/cron/auth";
import { processCoexistenceHistoryFallback } from "@/lib/whatsapp/coexistence-history-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getLimit(request: Request) {
  const value = Number(new URL(request.url).searchParams.get("limit") || 3);
  if (!Number.isFinite(value)) return 3;
  return Math.max(1, Math.min(10, Math.floor(value)));
}

function numberFrom(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function resumirResultados(
  result: Awaited<ReturnType<typeof processCoexistenceHistoryFallback>>
) {
  const resumo = {
    processados: 0,
    ignorados: 0,
    falhas: 0,
  };

  for (const item of result.results) {
    const record = item as Record<string, unknown>;
    const falhas = numberFrom(record.failed);
    resumo.processados += numberFrom(record.processed);
    resumo.ignorados += numberFrom(record.ignored);
    resumo.falhas += falhas;

    if (record.ok === false && falhas === 0) {
      resumo.falhas += 1;
    }
  }

  return resumo;
}

export async function GET(request: Request) {
  const auth = validarChamadaCron(request, { exigirVercelCron: true });

  if (!auth.ok) {
    console.warn("[WHATSAPP COEX HISTORY] Chamada recusada:", {
      userAgent: auth.userAgent,
      temAuthorization: auth.temAuthorization,
      chamadaVercelCron: auth.chamadaVercelCron,
    });

    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const result = await processCoexistenceHistoryFallback({
      integrationLimit: getLimit(request),
    });
    const resumo = resumirResultados(result);

    if (
      result.integrations > 0 ||
      resumo.processados > 0 ||
      resumo.ignorados > 0 ||
      resumo.falhas > 0
    ) {
      console.log("[WHATSAPP COEX HISTORY] Fallback executado:", {
        integracoes: result.integrations,
        ...resumo,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[WHATSAPP COEX HISTORY] Erro no cron:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao processar fila de histórico.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
