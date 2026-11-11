/**
 * Delay de digitação automático. Os valores são parte do comportamento do
 * aplicativo, não são configuráveis por agente (apenas ativo/desativado).
 */
export type ConfigDelayDinamico = { ativo: boolean };

export const DELAY_DINAMICO_PADRAO: ConfigDelayDinamico = { ativo: false };
export const LIMITE_DELAY_TOTAL_POR_RESPOSTA_MS = 24000;
/** A primeira resposta permanece rápida; cada balão seguinte usa sua própria faixa por caracteres. */
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

/** Delay-base por caracteres, utilizado também na primeira mensagem (com teto próprio). */
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
 * Intervalos mais naturais ENTRE balões sequenciais. O tempo cresce por faixa
 * e tem variação pequena (estável em tentativas repetidas) conforme o conteúdo.
 * Textos muito longos não geram minutos de espera.
 */
function calcularDelayEntreBaloesMs(texto: string): number {
  const conteudo = String(texto || "").trim();
  if (!conteudo) return 0;
  const tamanho = Array.from(conteudo).length;
  let minimo: number;
  let maximo: number;
  let tempo: number;
  if (tamanho <= 60) {
    minimo = 3000; maximo = 3900;
    tempo = interpolar(tamanho, 1, 60, minimo, maximo);
  } else if (tamanho <= 150) {
    minimo = 4300; maximo = 5800;
    tempo = interpolar(tamanho, 61, 150, minimo, maximo);
  } else if (tamanho <= 300) {
    minimo = 6100; maximo = 8200;
    tempo = interpolar(tamanho, 151, 300, minimo, maximo);
  } else {
    minimo = 8500; maximo = 10500;
    tempo = interpolar(Math.min(tamanho, 800), 301, 800, minimo, maximo);
  }
  const variacao = variacaoNaturalMs(conteudo) * 2;
  return Math.round(Math.max(minimo, Math.min(maximo, tempo + variacao)));
}

/**
 * Primeiro balão: até 1,2s extra, para não penalizar o tempo de geração da IA.
 * Demais balões: pausas individuais proporcionais ao texto (3s a 10,5s).
 * Teto de 24s acumulados evita bloquear execuções muito longas, como cotações.
 */
export function calcularDelayEnvioBalaoMs(
  texto: string,
  configuracao: unknown,
  indiceBalao: number,
  atrasoAcumuladoMs: number,
): number {
  const config = normalizarDelayDinamico(configuracao);
  if (!config.ativo) return 0;
  const tempo = indiceBalao === 0
    ? Math.min(calcularDelayDinamicoMs(texto, config), LIMITE_DELAY_PRIMEIRO_BALAO_MS)
    : calcularDelayEntreBaloesMs(texto);
  const saldo = Math.max(0, LIMITE_DELAY_TOTAL_POR_RESPOSTA_MS - Math.max(0, atrasoAcumuladoMs));
  return Math.min(tempo, saldo);
}
