import assert from "node:assert/strict";
import test from "node:test";
import {
  calcularDelayDinamicoMs,
  calcularDelayEnvioBalaoMs,
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
  assert.equal(LIMITE_DELAY_TOTAL_POR_RESPOSTA_MS, 24000);
});

test("primeiro balão mantém seu tempo original, mesmo em resposta longa", () => {
  const texto = "O CRM reúne atendimento, automações, IA e histórico para que a equipe acompanhe as oportunidades.";
  const antes = Math.min(calcularDelayDinamicoMs(texto, ligado), LIMITE_DELAY_PRIMEIRO_BALAO_MS);
  assert.equal(calcularDelayEnvioBalaoMs(texto, ligado, 0, 0), antes);
});

test("cada balão seguinte usa o próprio tamanho, com pausas maiores", () => {
  const textoLongo = "a".repeat(244);
  const textoCurto = "b".repeat(111);
  const segundo = calcularDelayEnvioBalaoMs(textoLongo, ligado, 1, 1200);
  const terceiro = calcularDelayEnvioBalaoMs(textoCurto, ligado, 2, 1200 + segundo);
  assert.ok(segundo >= 6100 && segundo <= 8200, `segundo: ${segundo}`);
  assert.ok(terceiro >= 4300 && terceiro <= 5800, `terceiro: ${terceiro}`);
  assert.ok(segundo > terceiro + 1000);
  assert.equal(calcularDelayEnvioBalaoMs(textoCurto, { ativo: false }, 2, 0), 0);
  assert.equal(calcularDelayEnvioBalaoMs(textoCurto, ligado, 0, 0), Math.min(calcularDelayDinamicoMs(textoCurto, ligado), LIMITE_DELAY_PRIMEIRO_BALAO_MS));
});

test("pausas entre mensagens respeitam as quatro faixas por caracteres", () => {
  for (const [length, min, max] of [
    [20, 3000, 3900],
    [60, 3000, 3900],
    [61, 4300, 5800],
    [150, 4300, 5800],
    [151, 6100, 8200],
    [300, 6100, 8200],
    [301, 8500, 10500],
    [10000, 8500, 10500],
  ] as const) {
    const atual = calcularDelayEnvioBalaoMs("x".repeat(length), ligado, 1, 0);
    assert.ok(atual >= min && atual <= max, `${length} caracteres: ${atual}ms`);
  }
});

test("primeira mensagem curta preserva sua naturalidade anterior", () => {
  const curto = "Meu nome é Leandro, sou consultor de vendas.";
  assert.equal(calcularDelayEnvioBalaoMs(curto, ligado, 0, 0), calcularDelayDinamicoMs(curto, ligado));
});

test("o teto de 24s limita respostas com muitos balões sem encurtar três balões normais", () => {
  const textos = ["a".repeat(290), "b".repeat(244), "c".repeat(111)];
  let soma = 0;
  const intervalos = textos.map((item, i) => {
    const delay = calcularDelayEnvioBalaoMs(item, ligado, i, soma);
    soma += delay;
    return delay;
  });
  assert.ok(intervalos[1] >= 6100 && intervalos[2] >= 4300);
  assert.ok(soma < LIMITE_DELAY_TOTAL_POR_RESPOSTA_MS);
  for (let i = 0; i < 10; i++) {
    soma += calcularDelayEnvioBalaoMs("z".repeat(900), ligado, i + 3, soma);
  }
  assert.equal(soma, LIMITE_DELAY_TOTAL_POR_RESPOSTA_MS);
});
