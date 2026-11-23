/**
 * Detecção determinística de pedidos explícitos de atendimento humano.
 * A execução deve considerar somente mensagens enviadas pelo contato.
 */
export type PedidoTransferenciaHumana = {
  destino: "direcao" | "atendimento";
  motivo: "pedido_direto" | "recusa_ia" | "pedido_reiterado";
  texto: string;
};

function normalizar(valor: unknown): string {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ALVO_HUMANO = /\b(?:atendente|atendimento humano|pessoa(?: da equipe| de verdade| real)?|ser humano|humano|alguem|equipe|suporte|consultor|vendedor|funcionario|responsavel|gerente|supervisor|gestor|chefe|proprietario|dono|diretor|diretoria|direcao|ceo|presidente|fundador|administrador)\b/;
const DIRECAO = /\b(?:ceo|diretor(?:a|ia)?|direcao|dono|proprietari[oa]|presidente|fundador)\b/;
const PEDIDO = /\b(?:quero|queria|gostaria|prefiro|preciso|posso|poderia|pode|podem|consegue|conseguem|solicito|favor|por favor|tem como|da pra|da para|como faco|me deixa|me coloca)\b/;
const ATO = /\b(?:falar|conversar|dialogar|atendimento|atender|atendido|atendida|contato|ligar|chamar)\b/;
const EXPRESSAO_TRANSFERIR = /\b(?:me transfere|me transfira|me transferir|me encaminha|me encaminhe|me passa|me passe|transferir para|transfira para|encaminhar para|encaminhe para|passar para|passe para)\b/;

/** Uma resposta de uma palavra como "CEO!" exige pedido prévio na conversa. */
export function reiteracaoCurtaDirecao(valor: unknown): boolean {
  return /^(?:o |a )?(?:ceo|diretor(?:a)?|diretoria|direcao|dono|proprietari[oa]|gerente|responsavel|presidente)$/.test(normalizar(valor));
}

export function identificarPedidoTransferenciaHumana(valor: unknown): PedidoTransferenciaHumana | null {
  const texto = normalizar(valor);
  if (!texto || texto.length > 900) return null;

  const recusaIa =
    /\b(?:nao|nunca)\s+(?:quero|gostaria|prefiro|vou|desejo)\b.{0,45}\b(?:falar|conversar|ser atendid[oa]|atendimento)\b.{0,22}\b(?:ia|robo|bot|inteligencia artificial|maquina|agente virtual|atendimento automatico)\b/.test(texto) ||
    /\b(?:chega de|sem mais)\b.{0,20}\b(?:robo|ia|bot)\b/.test(texto);
  if (recusaIa) {
    return { destino: "atendimento", motivo: "recusa_ia", texto: String(valor).trim() };
  }

  // Recusar atendimento humano não pode se transformar em pedido de transferência.
  if (
    /\b(?:nao|nunca|nem)\s+(?:quero|preciso|desejo|gostaria|pode|precisa)\b.{0,55}\b(?:transferir|encaminhar|atendente|humano|pessoa real|pessoa de verdade|ceo|diretor|gerente|dono|direcao)\b/.test(texto) ||
    /\b(?:nao|nunca|nem)\s+me\s+(?:transfira|transfere|encaminhe|encaminha|passe|passa)\b/.test(texto)
  ) return null;

  const pedidoComFala = new RegExp(
    "\\b(?:quero|queria|gostaria|prefiro|preciso|desejo|posso|poderia|pode|podem|consegue|solicito|favor|por favor|tem como|da pra|da para|como faco)\\b.{0,45}\\b(?:falar|conversar|dialogar|ser atendid[oa]|atendimento|ligar|chamar)\\b.{0,55}" + ALVO_HUMANO.source
  ).test(texto);
  const falarDireto = new RegExp(
    "^(?:falar|conversar|ligar|chamar)\\b.{0,55}" + ALVO_HUMANO.source
  ).test(texto);
  const pedidoSimples = /\b(?:quero|queria|gostaria|prefiro|preciso|desejo)\s+(?:de\s+)?(?:(?:um|uma|o|a)\s+)?(?:atendente|atendimento humano|humano|pessoa real|pessoa de verdade)\b/.test(texto);
  const pedidoParaAlguem = new RegExp(
    "\\b(?:transfere|transfira|transferir|encaminha|encaminhe|encaminhar|passa|passe|passar)\\s+(?:me\\s+)?(?:para|pra|pro|ao)\\b.{0,15}" + ALVO_HUMANO.source
  ).test(texto) && (
    PEDIDO.test(texto) || /\b(?:me|favor|por favor)\s+(?:transfere|transfira|encaminha|encaminhe|passa|passe)\b/.test(texto)
  );
  const direto = pedidoComFala || falarDireto || pedidoSimples || pedidoParaAlguem;
  const transferenciaSemDestino = /^(?:me\s+)?(?:transfere|transfira|encaminhe|encaminha)\s*(?:me|por favor|pfv)?$/.test(texto) ||
    /^(?:pode|poderia|favor|por favor|quero)\s+(?:me\s+)?(?:transferir|encaminhar|transfere|transfira)\s*(?:me)?$/.test(texto);
  // Aceitar pedidos curtos com saudações e fórmulas de cortesia (caso real: Igor).
  const pedidoDiretoCurto = /^(?:(?:oi|ola|bom dia|boa tarde|boa noite|pessoal)\s+){0,3}(?:atendente|atendimento humano|humano|pessoa real|pessoa de verdade|falar com atendente|falar com humano)(?:\s+(?:por favor|por gentileza|pfv|obrigad[oa]))?$/.test(texto);
  // Em frases compostas, a solicitação pode estar no final depois de outra pergunta.
  const pedidoCortesiaNoFinal =
    /\b(?:atendimento humano|atendente|pessoa real|pessoa de verdade|falar com atendente|falar com humano)\s+(?:por favor|por gentileza|pfv)(?:\s+obrigad[oa])?$/.test(texto) &&
    !/\b(?:o que significa|como funciona|qual (?:a |o )?(?:diferenca|significado)|quanto custa|voc[e]s? (?:tem|oferecem?)|existe|como configurar)\b.{0,95}\b(?:atendimento humano|atendente)\b/.test(texto);

  if (!direto && !transferenciaSemDestino && !pedidoDiretoCurto && !pedidoCortesiaNoFinal) return null;
  return {
    destino: DIRECAO.test(texto) ? "direcao" : "atendimento",
    motivo: "pedido_direto",
    texto: String(valor).trim(),
  };
}

export function reconhecerReiteracaoDirecao(
  mensagem: unknown,
  pedidosAnterioresDoContato: readonly string[]
): PedidoTransferenciaHumana | null {
  if (!reiteracaoCurtaDirecao(mensagem)) return null;
  const anterior = pedidosAnterioresDoContato
    .map(identificarPedidoTransferenciaHumana)
    .find((pedido) => pedido?.destino === "direcao");
  return anterior
    ? { destino: "direcao", motivo: "pedido_reiterado", texto: String(mensagem).trim() }
    : null;
}
