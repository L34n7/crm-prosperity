import { NextResponse } from "next/server";
import { validarChamadaCron } from "@/lib/cron/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

function obterLimite(request: Request) {
  const valor = Number(new URL(request.url).searchParams.get("limit") || 500);

  if (!Number.isFinite(valor)) return 500;

  return Math.min(Math.max(Math.floor(valor), 1), 1000);
}

export async function GET(request: Request) {
  const auth = validarChamadaCron(request, { exigirVercelCron: true });

  if (!auth.ok) {
    console.warn("[CRON EXPIRACAO CONVERSAS] Chamada recusada:", {
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

  const limite = obterLimite(request);

  try {
    const { data, error } = await supabaseAdmin.rpc(
      "processar_conversas_expiradas_24h",
      {
        p_limite: limite,
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    const conversas = Array.isArray(data) ? data : [];
    const processadas = conversas.length;
    const possuiMais = processadas === limite;

    if (processadas > 0) {
      console.log("[CRON EXPIRACAO CONVERSAS] Processamento concluido:", {
        processadas,
        limite,
        possui_mais: possuiMais,
      });
    }

    return NextResponse.json({
      ok: true,
      processadas,
      limite,
      possui_mais: possuiMais,
      conversas,
    });
  } catch (error) {
    console.error("[CRON EXPIRACAO CONVERSAS] Erro:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao processar expiracao das conversas",
      },
      { status: 500 }
    );
  }
}
