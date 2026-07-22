import assert from "node:assert/strict";
import test from "node:test";

import {
  aplicarTextosOtimizados,
  criarPayloadOtimizacaoTextos,
  criarPayloadPlanejamento,
  devePlanejarJornada,
  injetarPlanejamentoNoPayload,
  type RequisitosNormalizadosFluxo,
} from "../src/app/api/automacoes/assistente/gerar/route-planejamento-ia.ts";
import { extrairTextoSaida } from "../src/app/api/automacoes/assistente/gerar/route-validacao-ia.ts";

const contexto = {
  ativo: true as const,
  modo: "criar_fluxo",
  instrucaoCompleta: "Crie um fluxo para uma padaria vender paes e bolos.",
  agendas: [],
};

const body = {
  model: "modelo-teste",
  input: [
    { role: "system", content: "Planeje um fluxo." },
    {
      role: "user",
      content: JSON.stringify({
        modo: "criar_fluxo",
        instrucao: contexto.instrucaoCompleta,
        empresa: { nome_fantasia: "Padaria dos Sonhos" },
        recursos: {},
      }),
    },
  ],
};

const requisitos: RequisitosNormalizadosFluxo = {
  negocio: {
    segmento: "padaria",
    empresa: "Padaria dos Sonhos",
    publico: "clientes locais",
    oferta: "paes e bolos",
  },
  comunicacao: {
    tom: "acolhedor",
    linguagem: "simples e natural",
    termos_relevantes: ["fresquinho", "pedido"],
    restricoes: [],
  },
  objetivo_principal: "receber pedidos",
  conversao_esperada: "pedido confirmado",
  inicio: ["boas-vindas", "apresentacao", "menu de produtos"],
  jornada: [
    {
      id: "menu_produtos",
      titulo: "Produtos",
      proposito: "ajudar o cliente a escolher",
      ordem_conteudo: ["apresentar categorias", "pedir escolha"],
      opcoes: [
        { texto: "Pães", intencao: "ver pães", destino: "catalogo_paes" },
      ],
      proximo: null,
    },
  ],
  ramos: [
    {
      id: "pao",
      entrada: "Pao",
      objetivo: "definir quantidade",
      passos: ["perguntar quantidade", "confirmar item"],
      saidas: ["continuar comprando", "encerrar"],
    },
  ],
  finais_permitidos: ["pedido confirmado", "encerramento"],
  adaptacoes_crm: [],
  ambiguidades_essenciais: [],
  criterios_qualidade: ["cada produto leva ao catálogo correspondente"],
};

test("planejamento antecede somente a geracao principal de criar fluxo", () => {
  assert.equal(devePlanejarJornada(body, contexto), true);
  assert.equal(
    devePlanejarJornada(
      {
        ...body,
        input: [
          body.input[0],
          {
            role: "user",
            content: JSON.stringify({
              contexto_original: {},
              plano_invalido: {},
            }),
          },
        ],
      },
      contexto
    ),
    false
  );

  const payload = criarPayloadPlanejamento({ body, contexto });
  assert.match(String(payload.input[0].content), /inicio, meio e fim/i);
  assert.match(String(payload.input[0].content), /cada escolha/i);
  assert.match(String(payload.input[0].content), /nao e o objetivo/i);
  assert.match(String(payload.input[0].content), /especialista do nicho/i);
});

test("requisitos normalizados entram no contexto sem substituir o pedido", () => {
  const payload = injetarPlanejamentoNoPayload(body, requisitos);
  const input = payload.input as Array<{ content: string }>;
  const usuario = input[1];
  const conteudo = JSON.parse(usuario.content);

  assert.equal(conteudo.instrucao, contexto.instrucaoCompleta);
  assert.equal(
    conteudo.requisitos_normalizados.objetivo_principal,
    "receber pedidos"
  );
  assert.match(String(input[0].content), /como contrato/i);
  assert.match(String(input[0].content), /nao dependa de uma revisao posterior/i);
});

test("otimizacao altera apenas mensagens de refs existentes", () => {
  const plano = {
    etapas: [
      {
        ref: "boas_vindas",
        tipo: "mensagem",
        titulo: "Boas-vindas",
        mensagem: "Ola.",
        opcoes: [],
      },
      {
        ref: "menu",
        tipo: "pergunta_botoes",
        titulo: "Produtos",
        mensagem: "Ola, {{nome_cliente}}. Escolha.",
        opcoes: [{ id: "pao", texto: "Pao" }],
      },
    ],
    rotas: [
      {
        origem: "boas_vindas",
        destino: "menu",
        condicao: "sempre",
      },
    ],
  };
  const respostaPlano = { output_text: JSON.stringify(plano) };
  const respostaTextos = {
    output_text: JSON.stringify({
      mensagens: [
        {
          ref: "boas_vindas",
          mensagem: "Oi! Que bom receber voce por aqui.",
        },
        { ref: "inexistente", mensagem: "Nao deve entrar." },
        { ref: "menu", mensagem: "Escolha um produto." },
      ],
    }),
  };

  aplicarTextosOtimizados(respostaPlano, respostaTextos);
  const resultado = JSON.parse(extrairTextoSaida(respostaPlano));

  assert.equal(resultado.etapas.length, 2);
  assert.deepEqual(resultado.rotas, plano.rotas);
  assert.equal(
    resultado.etapas[0].mensagem,
    "Oi! Que bom receber voce por aqui."
  );
  assert.equal(
    resultado.etapas[1].mensagem,
    "Ola, {{nome_cliente}}. Escolha."
  );

  const payloadCopy = criarPayloadOtimizacaoTextos({
    body,
    plano,
    requisitos,
  });
  assert.match(String(payloadCopy.input[0].content), /maior conversao/i);
  assert.match(String(payloadCopy.input[0].content), /pessoa atenciosa/i);
});
