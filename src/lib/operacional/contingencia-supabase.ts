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

type EstadoCircuitoSupabase = {
  falhasConsecutivas: number;
  abertoAte: number;
  ultimaFalha: string | null;
};

type GlobalCircuitoSupabase = typeof globalThis & {
  __crmCircuitosSupabase?: Map<string, EstadoCircuitoSupabase>;
};

const globalCircuito = globalThis as GlobalCircuitoSupabase;
const circuitosSupabase =
  globalCircuito.__crmCircuitosSupabase ||
  new Map<string, EstadoCircuitoSupabase>();

globalCircuito.__crmCircuitosSupabase = circuitosSupabase;

function erroParaTexto(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error || "");
  }
}

export function erroSupabaseEhTransitorio(error: unknown) {
  const texto = erroParaTexto(error).toLowerCase();

  return [
    "statement timeout",
    "canceling statement due to statement timeout",
    "upstream request timeout",
    "connection timed out",
    "error code 522",
    " 522",
    "proxy_status",
    "error=57014",
    "57014",
    "gateway timeout",
    "bad gateway",
    "service unavailable",
    "fetch failed",
    "econnreset",
    "etimedout",
    "connection reset",
    "connection refused",
  ].some((trecho) => texto.includes(trecho));
}

export function circuitoSupabaseEstaAberto(servico: string) {
  if (MODO_CONTINGENCIA_SUPABASE_ATIVO) {
    return true;
  }

  const estado = circuitosSupabase.get(servico);
  if (!estado) return false;

  if (estado.abertoAte <= Date.now()) {
    circuitosSupabase.delete(servico);
    return false;
  }

  return true;
}

export function registrarFalhaCircuitoSupabase(
  servico: string,
  error: unknown,
  opcoes: {
    limiarFalhas?: number;
    pausaMs?: number;
  } = {}
) {
  if (!erroSupabaseEhTransitorio(error)) {
    return false;
  }

  const atual = circuitosSupabase.get(servico) || {
    falhasConsecutivas: 0,
    abertoAte: 0,
    ultimaFalha: null,
  };
  const falhasConsecutivas = atual.falhasConsecutivas + 1;
  const limiarFalhas = Math.max(1, Math.floor(opcoes.limiarFalhas ?? 1));
  const pausaMs = Math.max(15_000, Math.floor(opcoes.pausaMs ?? 60_000));

  circuitosSupabase.set(servico, {
    falhasConsecutivas,
    abertoAte:
      falhasConsecutivas >= limiarFalhas
        ? Date.now() + pausaMs
        : atual.abertoAte,
    ultimaFalha: erroParaTexto(error).slice(0, 500),
  });

  return true;
}

export function registrarSucessoCircuitoSupabase(servico: string) {
  circuitosSupabase.delete(servico);
}

export function obterEstadoCircuitoSupabase(servico: string) {
  const estado = circuitosSupabase.get(servico);

  if (!estado || estado.abertoAte <= Date.now()) {
    return null;
  }

  return {
    aberto: true,
    abertoAte: new Date(estado.abertoAte).toISOString(),
    falhasConsecutivas: estado.falhasConsecutivas,
    ultimaFalha: estado.ultimaFalha,
  };
}

