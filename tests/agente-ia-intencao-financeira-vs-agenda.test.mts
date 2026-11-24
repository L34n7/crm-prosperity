import assert from "node:assert/strict";
import test from "node:test";
import { mensagemEhPerguntaFinanceiraNaoAgendamento as financeira } from "../src/lib/agentes-ia/intencao-financeira-vs-agenda.ts";

test("Davi: pergunta sobre pagamento recorrente não aciona agenda", () => {
  for (const frase of [
    "E eu fechando hoje, como funcionaria? Paguei o valor mensal, e como faço o pagamento recorrente do disparo?",
    "Eu fechando hoje, como faço o pagamento da Meta?",
    "Já paguei o plano mensal, e a cobrança das mensagens?",
    "Como faço para pagar as tarifas de disparo automaticamente?",
    "A Meta cobra por mensagem ou tem mensalidade?",
    "Posso cadastrar meu cartão para pagar os disparos?",
    "Qual o valor da fatura de ontem?",
    "Paguei ontem, como funciona a cobrança recorrente?",
    "Quero agendar o pagamento da mensalidade",
    "O cliente pode pagar a assinatura?",
  ]) assert.equal(financeira(frase), true, frase);
});

test("agendamento genuíno com assunto financeiro não é bloqueado", () => {
  for (const frase of [
    "Pode agendar uma reunião amanhã para discutir o pagamento?",
    "Quero marcar uma demonstração para conhecer os preços",
    "Vamos agendar um horário para conversar sobre a mensalidade",
    "Gostaria de remarcar a reunião que era para discutir faturamento",
    "Amanhã às 14h pode ser?",
    "Quero uma reunião hoje",
    "Dia 16 seria bom para uma conversa",
    "Pode confirmar a reunião de hoje?",
    "Quero mudar o dia da reunião",
  ]) assert.equal(financeira(frase), false, frase);
});
