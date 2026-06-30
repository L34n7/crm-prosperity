import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function obterLimite(request: Request) {
  const valor = Number(new URL(request.url).searchParams.get("limit") || 100);

  if (!Number.isFinite(valor)) return 100;

  return Math.min(Math.max(Math.floor(valor), 1), 500);
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const limite = obterLimite(request);

  try {
    const { data, error } = await getSupabaseAdmin().rpc(
      "processar_feedbacks_agendamentos_pendentes",
      { p_limite: limite }
    );

    if (error) {
      throw new Error(error.message);
    }

    const processados = Array.isArray(data) ? data : [];

    return NextResponse.json({
      ok: true,
      processados: processados.length,
      possui_mais: processados.length === limite,
      agendamentos: processados,
    });
  } catch (error) {
    console.error("[CRON FEEDBACK AGENDAMENTOS] Erro:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao processar feedbacks de agendamentos.",
      },
      { status: 500 }
    );
  }
}
