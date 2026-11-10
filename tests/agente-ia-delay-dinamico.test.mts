import assert from "node:assert/strict";
import test from "node:test";
import {
  calcularDelayDinamicoMs,
  normalizarDelayDinamico,
} from "../src/lib/agentes-ia/delay-dinamico.ts";

test("desativado por padrão e sem atrasar mensagem", () => {
  assert.equal(normalizarDelayDinamico(null).ativo, false);
  assert.equal(calcularDelayDinamicoMs("Uma mensagem de teste", null), 0);
});

test("calcula o delay por palavra e antes do primeiro balão", () => {
  const config = { ativo: true, unidade: "palavras", quantidade: 10, segundos_por_bloco: 1, minimo_segundos: 0.5, maximo_segundos: 6 };
  assert.equal(calcularDelayDinamicoMs("um dois três quatro cinco seis sete oito nove dez", config), 1000);
  assert.equal(calcularDelayDinamicoMs("oi", config), 500);
  assert.equal(calcularDelayDinamicoMs("palavra ".repeat(100), config), 6000);
});

test("calcula por caracteres unicode e respeita mínimo e máximo", () => {
  const config = { ativo: true, unidade: "caracteres", quantidade: 4, segundos_por_bloco: 1, minimo_segundos: 0, maximo_segundos: 2 };
  assert.equal(calcularDelayDinamicoMs("Olá!", config), 1000);
  assert.equal(calcularDelayDinamicoMs("😀😀😀😀", config), 1000);
  assert.equal(calcularDelayDinamicoMs("123456789012", config), 2000);
});

test("normaliza valores maliciosos e extremos sem atraso ilimitado", () => {
  const config = normalizarDelayDinamico({
    ativo: true, unidade: "caracteres", quantidade: 0, segundos_por_bloco: Infinity,
    minimo_segundos: -10, maximo_segundos: 999,
  });
  assert.equal(config.quantidade, 1);
  assert.equal(config.maximo_segundos, 8);
  assert.equal(calcularDelayDinamicoMs("abcdef", config), 6000);
  assert.equal(calcularDelayDinamicoMs("  ", config), 0);
});
