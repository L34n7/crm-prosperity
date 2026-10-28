import assert from "node:assert/strict";
import test from "node:test";
import {
  reescreverLinksRastreados,
  destinoHttpSeguro,
  assinaturaLinkRastreado,
  validarAssinaturaLink,
} from "../src/lib/email-marketing/rastreamento.ts";

process.env.EMAIL_MARKETING_TRACKING_SECRET = "chave-exclusiva-de-teste";

test("links de campanha ganham assinatura e descadastro nao e rastreado", () => {
  const token = "9899b1ec-5ff0-437a-ad81-1324c59581e8";
  const html = '<a href="https://exemplo.com/oferta?x=1&amp;y=2">Oferta</a>' +
    '<a href="https://crmprosperity.com/api/email-marketing/descadastrar?token=abc">Sair</a>';
  const saida = reescreverLinksRastreados(html, {
    basePublica: "https://crmprosperity.com",
    token,
  });
  assert.match(saida, /\/api\/email-marketing\/rastrear\/clique/);
  assert.match(saida, /https:\/\/crmprosperity.com\/api\/email-marketing\/descadastrar/);
  assert.equal(saida.includes("rastrear/clique?token=abc"), false);
});

test("assinatura impede substituicao de destino e javascript", () => {
  const token = "teste";
  const destino = "https://exemplo.com/";
  const assinatura = assinaturaLinkRastreado(token, destino);
  assert.equal(validarAssinaturaLink(token, destino, assinatura), true);
  assert.equal(validarAssinaturaLink(token, "https://outro.com/", assinatura), false);
  assert.equal(destinoHttpSeguro("javascript:alert(1)"), null);
});
