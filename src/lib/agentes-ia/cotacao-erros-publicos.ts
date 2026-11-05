/**
 * Separa o diagnóstico operacional da mensagem enviada ao contato.
 * Nunca repasse preços FIPE internos, faixas, categorias ou tabelas de
 * precificação pelo WhatsApp. O erro original permanece na auditoria.
 */
export type TipoFalhaCotacao =
  | "comercial"
  | "consulta"
  | "versao"
  | "dados"
  | "inesperada";

export type FalhaCotacaoPublica = {
  tipo: TipoFalhaCotacao;
  codigo: string;
  orientacaoAgente: string;
  respostaFixa: string | null;
};

const RESPOSTA_COMERCIAL =
  "Não consegui finalizar sua cotação automaticamente para esse veículo. " +
  "Nossa equipe pode verificar as opções disponíveis e ajudar você a encontrar " +
  "a melhor alternativa. 😊";

const RESPOSTA_CONSULTA =
  "Não consegui consultar os dados desse veículo neste momento. " +
  "Podemos tentar novamente ou contar com a ajuda da nossa equipe. 😊";

const RESPOSTA_GENERICA =
  "Não consegui concluir sua cotação neste momento. " +
  "Nossa equipe pode ajudar a verificar as opções para esse veículo. 😊";

function normalizar(valor: string) {
  return String(valor || "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

export function classificarFalhaCotacao(erro: string): FalhaCotacaoPublica {
  const texto = normalizar(erro);

  // Preço acima do teto, "categoria outros", ausência de regras ou
  // faixas e produtos sem cobertura comercial são decisões internas.
  if (/(?:maior faixa|faixas? (?:cadastrad|de preco|disponiv)|tabela(?:s)?(?: de (?:preco|outros))?|atualiz(?:e|ar) (?:a )?(?:tabela|preco)|nao ha mensalidade|nenhum plano disponivel|nao ha preco|sem preco|sem valor comercial|configuracao comercial|classificacao comercial|categoria.*(?:cadastrad|preco|faixa|outros)|criterios de aceitacao|plano antes de cotar|sem plano(?:s)? ativo)/.test(texto)) {
    return {
      tipo: "comercial",
      codigo: "COTACAO_CONDICAO_COMERCIAL_INDISPONIVEL",
      orientacaoAgente:
        "Não foi possível montar uma proposta automática para este veículo. " +
        "Há uma condição comercial a validar com a equipe. " +
        "Não mencione preço de referência, tabela, categoria, limite ou alteração interna.",
      respostaFixa: RESPOSTA_COMERCIAL,
    };
  }

  if (/(?:indisponivel|temporari|timeout|tempo esgotado|tente novamente|falha ao consultar)/.test(texto) &&
      /(?:fipe|consulta|consultar|sistema|servidor|conexao)/.test(texto)) {
    return {
      tipo: "consulta",
      codigo: "COTACAO_CONSULTA_INDISPONIVEL",
      orientacaoAgente:
        "A consulta do veículo não foi concluída agora. Não exponha o provedor " +
        "de dados nem motivos técnicos; ofereça nova tentativa ou ajuda da equipe.",
      respostaFixa: RESPOSTA_CONSULTA,
    };
  }

  if (/(?:versao|motorizacao|modelo|ano.modelo|combustivel|cambio|descricao exata|opcoes)/.test(texto)) {
    return {
      tipo: "versao",
      codigo: "COTACAO_VERSAO_PENDENTE",
      orientacaoAgente:
        "Confirme apenas o detalhe do veículo que ainda precisa ser identificado, " +
        "sem citar mensagens técnicas da consulta, catálogos internos ou tabelas.",
      respostaFixa: null,
    };
  }

  if (/(?:informe|confirme|preciso somente|finalidade de uso|marca)/.test(texto)) {
    return {
      tipo: "dados",
      codigo: "COTACAO_DADOS_PENDENTES",
      orientacaoAgente: "Peça somente a informação necessária para cotar, sem repetir as já confirmadas.",
      respostaFixa: null,
    };
  }

  return {
    tipo: "inesperada",
    codigo: "COTACAO_FALHA_NAO_CLASSIFICADA",
    orientacaoAgente:
      "A ferramenta não concluiu a proposta. Não mencione detalhes operacionais, " +
      "erros de sistema, tabelas ou preços internos; ofereça ajuda da equipe.",
    respostaFixa: RESPOSTA_GENERICA,
  };
}

/** Defesa adicional contra uma resposta técnica inventada pelo próprio modelo. */
export function contemDetalheInternoCotacao(texto: string): boolean {
  return /(?:\bfaixas?\b.{0,25}\b(?:preco|cadastrad|superior|maior)|\b(?:tabela|tabelas)\b.{0,40}\b(?:preco|atualiz|cadastrad|outros)|\b(?:atualiz|cadastr)\w*\b.{0,35}\b(?:precos?|tabela|sistema)|\b(?:categoria)\b.{0,30}\b(?:outros|cadastrad|faixa)|\b(?:valor(?: do)? veiculo|valor fipe)\b.{0,55}\b(?:ultrapass|maior|limite)|\b(?:banco de dados|parametrizac|configuracao comercial|faixa cadastrada|mensalidade definida)\b)/.test(normalizar(texto));
}

export function respostaSeguraFalhaCotacao(erro: string, mensagens: string[]) {
  const classificada = classificarFalhaCotacao(erro);
  if (classificada.respostaFixa) return [classificada.respostaFixa];
  if (mensagens.some((texto) => contemDetalheInternoCotacao(texto))) {
    return [
      "Preciso confirmar um detalhe para concluir a cotação desse veículo. " +
      "Pode me informar a versão ou motorização exata? 😊",
    ];
  }
  return mensagens;
}
