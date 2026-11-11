/**
 * Delay de digitação automático. Os valores são parte do comportamento do
 * aplicativo, não são configuráveis por agente (apenas ativo/desativado).
 */
export type ConfigDelayDinamico = { ativo: boolean };

export const DELAY_DINAMICO_PADRAO: ConfigDelayDinamico = { ativo: false };
export const LIMITE_DELAY_TOTAL_POR_RESPOSTA_MS = 9000;
/** Tempo adicional apenas entre balões; não prolonga a primeira resposta. */
export const ACRESCIMO_DELAY_ENTRE_BALOES_MS = 1500;
export const LIMITE_DELAY_PRIMEIRO_BALAO_MS = 1200;

export function normalizarDelayDinamico(valor: unknown): ConfigDelayDinamico {
  const config = valor && typeof valor === "object" && !Array.isArray(valor)
    ? valor as Record<string, unknown>
    : {};
  return { ativo: config.ativo === true };
}

function interpolar(valor: number, inicial: number, final: number, de: number, ate: number) {
  const proporcao = Math.min(1, Math.max(0, (valor - inicial) / Math.max(1, final - inicial)));
  return de + (ate - de) * proporcao;
}

/** Variação estável de -100 a +100 ms por conteúdo (sem gerar esperas aleatórias a cada retry). */
function variacaoNaturalMs(texto: string) {
  let hash = 2166136261;
  for (const char of texto) {
    hash = Math.imul(hash ^ (char.codePointAt(0) || 0), 16777619);
  }
  return (hash >>> 0) % 201 - 100;
}

/**
 * Retorna o delay de um balão, limitado a 2,6 s. O limite de 1,2 s para o
 * primeiro balão e 5 s por resposta é aplicado no ponto de envio.
 */
export function calcularDelayDinamicoMs(texto: string, valor: unknown): number {
  if (!normalizarDelayDinamico(valor).ativo) return 0;
  const conteudo = String(texto || "").trim();
  if (!conteudo) return 0;
  const tamanho = Array.from(conteudo).length;

  let minimo: number;
  let maximo: number;
  let tempo: number;
  if (tamanho <= 60) {
    minimo = 500; maximo = 800;
    tempo = interpolar(tamanho, 1, 60, minimo, maximo);
  } else if (tamanho <= 150) {
    minimo = 900; maximo = 1300;
    tempo = interpolar(tamanho, 61, 150, minimo, maximo);
  } else if (tamanho <= 300) {
    minimo = 1400; maximo = 2000;
    tempo = interpolar(tamanho, 151, 300, minimo, maximo);
  } else {
    minimo = 2100; maximo = 2600;
    tempo = interpolar(Math.min(tamanho, 750), 301, 750, minimo, maximo);
  }
  return Math.round(Math.min(maximo, Math.max(minimo, tempo + variacaoNaturalMs(conteudo))));
}

/**
 * Delay efetivo de cada envio: preserva o primeiro balão e acrescenta
 * aproximadamente 1,5s somente nos balões seguintes, respeitando o teto total.
 * Retorna zero quando a função estiver desativada.
 */
export function calcularDelayEnvioBalaoMs(
  texto: string,
  configuracao: unknown,
  indiceBalao: number,
  atrasoAcumuladoMs: number,
): number {
  const baseMs = calcularDelayDinamicoMs(texto, configuracao);
  if (baseMs <= 0) return 0;
  const acrescimoMs = indiceBalao > 0 ? ACRESCIMO_DELAY_ENTRE_BALOES_MS : 0;
  const limiteIndividualMs = indiceBalao === 0
    ? LIMITE_DELAY_PRIMEIRO_BALAO_MS
    : Number.POSITIVE_INFINITY;
  const saldoMs = Math.max(0, LIMITE_DELAY_TOTAL_POR_RESPOSTA_MS - Math.max(0, atrasoAcumuladoMs));
  return Math.min(baseMs + acrescimoMs, limiteIndividualMs, saldoMs);
}
