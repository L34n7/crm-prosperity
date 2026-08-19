import { NextResponse } from "next/server";
import { validarChamadaCron } from "@/lib/cron/auth";
import { processarEventosIntegracoesMapeadas } from "@/lib/rotinas-automacao/runtime-eventos-mapeados";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function limite(request: Request) {
  const valor = Number(new URL(request.url).searchParams.get("limit") || 50);
  if (!Number.isFinite(valor)) return 50;
  return Math.min(Math.max(Math.floor(valor), 1), 100);
}

export async function GET(request: Request) {
  const auth = validarChamadaCron(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const resultado = await processarEventosIntegracoesMapeadas(limite(request));
    const houveTrabalho = Object.entries(resultado).some(
      ([chave, valor]) => chave !== "erros" && Number(valor || 0) > 0,
    );
    if (houveTrabalho || resultado.erros > 0) {
      console.log("[CRON AUTOMACOES INTEGRACOES] Processamento concluído", resultado);
    }
    return NextResponse.json({ ok: true, ...resultado });
  } catch (error) {
    console.error("[CRON AUTOMACOES INTEGRACOES] Erro geral", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro geral no cron.",
      },
      { status: 500 },
    );
  }
}
