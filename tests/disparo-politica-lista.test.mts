import assert from "node:assert/strict";
import test from "node:test";
import {
  CODIGO_CONFIRMACAO_LISTA_FRIA_OBRIGATORIA,
  CODIGO_MARKETING_LISTA_FRIA_BLOQUEADO,
  validarPoliticaListaDisparo,
} from "../src/lib/whatsapp/disparo-politica-lista.ts";

test("libera marketing quando todos os contatos possuem opt-in", () => {
  const resultado = validarPoliticaListaDisparo({
    categoria: "MARKETING",
    totalContatosFrios: 0,
    responsabilidadeListaFriaConfirmada: false,
  });

  assert.equal(resultado.ok, true);
});

test("bloqueia marketing quando existe contato de lista fria", () => {
  const resultado = validarPoliticaListaDisparo({
    categoria: "MARKETING",
    totalContatosFrios: 1,
    responsabilidadeListaFriaConfirmada: true,
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.code, CODIGO_MARKETING_LISTA_FRIA_BLOQUEADO);
});

test("exige responsabilidade para utility com lista fria", () => {
  const resultado = validarPoliticaListaDisparo({
    categoria: "UTILITY",
    totalContatosFrios: 2,
    responsabilidadeListaFriaConfirmada: false,
  });

  assert.equal(resultado.ok, false);
  assert.equal(
    resultado.code,
    CODIGO_CONFIRMACAO_LISTA_FRIA_OBRIGATORIA
  );
});

test("libera utility com lista fria após confirmação de responsabilidade", () => {
  const resultado = validarPoliticaListaDisparo({
    categoria: "UTILITY",
    totalContatosFrios: 2,
    responsabilidadeListaFriaConfirmada: true,
  });

  assert.equal(resultado.ok, true);
});
