export type PlanoLimites = {
  slugs: string[];
  limiteUsuarios: number | null;
  limiteTokensIa: number | null;
};

export const PLANOS_LIMITES: Record<"basico" | "essencial", PlanoLimites> = {
  basico: {
    slugs: ["basic", "basico"],
    limiteUsuarios: 2,
    limiteTokensIa: 1_000_000,
  },
  essencial: {
    slugs: ["essencial"],
    limiteUsuarios: 6,
    limiteTokensIa: 5_000_000,
  },
};

export function normalizarTextoPlano(valor: string | null | undefined) {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function obterLimitesPlanoPorIdentificador(
  identificador: string | null | undefined
) {
  const valor = normalizarTextoPlano(identificador);

  return (
    Object.values(PLANOS_LIMITES).find((plano) =>
      plano.slugs.includes(valor)
    ) ?? null
  );
}
