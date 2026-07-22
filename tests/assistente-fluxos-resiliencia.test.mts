import assert from "node:assert/strict";
import test from "node:test";

import { prepararPayloadAssistente } from "../src/app/api/automacoes/assistente/gerar/route-contexto-ia.ts";
import { problemasReparaveisPeloCompilador } from "../src/app/api/automacoes/assistente/gerar/route-politica-reparo.ts";

function payloadBaseAssistente() {
  return {
    input: [
      { role: "system", content: "Instrucoes base." },
      {
        role: "user",
        content: JSON.stringify({ instrucao: "Criar fluxo", recursos: {} }),
      },
    ],
    text: {
      format: {
        schema: {
          properties: {
            etapas: {
              items: {
                properties: { tipo: { enum: [] } },
                required: [],
              },
            },
          },
        },
      },
    },
  };
}

const contexto = {
  ativo: true as const,
  modo: "criar_fluxo",
  instrucaoCompleta: "Criar fluxo completo",
  agendas: [],
};

function instrucaoSistema(payload: Record<string, unknown>) {
  return String(
    (payload.input as Array<{ role: string; content: string }>)[0].content
  );
}

test("correcao estrutural preserva o rascunho integral anterior", () => {
  const rascunho = '{"etapas":[{"ref":"inicio"}],"rotas":[]}';
  const sistema = instrucaoSistema(
    prepararPayloadAssistente({
      body: payloadBaseAssistente(),
      limite: 22000,
      repetir: true,
      fase: "estrutura",
      problemas: ["O Menu Principal nao esta conectado."],
      rascunhoAnterior: rascunho,
      contexto,
    })
  );

  assert.match(sistema, /fase de correcao estrutural/i);
  assert.match(sistema, /Nao recomecar do zero/i);
  assert.ok(sistema.includes(rascunho));
  assert.match(sistema, /Menu Principal nao esta conectado/);
});

test("revisao final recebe o plano corrigido e somente as pendencias restantes", () => {
  const rascunho =
    '{"etapas":[{"ref":"inicio"},{"ref":"menu"}],"rotas":[{"origem":"inicio","destino":"menu"}]}';
  const sistema = instrucaoSistema(
    prepararPayloadAssistente({
      body: payloadBaseAssistente(),
      limite: 22000,
      repetir: true,
      fase: "revisao",
      problemas: ['A opcao "Agendar" precisa ter uma rota.'],
      rascunhoAnterior: rascunho,
      contexto,
    })
  );

  assert.match(sistema, /fase de revisao final/i);
  assert.match(sistema, /altere somente o necessario/i);
  assert.ok(sistema.includes(rascunho));
  assert.match(sistema, /opcao "Agendar" precisa ter uma rota/);
});

test("problemas topologicos reparaveis nao provocam outra reescrita completa pela IA", () => {
  assert.equal(
    problemasReparaveisPeloCompilador([
      "A rota antes_e_depois_agendar -> agendar_avaliacao referencia um bloco inexistente.",
      'O bloco "Menu Principal" nao esta conectado ao fluxo.',
      'O bloco "Harmonizacao Facial" nao esta conectado ao fluxo.',
      'A opcao "Antes e Depois" do bloco "Menu Principal" precisa ter uma rota.',
    ]),
    true
  );
});

test("problemas de conteudo continuam exigindo correcao pela IA", () => {
  assert.equal(
    problemasReparaveisPeloCompilador([
      'O bloco "Menu Principal" nao esta conectado ao fluxo.',
      'O menu do procedimento "Botox" omitiu: Duvidas Frequentes.',
    ]),
    false
  );
});
