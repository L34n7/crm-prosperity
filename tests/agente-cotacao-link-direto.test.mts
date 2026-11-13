import assert from "node:assert/strict";
import test from "node:test";
import {
  configuracaoCotacaoPorLink,
  solicitouCotacaoPorLink,
  materiaisAposLink,
} from "../src/lib/agentes-ia/cotacao-link-direto.ts";

const mensagem = "Faça sua cotação agora mesmo! https://cotacao.me/0oQ2mnOb?id=0DO2B0qN";

test("detecta pedidos efetivos de cotação sem acionamento pela IA",()=>{
  for(const entrada of [
    "quero fazer uma cotação",
    "Qual o orçamento para meu carro?",
    "quero cotar minha moto",
    "Gostaria de uma simulação para o veículo",
    "Quanto custa a proteção do carro?",
    "quero seguro para meu carro",
    "manda o link da cotação",
    "me envia o endereço para cotar",
  ]) assert.equal(solicitouCotacaoPorLink(entrada),true,entrada);
});

test("não interrompe saudação, atendimento ou negativa",()=>{
  for(const entrada of [
    "olá",
    "onde eu pago meu boleto?",
    "preciso de guincho",
    "não quero cotação",
    "não preciso de orçamento",
    "quanto custa o rastreador?",
  ]) assert.equal(solicitouCotacaoPorLink(entrada),false,entrada);
});

test("fluxo só é ativado com configuração explícita e link",()=>{
  assert.equal(configuracaoCotacaoPorLink(null),null);
  assert.equal(configuracaoCotacaoPorLink({ativo:false,mensagem}),null);
  assert.equal(configuracaoCotacaoPorLink({ativo:true,mensagem:"Olá"}),null);
  assert.equal(configuracaoCotacaoPorLink({ativo:true,mensagem})?.mensagem,mensagem);
  const id="e991f757-92fe-4545-9955-d5da1fbf11af";
  assert.equal(configuracaoCotacaoPorLink({
    ativo:true,mensagem,conhecimento_id:id,
  })?.conhecimento_id,id);
  assert.equal(configuracaoCotacaoPorLink({
    ativo:true,mensagem,conhecimento_id:"conhecimento-outra-empresa",
  })?.conhecimento_id,null);
});

test("seleciona apenas três mídias vinculadas ao envio APÓS o link, em ordem",()=>{
  const ids=["1efd002f-c83f-43e9-8326-ece90ed24f1f",
    "b236cf39-980a-40e8-9416-8e7bc7ac2a37",
    "bd82f335-ebd2-4322-82dd-e8485f853bfb",
    "d3bef94e-bf49-498f-8ba9-418970be3004"];
  assert.deepEqual(materiaisAposLink([
    {midia_id:ids[0],quando_enviar:"Após enviar o link de cotação ao cliente"},
    {midia_id:ids[1],quando_enviar:"Depois do link da cotação"},
    {midia_id:ids[2],quando_enviar:"Em seguida ao link para orçamento"},
    {midia_id:ids[3],quando_enviar:"Após enviar o link de cotação ao cliente"},
  ]),ids.slice(0,3));
  assert.deepEqual(materiaisAposLink([
    {midia_id:ids[0],quando_enviar:"Somente quando pedir panfleto"},
  ]),[]);
});

test("cotação por link filtra mídias apenas do conhecimento escolhido",()=>{
  const id="e991f757-92fe-4545-9955-d5da1fbf11af";
  const outro="51b68956-37fb-4b8e-9bc2-efc5187d379c";
  const materiais=[
    {midia_id:"1efd002f-c83f-43e9-8326-ece90ed24f1f",quando_enviar:"Após enviar o link de cotação ao cliente",conhecimento_ids:[id]},
    {midia_id:"b236cf39-980a-40e8-9416-8e7bc7ac2a37",quando_enviar:"Após enviar o link de cotação ao cliente",conhecimento_ids:[outro]},
  ];
  assert.deepEqual(materiaisAposLink(materiais,id),[materiais[0].midia_id]);
  assert.deepEqual(materiaisAposLink(materiais,outro),[materiais[1].midia_id]);
});
