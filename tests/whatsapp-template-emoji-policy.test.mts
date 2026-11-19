import assert from "node:assert/strict";
import test from "node:test";
import { textoTemEmojiTemplateRestrito } from "../src/lib/whatsapp/template-emoji-policy.ts";

test("detecta emojis comuns em cabeçalho ou botão", () => {
  assert.equal(textoTemEmojiTemplateRestrito("☀️🔥 O VERÃO ESTÁ CHEGANDO"), true);
  assert.equal(textoTemEmojiTemplateRestrito("💪 Saiba mais"), true);
  assert.equal(textoTemEmojiTemplateRestrito("👩‍⚕️ Agendar"), true);
});

test("detecta bandeiras e emojis numéricos", () => {
  assert.equal(textoTemEmojiTemplateRestrito("🇧🇷 Brasil"), true);
  assert.equal(textoTemEmojiTemplateRestrito("Opção 1️⃣"), true);
});

test("permite números, acentos, símbolos comuns e espaços", () => {
  assert.equal(textoTemEmojiTemplateRestrito("Promoção de verão - 2026"), false);
  assert.equal(textoTemEmojiTemplateRestrito("Ver detalhes (2)"), false);
  assert.equal(textoTemEmojiTemplateRestrito("Acessar site"), false);
  assert.equal(textoTemEmojiTemplateRestrito("Telefone: +55 31 3333-4444"), false);
  assert.equal(textoTemEmojiTemplateRestrito(null), false);
});
