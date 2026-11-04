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
