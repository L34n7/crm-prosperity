import assert from "node:assert/strict";
import test from "node:test";
import { normalizarMateriais, MAX_MATERIAIS_POR_VINCULO } from "../src/lib/agentes-ia/materiais-config.ts";

const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";

test("normaliza vínculos e preserva a regra declarativa", () => {
  assert.deepEqual(normalizarMateriais([
    { midia_id: ID1, quando_enviar: "  Mostrar  demonstração " },
    { midia_id: ID2, quando_enviar: "  Tutorial de cadastro" },
  ]), [
    { midia_id: ID1, quando_enviar: "Mostrar demonstração" },
    { midia_id: ID2, quando_enviar: "Tutorial de cadastro" },
  ]);
});

test("não aceita IDs arbitrários, itens repetidos nem regras vazias", () => {
  assert.deepEqual(normalizarMateriais([
    { midia_id: "/outro-cliente.mp4", quando_enviar: "Enviar" },
    { midia_id: ID1, quando_enviar: "" },
    { midia_id: ID1, quando_enviar: "Quando necessário" },
    { midia_id: ID1, quando_enviar: "Repetido" },
  ]), [{ midia_id: ID1, quando_enviar: "Quando necessário" }]);
});

test("respeita o limite para não estourar o contexto", () => {
  const itens = Array.from({ length: 25 }, (_, indice) => ({
    midia_id: "00000000-0000-4000-8000-" + String(indice).padStart(12, "0"),
    quando_enviar: "Quando solicitar",
  }));
  assert.equal(normalizarMateriais(itens).length, MAX_MATERIAIS_POR_VINCULO);
});
