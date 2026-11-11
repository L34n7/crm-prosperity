import assert from "node:assert/strict";
import test from "node:test";
import {
  calcularDelayDinamicoMs,
  calcularDelayEnvioBalaoMs,
  ACRESCIMO_DELAY_ENTRE_BALOES_MS,
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
  assert.equal(LIMITE_DELAY_TOTAL_POR_RESPOSTA_MS, 9000);
});

test("primeiro balão mantém seu tempo original, mesmo em resposta longa", () => {
  const texto = "O CRM reúne atendimento, automações, IA e histórico para que a equipe acompanhe as oportunidades.";
  const antes = Math.min(calcularDelayDinamicoMs(texto, ligado), LIMITE_DELAY_PRIMEIRO_BALAO_MS);
  assert.equal(calcularDelayEnvioBalaoMs(texto, ligado, 0, 0), antes);
});

test("segundo balão ganha 1,5s; respostas com um balão não ficam mais lentas", () => {
  const texto = "A automação do CRM atende o contato, registra o histórico e encaminha o interessado para a equipe.";
  const baseMs = calcularDelayDinamicoMs(texto, ligado);
  assert.equal(ACRESCIMO_DELAY_ENTRE_BALOES_MS, 1500);
  assert.equal(calcularDelayEnvioBalaoMs(texto, ligado, 1, 1200), baseMs + 1500);
  assert.equal(calcularDelayEnvioBalaoMs(texto, ligado, 0, 0), Math.min(baseMs, 1200));
  assert.equal(calcularDelayEnvioBalaoMs(texto, { ativo: false }, 1, 0), 0);
});

test("somatório de atrasos respeita o teto de 9s", () => {
  const longo = "Informações detalhadas sobre as funcionalidades e integrações do CRM. ".repeat(30);
  const d1 = calcularDelayEnvioBalaoMs(longo, ligado, 0, 0);
  const d2 = calcularDelayEnvioBalaoMs(longo, ligado, 1, d1);
  const d3 = calcularDelayEnvioBalaoMs(longo, ligado, 2, d1+d2);
  const d4 = calcularDelayEnvioBalaoMs(longo, ligado, 3, d1+d2+d3);
  assert.equal(d1+d2+d3+d4, LIMITE_DELAY_TOTAL_POR_RESPOSTA_MS);
});
