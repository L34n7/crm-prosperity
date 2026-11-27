import assert from "node:assert/strict";
import test from "node:test";
import {
  configurarTratamentoOfertaExterna,
  ehOfertaComercialExterna,
} from "../src/lib/agentes-ia/ofertas-comerciais-externas.ts";

test("identifica oferta real de crédito enviada a Josué",()=>{
  assert.equal(ehOfertaComercialExterna(
    "Olá, Josue👋🏻\nSou a Sílvia correspondente do Banco Daycoval, tudo bem?\n\nTemos crédito em conta pré-aprovado para você no valor de até *R$3.500,00*\nValores liberados no mesmo dia!!!\n\nResponda *SIM* para receber mais detalhes!"
  ),true);
});

test("detecta campanha comercial externa com uma proposta e CTA",()=>{
  for(const mensagem of [
    "Olá, sou consultora da empresa de energia solar. Temos uma promoção especial, responda SIM para receber detalhes.",
    "Somos da empresa de marketing digital. Oferecemos serviços de tráfego pago! Podemos conversar?",
    "Temos um empréstimo pré-aprovado para você. Responda SIM para liberar seu crédito.",
    "Olá, sou representante comercial. Temos serviços de contabilidade com desconto. Entre em contato.",
  ]) assert.equal(ehOfertaComercialExterna(mensagem),true,mensagem);
});

test("não intercepta solicitações legítimas ou casos ambíguos",()=>{
  for(const mensagem of [
    "Olá",
    "Quero fazer uma cotação de proteção veicular para meu carro",
    "Tenho uma proposta comercial para proteção veicular",
    "Preciso de um empréstimo para comprar meu carro e depois cotar a proteção",
    "Quero saber se a SaveCar oferece financiamento",
    "Como funciona o seguro do carro?",
    "Preciso de guincho urgente, bati o carro!",
    "Meu boleto está atrasado",
    "O banco me ofereceu crédito, vocês trabalham com isso?",
    "Sou consultor do Banco Daycoval. Tudo bem?",
    "Quero falar com o Josué",
    "Temos uma promoção especial!",
    "Bom dia, te mandei aquela oferta.",
    "Minha mãe foi ao banco pegar um empréstimo.",
  ]) assert.equal(ehOfertaComercialExterna(mensagem),false,mensagem);
});

test("resposta determinística só é habilitada com opt-in explícito",()=>{
  const mensagem="Olá! Aqui é a Andreia, do atendimento da SaveCar Brasil. Obrigada pelo contato! Este canal é dedicado à proteção veicular, então não atendemos ofertas comerciais de outros serviços por aqui.";
  assert.equal(configurarTratamentoOfertaExterna(null),null);
  assert.equal(configurarTratamentoOfertaExterna({ativo:false,mensagem}),null);
  assert.equal(configurarTratamentoOfertaExterna({ativo:true,mensagem:"Oi"}),null);
  assert.equal(configurarTratamentoOfertaExterna({ativo:true,mensagem})?.mensagem,mensagem);
});
