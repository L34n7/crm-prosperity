import type { Edge, Node } from "@xyflow/react";
import type { TemplateVariableOption } from "@/components/TemplateVariableCombobox";
import { normalizarConfiguracaoConsultarEstoque } from "@/components/automacoes/ConsultarEstoqueConfig";

export const TIPO_NO_CONSULTAR_ESTOQUE = "consultar_estoque";

export const SAIDAS_CONSULTA_ESTOQUE = [
  { valor: "disponivel", titulo: "Disponível" },
  { valor: "sem_estoque", titulo: "Sem estoque" },
  { valor: "nao_encontrado", titulo: "Não encontrado" },
  { valor: "multiplos_resultados", titulo: "Vários encontrados" },
] as const;

export const VARIAVEIS_SAIDA_ESTOQUE: TemplateVariableOption[] = [
  ["estoque_resultado", "Resultado da consulta de estoque."],
  ["estoque_produto_id", "ID do produto localizado."],
  ["estoque_produto_codigo", "Código do produto localizado."],
  ["estoque_produto_sku", "SKU do produto localizado."],
  ["estoque_produto_codigo_barras", "Código de barras do produto localizado."],
  ["estoque_produto_nome", "Nome do produto localizado."],
  ["estoque_preco", "Preço numérico do produto."],
  ["estoque_preco_formatado", "Preço formatado em reais."],
  ["estoque_quantidade", "Quantidade disponível para venda."],
  ["estoque_quantidade_fisica", "Quantidade física no escopo consultado."],
  ["estoque_quantidade_reservada", "Quantidade reservada no escopo consultado."],
  ["estoque_unidade", "Unidade base do produto."],
  [
    "estoque_deposito_id",
    "ID do depósito quando o escopo possui um único depósito.",
  ],
  ["estoque_deposito_nome", "Nome do depósito ou depósitos consultados."],
  [
    "estoque_depositos_json",
    "Detalhamento dos depósitos consultados em JSON.",
  ],
  ["estoque_embalagem_id", "ID da embalagem padrão de venda."],
  ["estoque_embalagem_nome", "Nome da embalagem padrão de venda."],
  ["estoque_embalagem_sigla", "Sigla da embalagem padrão de venda."],
  ["estoque_embalagem_fator", "Fator de conversão da embalagem."],
  ["estoque_embalagem_preco", "Preço numérico da embalagem."],
  [
    "estoque_embalagem_preco_formatado",
    "Preço formatado da embalagem.",
  ],
  [
    "estoque_embalagem_quantidade_disponivel",
    "Quantidade de embalagens completas disponíveis.",
  ],
  ["estoque_candidatos_quantidade", "Quantidade de candidatos encontrados."],
  ["estoque_candidatos_texto", "Lista pronta dos candidatos encontrados."],
  ["estoque_candidatos_json", "Candidatos encontrados em JSON."],
].map(([key, description]) => ({
  key,
  description,
  category: "Estoque" as const,
}));

type EdgeDataConexao = {
  condicao_json?: Record<string, unknown>;
};

export function saidaConsultaEstoquePorValor(valor: unknown) {
  const valorNormalizado = String(valor || "").trim();

  return (
    SAIDAS_CONSULTA_ESTOQUE.find(
      (saida) => saida.valor === valorNormalizado
    ) || null
  );
}

export function sourceHandleConsultaEstoque(
  tipoNoOrigem: unknown,
  condicao: Record<string, unknown> | null | undefined
) {
  if (String(tipoNoOrigem || "") !== TIPO_NO_CONSULTAR_ESTOQUE) {
    return undefined;
  }

  return saidaConsultaEstoquePorValor(condicao?.valor)?.valor;
}

export function validarNodeConsultarEstoque(node: Node, edges: Edge[]) {
  if (String(node.data?.tipo_no || "") !== TIPO_NO_CONSULTAR_ESTOQUE) {
    return "";
  }

  const titulo = String(node.data?.titulo || "Consultar estoque");
  const config = normalizarConfiguracaoConsultarEstoque(
    (node.data?.configuracao_json || {}) as Record<string, unknown>
  );

  if (config.origem_produto === "produto_especifico" && !config.produto_id) {
    return `O bloco "${titulo}" precisa ter um produto selecionado.`;
  }

  if (config.origem_produto === "variavel" && !config.variavel_produto) {
    return `O bloco "${titulo}" precisa ter uma variável de produto.`;
  }

  if (config.deposito_modo === "especifico" && !config.deposito_id) {
    return `O bloco "${titulo}" precisa ter um depósito selecionado.`;
  }

  if (
    config.deposito_modo === "selecionados" &&
    config.deposito_ids.length === 0
  ) {
    return `O bloco "${titulo}" precisa ter pelo menos um depósito selecionado.`;
  }

  const conexoesSaida = edges.filter((edge) => edge.source === node.id);

  if (conexoesSaida.length !== SAIDAS_CONSULTA_ESTOQUE.length) {
    return `O bloco "${titulo}" precisa ter exatamente ${SAIDAS_CONSULTA_ESTOQUE.length} conexões de saída.`;
  }

  for (const edge of conexoesSaida) {
    const condicao =
      (edge.data as EdgeDataConexao | undefined)?.condicao_json || {};
    const tipoCondicao = String(condicao.tipo || "").trim();
    const valorCondicao = String(condicao.valor || "").trim();
    const saida = saidaConsultaEstoquePorValor(valorCondicao);

    if (tipoCondicao !== "resposta_igual" || !saida) {
      return `As conexões do bloco "${titulo}" precisam usar as saídas padrão da consulta de estoque.`;
    }

    if (
      edge.sourceHandle &&
      String(edge.sourceHandle) !== saida.valor
    ) {
      return `A conexão "${saida.titulo}" do bloco "${titulo}" está ligada ao conector incorreto.`;
    }
  }

  const valoresSaida = conexoesSaida.map((edge) =>
    String(
      ((edge.data as EdgeDataConexao | undefined)?.condicao_json || {}).valor ||
        ""
    ).trim()
  );

  for (const saida of SAIDAS_CONSULTA_ESTOQUE) {
    const quantidade = valoresSaida.filter(
      (valor) => valor === saida.valor
    ).length;

    if (quantidade !== 1) {
      return `O bloco "${titulo}" precisa ter exatamente uma conexão na saída "${saida.titulo}".`;
    }
  }

  return "";
}

export function validarConsultasEstoqueAntesDeAtivar(
  nodes: Node[],
  edges: Edge[]
) {
  for (const node of nodes) {
    const erro = validarNodeConsultarEstoque(node, edges);
    if (erro) return erro;
  }

  return "";
}
