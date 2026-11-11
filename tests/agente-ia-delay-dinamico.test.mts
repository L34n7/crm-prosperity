import assert from "node:assert/strict";
import test from "node:test";
import {
  calcularDelayDinamicoMs,
  normalizarDelayDinamico,
  LIMITE_DELAY_TOTAL_POR_RESPOSTA_MS,
  LIMITE_DELAY_PRIMEIRO_BALAO_MS,
} from "../src/lib/agentes-ia/delay-dinamico.ts";

const ligado = { ativo: true };

test("inativo por padrão; config antigas só preservam a ativação", () => {
  assert.deepEqual(normalizarDelayDinamico(null), { ativo: false });
  assert.deepEqual(normalizarDelayDinamico({ ativo: true, unidade: "palavras", maximo_segundos: 50 }), { ativo: true });
  assert.equal(calcularDelayDinamicoMs("Olá, tudo bem?", null), 0);
  assert.equal(calcularDelayDinamicoMs(" ", ligado), 0);
});

test("faixas por caracteres produzem atrasos curtos e progressivos", () => {
  for (const [tamanho, menor, maior] of [
    [20, 500, 800],
    [60, 500, 800],
    [61, 900, 1300],
    [150, 900, 1300],
    [151, 1400, 2000],
    [300, 1400, 2000],
    [301, 2100, 2600],
    [20000, 2100, 2600],
  ] as const) {
    const valor = calcularDelayDinamicoMs("a".repeat(tamanho), ligado);
    assert.ok(valor >= menor && valor <= maior, `${tamanho} caracteres: ${valor}ms`);
  }
});

test("delay é estável para a mesma mensagem e suporta Unicode", () => {
  const texto = "Olá! 😀 A plataforma ajuda seu time a atender.";
  assert.equal(calcularDelayDinamicoMs(texto, ligado), calcularDelayDinamicoMs(texto, ligado));
  assert.ok(calcularDelayDinamicoMs("😀".repeat(70), ligado) >= 900);
});

test("limites por primeiro balão e por resposta evitam esperas longas", () => {
  assert.equal(LIMITE_DELAY_PRIMEIRO_BALAO_MS, 1200);
  assert.equal(LIMITE_DELAY_TOTAL_POR_RESPOSTA_MS, 5000);
});
