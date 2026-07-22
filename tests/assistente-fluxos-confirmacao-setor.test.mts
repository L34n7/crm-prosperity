import assert from "node:assert/strict";
import test from "node:test";

import { normalizarPlanoAssistente } from "../src/lib/automacoes/assistente-fluxos-base.ts";
import { compilarPlanoAssistente } from "../src/lib/automacoes/assistente-fluxos-compilador-seguro.ts";
import {
  aplicarRespostaPerguntaAssistente,
  criarPerguntasAssistenteFluxo,
} from "../src/lib/automacoes/assistente-fluxos-conversa.ts";

test("confirma setor com o assunto da transferencia direta e por excesso", () => {
  const plano = normalizarPlanoAssistente({
    nome_fluxo: "Clínica",
    etapas: [
      { ref: "inicio", tipo: "inicio", opcoes: [] },
      {
        ref: "menu",
        tipo: "pergunta_opcoes",
        titulo: "Menu Principal",
        mensagem: "Qual assunto deseja tratar?",
        opcoes: [{ id: "especialista", texto: "Harmonização Facial" }],
      },
      {
        ref: "handoff",
        tipo: "transferir",
        titulo: "Falar com especialista",
        opcoes: [],
      },
    ],
    rotas: [
      { origem: "inicio", destino: "menu", condicao: "sempre" },
      {
        origem: "menu",
        destino: "handoff",
        condicao: "resposta_contem",
        valor: "especialista",
        rotulo: "Harmonização Facial",
      },
    ],
    clarificacoes: [],
    mensagens_revisadas: [],
    variaveis_sugeridas: [],
    avisos: [],
  });
  const setores = [
    { id: "estetica", nome: "Estética" },
    { id: "recepcao", nome: "Recepção" },
  ];
  const perguntas = criarPerguntasAssistenteFluxo({
    plano,
    setores,
    midias: [],
  });

  assert.deepEqual(
    perguntas.map((pergunta) => pergunta.id),
    ["setor:handoff", "setor_excesso:menu"]
  );
  assert.equal(
    perguntas[0].mensagem.includes("Menu Principal → Harmonização Facial"),
    true
  );
  assert.equal(perguntas[1].mensagem.includes("exceder as tentativas"), true);
  assert.equal(
    perguntas[1].mensagem.includes("Início → Menu Principal"),
    true
  );

  const aplicada = aplicarRespostaPerguntaAssistente({
    plano,
    pergunta: perguntas[1],
    resposta: "recepcao",
    setores,
    midias: [],
  });
  const compilacao = compilarPlanoAssistente({
    modo: "criar_fluxo",
    plano: aplicada.plano,
    setores,
  });
  const menu = compilacao.nos.find((no) => no.titulo === "Menu Principal");
  assert.equal(menu?.configuracao_json.setor_excesso_tentativas, "recepcao");
});
