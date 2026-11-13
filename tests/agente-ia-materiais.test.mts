import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizarMateriais, MAX_MATERIAIS_POR_VINCULO,
  materiaisDeConhecimento, materialAutorizadoPorConhecimento,
} from "../src/lib/agentes-ia/materiais-config.ts";

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
  const itens = Array.from({ length: MAX_MATERIAIS_POR_VINCULO + 15 }, (_, indice) => ({
    midia_id: "00000000-0000-4000-8000-" + String(indice).padStart(12, "0"),
    quando_enviar: "Quando solicitar",
  }));
  assert.equal(normalizarMateriais(itens).length, MAX_MATERIAIS_POR_VINCULO);
});

const CONHECIMENTO_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONHECIMENTO_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("mesma mídia pode pertencer a vários conhecimentos do mesmo agente",()=>{
  const materiais=normalizarMateriais([{
    midia_id: ID1,
    quando_enviar: "Após responder sobre orçamento",
    conhecimento_ids:[CONHECIMENTO_A,CONHECIMENTO_B,CONHECIMENTO_A],
  }]);
  assert.deepEqual(materiais[0].conhecimento_ids,[CONHECIMENTO_A,CONHECIMENTO_B]);
  assert.equal(materiaisDeConhecimento(materiais,CONHECIMENTO_A).length,1);
  assert.equal(materiaisDeConhecimento(materiais,CONHECIMENTO_B).length,1);
  assert.equal(materiaisDeConhecimento(materiais,ID2).length,0);
});

test("arquivo vinculado só está autorizado após consultar o conhecimento correspondente",()=>{
  const materiais=normalizarMateriais([
    {midia_id:ID1,quando_enviar:"Depois de responder",conhecimento_ids:[CONHECIMENTO_A]},
    {midia_id:ID2,quando_enviar:"Quando solicitarem o catálogo"},
  ]);
  assert.equal(materialAutorizadoPorConhecimento(materiais[0],new Set()),false);
  assert.equal(materialAutorizadoPorConhecimento(materiais[0],new Set([CONHECIMENTO_B])),false);
  assert.equal(materialAutorizadoPorConhecimento(materiais[0],new Set([CONHECIMENTO_A])),true);
  assert.equal(materialAutorizadoPorConhecimento(materiais[1],new Set()),true);
});
