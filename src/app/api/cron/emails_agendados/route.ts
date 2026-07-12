import { NextResponse } from "next/server";
import { validarChamadaCron } from "@/lib/cron/auth";
import { processarEmailsAgendados } from "@/lib/email/emails-agendados";

function obterLimite(request: Request) {
  const valor = Number(new URL(request.url).searchParams.get("limit") || 25);

  if (!Number.isFinite(valor)) return 25;

  return Math.min(Math.max(Math.floor(valor), 1), 100);
}

function encontrouTrabalho(resultado: {
  encontrados: number;
  enviados: number;
  erros: number;
  cancelados: number;
}) {
  return (
    resultado.encontrados > 0 ||
    resultado.enviados > 0 ||
    resultado.erros > 0 ||
    resultado.cancelados > 0
  );
}

export async function GET(request: Request) {
  const auth = validarChamadaCron(request, { exigirVercelCron: true });

  if (!auth.ok) {
    console.warn("[CRON EMAILS AGENDADOS] Chamada recusada:", {
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
    const resultado = await processarEmailsAgendados({
      agora,
      limite: obterLimite(request),
    });

    if (encontrouTrabalho(resultado)) {
      console.log("[CRON EMAILS AGENDADOS] Processamento concluido:", {
        agora,
        resultado,
      });
    }

    return NextResponse.json({
      ok: true,
      ...resultado,
    });
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "Erro geral no cron.";

    console.error("[CRON EMAILS AGENDADOS] Erro geral:", error);

    return NextResponse.json(
      {
        ok: false,
        error: mensagem,
      },
      { status: 500 }
    );
  }
}
