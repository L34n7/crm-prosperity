import assert from "node:assert/strict";
import test from "node:test";
import {
  condicaoCombinaComCandidatos,
  resolverRespostaInterativa,
} from "../src/lib/automacoes/resposta-conexao-policy.ts";

const noBotoes = {
  tipo_no: "enviar_botoes",
  configuracao_json: {
    botoes: [
      { id: "opcao_1", titulo: "Nunca vendi nada" },
      { id: "opcao_2", titulo: "Já tentei..." },
      { id: "opcao_3", titulo: "Vendo, quero escalar" },
    ],
  },
};

test("resolve o ID recebido pelo WhatsApp para o título do botão", () => {
  assert.deepEqual(resolverRespostaInterativa(noBotoes, "opcao_2"), {
    original: "opcao_2",
    candidatos: ["opcao_2", "Já tentei..."],
    identificador: "opcao_2",
    titulo: "Já tentei...",
    textoSemantico: "Já tentei...",
  });
});

test("aceita conexão salva pelo ID ou pelo título do mesmo botão", () => {
  const resposta = resolverRespostaInterativa(noBotoes, "opcao_2");

  assert.equal(
    condicaoCombinaComCandidatos(
      { tipo: "resposta_igual", valor: "opcao_2" },
      resposta.candidatos
    ),
    true
  );
  assert.equal(
    condicaoCombinaComCandidatos(
      { tipo: "resposta_contem", valor: "Já tentei..." },
      resposta.candidatos
    ),
    true
  );
});

test("mantém respostas livres sem correspondência como texto original", () => {
  assert.deepEqual(resolverRespostaInterativa(noBotoes, "outra resposta"), {
    original: "outra resposta",
    candidatos: ["outra resposta"],
    identificador: null,
    titulo: null,
    textoSemantico: "outra resposta",
  });
});

test("blocos idênticos resolvem a resposta de forma independente", () => {
  const cloneBotoes = structuredClone(noBotoes);

  assert.deepEqual(
    resolverRespostaInterativa(cloneBotoes, "opcao_3").candidatos,
    ["opcao_3", "Vendo, quero escalar"]
  );
});
