export type UnidadeDelayDinamico = "palavras" | "caracteres";

export type ConfigDelayDinamico = {
  ativo: boolean;
  unidade: UnidadeDelayDinamico;
  quantidade: number;
  segundos_por_bloco: number;
  minimo_segundos: number;
  maximo_segundos: number;
};

/** Evita exceder o tempo de execução em respostas com muitos balões (ex.: cotações). */
export const LIMITE_DELAY_TOTAL_POR_RESPOSTA_MS = 24000;

export const DELAY_DINAMICO_PADRAO: ConfigDelayDinamico = {
  ativo: false,
  unidade: "palavras",
  quantidade: 12,
  segundos_por_bloco: 1,
  minimo_segundos: 0.7,
  maximo_segundos: 6,
};

function limitarNumero(valor: unknown, padrao: number, minimo: number, maximo: number) {
  if (valor === null || valor === undefined || valor === "") return padrao;
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return padrao;
  return Math.min(maximo, Math.max(minimo, numero));
}

export function normalizarDelayDinamico(valor: unknown): ConfigDelayDinamico {
  const entrada = valor && typeof valor === "object" && !Array.isArray(valor)
    ? valor as Record<string, unknown>
    : {};
  const unidade: UnidadeDelayDinamico = entrada.unidade === "caracteres" ? "caracteres" : "palavras";
  const minimo = limitarNumero(entrada.minimo_segundos, DELAY_DINAMICO_PADRAO.minimo_segundos, 0, 5);
  const maximo = Math.max(minimo, limitarNumero(entrada.maximo_segundos, DELAY_DINAMICO_PADRAO.maximo_segundos, 0.5, 8));
  return {
    ativo: entrada.ativo === true,
    unidade,
    quantidade: Math.round(limitarNumero(entrada.quantidade, unidade === "caracteres" ? 60 : 12, 1, 500)),
    segundos_por_bloco: limitarNumero(entrada.segundos_por_bloco, 1, 0.1, 5),
    minimo_segundos: minimo,
    maximo_segundos: maximo,
  };
}

/** Atraso individual do balão; não altera o debounce de entrada. */
export function calcularDelayDinamicoMs(texto: string, valor: unknown): number {
  const config = normalizarDelayDinamico(valor);
  if (!config.ativo) return 0;
  const limpo = String(texto || "").trim();
  if (!limpo) return 0;
  const total = config.unidade === "palavras"
    ? (limpo.match(/\S+/gu)?.length ?? 0)
    : Array.from(limpo).length;
  if (!total) return 0;
  const segundos = Math.max(
    config.minimo_segundos,
    Math.min(config.maximo_segundos, total / config.quantidade * config.segundos_por_bloco),
  );
  return Math.round(segundos * 1000);
}
