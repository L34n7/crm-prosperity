import { NextResponse } from "next/server";

/**
 * Contingência operacional temporária para incidentes graves do Supabase.
 *
 * Enquanto ativo:
 * - crons não iniciam consultas/processamentos no banco;
 * - workers QStash validam a assinatura e encerram com 200, evitando retries em massa;
 * - o webhook da Meta responde 503 antes de tocar no Supabase, permitindo retry posterior.
 *
 * Desative este flag assim que o Supabase estiver estável e faça a reconciliação
 * dos registros pendentes pelas rotinas já existentes.
 */
export const MODO_CONTINGENCIA_SUPABASE_ATIVO = false;

export function respostaContingenciaSupabase(
  servico: string,
  opcoes: { status?: 200 | 503; retryAfterSegundos?: number } = {}
) {
  const status = opcoes.status ?? 200;
  const retryAfterSegundos = Math.max(
    60,
    Math.floor(opcoes.retryAfterSegundos ?? 300)
  );

  return NextResponse.json(
    {
      ok: status === 200,
      success: status === 200,
      contingency: true,
      paused: true,
      service: servico,
      reason: "Supabase temporariamente indisponível. Processamento suspenso para evitar avalanche de retries.",
      recovery: "reprocessar_pendencias_apos_normalizacao",
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(status === 503
          ? { "Retry-After": String(retryAfterSegundos) }
          : {}),
      },
    }
  );
}
