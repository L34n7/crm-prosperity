import assert from "node:assert/strict";
import test from "node:test";
import { calculateCoexistenceHistoryProgress } from "../src/lib/whatsapp/coexistence-history-state.ts";

test("não conclui o histórico antes da Meta finalizar os chunks", () => {
  const result = calculateCoexistenceHistoryProgress({
    total: 100,
    processed: 100,
    fatalErrors: 0,
    metaCompleted: false,
  });

  assert.equal(result.status, "processando");
  assert.equal(result.processingProgress, 100);
});

test("conclui apenas quando Meta e fila terminaram", () => {
  const result = calculateCoexistenceHistoryProgress({
    total: 100,
    processed: 100,
    fatalErrors: 0,
    metaCompleted: true,
  });

  assert.equal(result.status, "concluido");
  assert.equal(result.completed, true);
});

test("mantém processamento enquanto há itens pendentes", () => {
  const result = calculateCoexistenceHistoryProgress({
    total: 100,
    processed: 40,
    fatalErrors: 0,
    metaCompleted: true,
  });

  assert.equal(result.status, "processando");
  assert.equal(result.processingProgress, 40);
});

test("encerra com erro quando restam falhas sem retry", () => {
  const result = calculateCoexistenceHistoryProgress({
    total: 100,
    processed: 98,
    fatalErrors: 2,
    metaCompleted: true,
  });

  assert.equal(result.status, "erro");
  assert.equal(result.failed, true);
});
