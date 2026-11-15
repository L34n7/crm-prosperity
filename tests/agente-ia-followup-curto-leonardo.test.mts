import assert from "node:assert/strict";
import test from "node:test";
import {
  garantirFollowupCurtoLeonardo,
  LEONARDO_CRM_PROSPERITY_ID,
  MAX_CARACTERES_FOLLOWUP_LEONARDO,
} from "../src/lib/agentes-ia/followup-curto-leonardo.ts";

const OUTRO="00000000-0000-0000-0000-000000000009";

test("mensagem curta do Leonardo é preservada", () => {
  const texto="Posso te mostrar como o agente comercial responde seus leads? 😊";
  assert.equal(garantirFollowupCurtoLeonardo({
    agenteId:LEONARDO_CRM_PROSPERITY_ID,texto,alternativa:"Alternativa",
  }),texto);
});

test("balão longo do Leonardo vira retomada curta sem corte de frase", () => {
  const original="O CRM Prosperity pode transformar o atendimento, centralizar mensagens, conectar a equipe, automatizar respostas, enviar campanhas, qualificar os clientes e desenvolver um processo comercial mais eficiente. ".repeat(3);
  const alternativa="Posso te mostrar como o vendedor de IA ajuda a atender seus leads?";
  const final=garantirFollowupCurtoLeonardo({
    agenteId:LEONARDO_CRM_PROSPERITY_ID,texto:original,alternativa,
  });
  assert.equal(final,alternativa);
  assert.ok(final.length<=MAX_CARACTERES_FOLLOWUP_LEONARDO);
});

test("outros agentes mantêm o texto integral, mesmo quando extenso", () => {
  const original="Argumento persuasivo para outro agente. ".repeat(20);
  assert.equal(garantirFollowupCurtoLeonardo({
    agenteId:OUTRO,texto:original,alternativa:"Curto",
  }),original);
});

test("checkout oficial não é truncado em mensagem extensa", () => {
  const link="https://crmprosperity.com/comecar?ref=EMERSONLUI8FA7B4AF2A44F7C3";
  const texto="Veja todas as funções e benefícios que a plataforma oferece. ".repeat(10)+link;
  const saida=garantirFollowupCurtoLeonardo({
    agenteId:LEONARDO_CRM_PROSPERITY_ID,texto,
    alternativa:"Quer começar pelo plano que combinamos?",
  });
  assert.ok(saida.includes(link));
  assert.ok(saida.length<=MAX_CARACTERES_FOLLOWUP_LEONARDO);
});

test("alternativa longa não vaza balão extenso", () => {
  const saida=garantirFollowupCurtoLeonardo({
    agenteId:LEONARDO_CRM_PROSPERITY_ID,
    texto:"Texto longo. ".repeat(40),alternativa:"Outras funcionalidades. ".repeat(30),
  });
  assert.ok(saida.length<=MAX_CARACTERES_FOLLOWUP_LEONARDO);
});
