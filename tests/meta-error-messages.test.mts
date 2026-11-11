import assert from "node:assert/strict";
import test from "node:test";

import {
  descreverErroMetaWhatsApp,
  formatarErroMetaWhatsApp,
  gravidadeErroMetaWhatsApp,
  identificarCodigoErroMetaWhatsApp,
} from "../src/lib/whatsapp/meta-error-messages.ts";

const metaRaw =
  "(#131037) WhatsApp provided number needs display name approval before message can be sent.";

test("131037: exibe nome, causa e ação didática em histórico e relatórios", () => {
  const descricao = descreverErroMetaWhatsApp(131037, metaRaw);
  assert.equal(descricao.codigo, 131037);
  assert.match(descricao.nome, /nome de exibição/i);
  assert.match(descricao.significado, /número remetente/i);
  assert.match(descricao.significado, /não no template nem nos contatos/i);
  assert.match(descricao.resumo || "", /aprovação/i);
  assert.match(descricao.acao, /WhatsApp/i);
  assert.match(descricao.acao, /AVAILABLE_WITHOUT_REVIEW/);
  assert.match(descricao.acao, /Phone Number ID/);
  assert.equal(gravidadeErroMetaWhatsApp(131037), 3);
});

test("131037: reconhece código apenas no texto de falha histórica", () => {
  assert.equal(identificarCodigoErroMetaWhatsApp(null, metaRaw), 131037);
  const mensagem = formatarErroMetaWhatsApp(null, metaRaw);
  assert.match(mensagem, /^131037 · Nome de exibição/);
  assert.match(mensagem, /O que fazer:/);
});

test("os demais códigos mantêm o comportamento atual", () => {
  const outro = descreverErroMetaWhatsApp(131008);
  assert.match(outro.significado, /parâmetro obrigatório/i);
  assert.equal(gravidadeErroMetaWhatsApp(131008), 2);
});
