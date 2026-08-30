import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

export type UsoTokensIa = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number;
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
  const totalTokens =
    numeroOuNull(usage?.total_tokens) ??
    (inputTokens ?? 0) + (outputTokens ?? 0);

  return {
    inputTokens,
    outputTokens,
    totalTokens: Math.max(totalTokens, 0),
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
  };
  const { data, error } = await supabaseAdmin.rpc("registrar_uso_tokens_ia", {
    p_empresa_id: params.empresaId,
    p_origem: params.origem,
    p_modelo: modelo,
    p_tokens_total: uso.totalTokens,
    p_tokens_input: uso.inputTokens,
    p_tokens_output: uso.outputTokens,
    p_usuario_id: params.usuarioId ?? null,
    p_metadata_json: {
      ...(params.metadata ?? {}),
      modelo_efetivo: modelo,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return normalizarSaldoTokensIa(
    data as Omit<SaldoTokensIa, "limite" | "restantes">
  );
}
