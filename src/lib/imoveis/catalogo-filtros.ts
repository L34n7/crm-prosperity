export type OpcaoFiltroCatalogo = {
  valor: string;
  total: number;
};

export type FacetaCatalogoRow = {
  origem_tipo: string | null;
  tipo: string | null;
  finalidade: string | null;
  status: string | null;
  cidade: string | null;
  estado: string | null;
};

export type OpcoesFiltrosCatalogo = {
  origens: OpcaoFiltroCatalogo[];
  tipos: OpcaoFiltroCatalogo[];
  finalidades: OpcaoFiltroCatalogo[];
  status: OpcaoFiltroCatalogo[];
  cidades: OpcaoFiltroCatalogo[];
  estados: OpcaoFiltroCatalogo[];
};

export type CampoOrdenacaoCatalogo = {
  campo:
    | "valor"
    | "area_m2"
    | "titulo_ordenacao"
    | "created_at"
    | "catalogo_id";
  ascending: boolean;
  nullsFirst?: boolean;
};

export function obterOrdenacaoCatalogo(valor: string) {
  const desempate: CampoOrdenacaoCatalogo = {
    campo: "catalogo_id",
    ascending: true,
  };

  const ordenacoes: Record<string, CampoOrdenacaoCatalogo[]> = {
    valor_asc: [
      { campo: "valor", ascending: true, nullsFirst: false },
      desempate,
    ],
    valor_desc: [
      { campo: "valor", ascending: false, nullsFirst: false },
      desempate,
    ],
    area_desc: [
      { campo: "area_m2", ascending: false, nullsFirst: false },
      desempate,
    ],
    titulo_asc: [
      { campo: "titulo_ordenacao", ascending: true },
      desempate,
    ],
    recentes: [
      { campo: "created_at", ascending: false, nullsFirst: false },
      { campo: "catalogo_id", ascending: false },
    ],
  };

  return ordenacoes[valor] ?? ordenacoes.recentes;
}

export function sanitizarTextoFiltro(valor: string | null, limite = 80) {
  return String(valor ?? "")
    .replace(/[%_(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limite);
}

export function normalizarIntervalo(
  minimo: number | null,
  maximo: number | null,
) {
  if (minimo !== null && maximo !== null && minimo > maximo) {
    return { minimo: maximo, maximo: minimo };
  }
  return { minimo, maximo };
}

function montarOpcoes(
  linhas: FacetaCatalogoRow[],
  campo: keyof FacetaCatalogoRow,
) {
  const totais = new Map<string, number>();

  for (const linha of linhas) {
    const valor = String(linha[campo] ?? "").trim();
    if (!valor) continue;
    totais.set(valor, (totais.get(valor) ?? 0) + 1);
  }

  return Array.from(totais, ([valor, total]) => ({ valor, total })).sort(
    (a, b) => a.valor.localeCompare(b.valor, "pt-BR", { sensitivity: "base" }),
  );
}

export function montarOpcoesFiltrosCatalogo(linhas: FacetaCatalogoRow[]) {
  return {
    origens: montarOpcoes(linhas, "origem_tipo"),
    tipos: montarOpcoes(linhas, "tipo"),
    finalidades: montarOpcoes(linhas, "finalidade"),
    status: montarOpcoes(linhas, "status"),
    cidades: montarOpcoes(linhas, "cidade"),
    estados: montarOpcoes(linhas, "estado"),
  } satisfies OpcoesFiltrosCatalogo;
}
