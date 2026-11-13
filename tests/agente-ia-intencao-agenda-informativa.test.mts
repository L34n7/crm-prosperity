import assert from "node:assert/strict";
import test from "node:test";
import { mensagemEhDuvidaSobreAgendaDoProduto as ehDuvida } from "../src/lib/agentes-ia/intencao-agenda-informativa.ts";

test("perguntas de recurso não solicitam reunião comercial",()=>{
  for (const frase of [
    "A IA agenda sozinha?",
    "Como funciona o agendamento?",
    "Como posso ver os agendamentos?",
    "No meu negócio pode ser necessário marcar uma call com o lead para fechar venda",
    "Quero que meu agente de IA marque reuniões para meus clientes",
    "O CRM consegue agendar horários?",
  ]) assert.equal(ehDuvida(frase),true,frase);
});
test("pedidos de marcação com o consultor continuam possíveis",()=>{
  for (const frase of [
    "Quero agendar uma reunião com vocês",
    "Pode me agendar para amanhã às 14h?",
    "Marque pra mim uma demonstração",
    "Vamos marcar uma apresentação com seu time",
    "Quero marcar uma demonstração",
    "Amanhã às 14h pode ser?",
    "Me agende às 9",
  ]) assert.equal(ehDuvida(frase),false,frase);
});
test("assuntos sem agenda não disparam o filtro",()=>{
  for (const frase of ["Qual valor de 2 mil mensagens?", "Preciso de um agente de vendas", "Tenho 1000 leads"]) assert.equal(ehDuvida(frase),false,frase);
});
