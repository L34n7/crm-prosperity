import assert from "node:assert/strict";
import test from "node:test";
import {
  gerarHtmlEmailVisual, novoDocumentoEmail, novoBlocoEmail,
  normalizarDocumentoEmail, urlEmailSegura,
} from "../src/lib/email-marketing/editor-visual.ts";

test("gera HTML de e-mail responsivo com layout em tabelas e variáveis", () => {
  const documento = novoDocumentoEmail();
  const html = gerarHtmlEmailVisual(documento);
  assert.match(html, /role="presentation"/);
  assert.match(html, /max-width:620px/);
  assert.match(html, /\{\{nome_contato\}\}/);
  assert.match(html, /mailto:|https:\/\/crmprosperity\.com/);
});

test("escapa conteúdo de texto e bloqueia links perigosos", () => {
  const documento = novoDocumentoEmail();
  documento.blocos[0].texto = '<img src=x onerror=alert("x")>';
  documento.blocos.push({ ...novoBlocoEmail("botao"), url: "javascript:alert(1)" });
  const html = gerarHtmlEmailVisual(documento);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /javascript:/);
  assert.equal(urlEmailSegura("data:text/html,hello"), "");
});

test("normalização rejeita documento malformado e valores fora dos limites", () => {
  const documento = novoDocumentoEmail();
  assert.equal(normalizarDocumentoEmail({ ...documento, versao: 2 }), null);
  assert.equal(normalizarDocumentoEmail({ ...documento, blocos: [] }), null);
  assert.equal(normalizarDocumentoEmail({ ...documento, blocos: [{ ...novoBlocoEmail("imagem"), imagem: "javascript:bad" }] }), null);
  const limitado = normalizarDocumentoEmail({ ...documento, largura: 9999 });
  assert.equal(limitado?.largura, 700);
});

test("colunas são geradas com classe empilhável para mobile", () => {
  const documento = novoDocumentoEmail();
  documento.blocos = [{ ...novoBlocoEmail("colunas"), texto: "A", textoDireita: "B" }];
  const html = gerarHtmlEmailVisual(documento);
  assert.match(html, /class="email-stack"/);
  assert.match(html, /display:block!important/);
  assert.match(html, />A<\/td>/);
  assert.match(html, />B<\/td>/);
});
