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

  return data as SaldoTokensIa;
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

export async function registrarUsoTokensIa(params: {
  empresaId: string;
  origem: string;
  modelo: string;
  uso: UsoTokensIa;
  usuarioId?: string | null;
  metadata?: Record<string, any>;
}) {
  const { data, error } = await supabaseAdmin.rpc("registrar_uso_tokens_ia", {
    p_empresa_id: params.empresaId,
    p_origem: params.origem,
    p_modelo: params.modelo,
    p_tokens_total: params.uso.totalTokens,
    p_tokens_input: params.uso.inputTokens,
    p_tokens_output: params.uso.outputTokens,
    p_usuario_id: params.usuarioId ?? null,
    p_metadata_json: params.metadata ?? {},
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as SaldoTokensIa;
}
