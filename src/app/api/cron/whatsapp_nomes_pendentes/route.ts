import { NextResponse } from "next/server";
import { validarChamadaCron } from "@/lib/cron/auth";
import { processarAlteracoesNomeWhatsappPendentes } from "@/lib/whatsapp/display-name-changes";

function obterLimite(request: Request) {
  const valor = Number(new URL(request.url).searchParams.get("limit") || 10);

  if (!Number.isFinite(valor)) return 10;

  return Math.min(Math.max(Math.floor(valor), 1), 50);
}

export async function GET(request: Request) {
  const auth = validarChamadaCron(request, { exigirVercelCron: true });

  if (!auth.ok) {
    console.warn("[CRON WHATSAPP NOMES] Chamada recusada:", {
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
    const agora = new Date().toISOString();
    const resultado = await processarAlteracoesNomeWhatsappPendentes({
      limite: obterLimite(request),
    });

    if (!resultado.ok) {
      console.error("[CRON WHATSAPP NOMES] Erro no processamento:", resultado);

      return NextResponse.json(resultado, { status: 500 });
    }

    if (resultado.processados > 0) {
      console.log("[CRON WHATSAPP NOMES] Processamento concluido:", {
        agora,
        resultado,
      });
    }

    return NextResponse.json(resultado);
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "Erro geral no cron.";

    console.error("[CRON WHATSAPP NOMES] Erro geral:", error);

    return NextResponse.json(
      {
        ok: false,
        error: mensagem,
      },
      { status: 500 }
    );
  }
}
