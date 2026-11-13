/** Ciclo de inatividade novo para cada mensagem recebida; limite de tentativas só dentro desse ciclo. */
export function podeIniciarCicloFollowup(p: {
  respostaEnviada: boolean;
  acaoCriticaExecutada: boolean;
  transferidoHumano?: boolean;
  ultimaMensagemContatoId?: string | null;
  numeroDestino?: string | null;
  mensagensSaida: string[];
}): boolean {
  return p.respostaEnviada && !p.acaoCriticaExecutada &&
    p.transferidoHumano !== true &&
    Boolean(String(p.ultimaMensagemContatoId || "").trim()) &&
    Boolean(String(p.numeroDestino || "").trim()) &&
    p.mensagensSaida.some((texto) => Boolean(String(texto || "").trim()));
}
/** Não exigir interrogação no fechamento de um pitch comercial. */
export function mensagemPermiteAcompanhamento(texto: unknown): boolean {
  return Boolean(String(texto || "").trim());
}
