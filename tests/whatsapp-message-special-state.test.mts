import assert from "node:assert/strict";
import test from "node:test";
import { getWhatsAppMessageSpecialState } from "../src/lib/whatsapp/message-special-state.ts";

test("agrupa reacoes salvas no metadata da mensagem original", () => {
  const state = getWhatsAppMessageSpecialState({
    conteudo: "Mensagem original",
    metadata_json: {
      reacoes_whatsapp: [
        { emoji: "👍", remetente: "551100000001" },
        { emoji: "❤️", remetente: "551100000002" },
        { emoji: "👍", remetente: "551100000003" },
      ],
    },
  });

  assert.deepEqual(state.reactions, [
    { emoji: "👍", count: 2 },
    { emoji: "❤️", count: 1 },
  ]);
});

test("preserva a versao imediatamente anterior de mensagem editada", () => {
  const state = getWhatsAppMessageSpecialState({
    conteudo: "Terceira versão",
    metadata_json: {
      mensagem_editada_whatsapp: true,
      historico_edicoes_whatsapp: [
        { conteudo: "Primeira versão" },
        { conteudo: "Segunda versão" },
      ],
    },
  });

  assert.equal(state.edited, true);
  assert.equal(state.previousContent, "Segunda versão");
  assert.equal(state.currentContent, "Terceira versão");
});

test("usa o conteudo preservado antes da revogacao", () => {
  const state = getWhatsAppMessageSpecialState({
    conteudo: "Mensagem apagada pelo contato",
    metadata_json: {
      mensagem_revogada_whatsapp: true,
      conteudo_antes_revogacao: "Conteúdo que foi apagado",
    },
  });

  assert.equal(state.revoked, true);
  assert.equal(state.deletedContent, "Conteúdo que foi apagado");
});

test("ignora metadata malformado sem impedir a conversa", () => {
  const state = getWhatsAppMessageSpecialState({
    conteudo: "Mensagem normal",
    metadata_json: "metadata inválido",
  });

  assert.deepEqual(state.reactions, []);
  assert.equal(state.edited, false);
  assert.equal(state.revoked, false);
  assert.equal(state.currentContent, "Mensagem normal");
});
