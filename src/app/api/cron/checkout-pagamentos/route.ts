import { NextResponse } from "next/server";
import { validarChamadaCron } from "@/lib/cron/auth";
import { processarCheckoutPagamentosExpirados } from "@/lib/automacoes/process-automation-engine-checkout-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = validarChamadaCron(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const informado = Number(url.searchParams.get("limit") || 50);
  const limite = Number.isFinite(informado)
    ? Math.min(100, Math.max(1, Math.floor(informado)))
    : 50;

  try {
    const resultado = await processarCheckoutPagamentosExpirados(limite);
    return NextResponse.json({ ok: true, ...resultado });
  } catch (error) {
    console.error("[CRON CHECKOUT] Erro:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
