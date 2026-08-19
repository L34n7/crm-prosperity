export const IMPORTACAO_PRODUTOS_LIMITE_LINHAS = 2_000;
export const IMPORTACAO_PRODUTOS_LIMITE_BYTES = 5 * 1024 * 1024;

export const IMPORTACAO_PRODUTOS_CABECALHOS = [
  "codigo",
  "nome",
  "descricao",
  "tipo",
  "unidade",
  "sku",
  "codigo_barras",
  "categoria",
  "marca",
  "estoque_minimo",
  "custo_unitario",
  "preco_venda",
  "controla_lote",
  "controla_validade",
  "controla_serie",
  "saldo_inicial",
  "deposito",
  "localizacao",
  "lote",
  "fabricado_em",
  "validade",
  "numero_serie",
] as const;

export type TipoItemImportacao = "produto" | "material" | "insumo";
export type UnidadeItemImportacao = "un" | "kg" | "g" | "l" | "ml" | "m" | "cm" | "cx" | "pct";

export type LinhaImportacaoProduto = {
  linha: number;
  codigo: string | null;
  nome: string;
  descricao: string | null;
  tipo: TipoItemImportacao | null;
  unidade: UnidadeItemImportacao | null;
  sku: string | null;
  codigo_barras: string | null;
  categoria: string | null;
  marca: string | null;
  estoque_minimo: number | null;
  custo_unitario: number | null;
  preco_venda: number | null;
  controla_lote: boolean | null;
  controla_validade: boolean | null;
  controla_serie: boolean | null;
  saldo_inicial: number;
  deposito: string | null;
  localizacao: string | null;
  lote: string | null;
  fabricado_em: string | null;
  validade: string | null;
  numero_serie: string | null;
  erros: string[];
  alertas: string[];
};

const ALIASES: Record<(typeof IMPORTACAO_PRODUTOS_CABECALHOS)[number], string[]> = {
  codigo: ["codigo", "código", "codigo produto", "código produto", "cod", "code"],
  nome: ["nome", "produto", "nome produto", "descrição produto", "descricao produto", "name"],
  descricao: ["descricao", "descrição", "observacao", "observação", "detalhes"],
  tipo: ["tipo", "tipo item"],
  unidade: ["unidade", "un", "unidade medida", "unidade de medida"],
  sku: ["sku", "referencia", "referência", "ref"],
  codigo_barras: ["codigo barras", "código barras", "codigo de barras", "código de barras", "ean", "gtin"],
  categoria: ["categoria", "grupo"],
  marca: ["marca", "fabricante"],
  estoque_minimo: ["estoque minimo", "estoque mínimo", "minimo", "mínimo"],
  custo_unitario: ["custo unitario", "custo unitário", "custo", "valor custo"],
  preco_venda: ["preco venda", "preço venda", "preco de venda", "preço de venda", "preco", "preço"],
  controla_lote: ["controla lote", "lote controlado"],
  controla_validade: ["controla validade", "validade controlada"],
  controla_serie: ["controla serie", "controla série", "numero de serie controlado", "número de série controlado"],
  saldo_inicial: ["saldo inicial", "quantidade inicial", "estoque inicial", "qtd inicial"],
  deposito: ["deposito", "depósito", "deposito inicial", "depósito inicial", "almoxarifado"],
  localizacao: ["localizacao", "localização", "endereco estoque", "endereço estoque"],
  lote: ["lote", "codigo lote", "código lote"],
  fabricado_em: ["fabricado em", "fabricacao", "fabricação", "data fabricacao", "data fabricação"],
  validade: ["validade", "data validade"],
  numero_serie: ["numero serie", "número série", "numero de serie", "número de série", "serial"],
};

const TIPOS = new Set<TipoItemImportacao>(["produto", "material", "insumo"]);
const UNIDADES = new Set<UnidadeItemImportacao>(["un", "kg", "g", "l", "ml", "m", "cm", "cx", "pct"]);

export function normalizarCabecalhoImportacao(valor: unknown) {
  return String(valor ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function texto(valor: unknown) {
  const resultado = String(valor ?? "").trim();
  return resultado || null;
}

function valorDaColuna(
  cabecalhos: string[],
  linha: unknown[],
  campo: (typeof IMPORTACAO_PRODUTOS_CABECALHOS)[number],
) {
  const aliases = new Set(ALIASES[campo].map(normalizarCabecalhoImportacao));
  const indice = cabecalhos.findIndex((cabecalho) => aliases.has(cabecalho));
  return indice >= 0 ? linha[indice] : null;
}

function numeroImportacao(valor: unknown, campo: string, erros: string[]) {
  const entrada = texto(valor);
  if (entrada === null) return null;

  const semEspacos = entrada.replace(/\s/g, "").replace(/R\$/gi, "");
  let normalizado = semEspacos;
  if (semEspacos.includes(",")) {
    normalizado = semEspacos.replace(/\./g, "").replace(",", ".");
  }

  const resultado = Number(normalizado);
  if (!Number.isFinite(resultado) || resultado < 0) {
    erros.push(`${campo} deve ser um número maior ou igual a zero.`);
    return null;
  }
  return resultado;
}

function booleanoImportacao(valor: unknown, campo: string, erros: string[]) {
  const entrada = normalizarCabecalhoImportacao(valor);
  if (!entrada) return null;
  if (["sim", "s", "1", "true", "verdadeiro", "x"].includes(entrada)) return true;
  if (["nao", "n", "0", "false", "falso"].includes(entrada)) return false;
  erros.push(`${campo} deve ser preenchido com Sim ou Não.`);
  return null;
}

function dataImportacao(valor: unknown, campo: string, erros: string[]) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor.toISOString().slice(0, 10);
  }
  if (typeof valor === "number" && Number.isFinite(valor) && valor > 0) {
    const dataExcel = new Date(Date.UTC(1899, 11, 30) + Math.round(valor) * 86_400_000);
    return dataExcel.toISOString().slice(0, 10);
  }
  const entrada = texto(valor);
  if (!entrada) return null;

  const iso = entrada.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const br = entrada.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const resultado = iso
    ? `${iso[1]}-${iso[2]}-${iso[3]}`
    : br
      ? `${br[3]}-${br[2]}-${br[1]}`
      : null;

  const data = resultado ? new Date(`${resultado}T12:00:00Z`) : null;
  if (
    !resultado
    || !data
    || Number.isNaN(data.getTime())
    || data.toISOString().slice(0, 10) !== resultado
  ) {
    erros.push(`${campo} deve usar o formato DD/MM/AAAA.`);
    return null;
  }
  return resultado;
}

export function mapearLinhasImportacaoProdutos(
  cabecalhosOriginais: unknown[],
  linhas: unknown[][],
) {
  const cabecalhos = cabecalhosOriginais.map(normalizarCabecalhoImportacao);
  const possuiNome = ALIASES.nome.some((alias) => cabecalhos.includes(normalizarCabecalhoImportacao(alias)));
  if (!possuiNome) {
    throw new Error('A planilha precisa ter a coluna "nome". Baixe o modelo para conferir o formato.');
  }

  return linhas.map((valores, indice): LinhaImportacaoProduto => {
    const erros: string[] = [];
    const alertas: string[] = [];
    const nome = texto(valorDaColuna(cabecalhos, valores, "nome")) ?? "";
    const tipoTexto = normalizarCabecalhoImportacao(valorDaColuna(cabecalhos, valores, "tipo"));
    const unidadeTexto = normalizarCabecalhoImportacao(valorDaColuna(cabecalhos, valores, "unidade"));
    const tipo = tipoTexto ? tipoTexto as TipoItemImportacao : null;
    const unidade = unidadeTexto ? unidadeTexto as UnidadeItemImportacao : null;
    const controlaLote = booleanoImportacao(valorDaColuna(cabecalhos, valores, "controla_lote"), "Controla lote", erros);
    const controlaValidade = booleanoImportacao(valorDaColuna(cabecalhos, valores, "controla_validade"), "Controla validade", erros);
    const controlaSerie = booleanoImportacao(valorDaColuna(cabecalhos, valores, "controla_serie"), "Controla série", erros);
    const saldoInicial = numeroImportacao(valorDaColuna(cabecalhos, valores, "saldo_inicial"), "Saldo inicial", erros) ?? 0;
    const lote = texto(valorDaColuna(cabecalhos, valores, "lote"));
    const numeroSerie = texto(valorDaColuna(cabecalhos, valores, "numero_serie"));

    if (!nome) erros.push("Nome é obrigatório.");
    if (tipo && !TIPOS.has(tipo)) erros.push("Tipo deve ser produto, material ou insumo.");
    if (unidade && !UNIDADES.has(unidade)) erros.push("Unidade inválida. Use un, cx, pct, kg, g, l, ml, m ou cm.");
    return {
      linha: indice + 2,
      codigo: texto(valorDaColuna(cabecalhos, valores, "codigo")),
      nome,
      descricao: texto(valorDaColuna(cabecalhos, valores, "descricao")),
      tipo,
      unidade,
      sku: texto(valorDaColuna(cabecalhos, valores, "sku")),
      codigo_barras: texto(valorDaColuna(cabecalhos, valores, "codigo_barras")),
      categoria: texto(valorDaColuna(cabecalhos, valores, "categoria")),
      marca: texto(valorDaColuna(cabecalhos, valores, "marca")),
      estoque_minimo: numeroImportacao(valorDaColuna(cabecalhos, valores, "estoque_minimo"), "Estoque mínimo", erros),
      custo_unitario: numeroImportacao(valorDaColuna(cabecalhos, valores, "custo_unitario"), "Custo unitário", erros),
      preco_venda: numeroImportacao(valorDaColuna(cabecalhos, valores, "preco_venda"), "Preço de venda", erros),
      controla_lote: controlaLote,
      controla_validade: controlaValidade,
      controla_serie: controlaSerie,
      saldo_inicial: saldoInicial,
      deposito: texto(valorDaColuna(cabecalhos, valores, "deposito")),
      localizacao: texto(valorDaColuna(cabecalhos, valores, "localizacao")),
      lote,
      fabricado_em: dataImportacao(valorDaColuna(cabecalhos, valores, "fabricado_em"), "Data de fabricação", erros),
      validade: dataImportacao(valorDaColuna(cabecalhos, valores, "validade"), "Validade", erros),
      numero_serie: numeroSerie,
      erros,
      alertas,
    };
  });
}

export function chaveComparacaoImportacao(valor: string | null | undefined) {
  return valor?.trim().toLocaleLowerCase("pt-BR") || null;
}
