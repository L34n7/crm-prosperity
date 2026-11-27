import assert from "node:assert/strict";
import test from "node:test";
import {
  configurarTratamentoOfertaExterna,
  ehOfertaComercialExterna,
  RESPOSTA_PADRAO_OFERTA_EXTERNA,
} from "../src/lib/agentes-ia/ofertas-comerciais-externas.ts";

test("cobre ofertas comerciais externas de setores variados sem personalização por agente", () => {
  for (const mensagem of [
    "Olá, Josue👋🏻\nSou a Sílvia correspondente do Banco Daycoval, tudo bem?\n\nTemos crédito em conta pré-aprovado para você no valor de até *R$3.500,00*\nValores liberados no mesmo dia!!!\nResponda *SIM* para receber mais detalhes!",
    "Olá, sou consultora da empresa de energia solar. Temos uma promoção especial, responda SIM para receber detalhes.",
    "Somos da empresa de marketing digital. Oferecemos serviços de tráfego pago! Podemos conversar?",
    "Temos um empréstimo pré-aprovado para você. Responda SIM para liberar seu crédito.",
    "Olá, sou representante comercial. Temos serviços de contabilidade com desconto. Entre em contato.",
    "Temos doces artesanais para eventos, deseja conhecer nosso cardápio? Chame agora.",
    "Olá! Somos da Agência X e temos vídeos para sua empresa. Posso te enviar nosso portfólio?",
    "🔥 SUPER OFERTA DE NATAL! 50% de desconto em uniformes. Confira nosso catálogo.",
    "Olá, minha empresa tem um software de gestão. Posso enviar uma proposta comercial?",
    "Quero oferecer nossos serviços de limpeza. Pode me dar um retorno?",
    "Olá, sou da empresa Tech. Gostaria de apresentar uma solução de gestão para seu negócio.",
    "Oi, somos uma consultoria. Nosso pacote empresarial tem desconto de 30%, posso agendar uma reunião?",
    "Aproveite nossa promoção imperdível! Clique aqui para conhecer as condições.",
    "Somos a empresa GoldMed, temos um plano promocional de saúde. Gostaria de enviar uma proposta para vocês.",
    "Olá, trabalho como consultor comercial, temos novos equipamentos e gostaria de oferecer condições especiais.",
  ]) assert.equal(ehOfertaComercialExterna(mensagem),true,mensagem);
});

test("não intercepta leads, pedidos de compra, suporte e mensagens sociais", () => {
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
    "Sou a Maria da empresa ABC e gostaria de fazer uma cotação para nossa frota.",
    "Somos uma loja e precisamos contratar um CRM. Vocês fazem implantação?",
    "Queremos contratar serviços de desenvolvimento. Pode enviar um orçamento?",
    "Tenho interesse em comprar seu produto. Quais valores?",
    "Meu cartão foi cobrado duas vezes, preciso de suporte.",
    "Minha empresa oferece crédito, mas eu quero fazer cotação de seguro da frota.",
    "Quero uma cotação para 30 carros. Somos vendedores de carros usados.",
    "Preciso saber como funciona a assistência para nosso plano empresarial.",
    "Gostaria de receber proposta comercial da sua empresa para serviços de marketing.",
  ]) assert.equal(ehOfertaComercialExterna(mensagem),false,mensagem);
});

test("proteção global para agentes existentes e futuros sem opt-in", () => {
  const padrao=configurarTratamentoOfertaExterna(null);
  assert.equal(padrao.ativo,true);
  assert.equal(padrao.mensagem,RESPOSTA_PADRAO_OFERTA_EXTERNA);
  assert.equal(configurarTratamentoOfertaExterna({ativo:false,mensagem:"Oi"}).mensagem,RESPOSTA_PADRAO_OFERTA_EXTERNA);
  assert.equal(configurarTratamentoOfertaExterna({ativo:true,mensagem:"Curta"}).mensagem,RESPOSTA_PADRAO_OFERTA_EXTERNA);
  const personalizada="Olá! Aqui é a Andreia, do atendimento da SaveCar Brasil. Obrigada pelo contato! Este canal é dedicado à proteção veicular, então não atendemos ofertas comerciais de outros serviços por aqui.";
  assert.equal(configurarTratamentoOfertaExterna({ativo:true,mensagem:personalizada}).mensagem,personalizada);
});
