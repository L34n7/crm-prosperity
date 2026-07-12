import { NextResponse } from "next/server";
import { validarChamadaCron } from "@/lib/cron/auth";
import { processarFilaDisparosWhatsapp } from "@/lib/whatsapp/disparo-fila";

export const runtime = "nodejs";

function obterLimite(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "");

  if (!Number.isFinite(limit) || limit <= 0) {
    return undefined;
  }

  return Math.max(1, Math.min(50, Math.floor(limit)));
}

function encontrouTrabalho(resultado: {
  buscados: number;
  enviados: number;
  falhas: number;
  reagendados: number;
  ignorados: number;
}) {
  return (
    resultado.buscados > 0 ||
    resultado.enviados > 0 ||
    resultado.falhas > 0 ||
    resultado.reagendados > 0 ||
    resultado.ignorados > 0
  );
}

export async function GET(request: Request) {
  const auth = validarChamadaCron(request, { exigirVercelCron: true });

  if (!auth.ok) {
    console.warn("[CRON WHATSAPP DISPAROS FILA] Chamada recusada:", {
      userAgent: auth.userAgent,
      temAuthorization: auth.temAuthorization,
      chamadaVercelCron: auth.chamadaVercelCron,
    });

    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized",
      },
      { status: 401 }
    );
  }

  try {
    const resultado = await processarFilaDisparosWhatsapp({
      limite: obterLimite(request),
      apenasSemQstash: true,
    });

    if (encontrouTrabalho(resultado)) {
      console.log("[CRON WHATSAPP DISPAROS FILA] Fallback executado:", {
        buscados: resultado.buscados,
        enviados: resultado.enviados,
        falhas: resultado.falhas,
        reagendados: resultado.reagendados,
        ignorados: resultado.ignorados,
        limite: resultado.limite,
      });
    }

    return NextResponse.json(resultado);
  } catch (error) {
    console.error("[CRON WHATSAPP DISPAROS FILA] Erro geral:", error);

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
