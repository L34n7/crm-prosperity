import assert from "node:assert/strict";
import test from "node:test";

import { validarFluxoAssistente } from "../src/lib/automacoes/assistente-fluxos.ts";

const nos = [
  {
    id: "inicio",
    tipo_no: "inicio",
    titulo: "Inicio",
    descricao: null,
    posicao_x: 0,
    posicao_y: 0,
    configuracao_json: {},
    delay_segundos: null,
  },
  {
    id: "imagem",
    tipo_no: "enviar_imagem",
    titulo: "Imagem importada",
    descricao: null,
    posicao_x: 360,
    posicao_y: 0,
    configuracao_json: {},
    delay_segundos: 0,
  },
  {
    id: "fim",
    tipo_no: "encerrar",
    titulo: "Encerrar",
    descricao: null,
    posicao_x: 720,
    posicao_y: 0,
    configuracao_json: {},
    delay_segundos: 0,
  },
];

const conexoes = [
  {
    id: "inicio-imagem",
    no_origem_id: "inicio",
    no_destino_id: "imagem",
    rotulo: null,
    ordem: 1,
    condicao_json: { tipo: "sempre" },
  },
  {
    id: "imagem-fim",
    no_origem_id: "imagem",
    no_destino_id: "fim",
    rotulo: null,
    ordem: 2,
    condicao_json: { tipo: "sempre" },
  },
];

test("permite importar rascunho compartilhado sem a midia original", () => {
  const validacao = validarFluxoAssistente({
    nos,
    conexoes,
    setores: [],
  });

  assert.equal(validacao.valido, true);
  assert.deepEqual(validacao.erros, []);
  assert.ok(validacao.avisos.some((aviso) => aviso.codigo === "MIDIA_AUSENTE"));
});

test("mantem validacao estrita fora da importacao compartilhada", () => {
  const validacao = validarFluxoAssistente({
    nos,
    conexoes,
    setores: [],
    variaveis: [],
    midias: [],
  });

  assert.equal(validacao.valido, false);
  assert.ok(validacao.erros.some((erro) => erro.codigo === "MIDIA_AUSENTE"));
});
