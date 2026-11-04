/**
 * Detecta correção de veículo/versão após cotação sem tratá-la como
 * aceite comercial. A presença de uma proposta anterior deve ser
 * validada pelo runtime antes de reabrir a ferramenta.
 */
export function clienteCorrigiuVersaoCotacao(mensagem: string): boolean {
  const texto = String(mensagem || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

  return /\b(?:nao e|nao foi|nao corresponde|nao esta correto|esta errado|ficou errado|veio errado)\b.{0,55}\b(?:modelo|versao|motor|motorizacao|cambio|veiculo|carro)\b/.test(texto) ||
    /\b(?:modelo|versao|motor|motorizacao|cambio|veiculo|carro)\b.{0,35}\b(?:errado|errada|incorreto|incorreta|diferente|correto e|correta e|e na verdade|na verdade e)\b/.test(texto) ||
    /\b(?:corrigir|corrija|correcao|refazer|refaca|recalcular|ajustar)\b.{0,50}\b(?:cotacao|versao|modelo|motor|motorizacao|veiculo)\b/.test(texto) ||
    /\b(?:na verdade|nao|o correto e|a correta e)\b.{0,25}\b(?:e|eh|tem|possui)\s+\d[.,]\d\b/.test(texto) ||
    /\b(?:motor|motorizacao|versao|modelo|cambio)\s+(?:correto\s+|correta\s+)?(?:e|eh)\s+\d[.,]\d\b/.test(texto);
}

/**
 * A motorização informada APÓS uma correção prevalece sobre a utilizada
 * na proposta rejeitada. Nunca deduzir motorização a partir do valor FIPE.
 */
export function motorizacaoCorrigidaCotacao(mensagens: string[]): string | null {
  const ultimaCorrecao = mensagens.findLastIndex((item) =>
    clienteCorrigiuVersaoCotacao(item)
  );
  if (ultimaCorrecao < 0) return null;
  const mensagensDaCorrecao = mensagens.slice(ultimaCorrecao);
  const motores = mensagensDaCorrecao.flatMap((texto) =>
    [...texto.matchAll(/\b([1-9][.,][0-9])\b/g)].map((m) =>
      m[1].replace(",", ".")
    )
  );
  return motores.at(-1) || null;
}

export function aplicarMotorizacaoCorrigida(modelo: string, motor: string | null): string {
  if (!motor) return modelo;
  const atual = modelo.match(/\b[1-9][.,][0-9]\b/);
  if (atual) return modelo.replace(atual[0], motor);
  return (modelo.trim() + " " + motor).trim();
}

/** "Não é esse modelo" isolado pede informação, não nova cotação especulativa. */
export function versaoCorrigidaFoiInformada(mensagens: string[]): boolean {
  const ultimaCorrecao = mensagens.findLastIndex((item) =>
    clienteCorrigiuVersaoCotacao(item)
  );
  if (ultimaCorrecao < 0) return true;
  const novas = mensagens.slice(ultimaCorrecao).map((item) =>
    String(item || "").normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").toLowerCase()
  );
  return novas.some((texto) =>
    /\b[1-9][.,][0-9]\b/.test(texto) ||
    /\b(?:automatico|automatica|manual|mecanico|mecanica|cvt|tiptronic|dsg|ltz|lxs|lx|ex|exl|xlt|xls|xl|limited|comfortline|highline|trendline|sportline|r.line)\b/.test(texto) ||
    /\b(?:versao|modelo)\s+(?:certo|correto|certa|correta|e|eh)\s+\S+/.test(texto)
  );
}
