import assert from "node:assert/strict";
import test from "node:test";
import { mensagemPertenceFluxoAgenda as agenda } from "../src/lib/agentes-ia/intencao-agendamento-operacional.ts";

test("agendamento explícito, independente do tema comercial", () => {
  for (const texto of [
  "Quero agendar uma reunião com vocês",
  "Pode marcar uma visita para terça?",
  "Gostaria de marcar uma demonstração",
  "Preciso de outro agendamento",
  "Agendar consulta amanhã",
  "Quero agendar uma reunião para tratar do pagamento"
])
    assert.equal(agenda(texto, { emCurso: false, confirmacaoPendente: false }), true, texto);
});

test("conversa de outra natureza não é capturada pela agenda", () => {
  for (const texto of [
  "Pode agendar o pagamento para amanhã?",
  "Quero agendar um disparo para amanhã",
  "Como agendar campanhas pelo WhatsApp?",
  "Como funciona o agendamento no CRM?",
  "Quero saber como agendar uma reunião no CRM",
  "Não quero agendar uma reunião",
  "E eu fechando hoje, como funcionaria? Paguei o valor mensal, e como faço o pagamento recorrente do disparo?",
  "Outra coisa, o número caiu, posso colocar outro na mesma plataforma?",
  "Amanhã vou pagar o boleto",
  "Hoje prefiro contratar o plano",
  "Pode confirmar a compra hoje?",
  "O que você acha de lançar amanhã?",
  "Prefiro o plano básico",
  "Não quero remarcar",
  "Sim"
])
    assert.equal(agenda(texto, { emCurso: true, confirmacaoPendente: false }), false, texto);
});

test("respostas reais a escolha de horário são reconhecidas", () => {
  for (const texto of [
  "Quero mudar o dia",
  "Amanhã às 14h",
  "Sexta-feira",
  "Prefiro terça às 15h",
  "Pode ser amanhã?",
  "Hoje",
  "Na próxima semana",
  "Amanhã às 14h pode ser?",
  "Pode ser na sexta?",
  "Outro dia",
  "O segundo",
  "Não consigo nesse horário",
  "Dia 16"
])
    assert.equal(agenda(texto, { emCurso: true, confirmacaoPendente: false }), true, texto);
});

test("confirmações curtas só operam com confirmação pendente", () => {
  for (const texto of ["Sim", "Confirmo", "Não"]) {
    assert.equal(agenda(texto, { emCurso: true, confirmacaoPendente: true }), true, texto);
    assert.equal(agenda(texto, { emCurso: true, confirmacaoPendente: false }), false, texto);
  }
});

test("variações naturais de agendamento e novo assunto", () => {
  for (const texto of ["Pode me agendar para amanhã às 14h?","Quero agendar às 9h","Quero marcar para sexta-feira","Remarca minha reunião"])
    assert.equal(agenda(texto, { emCurso: false, confirmacaoPendente: false }), true, texto);
  for (const texto of ["Terça, às 15h","Não consigo amanhã","Pode ser de manhã","Depois das 16h","A partir das 10h"])
    assert.equal(agenda(texto, { emCurso: true, confirmacaoPendente: false }), true, texto);
  for (const texto of ["Quero agendar um pagamento para amanhã","Quero agendar um disparo para sexta-feira","Me ensina como marcar reuniões no sistema"])
    assert.equal(agenda(texto, { emCurso: false, confirmacaoPendente: false }), false, texto);
  for (const texto of ["Não consigo pagar amanhã","Fechando hoje: pode alterar o valor?","Amanhã eu vou comprar o serviço"])
    assert.equal(agenda(texto, { emCurso: true, confirmacaoPendente: false }), false, texto);
});
