export const TIPO_NO_CHECKOUT_PAGAMENTO = "checkout_pagamento";

export const SAIDAS_CHECKOUT_PAGAMENTO = [
  { valor: "pagamento_aprovado", titulo: "Pagamento aprovado" },
  { valor: "sem_estoque", titulo: "Sem estoque" },
  { valor: "expirado_cancelado", titulo: "Expirado / cancelado" },
  { valor: "erro", titulo: "Erro" },
] as const;
