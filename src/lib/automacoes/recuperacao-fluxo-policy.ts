export const JANELA_RECUPERACAO_FLUXO_MS = (24 * 60 - 1) * 60 * 1000;
const TOLERANCIA_DATA_FUTURA_MS = 5 * 60 * 1000;

export type ElegibilidadeRecuperacaoFluxoInput = {
  conversaStatus?: string | null;
  aguardandoAtendente?: boolean | null;
  mensagemRecebidaEm?: string | null;
  automacaoProcessada: boolean;
  possuiExecucaoAtiva: boolean;
  agora?: Date;
};

export function avaliarElegibilidadeRecuperacaoFluxo(
  input: ElegibilidadeRecuperacaoFluxoInput
) {
  if (input.conversaStatus !== "fila") {
    return {
      elegivel: false as const,
      motivo: "conversa_nao_esta_na_fila",
    };
  }

  if (input.aguardandoAtendente === true) {
    return {
      elegivel: false as const,
      motivo: "conversa_aguardando_atendente",
    };
  }

  if (input.automacaoProcessada) {
    return {
      elegivel: false as const,
      motivo: "mensagem_ja_processada",
    };
  }

  if (input.possuiExecucaoAtiva) {
    return {
      elegivel: false as const,
      motivo: "conversa_possui_execucao_ativa",
    };
  }

  const recebidaEmMs = input.mensagemRecebidaEm
    ? new Date(input.mensagemRecebidaEm).getTime()
    : Number.NaN;

  if (!Number.isFinite(recebidaEmMs)) {
    return {
      elegivel: false as const,
      motivo: "data_mensagem_invalida",
    };
  }

  const agoraMs = (input.agora || new Date()).getTime();
  const idadeMs = agoraMs - recebidaEmMs;

  if (
    idadeMs > JANELA_RECUPERACAO_FLUXO_MS ||
    idadeMs < -TOLERANCIA_DATA_FUTURA_MS
  ) {
    return {
      elegivel: false as const,
      motivo: "fora_da_janela_24h",
    };
  }

  return {
    elegivel: true as const,
    motivo: null,
  };
}
