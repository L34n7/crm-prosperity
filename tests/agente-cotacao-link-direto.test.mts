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
