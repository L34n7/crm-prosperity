import assert from "node:assert/strict";
import test from "node:test";
import {
  classificarMensagemPorRegras,
  extrairValorConversao,
  classificacaoBloqueiaFollowup,
} from "../src/lib/leads/classificacao-automatica.ts";

test("conversão confirmada com valor informado", () => {
  const analise = classificarMensagemPorRegras("Já contratei o plano, paguei R$ 267,00.");
  assert.equal(analise?.classificacao, "convertido");
  assert.equal(analise?.valorConversao, 267);
});

test("pedido de link é qualificação e não conversão", () => {
  assert.equal(classificarMensagemPorRegras("Pode me enviar o link?")?.classificacao, "qualificado");
});

test("recusa explícita encerra follow-up", () => {
  assert.equal(classificarMensagemPorRegras("Não tenho interesse")?.classificacao, "perdido");
  assert.equal(classificacaoBloqueiaFollowup("perdido"), true);
  assert.equal(classificacaoBloqueiaFollowup("convertido"), true);
  assert.equal(classificacaoBloqueiaFollowup("qualificado"), false);
});

test("pergunta de compra não deve ser conversão", () => {
  assert.notEqual(classificarMensagemPorRegras("Como posso comprar?")?.classificacao, "convertido");
  assert.notEqual(classificarMensagemPorRegras("Não comprei.")?.classificacao, "convertido");
});

test("mensagens neutras não reclassificam nem acionam IA", () => {
  const analise = classificarMensagemPorRegras("Bom dia!");
  assert.equal(analise?.classificacao, null);
});

test("conversão só registra valor com moeda explícita", () => {
  assert.equal(extrairValorConversao("R$ 1.250,50"), 1250.5);
  assert.equal(extrairValorConversao("R$ 267"), 267);
  assert.equal(extrairValorConversao("tenho 267 contatos"), null);
});
