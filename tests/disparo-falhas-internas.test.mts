import assert from "node:assert/strict";
import test from "node:test";

import { diagnosticarFalhaInternaDisparo } from "../src/lib/whatsapp/disparo-falhas-internas.ts";

test("mostra a variável e o campo que não recebeu valor", () => {
  const diagnostico = diagnosticarFalhaInternaDisparo(
    "Template agendado com variaveis obrigatorias sem valor: corpo {{1}} (campo_contato)."
  );

  assert.equal(diagnostico?.nome, "Variável obrigatória sem valor");
  assert.match(diagnostico?.resumo || "", /corpo \{\{1\}\} \(campo_contato\)/);
  assert.match(diagnostico?.significado || "", /não chegou à Meta/);
  assert.match(diagnostico?.acao || "", /"nome" no lugar de "campo_contato"/);
});

test("identifica várias variáveis obrigatórias e seus campos", () => {
  const diagnostico = diagnosticarFalhaInternaDisparo(
    "Template agendado com variaveis obrigatorias sem valor: cabecalho {{1}} (nome), corpo {{1}} (email)."
  );

  assert.equal(diagnostico?.nome, "Variáveis obrigatórias sem valor");
  assert.match(diagnostico?.resumo || "", /cabecalho \{\{1\}\} \(nome\)/);
  assert.match(diagnostico?.resumo || "", /corpo \{\{1\}\} \(email\)/);
});

test("não classifica outras falhas como ausência de variáveis", () => {
  assert.equal(diagnosticarFalhaInternaDisparo("Numero invalido."), null);
  assert.equal(diagnosticarFalhaInternaDisparo(null), null);
});
