import assert from "node:assert/strict";
import test from "node:test";
import { obterUrlImagemTemplate, atribuirUrlImagemTemplate } from "../src/lib/whatsapp/template-media-preview.ts";

const payload = {
  components: [
    { type: "HEADER", format: "IMAGE", example: { header_handle: ["4:identificador-da-meta"] } },
    { type: "BODY", text: "Olá!" },
  ],
};

test("identificador da Meta não é uma imagem visível", () => {
  assert.equal(obterUrlImagemTemplate(payload), "");
});

test("cópia local armazena URL sem modificar handle original", () => {
  const copia = atribuirUrlImagemTemplate(payload, "https://cdn.exemplo.com/imagem.png");
  assert.equal(obterUrlImagemTemplate(copia), "https://cdn.exemplo.com/imagem.png");
  assert.equal(obterUrlImagemTemplate(payload), "");
  assert.match(JSON.stringify(payload), /4:identificador-da-meta/);
});

test("não associa imagem a templates sem cabeçalho de imagem", () => {
  const somenteTexto = { components: [{ type: "BODY", text: "Mensagem" }] };
  assert.equal(obterUrlImagemTemplate(atribuirUrlImagemTemplate(somenteTexto, "https://exemplo.com/a.png")), "");
});
