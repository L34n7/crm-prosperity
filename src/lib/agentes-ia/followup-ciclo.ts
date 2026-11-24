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

/** Respeita pedidos explícitos de pausa, recusa ou não contato.
 * Uma objeção como "vou pensar" não configura pedido de parar. */
export function contatoPediuPausaExplicita(valor: unknown): boolean {
  const texto = String(valor || "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!texto) return false;
  return /\b(?:nao quero|nao tenho interesse|sem interesse|pare|para de|nao me chame|nao me mande)\b/.test(texto) ||
    /\b(?:agora|por enquanto)\s+nao\b/.test(texto) ||
    /\b(?:te retorno|te chamo|falo com voce)\s+(?:depois|mais tarde)\b/.test(texto) ||
    /\b(?:depois|mais tarde)\s+(?:te retorno|te chamo|falo)\b/.test(texto) ||
    /\b(?:vou|irei)\s+(?:te\s+)?(?:chamar|retornar|voltar)\s+(?:depois|mais tarde)\b/.test(texto);
}

/**
 * Preserva a distância entre follow-ups mesmo se uma tentativa foi recuperada
 * depois do horário original; evita vários envios seguidos por atraso no job.
 * Os intervalos configurados são cumulativos desde a última entrada do cliente.
 */
export function calcularProximaExecucaoFollowupMs(params: {
  referenciaInatividadeMs: number;
  intervaloMinutos: number;
  intervaloAnteriorMinutos: number;
  ultimaTentativaEnviadaMs?: number | null;
}): number {
  const base = params.referenciaInatividadeMs + params.intervaloMinutos * 60_000;
  if (typeof params.ultimaTentativaEnviadaMs !== "number" ||
      !Number.isFinite(params.ultimaTentativaEnviadaMs)) {
    return base;
  }
  const entreTentativasMinutos = Math.max(
    1,
    params.intervaloMinutos - params.intervaloAnteriorMinutos,
  );
  return Math.max(
    base,
    params.ultimaTentativaEnviadaMs + entreTentativasMinutos * 60_000,
  );
}
