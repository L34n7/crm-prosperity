import type { Edge, Node } from "@xyflow/react";
import type { TemplateVariableOption } from "@/components/TemplateVariableCombobox";

export const TIPO_NO_CHECKOUT_PAGAMENTO = "checkout_pagamento";

export const MENSAGEM_CHECKOUT_PAGAMENTO_PADRAO = `Seu pedido está pronto para pagamento ✅

*Produto:* {{estoque_produto_nome}}
*Quantidade:* {{quantidade_desejada}}
*Total:* {{pagamento_valor_formatado}}

Para concluir sua compra com segurança, acesse:
{{checkout_url}}

Assim que o pagamento for confirmado, eu continuo seu atendimento automaticamente.`;

export const MENSAGEM_RECUPERACAO_CHECKOUT_PADRAO = `Vi que o pagamento do seu pedido ainda está pendente.

Se quiser concluir agora, seu link continua disponível:
{{checkout_url}}

*Total:* {{pagamento_valor_formatado}}

Assim que o Mercado Pago confirmar o pagamento, eu sigo automaticamente por aqui.`;

export const SAIDAS_CHECKOUT_PAGAMENTO = [
  { valor: "pagamento_aprovado", titulo: "Pagamento aprovado" },
  { valor: "sem_estoque", titulo: "Sem estoque" },
  { valor: "expirado_cancelado", titulo: "Expirado / cancelado" },
  { valor: "erro", titulo: "Erro" },
] as const;

export const VARIAVEIS_SAIDA_CHECKOUT: TemplateVariableOption[] = [
  ["checkout_url", "Link seguro do Checkout Pro gerado pelo Mercado Pago."],
  ["pedido_id", "ID interno do pedido de venda criado pelo checkout."],
  ["pedido_numero", "Número do pedido de venda criado pelo checkout."],
  ["pagamento_id", "ID interno da transação de pagamento."],
  ["pagamento_gateway", "Gateway utilizado para processar o pagamento."],
  ["pagamento_status", "Status atual do pagamento."],
  ["pagamento_valor", "Valor numérico total do pagamento."],
  ["pagamento_valor_formatado", "Valor total do pagamento formatado em reais."],
  ["pagamento_metodo", "Método confirmado pelo gateway, como pix ou cartão."],
].map(([key, description]) => ({
  key,
  description,
  category: "Fluxo" as const,
}));

export function saidaCheckoutPagamentoPorValor(valor: unknown) {
  const normalizado = String(valor || "").trim();
  return (
    SAIDAS_CHECKOUT_PAGAMENTO.find((saida) => saida.valor === normalizado) || null
  );
}

function condicaoDaConexao(edge: Edge) {
  return (
    (edge.data as { condicao_json?: Record<string, unknown> } | undefined)
      ?.condicao_json || {}
  );
}

export function validarCheckoutsAntesDeAtivar(nodes: Node[], edges: Edge[]) {
  for (const node of nodes) {
    if (String(node.data?.tipo_no || "") !== TIPO_NO_CHECKOUT_PAGAMENTO) {
      continue;
    }

    const titulo = String(node.data?.titulo || "Checkout / pagamento");
    const configuracao =
      (node.data?.configuracao_json || {}) as Record<string, unknown>;
    const expiracao = Number(configuracao.expiracao_minutos || 30);
    const recuperacaoAtiva = configuracao.recuperacao_ativa === true;
    const recuperacaoApos = Number(configuracao.recuperacao_apos_minutos || 10);

    if (!String(configuracao.mensagem || "").trim()) {
      return `O bloco "${titulo}" precisa ter a mensagem com o link de pagamento.`;
    }

    if (
      !Number.isInteger(expiracao) ||
      !Number.isFinite(expiracao) ||
      expiracao < 5 ||
      expiracao > 1440
    ) {
      return `O bloco "${titulo}" precisa ter vencimento entre 5 e 1440 minutos.`;
    }

    if (
      recuperacaoAtiva &&
      (!Number.isInteger(recuperacaoApos) ||
        !Number.isFinite(recuperacaoApos) ||
        recuperacaoApos < 1 ||
        recuperacaoApos >= expiracao)
    ) {
      return `No bloco "${titulo}", a recuperação deve ocorrer depois de pelo menos 1 minuto e antes do vencimento do checkout.`;
    }

    if (
      recuperacaoAtiva &&
      !String(configuracao.mensagem_recuperacao || "").trim()
    ) {
      return `Informe a mensagem de recuperação do bloco "${titulo}".`;
    }

    const conexoesSaida = edges.filter((edge) => edge.source === node.id);

    if (conexoesSaida.length !== SAIDAS_CHECKOUT_PAGAMENTO.length) {
      return `O bloco "${titulo}" precisa ter exatamente ${SAIDAS_CHECKOUT_PAGAMENTO.length} conexões de saída.`;
    }

    for (const saida of SAIDAS_CHECKOUT_PAGAMENTO) {
      const conexoes = conexoesSaida.filter((edge) => {
        const condicao = condicaoDaConexao(edge);
        return String(condicao.valor || "").trim() === saida.valor;
      });

      if (conexoes.length !== 1) {
        return `O bloco "${titulo}" precisa ter exatamente uma conexão na saída "${saida.titulo}" (${saida.valor}).`;
      }

      const conexao = conexoes[0];
      const condicao = condicaoDaConexao(conexao);

      if (String(condicao.tipo || "").trim() !== "resposta_igual") {
        return `A conexão "${saida.titulo}" do bloco "${titulo}" precisa usar o ID de resposta automático ${saida.valor}.`;
      }

      if (
        conexao.sourceHandle &&
        String(conexao.sourceHandle) !== saida.valor
      ) {
        return `A conexão "${saida.titulo}" do bloco "${titulo}" está ligada ao conector incorreto.`;
      }
    }
  }

  return "";
}
