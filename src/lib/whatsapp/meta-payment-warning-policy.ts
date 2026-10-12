export type MetaPaymentWarningClearInput = {
  ativo: boolean;
  ultimaFalhaEm?: string | null;
  mensagemCriadaEm?: string | null;
};

function timestampSeguro(valor?: string | null) {
  if (!valor) return null;

  const timestamp = new Date(valor).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function deveLimparAvisoPagamentoMeta(
  input: MetaPaymentWarningClearInput
) {
  if (!input.ativo) return false;

  const ultimaFalhaEm = timestampSeguro(input.ultimaFalhaEm);
  const mensagemCriadaEm = timestampSeguro(input.mensagemCriadaEm);

  if (ultimaFalhaEm === null || mensagemCriadaEm === null) {
    return false;
  }

  return mensagemCriadaEm > ultimaFalhaEm;
}
