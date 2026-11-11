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
    [20, 800, 1300],
    [60, 800, 1300],
    [61, 1600, 2800],
    [150, 1600, 2800],
    [151, 3300, 5200],
    [300, 3300, 5200],
    [301, 5400, 7000],
    [20000, 5400, 7000],
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
  assert.equal(LIMITE_DELAY_PRIMEIRO_BALAO_MS, 7000);
  assert.equal(LIMITE_DELAY_TOTAL_POR_RESPOSTA_MS, 40000);
});

test("primeiro balão tem atraso próprio pelo tamanho, sem corte de 1,2s", () => {
  const texto = "O CRM reúne atendimento, automações, IA e histórico para que a equipe acompanhe as oportunidades.";
  const antes = Math.min(calcularDelayDinamicoMs(texto, ligado), LIMITE_DELAY_PRIMEIRO_BALAO_MS);
  assert.equal(calcularDelayEnvioBalaoMs(texto, ligado, 0, 0), antes);
});

test("cada balão seguinte usa o próprio tamanho, com pausas maiores", () => {
  const textoLongo = "a".repeat(244);
  const textoCurto = "b".repeat(111);
  const segundo = calcularDelayEnvioBalaoMs(textoLongo, ligado, 1, 1200);
  const terceiro = calcularDelayEnvioBalaoMs(textoCurto, ligado, 2, 1200 + segundo);
  assert.ok(segundo >= 9200 && segundo <= 12500, `segundo: ${segundo}`);
  assert.ok(terceiro >= 6500 && terceiro <= 8700, `terceiro: ${terceiro}`);
  assert.ok(segundo > terceiro + 1000);
  assert.equal(calcularDelayEnvioBalaoMs(textoCurto, { ativo: false }, 2, 0), 0);
  assert.equal(calcularDelayEnvioBalaoMs(textoCurto, ligado, 0, 0), Math.min(calcularDelayDinamicoMs(textoCurto, ligado), LIMITE_DELAY_PRIMEIRO_BALAO_MS));
});

test("pausas entre mensagens respeitam as quatro faixas por caracteres", () => {
  for (const [length, min, max] of [
    [20, 4500, 5800],
    [60, 4500, 5800],
    [61, 6500, 8700],
    [150, 6500, 8700],
    [151, 9200, 12500],
    [300, 9200, 12500],
    [301, 12800, 16000],
    [10000, 12800, 16000],
  ] as const) {
    const atual = calcularDelayEnvioBalaoMs("x".repeat(length), ligado, 1, 0);
    assert.ok(atual >= min && atual <= max, `${length} caracteres: ${atual}ms`);
  }
});

test("primeira mensagem curta preserva sua naturalidade anterior", () => {
  const curto = "Meu nome é Leandro, sou consultor de vendas.";
  assert.equal(calcularDelayEnvioBalaoMs(curto, ligado, 0, 0), calcularDelayDinamicoMs(curto, ligado));
});

test("o teto de 40s limita respostas com muitos balões sem encurtar três balões normais", () => {
  const textos = ["a".repeat(290), "b".repeat(244), "c".repeat(111)];
  let soma = 0;
  const intervalos = textos.map((item, i) => {
    const delay = calcularDelayEnvioBalaoMs(item, ligado, i, soma);
    soma += delay;
    return delay;
  });
  assert.ok(intervalos[1] >= 9200 && intervalos[2] >= 6500);
  assert.ok(soma < LIMITE_DELAY_TOTAL_POR_RESPOSTA_MS);
  for (let i = 0; i < 10; i++) {
    soma += calcularDelayEnvioBalaoMs("z".repeat(900), ligado, i + 3, soma);
  }
  assert.equal(soma, LIMITE_DELAY_TOTAL_POR_RESPOSTA_MS);
});

test("simulação do teste real: o segundo e o terceiro balão têm tempos diferentes e maiores", () => {
  const textos = ["a".repeat(219), "b".repeat(337), "c".repeat(99)];
  let acumulado = 0;
  const tempos = textos.map((texto, indice) => {
    const ms = calcularDelayEnvioBalaoMs(texto, ligado, indice, acumulado);
    acumulado += ms;
    return ms;
  });
  assert.ok(tempos[0] <= LIMITE_DELAY_PRIMEIRO_BALAO_MS);
  assert.ok(tempos[1] >= 12800 && tempos[1] <= 16000, `segundo balão: ${tempos[1]} ms`);
  assert.ok(tempos[2] >= 6500 && tempos[2] <= 8700, `terceiro balão: ${tempos[2]} ms`);
  assert.ok(tempos[1] > tempos[2]);
  assert.ok(acumulado < LIMITE_DELAY_TOTAL_POR_RESPOSTA_MS);
});

test("a primeira mensagem de 250–350 caracteres aguarda significativamente mais, mas preserva variação por tamanho", () => {
  const media = calcularDelayEnvioBalaoMs("m".repeat(250), ligado, 0, 0);
  const longa = calcularDelayEnvioBalaoMs("l".repeat(350), ligado, 0, 0);
  const curta = calcularDelayEnvioBalaoMs("o".repeat(45), ligado, 0, 0);
  assert.ok(media >= 3300 && media <= 5200, `primeiro médio: ${media}`);
  assert.ok(longa >= 5400 && longa <= 7000, `primeiro longo: ${longa}`);
  assert.ok(curta >= 800 && curta <= 1300, `primeiro curto: ${curta}`);
  assert.ok(longa > media && media > curta);
  const segundo = calcularDelayEnvioBalaoMs("s".repeat(337), ligado, 1, longa);
  const terceiro = calcularDelayEnvioBalaoMs("t".repeat(99), ligado, 2, longa + segundo);
  assert.ok(segundo >= 12800 && terceiro >= 6500);
  assert.ok(longa + segundo + terceiro < LIMITE_DELAY_TOTAL_POR_RESPOSTA_MS);
});
