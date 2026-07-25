import { NextRequest, NextResponse } from "next/server";
import { processAgendaAutomations } from "@/lib/agendas/automation-runtime";
import { validarChamadaCron } from "@/lib/cron/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function limitFromRequest(request: NextRequest) {
  const value = Number(new URL(request.url).searchParams.get("limit") || 50);
  return Number.isFinite(value)
    ? Math.min(100, Math.max(1, Math.floor(value)))
    : 50;
}

export async function GET(request: NextRequest) {
  const auth = validarChamadaCron(request, { exigirVercelCron: true });
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processAgendaAutomations(limitFromRequest(request));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[CRON AGENDA AUTOMACOES] Erro:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao processar automações da agenda.",
      },
      { status: 500 }
    );
  }
}
