import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizarEstrategiaTransferenciaAtendente,
  selecionarAtendenteTransferencia,
} from "../src/lib/conversas/estrategia-transferencia.ts";

const candidatos = [
  { id: "a", nome: "Ana", cargaAtual: 4 },
  { id: "b", nome: "Bruno", cargaAtual: 1 },
  { id: "c", nome: "Carla", cargaAtual: 1 },
];

test("mantem compatibilidade com configuracao antiga", () => {
  assert.equal(
    normalizarEstrategiaTransferenciaAtendente(undefined, undefined),
    "fila_setor"
  );
  assert.equal(
    normalizarEstrategiaTransferenciaAtendente(undefined, "b"),
    "atendente_especifico"
  );
});

test("seleciona somente o atendente especifico valido", () => {
  assert.equal(
    selecionarAtendenteTransferencia({
      estrategia: "atendente_especifico",
      candidatos,
      atendenteId: "b",
    })?.id,
    "b"
  );
  assert.equal(
    selecionarAtendenteTransferencia({
      estrategia: "atendente_especifico",
      candidatos,
      atendenteId: "inexistente",
    }),
    null
  );
});

test("rodizio aleatorio usa apenas candidatos disponiveis", () => {
  assert.equal(
    selecionarAtendenteTransferencia({
      estrategia: "rodizio_aleatorio",
      candidatos,
      random: () => 0.8,
    })?.id,
    "c"
  );
});

test("menos conversas escolhe a menor carga e desempata aleatoriamente", () => {
  assert.equal(
    selecionarAtendenteTransferencia({
      estrategia: "menos_conversas",
      candidatos,
      random: () => 0,
    })?.id,
    "b"
  );
  assert.equal(
    selecionarAtendenteTransferencia({
      estrategia: "menos_conversas",
      candidatos,
      random: () => 0.9,
    })?.id,
    "c"
  );
});

test("fila do setor nao atribui responsavel", () => {
  assert.equal(
    selecionarAtendenteTransferencia({
      estrategia: "fila_setor",
      candidatos,
    }),
    null
  );
});
