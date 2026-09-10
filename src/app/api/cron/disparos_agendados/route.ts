import { NextResponse } from "next/server";
import { validarChamadaCron } from "@/lib/cron/auth";
import { enfileirarDisparosAgendadosVencidos } from "@/lib/whatsapp/disparo-agendado-fila";
import { enfileirarMensagensManuaisAgendadasVencidas } from "@/lib/whatsapp/mensagem-agendada";

function obterLimite(request: Request) {
  const valor = Number(new URL(request.url).searchParams.get("limit") || 1000);

  if (!Number.isFinite(valor)) return 1000;

  return Math.min(Math.max(Math.floor(valor), 1), 2000);
}

function encontrouTrabalho(resultado: {
  encontrados: number;
  enfileirados: number;
  adiados: number;
  erros: number;
  cancelados: number;
}) {
  return (
    resultado.encontrados > 0 ||
    resultado.enfileirados > 0 ||
    resultado.adiados > 0 ||
    resultado.erros > 0 ||
    resultado.cancelados > 0
  );
}

export async function GET(request: Request) {
  const auth = validarChamadaCron(request, { exigirVercelCron: true });

  if (!auth.ok) {
    console.warn("[CRON DISPAROS AGENDADOS] Chamada recusada:", {
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
    const limite = obterLimite(request);
    const [resultado, mensagensManuais] = await Promise.all([
      enfileirarDisparosAgendadosVencidos({ limite }),
      enfileirarMensagensManuaisAgendadasVencidas({
        limite: Math.min(limite, 200),
      }),
    ]);

    if (encontrouTrabalho(resultado) || mensagensManuais.encontrados > 0) {
      console.log("[CRON DISPAROS AGENDADOS] Processamento concluido:", {
        agora,
        resultado,
        mensagens_manuais: mensagensManuais,
      });
    }

    return NextResponse.json({
      ok: true,
      modelo_disparos: "fila_qstash",
      ...resultado,
      mensagens_manuais: mensagensManuais,
    });
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "Erro geral no cron.";

    console.error("[CRON DISPAROS AGENDADOS] Erro geral:", error);

    return NextResponse.json(
      {
        ok: false,
        error: mensagem,
      },
      { status: 500 }
    );
  }
}
