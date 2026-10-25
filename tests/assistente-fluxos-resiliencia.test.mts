import assert from "node:assert/strict";
import test from "node:test";

import { prepararPayloadAssistente } from "../src/app/api/automacoes/assistente/gerar/route-contexto-ia.ts";
import {
  deveExecutarRevisaoFinal,
  problemasReparaveisPeloCompilador,
} from "../src/app/api/automacoes/assistente/gerar/route-politica-reparo.ts";
import {
  aplicarClarificacaoAgendaJaResolvida,
} from "../src/app/api/automacoes/assistente/gerar/route-confirmar-agenda.ts";

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
  midias: [],
};

function instrucaoSistema(payload: Record<string, unknown>) {
  return String(
    (payload.input as Array<{ role: string; content: string }>)[0].content
  );
}

test("payload principal preserva o pedido e injeta o contrato atual", () => {
  const payload = prepararPayloadAssistente({
    body: payloadBaseAssistente(),
    limite: 22000,
    contexto,
  });

  const sistema = instrucaoSistema(payload);
  assert.match(sistema, /CONTRATO DESTA EXECUCAO/i);
  assert.match(sistema, /Planeje e revise internamente/i);

  const entradaUsuario = JSON.parse(
    String(
      (payload.input as Array<{ role: string; content: string }>).find(
        (item) => item.role === "user"
      )?.content || "{}"
    )
  );

  assert.equal(
    entradaUsuario.secao_solicitacao_usuario.texto,
    contexto.instrucaoCompleta
  );
  assert.deepEqual(
    entradaUsuario.secao_recursos_disponiveis.agendas,
    contexto.agendas
  );
  assert.deepEqual(
    entradaUsuario.secao_recursos_disponiveis.midias,
    contexto.midias
  );
});

test("payload principal expande o schema com campos operacionais de agenda", () => {
  const payload = prepararPayloadAssistente({
    body: payloadBaseAssistente(),
    limite: 22000,
    contexto,
  });

  const schema = (
    payload.text as {
      format: {
        schema: {
          properties: {
            etapas: {
              items: {
                properties: Record<string, { enum?: unknown[] }>;
                required: string[];
              };
            };
          };
        };
      };
    }
  ).format.schema;

  const etapa = schema.properties.etapas.items;
  assert.ok(etapa.properties.agenda_id);
  assert.ok(etapa.properties.estrategia_transferencia);
  assert.ok(etapa.required.includes("agenda_id"));
  assert.ok(etapa.required.includes("estrategia_transferencia"));
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

test("referencias duplicadas seguem para consolidacao deterministica", () => {
  assert.equal(
    problemasReparaveisPeloCompilador([
      "Existem etapas com referencias duplicadas: harmonizacao_facial_1_beneficios, harmonizacao_facial_1_cuidados.",
      'O bloco "harmonizacao_menu_2" nao esta conectado ao fluxo.',
      'A opcao "Dói?" do bloco "Dúvidas Frequentes" precisa ter uma rota.',
    ]),
    true
  );
});

test("reparo interno nao inicia uma terceira chamada que pode exceder o timeout", () => {
  assert.equal(deveExecutarRevisaoFinal(false), false);
  assert.equal(deveExecutarRevisaoFinal(true), false);
});

test("problemas de conteudo nao sao confundidos com reparos topologicos", () => {
  assert.equal(
    problemasReparaveisPeloCompilador([
      'O bloco "Menu Principal" nao esta conectado ao fluxo.',
      'O menu do procedimento "Botox" omitiu: Duvidas Frequentes.',
    ]),
    false
  );
});

test("confirmacao da agenda configurada preserva etapas e rotas do plano", () => {
  const plano = {
    nome_fluxo: "Clinica premium",
    objetivo: "Agendar avaliacao",
    resumo: "Atendimento com agenda fixa.",
    etapas: [
      {
        ref: "inicio",
        tipo: "inicio",
        titulo: "Inicio",
        mensagem: null,
        opcoes: [],
      },
      {
        ref: "escolher_horario",
        tipo: "agenda_escolher_horario",
        titulo: "Escolher horario",
        mensagem: "Qual horario voce prefere?",
        agenda_id: "agenda-1",
        agenda_nome: "Agenda fixa",
        opcoes: [],
      },
      {
        ref: "criar_agendamento",
        tipo: "agenda_criar_agendamento",
        titulo: "Criar agendamento",
        mensagem: "Horario confirmado.",
        agenda_id: "agenda-1",
        agenda_nome: "Agenda fixa",
        opcoes: [],
      },
    ],
    rotas: [
      {
        origem: "inicio",
        destino: "escolher_horario",
        condicao: "sempre",
      },
    ],
    clarificacoes: [
      {
        id: "clarificacao_agenda",
        pergunta: "Qual agenda deve ser usada para o agendamento?",
        tipo: "selecao",
        opcoes: [{ id: "agenda_fixa", texto: "Agenda fixa" }],
        valor_sugerido: "agenda-1",
        motivo: "Confirme a agenda.",
      },
    ],
    mensagens_revisadas: [],
    variaveis_sugeridas: [],
    avisos: [],
  };
  const resultado = aplicarClarificacaoAgendaJaResolvida({
    plano,
    pergunta: {
      id: "clarificacao:clarificacao_agenda",
      etapa_ref: "clarificacao_agenda",
      campo: "clarificacao",
      tipo: "selecao",
      mensagem: "Qual agenda deve ser usada para o agendamento?",
      ajuda: null,
      obrigatoria: true,
      bloqueada: false,
      valor_sugerido: "agenda-1",
      opcoes: [{ id: "agenda_fixa", label: "Agenda fixa", descricao: null }],
    },
    resposta: "agenda_fixa",
  });

  assert.ok(resultado);
  assert.equal(resultado.plano.etapas.length, plano.etapas.length);
  assert.deepEqual(resultado.plano.rotas, plano.rotas);
  assert.deepEqual(resultado.plano.clarificacoes, []);
  assert.equal(
    resultado.plano.etapas.find(
      (etapa) => etapa.tipo === "agenda_escolher_horario"
    )?.agenda_id,
    "agenda-1"
  );
});

test("escolha de outra agenda continua exigindo replanejamento", () => {
  const plano = {
    etapas: [
      {
        ref: "agenda",
        tipo: "agenda_escolher_horario",
        agenda_id: "agenda-1",
        agenda_nome: "Agenda atual",
        opcoes: [],
      },
    ],
    clarificacoes: [
      {
        id: "agenda",
        pergunta: "Qual agenda deve ser usada?",
        tipo: "selecao",
        opcoes: [
          { id: "atual", texto: "Agenda atual" },
          { id: "nova", texto: "Agenda nova" },
        ],
      },
    ],
    rotas: [],
    avisos: [],
  };

  const resultado = aplicarClarificacaoAgendaJaResolvida({
    plano,
    pergunta: {
      id: "clarificacao:agenda",
      etapa_ref: "agenda",
      campo: "clarificacao",
      tipo: "selecao",
      mensagem: "Qual agenda deve ser usada?",
      ajuda: null,
      obrigatoria: true,
      bloqueada: false,
      valor_sugerido: null,
      opcoes: [
        { id: "atual", label: "Agenda atual", descricao: null },
        { id: "nova", label: "Agenda nova", descricao: null },
      ],
    },
    resposta: "nova",
  });

  assert.equal(resultado, null);
});
