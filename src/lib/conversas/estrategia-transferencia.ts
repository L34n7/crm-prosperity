export type EstrategiaTransferenciaAtendente =
  | "fila_setor"
  | "atendente_especifico"
  | "rodizio_aleatorio"
  | "menos_conversas";

export type CandidatoTransferenciaAtendente = {
  id: string;
  nome?: string | null;
  cargaAtual?: number;
};

const ESTRATEGIAS_VALIDAS = new Set<EstrategiaTransferenciaAtendente>([
  "fila_setor",
  "atendente_especifico",
  "rodizio_aleatorio",
  "menos_conversas",
]);

export function normalizarEstrategiaTransferenciaAtendente(
  valor: unknown,
  atendenteId?: unknown
): EstrategiaTransferenciaAtendente {
  const estrategia = String(valor || "").trim() as EstrategiaTransferenciaAtendente;

  if (ESTRATEGIAS_VALIDAS.has(estrategia)) {
    return estrategia;
  }

  return String(atendenteId || "").trim()
    ? "atendente_especifico"
    : "fila_setor";
}

function indiceAleatorio(tamanho: number, random: () => number) {
  if (tamanho <= 1) return 0;
  const valor = Number(random());
  const normalizado = Number.isFinite(valor)
    ? Math.min(0.999999999, Math.max(0, valor))
    : 0;
  return Math.floor(normalizado * tamanho);
}

export function selecionarAtendenteTransferencia(params: {
  estrategia: EstrategiaTransferenciaAtendente;
  candidatos: CandidatoTransferenciaAtendente[];
  atendenteId?: string | null;
  random?: () => number;
}): CandidatoTransferenciaAtendente | null {
  const candidatos = params.candidatos.filter((item) => Boolean(item?.id));

  if (params.estrategia === "fila_setor" || candidatos.length === 0) {
    return null;
  }

  if (params.estrategia === "atendente_especifico") {
    const atendenteId = String(params.atendenteId || "").trim();
    if (!atendenteId) return null;
    return candidatos.find((item) => item.id === atendenteId) || null;
  }

  const random = params.random || Math.random;

  if (params.estrategia === "rodizio_aleatorio") {
    return candidatos[indiceAleatorio(candidatos.length, random)] || null;
  }

  const menorCarga = Math.min(
    ...candidatos.map((item) => Math.max(0, Number(item.cargaAtual || 0)))
  );
  const empatados = candidatos.filter(
    (item) => Math.max(0, Number(item.cargaAtual || 0)) === menorCarga
  );

  return empatados[indiceAleatorio(empatados.length, random)] || null;
}
