import assert from "node:assert/strict";
import test from "node:test";
import {
  montarOpcoesFiltrosCatalogo,
  normalizarIntervalo,
  obterOrdenacaoCatalogo,
  sanitizarTextoFiltro,
} from "../src/lib/imoveis/catalogo-filtros.ts";

test("preserva tipos reais com espaços e acentos", () => {
  assert.equal(
    sanitizarTextoFiltro("  Cobertura Duplex  "),
    "Cobertura Duplex",
  );
  assert.equal(
    sanitizarTextoFiltro("Área Privativa / Garden"),
    "Área Privativa / Garden",
  );
});

test("remove curingas de filtros exatos", () => {
  assert.equal(sanitizarTextoFiltro("Casa%_Geminada"), "Casa Geminada");
});

test("corrige intervalos invertidos", () => {
  assert.deepEqual(normalizarIntervalo(900_000, 300_000), {
    minimo: 300_000,
    maximo: 900_000,
  });
  assert.deepEqual(normalizarIntervalo(50, null), { minimo: 50, maximo: null });
});

test("monta opções apenas com valores existentes e suas quantidades", () => {
  const opcoes = montarOpcoesFiltrosCatalogo([
    {
      origem_tipo: "externo",
      tipo: "Casa Duplex",
      finalidade: "venda",
      status: "disponivel",
      cidade: "Contagem",
      estado: "MG",
    },
    {
      origem_tipo: "externo",
      tipo: "Casa Duplex",
      finalidade: "venda",
      status: "indisponivel",
      cidade: "Contagem",
      estado: "MG",
    },
  ]);

  assert.deepEqual(opcoes.tipos, [{ valor: "Casa Duplex", total: 2 }]);
  assert.deepEqual(opcoes.status, [
    { valor: "disponivel", total: 1 },
    { valor: "indisponivel", total: 1 },
  ]);
});

test("ordena maior área no banco antes da paginação", () => {
  assert.deepEqual(obterOrdenacaoCatalogo("area_desc"), [
    { campo: "area_m2", ascending: false, nullsFirst: false },
    { campo: "catalogo_id", ascending: true },
  ]);
});

test("ordena A–Z pela chave de título sem formatação inicial", () => {
  assert.deepEqual(obterOrdenacaoCatalogo("titulo_asc"), [
    { campo: "titulo_ordenacao", ascending: true },
    { campo: "catalogo_id", ascending: true },
  ]);
});
