import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

export type UsoTokensIa = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number;
  cachedInputTokens?: number;
  cacheWriteInputTokens?: number;
};

export type SaldoTokensIa = {
  empresa_id: string;
  limite_mensal: number | null;
  tokens_usados: number;
  tokens_restantes: number | null;
  saldo_mensal_restante: number | null;
  saldo_avulso_restante: number;
  tokens_mensais_usados: number;
  tokens_avulsos_usados: number;
  periodo_inicio: string;
  periodo_fim: string;
  updated_at?: string;
  // aliases de leitura para runtimes conversacionais mais novos
  limite: number | null;
  restantes: number | null;
};

type PrecoModeloIa = {
  referencia: string;
  inputUsdPorMilhao: number;
  cachedInputUsdPorMilhao: number;
  cacheWriteInputUsdPorMilhao: number;
  outputUsdPorMilhao: number;
};

export type CobrancaTokensIa = {
  tokensEquivalentes: number;
  custoEstimadoUsd: number;
  preco: PrecoModeloIa;
  precificacaoFallback: boolean;
  inputTokensNaoCacheados: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
};

// Um token de IA Prosperity representa um microdolar (US$ 0,000001) de custo.
// Por isso, o preco em USD por 1M de tokens e numericamente igual ao peso usado
// para converter tokens fisicos do provider em tokens equivalentes do plano.
const PRECOS_MODELOS_IA: Array<{
  corresponde: (modelo: string) => boolean;
  preco: PrecoModeloIa;
}> = [
  {
    corresponde: (modelo) => modelo.startsWith("gpt-4o-mini-transcribe"),
    preco: {
      referencia: "gpt-4o-mini-transcribe",
      inputUsdPorMilhao: 1.25,
      cachedInputUsdPorMilhao: 1.25,
      cacheWriteInputUsdPorMilhao: 1.25,
      outputUsdPorMilhao: 5,
    },
  },
  {
    corresponde: (modelo) => modelo.startsWith("gpt-5.6-luna"),
    preco: {
      referencia: "gpt-5.6-luna",
      inputUsdPorMilhao: 0.2,
      cachedInputUsdPorMilhao: 0.02,
      cacheWriteInputUsdPorMilhao: 0.25,
      outputUsdPorMilhao: 1.2,
    },
  },
  {
    corresponde: (modelo) => modelo.startsWith("gpt-5.6-terra"),
    preco: {
      referencia: "gpt-5.6-terra",
      inputUsdPorMilhao: 2,
      cachedInputUsdPorMilhao: 0.2,
      cacheWriteInputUsdPorMilhao: 2.5,
      outputUsdPorMilhao: 12,
    },
  },
  {
    corresponde: (modelo) => modelo.startsWith("gpt-5.6-sol"),
    preco: {
      referencia: "gpt-5.6-sol",
      inputUsdPorMilhao: 4,
      cachedInputUsdPorMilhao: 0.4,
      cacheWriteInputUsdPorMilhao: 5,
      outputUsdPorMilhao: 20,
    },
  },
  {
    corresponde: (modelo) => modelo.startsWith("gpt-5.4-mini"),
    preco: {
      referencia: "gpt-5.4-mini",
      inputUsdPorMilhao: 0.75,
      cachedInputUsdPorMilhao: 0.075,
      cacheWriteInputUsdPorMilhao: 0.75,
      outputUsdPorMilhao: 4.5,
    },
  },
  {
    corresponde: (modelo) => modelo === "gpt-5.4" || modelo.startsWith("gpt-5.4-20"),
    preco: {
      referencia: "gpt-5.4",
      inputUsdPorMilhao: 2.5,
      cachedInputUsdPorMilhao: 0.25,
      cacheWriteInputUsdPorMilhao: 2.5,
      outputUsdPorMilhao: 15,
    },
  },
  {
    corresponde: (modelo) => modelo.startsWith("gpt-5.5"),
    preco: {
      referencia: "gpt-5.5",
      inputUsdPorMilhao: 5,
      cachedInputUsdPorMilhao: 0.5,
      cacheWriteInputUsdPorMilhao: 5,
      outputUsdPorMilhao: 30,
    },
  },
  {
    corresponde: (modelo) => modelo.startsWith("gpt-4.1-mini"),
    preco: {
      referencia: "gpt-4.1-mini",
      inputUsdPorMilhao: 0.4,
      cachedInputUsdPorMilhao: 0.1,
      cacheWriteInputUsdPorMilhao: 0.4,
      outputUsdPorMilhao: 1.6,
    },
  },
  {
    corresponde: (modelo) => modelo.startsWith("gpt-4o-mini"),
    preco: {
      referencia: "gpt-4o-mini",
      inputUsdPorMilhao: 0.15,
      cachedInputUsdPorMilhao: 0.075,
      cacheWriteInputUsdPorMilhao: 0.15,
      outputUsdPorMilhao: 0.6,
    },
  },
];

const PRECO_FALLBACK: PrecoModeloIa = {
  referencia: "fallback-1x",
  inputUsdPorMilhao: 1,
  cachedInputUsdPorMilhao: 1,
  cacheWriteInputUsdPorMilhao: 1,
  outputUsdPorMilhao: 1,
};

export class SaldoTokensIaEsgotadoError extends Error {
  constructor() {
    super("Saldo de tokens de IA esgotado.");
    this.name = "SaldoTokensIaEsgotadoError";
  }
}

function numeroOuNull(valor: unknown) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function numeroNaoNegativo(valor: unknown) {
  return Math.max(numeroOuNull(valor) ?? 0, 0);
}

function normalizarSaldoTokensIa(data: Omit<SaldoTokensIa, "limite" | "restantes"> | SaldoTokensIa) {
  return {
    ...data,
    limite: data.limite_mensal,
    restantes: data.tokens_restantes,
  } as SaldoTokensIa;
}

export function extrairUsoTokensIa(usage: any): UsoTokensIa {
  const inputTokens = numeroOuNull(
    usage?.input_tokens ?? usage?.prompt_tokens
  );
  const outputTokens = numeroOuNull(
    usage?.output_tokens ?? usage?.completion_tokens
  );
  const inputDetails = usage?.input_tokens_details ?? usage?.prompt_tokens_details ?? {};
  const cachedInputTokens = numeroNaoNegativo(
    inputDetails?.cached_tokens ?? usage?.input_cached_tokens ?? usage?.cached_tokens
  );
  const cacheWriteInputTokens = numeroNaoNegativo(
    inputDetails?.cache_write_tokens ??
      usage?.input_cache_write_tokens ??
      usage?.cache_write_tokens
  );
  const totalTokens =
    numeroOuNull(usage?.total_tokens) ??
    (inputTokens ?? 0) + (outputTokens ?? 0);

  return {
    inputTokens,
    outputTokens,
    totalTokens: Math.max(totalTokens, 0),
    cachedInputTokens,
    cacheWriteInputTokens,
  };
}

function buscarPrecoModeloIa(modelo: string) {
  const normalizado = String(modelo || "").trim().toLowerCase();
  const encontrado = PRECOS_MODELOS_IA.find((item) => item.corresponde(normalizado));

  return {
    preco: encontrado?.preco ?? PRECO_FALLBACK,
    precificacaoFallback: !encontrado,
  };
}

export function calcularCobrancaTokensIa(modelo: string, uso: UsoTokensIa): CobrancaTokensIa {
  const { preco, precificacaoFallback } = buscarPrecoModeloIa(modelo);
  const inputTotal = numeroNaoNegativo(uso.inputTokens);
  const outputTokens = numeroNaoNegativo(uso.outputTokens);
  const cachedInputTokens = Math.min(numeroNaoNegativo(uso.cachedInputTokens), inputTotal);
  const cacheWriteInputTokens = Math.min(
    numeroNaoNegativo(uso.cacheWriteInputTokens),
    Math.max(inputTotal - cachedInputTokens, 0)
  );
  const inputTokensNaoCacheados = Math.max(
    inputTotal - cachedInputTokens - cacheWriteInputTokens,
    0
  );

  let custoMicrodolares =
    inputTokensNaoCacheados * preco.inputUsdPorMilhao +
    cachedInputTokens * preco.cachedInputUsdPorMilhao +
    cacheWriteInputTokens * preco.cacheWriteInputUsdPorMilhao +
    outputTokens * preco.outputUsdPorMilhao;

  // Compatibilidade com integrações antigas que eventualmente retornem apenas
  // total_tokens. Nesses casos preservamos a cobrança 1:1, evitando uso gratuito.
  if (inputTotal === 0 && outputTokens === 0 && uso.totalTokens > 0) {
    custoMicrodolares = uso.totalTokens;
  }

  const tokensEquivalentes =
    uso.totalTokens > 0 ? Math.max(Math.ceil(custoMicrodolares), 1) : 0;

  return {
    tokensEquivalentes,
    custoEstimadoUsd: custoMicrodolares / 1_000_000,
    preco,
    precificacaoFallback,
    inputTokensNaoCacheados,
    cachedInputTokens,
    cacheWriteInputTokens,
    outputTokens,
  };
}

export async function buscarSaldoTokensIa(empresaId: string) {
  const { data, error } = await supabaseAdmin.rpc(
    "sincronizar_empresa_tokens_ia",
    {
      p_empresa_id: empresaId,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  return normalizarSaldoTokensIa(
    data as Omit<SaldoTokensIa, "limite" | "restantes">
  );
}

export async function verificarSaldoTokensIa(empresaId: string) {
  const saldo = await buscarSaldoTokensIa(empresaId);

  if (
    saldo.limite_mensal !== null &&
    Number(saldo.tokens_restantes ?? 0) <= 0
  ) {
    throw new SaldoTokensIaEsgotadoError();
  }

  return saldo;
}

function modeloEfetivo(params: { origem: string; modelo: string }) {
  if (params.origem !== "assistente_fluxos") return params.modelo;

  // A rota historica ainda informa o nome antigo ao registrar o consumo, mas a
  // chamada real e substituida pelo pipeline do Prompt Mestre antes de chegar a
  // OpenAI. Grave o modelo efetivamente utilizado para manter o extrato correto.
  return process.env.OPENAI_ASSISTENTE_FLUXOS_MODEL || "gpt-5.5";
}

export async function registrarUsoTokensIa(params: {
  empresaId: string;
  origem: string;
  modelo: string;
  uso?: UsoTokensIa;
  tokensTotal?: number;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  usuarioId?: string | null;
  metadata?: Record<string, any>;
}) {
  const modelo = modeloEfetivo(params);
  const uso: UsoTokensIa = params.uso ?? {
    totalTokens: Math.max(Number(params.tokensTotal || 0), 0),
    inputTokens:
      params.tokensInput === undefined ? null : Number(params.tokensInput),
    outputTokens:
      params.tokensOutput === undefined ? null : Number(params.tokensOutput),
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
  };
  const cobranca = calcularCobrancaTokensIa(modelo, uso);
  const { data, error } = await supabaseAdmin.rpc("registrar_uso_tokens_ia", {
    p_empresa_id: params.empresaId,
    p_origem: params.origem,
    p_modelo: modelo,
    // tokens_total permanece físico para auditoria; a RPC debita o saldo pelo
    // valor econômico informado em tokens_equivalentes.
    p_tokens_total: uso.totalTokens,
    p_tokens_input: uso.inputTokens,
    p_tokens_output: uso.outputTokens,
    p_usuario_id: params.usuarioId ?? null,
    p_metadata_json: {
      ...(params.metadata ?? {}),
      modelo_efetivo: modelo,
      tokens_equivalentes: cobranca.tokensEquivalentes,
      custo_estimado_usd: cobranca.custoEstimadoUsd,
      precificacao_referencia: cobranca.preco.referencia,
      precificacao_fallback: cobranca.precificacaoFallback,
      input_tokens_nao_cacheados: cobranca.inputTokensNaoCacheados,
      input_cached_tokens: cobranca.cachedInputTokens,
      input_cache_write_tokens: cobranca.cacheWriteInputTokens,
      preco_input_usd_milhao: cobranca.preco.inputUsdPorMilhao,
      preco_cached_input_usd_milhao: cobranca.preco.cachedInputUsdPorMilhao,
      preco_cache_write_input_usd_milhao:
        cobranca.preco.cacheWriteInputUsdPorMilhao,
      preco_output_usd_milhao: cobranca.preco.outputUsdPorMilhao,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return normalizarSaldoTokensIa(
    data as Omit<SaldoTokensIa, "limite" | "restantes">
  );
}
