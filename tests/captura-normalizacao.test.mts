import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizarTelefoneCapturado,
  validarCaptura,
} from "../src/lib/automacoes/captura-normalizacao.ts";

test("aceita e normaliza datas completas sem alterar a precisão", () => {
  const casos = [
    ["26/07/2026", "2026-07-26", "DD/MM/AAAA"],
    ["26/07/26", "2026-07-26", "DD/MM/AA"],
    ["2026-07-26", "2026-07-26", "AAAA-MM-DD"],
  ] as const;

  for (const [entrada, valorNormalizado, formato] of casos) {
    const resultado = validarCaptura("data", entrada);

    assert.equal(resultado.valido, true);
    assert.equal(resultado.valorLimpo, entrada);
    assert.equal(resultado.valorNormalizado, valorNormalizado);
    assert.equal(resultado.precisaoData, "completa");
    assert.equal(resultado.formatoData, formato);
  }
});

test("preserva a precisão de dia/mês e mês/ano", () => {
  const diaMes = validarCaptura("data", "01/12");
  assert.equal(diaMes.valido, true);
  assert.equal(diaMes.valorLimpo, "01/12");
  assert.equal(diaMes.valorNormalizado, "--12-01");
  assert.equal(diaMes.precisaoData, "dia_mes");
  assert.equal(diaMes.formatoData, "DD/MM");

  const mesAnoCurto = validarCaptura("data", "01/26");
  assert.equal(mesAnoCurto.valido, true);
  assert.equal(mesAnoCurto.valorLimpo, "01/26");
  assert.equal(mesAnoCurto.valorNormalizado, "2026-01");
  assert.equal(mesAnoCurto.precisaoData, "mes_ano");
  assert.equal(mesAnoCurto.formatoData, "MM/AA");

  const mesAnoCompleto = validarCaptura("data", "01/2012");
  assert.equal(mesAnoCompleto.valido, true);
  assert.equal(mesAnoCompleto.valorNormalizado, "2012-01");
  assert.equal(mesAnoCompleto.precisaoData, "mes_ano");
  assert.equal(mesAnoCompleto.formatoData, "MM/AAAA");
});

test("recusa datas e componentes inexistentes", () => {
  const invalidas = [
    "32/01/2026",
    "31/02/2026",
    "15/15",
    "13/2026",
    "00/26",
    "00/12",
    "2026-25-50",
    "29/02/2025",
  ];

  for (const entrada of invalidas) {
    assert.equal(
      validarCaptura("data", entrada).valido,
      false,
      `deveria recusar ${entrada}`
    );
  }
});

test("aceita 29 de fevereiro sem ano, preservando a data parcial", () => {
  const resultado = validarCaptura("data", "29/02");

  assert.equal(resultado.valido, true);
  assert.equal(resultado.valorNormalizado, "--02-29");
  assert.equal(resultado.precisaoData, "dia_mes");
});

test("normaliza e-mail, telefone, CPF, CNPJ e CEP para comparação", () => {
  const email = validarCaptura("email", "CLIENTE@EMAIL.COM");
  assert.equal(email.valido, true);
  assert.equal(email.valorNormalizado, "cliente@email.com");

  assert.equal(
    normalizarTelefoneCapturado("+55 (31) 97505-1275"),
    normalizarTelefoneCapturado("31975051275")
  );

  const telefone = validarCaptura("telefone", "+55 (31) 97505-1275");
  assert.equal(telefone.valido, true);
  assert.equal(telefone.valorNormalizado, "31975051275");

  const cpf = validarCaptura("cpf", "529.982.247-25");
  assert.equal(cpf.valido, true);
  assert.equal(cpf.valorNormalizado, "52998224725");

  const cnpj = validarCaptura("cnpj", "04.252.011/0001-10");
  assert.equal(cnpj.valido, true);
  assert.equal(cnpj.valorNormalizado, "04252011000110");
  assert.equal(validarCaptura("cnpj", "04.252.011/0001-11").valido, false);

  const cep = validarCaptura("cep", "30.130-110");
  assert.equal(cep.valido, true);
  assert.equal(cep.valorNormalizado, "30130110");
});

test("normaliza observações ignorando caixa e espaços extras", () => {
  const primeira = validarCaptura(
    "texto",
    "  Cliente   prefere atendimento pela MANHÃ. "
  );
  const repetida = validarCaptura(
    "texto",
    "cliente prefere atendimento pela manhã."
  );

  assert.equal(primeira.valido, true);
  assert.equal(primeira.valorNormalizado, repetida.valorNormalizado);
});
