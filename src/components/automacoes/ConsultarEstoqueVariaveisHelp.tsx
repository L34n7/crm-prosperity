"use client";

import styles from "./ConsultarEstoqueVariaveisHelp.module.css";

type VariavelAjuda = {
  chave: string;
  descricao: string;
};

type GrupoVariaveisAjuda = {
  titulo: string;
  descricao: string;
  variaveis: VariavelAjuda[];
};

const GRUPOS_VARIAVEIS: GrupoVariaveisAjuda[] = [
  {
    titulo: "Resultado e produto",
    descricao:
      "Use para identificar o resultado final da consulta e o produto selecionado.",
    variaveis: [
      { chave: "estoque_resultado", descricao: "disponivel, sem_estoque ou nao_encontrado." },
      { chave: "estoque_produto_id", descricao: "ID interno do produto." },
      { chave: "estoque_produto_nome", descricao: "Nome do produto localizado." },
      { chave: "estoque_produto_codigo", descricao: "Código interno do produto." },
      { chave: "estoque_produto_sku", descricao: "SKU do produto." },
      { chave: "estoque_produto_codigo_barras", descricao: "Código de barras do produto." },
      { chave: "estoque_unidade", descricao: "Unidade base, como un, kg ou cx." },
    ],
  },
  {
    titulo: "Preço",
    descricao:
      "Para mensagens ao cliente, prefira as versões _formatado, que já retornam o valor pronto para exibição.",
    variaveis: [
      { chave: "estoque_preco", descricao: "Preço efetivo usado no canal WhatsApp." },
      { chave: "estoque_preco_formatado", descricao: "Preço efetivo formatado." },
      { chave: "estoque_preco_base_formatado", descricao: "Preço-base formatado." },
      { chave: "estoque_preco_balcao_formatado", descricao: "Preço de balcão/PDV formatado." },
      { chave: "estoque_preco_online_formatado", descricao: "Preço online formatado." },
      { chave: "estoque_preco_whatsapp_formatado", descricao: "Preço do WhatsApp formatado." },
      { chave: "estoque_preco_promocional_formatado", descricao: "Preço promocional vigente formatado." },
      { chave: "estoque_preco_pix_formatado", descricao: "Preço para PIX formatado." },
      { chave: "estoque_preco_dinheiro_formatado", descricao: "Preço para dinheiro formatado." },
      { chave: "estoque_preco_debito_formatado", descricao: "Preço para débito formatado." },
      { chave: "estoque_preco_credito_formatado", descricao: "Preço para crédito formatado." },
    ],
  },
  {
    titulo: "Disponibilidade",
    descricao:
      "Representa o saldo dentro dos depósitos configurados neste bloco.",
    variaveis: [
      { chave: "estoque_quantidade", descricao: "Quantidade disponível para venda." },
      { chave: "estoque_quantidade_fisica", descricao: "Quantidade física total." },
      { chave: "estoque_quantidade_reservada", descricao: "Quantidade atualmente reservada." },
    ],
  },
  {
    titulo: "Depósito e embalagem",
    descricao:
      "Podem ficar vazias quando a consulta usa vários depósitos ou não há embalagem padrão configurada.",
    variaveis: [
      { chave: "estoque_deposito_id", descricao: "ID quando o resultado pertence a um único depósito." },
      { chave: "estoque_deposito_nome", descricao: "Nome do depósito ou lista dos depósitos consultados." },
      { chave: "estoque_embalagem_nome", descricao: "Nome da embalagem padrão de venda." },
      { chave: "estoque_embalagem_sigla", descricao: "Sigla da embalagem." },
      { chave: "estoque_embalagem_fator", descricao: "Fator de conversão da embalagem." },
      { chave: "estoque_embalagem_preco_formatado", descricao: "Preço formatado da embalagem." },
      { chave: "estoque_embalagem_quantidade_disponivel", descricao: "Quantidade de embalagens completas disponíveis." },
    ],
  },
  {
    titulo: "Promoção",
    descricao:
      "Preenchidas somente quando existir promoção vigente aplicável ao produto/canal.",
    variaveis: [
      { chave: "estoque_promocao_nome", descricao: "Nome da promoção vigente." },
      { chave: "estoque_promocao_inicio_em", descricao: "Data/hora de início da promoção." },
      { chave: "estoque_promocao_fim_em", descricao: "Data/hora de término da promoção." },
      { chave: "estoque_promocao_canais", descricao: "Canais aos quais a promoção se aplica." },
    ],
  },
  {
    titulo: "Busca e paginação",
    descricao:
      "Úteis para auditoria, mensagens avançadas e integrações. A seleção entre vários produtos é tratada automaticamente pelo próprio nó.",
    variaveis: [
      { chave: "estoque_busca_termo", descricao: "Termo efetivamente usado na busca." },
      { chave: "estoque_busca_ia_usada", descricao: "Indica se a IA interpretou a busca." },
      { chave: "estoque_candidatos_total", descricao: "Total de produtos candidatos encontrados." },
      { chave: "estoque_candidatos_json", descricao: "Candidatos da página em JSON." },
      { chave: "estoque_pagina", descricao: "Página atual da busca." },
      { chave: "estoque_total_paginas", descricao: "Total de páginas da busca." },
    ],
  },
];

function token(chave: string) {
  return `{{${chave}}}`;
}

export default function ConsultarEstoqueVariaveisHelp() {
  return (
    <details className={styles.variablesHelp}>
      <summary>Variáveis disponíveis para os próximos blocos</summary>

      <div className={styles.variablesHelpBody}>
        <p>
          Depois que a consulta terminar, estas variáveis ficam disponíveis nos
          próximos blocos do fluxo. Você pode selecioná-las no campo de variáveis ou
          digitar o token diretamente no texto.
        </p>

        <div className={styles.variableExample}>
          <strong>Exemplo de mensagem após a saída Disponível</strong>
          <code>
            {"Encontrei {{estoque_produto_nome}} por {{estoque_preco_whatsapp_formatado}}. Temos {{estoque_quantidade}} {{estoque_unidade}} disponíveis."}
          </code>
        </div>

        <div className={styles.variableNotice}>
          Na saída <strong>Não encontrado</strong>, dados específicos do produto podem
          ficar vazios. Preços, promoção e embalagem também ficam vazios quando não
          estiverem configurados para o item.
        </div>

        <div className={styles.variableGroups}>
          {GRUPOS_VARIAVEIS.map((grupo) => (
            <section key={grupo.titulo} className={styles.variableGroup}>
              <div className={styles.variableGroupHeader}>
                <strong>{grupo.titulo}</strong>
                <span>{grupo.descricao}</span>
              </div>

              <div className={styles.variableList}>
                {grupo.variaveis.map((variavel) => (
                  <div key={variavel.chave} className={styles.variableItem}>
                    <code>{token(variavel.chave)}</code>
                    <span>{variavel.descricao}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </details>
  );
}
