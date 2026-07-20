import assert from "node:assert/strict";
import test from "node:test";
import {
  compilarPlanoAssistente,
  normalizarPlanoAssistente,
} from "../src/lib/automacoes/assistente-fluxos.ts";

test("compila plano de criacao em nos e conexoes validos", () => {
  const plano = normalizarPlanoAssistente({
    nome_fluxo: "Atendimento comercial",
    objetivo: "Qualificar lead",
    resumo: "Fluxo simples de qualificacao.",
    etapas: [
      {
        ref: "inicio",
        tipo: "inicio",
        titulo: "Inicio",
        mensagem: null,
        variavel: null,
        tipo_captura: null,
        setor_id: null,
        setor_nome: null,
        resultado: null,
        opcoes: [],
      },
      {
        ref: "boas_vindas",
        tipo: "mensagem",
        titulo: "Boas-vindas",
        mensagem: "Ola! Vou te ajudar.",
        variavel: null,
        tipo_captura: null,
        setor_id: null,
        setor_nome: null,
        resultado: null,
        opcoes: [],
      },
      {
        ref: "interesse",
        tipo: "pergunta_botoes",
        titulo: "Interesse",
        mensagem: "Voce quer falar com comercial?",
        variavel: null,
        tipo_captura: null,
        setor_id: null,
        setor_nome: null,
        resultado: null,
        opcoes: [
          { id: "sim", texto: "Sim" },
          { id: "nao", texto: "Nao" },
        ],
      },
      {
        ref: "transferir",
        tipo: "transferir",
        titulo: "Transferir",
        mensagem: "Vou te encaminhar.",
        variavel: null,
        tipo_captura: null,
        setor_id: "setor-comercial",
        setor_nome: null,
        resultado: null,
        opcoes: [],
      },
      {
        ref: "encerrar",
        tipo: "encerrar",
        titulo: "Encerrar",
        mensagem: "Tudo bem. Encerramos por aqui.",
        variavel: null,
        tipo_captura: null,
        setor_id: null,
        setor_nome: null,
        resultado: "negativo",
        opcoes: [],
      },
    ],
    rotas: [
      {
        origem: "inicio",
        destino: "boas_vindas",
        condicao: "sempre",
        valor: null,
        rotulo: null,
        descricao_ia: null,
        timeout_segundos: null,
      },
      {
        origem: "boas_vindas",
        destino: "interesse",
        condicao: "sempre",
        valor: null,
        rotulo: null,
        descricao_ia: null,
        timeout_segundos: null,
      },
      {
        origem: "interesse",
        destino: "transferir",
        condicao: "resposta_contem",
        valor: "sim",
        rotulo: "Sim",
        descricao_ia: null,
        timeout_segundos: null,
      },
      {
        origem: "interesse",
        destino: "encerrar",
        condicao: "resposta_contem",
        valor: "nao",
        rotulo: "Nao",
        descricao_ia: null,
        timeout_segundos: null,
      },
    ],
    mensagens_revisadas: [],
    variaveis_sugeridas: [],
    avisos: [],
  });

  const resultado = compilarPlanoAssistente({
    modo: "criar_fluxo",
    plano,
    setores: [{ id: "setor-comercial", nome: "Comercial" }],
  });

  assert.equal(resultado.validacao.erros.length, 0);
  assert.equal(resultado.nos.filter((no) => no.tipo_no === "inicio").length, 1);
  assert.equal(resultado.conexoes.length, 4);

  const transferencia = resultado.nos.find(
    (no) => no.tipo_no === "transferir_setor"
  );

  assert.equal(transferencia?.configuracao_json.setor_id, "setor-comercial");
});

test("validador bloqueia quando opcao de pergunta nao possui rota", () => {
  const plano = normalizarPlanoAssistente({
    nome_fluxo: "Fluxo incompleto",
    objetivo: "Testar avisos",
    resumo: "Fluxo com uma opcao sem destino.",
    etapas: [
      {
        ref: "inicio",
        tipo: "inicio",
        titulo: null,
        mensagem: null,
        variavel: null,
        tipo_captura: null,
        setor_id: null,
        setor_nome: null,
        resultado: null,
        opcoes: [],
      },
      {
        ref: "pergunta",
        tipo: "pergunta_botoes",
        titulo: "Pergunta",
        mensagem: "Escolha uma opcao.",
        variavel: null,
        tipo_captura: null,
        setor_id: null,
        setor_nome: null,
        resultado: null,
        opcoes: [
          { id: "a", texto: "A" },
          { id: "b", texto: "B" },
        ],
      },
      {
        ref: "fim",
        tipo: "encerrar",
        titulo: "Fim",
        mensagem: "Finalizado.",
        variavel: null,
        tipo_captura: null,
        setor_id: null,
        setor_nome: null,
        resultado: "positivo",
        opcoes: [],
      },
    ],
    rotas: [
      {
        origem: "inicio",
        destino: "pergunta",
        condicao: "sempre",
        valor: null,
        rotulo: null,
        descricao_ia: null,
        timeout_segundos: null,
      },
      {
        origem: "pergunta",
        destino: "fim",
        condicao: "resposta_contem",
        valor: "a",
        rotulo: "A",
        descricao_ia: null,
        timeout_segundos: null,
      },
    ],
    mensagens_revisadas: [],
    variaveis_sugeridas: [],
    avisos: [],
  });

  const resultado = compilarPlanoAssistente({
    modo: "criar_fluxo",
    plano,
  });

  assert.equal(resultado.validacao.valido, false);
  assert.ok(
    resultado.validacao.erros.some(
      (erro) => erro.codigo === "OPCAO_SEM_ROTA"
    )
  );
});

test("validador bloqueia pergunta com rota duplicada e incondicional", () => {
  const plano = normalizarPlanoAssistente({
    nome_fluxo: "Fluxo ambiguo",
    objetivo: "Testar rotas ambiguas",
    resumo: "Pergunta com mais de uma saida para a mesma resposta.",
    etapas: [
      {
        ref: "inicio",
        tipo: "inicio",
        titulo: "Inicio",
        mensagem: null,
        variavel: null,
        tipo_captura: null,
        setor_id: null,
        setor_nome: null,
        resultado: null,
        opcoes: [],
      },
      {
        ref: "pergunta",
        tipo: "pergunta_opcoes",
        titulo: "Escolha",
        mensagem: "Escolha A ou B.",
        variavel: null,
        tipo_captura: null,
        setor_id: null,
        setor_nome: null,
        resultado: null,
        opcoes: [
          { id: "a", texto: "A" },
          { id: "b", texto: "B" },
        ],
      },
      {
        ref: "fim_a",
        tipo: "encerrar",
        titulo: "Fim A",
        mensagem: "Fim A.",
        variavel: null,
        tipo_captura: null,
        setor_id: null,
        setor_nome: null,
        resultado: "positivo",
        opcoes: [],
      },
      {
        ref: "fim_b",
        tipo: "encerrar",
        titulo: "Fim B",
        mensagem: "Fim B.",
        variavel: null,
        tipo_captura: null,
        setor_id: null,
        setor_nome: null,
        resultado: "positivo",
        opcoes: [],
      },
    ],
    rotas: [
      {
        origem: "inicio",
        destino: "pergunta",
        condicao: "sempre",
        valor: null,
        rotulo: null,
        descricao_ia: null,
        timeout_segundos: null,
      },
      {
        origem: "pergunta",
        destino: "fim_a",
        condicao: "resposta_contem",
        valor: "a",
        rotulo: "A",
        descricao_ia: null,
        timeout_segundos: null,
      },
      {
        origem: "pergunta",
        destino: "fim_b",
        condicao: "resposta_contem",
        valor: "a",
        rotulo: "A duplicada",
        descricao_ia: null,
        timeout_segundos: null,
      },
      {
        origem: "pergunta",
        destino: "fim_b",
        condicao: "sempre",
        valor: null,
        rotulo: "Sempre",
        descricao_ia: null,
        timeout_segundos: null,
      },
    ],
    mensagens_revisadas: [],
    variaveis_sugeridas: [],
    avisos: [],
  });

  const resultado = compilarPlanoAssistente({
    modo: "criar_fluxo",
    plano,
  });

  assert.equal(resultado.validacao.valido, false);
  assert.ok(
    resultado.validacao.erros.some(
      (erro) => erro.codigo === "OPCAO_COM_ROTAS_DUPLICADAS"
    )
  );
  assert.ok(
    resultado.validacao.erros.some(
      (erro) => erro.codigo === "PERGUNTA_COM_ROTA_INCONDICIONAL"
    )
  );
});

test("validador bloqueia bloco de mensagem desconectado", () => {
  const plano = normalizarPlanoAssistente({
    nome_fluxo: "Fluxo com saudacao orfa",
    objetivo: "Testar bloco desconectado",
    resumo: "O inicio pula a saudacao.",
    etapas: [
      {
        ref: "inicio",
        tipo: "inicio",
        titulo: "Inicio",
        mensagem: null,
        variavel: null,
        tipo_captura: null,
        setor_id: null,
        setor_nome: null,
        resultado: null,
        opcoes: [],
      },
      {
        ref: "saudacao",
        tipo: "mensagem",
        titulo: "Saudacao",
        mensagem: "Ola!",
        variavel: null,
        tipo_captura: null,
        setor_id: null,
        setor_nome: null,
        resultado: null,
        opcoes: [],
      },
      {
        ref: "fim",
        tipo: "encerrar",
        titulo: "Fim",
        mensagem: "Fim.",
        variavel: null,
        tipo_captura: null,
        setor_id: null,
        setor_nome: null,
        resultado: "positivo",
        opcoes: [],
      },
    ],
    rotas: [
      {
        origem: "inicio",
        destino: "fim",
        condicao: "sempre",
        valor: null,
        rotulo: null,
        descricao_ia: null,
        timeout_segundos: null,
      },
    ],
    mensagens_revisadas: [],
    variaveis_sugeridas: [],
    avisos: [],
  });

  const resultado = compilarPlanoAssistente({
    modo: "criar_fluxo",
    plano,
  });

  assert.equal(resultado.validacao.valido, false);
  assert.ok(
    resultado.validacao.erros.some(
      (erro) =>
        erro.codigo === "BLOCO_SEM_ENTRADA" &&
        erro.no_id ===
          resultado.nos.find((no) => no.titulo === "Saudacao")?.id
    )
  );
});

test("adicionar etapa substitui rotas antigas do bloco alterado", () => {
  const nosAtuais = [
    {
      id: "inicio-atual",
      tipo_no: "inicio",
      titulo: "Inicio",
      descricao: null,
      posicao_x: 0,
      posicao_y: 0,
      configuracao_json: {},
      delay_segundos: null,
    },
    {
      id: "renda-atual",
      tipo_no: "pergunta_opcoes",
      titulo: "Faixa de renda",
      descricao: null,
      posicao_x: 360,
      posicao_y: 0,
      configuracao_json: {
        mensagem: "Qual a faixa de renda?",
        opcoes: [
          { valor: "a", titulo: "A" },
          { valor: "b", titulo: "B" },
          { valor: "c", titulo: "C" },
        ],
      },
      delay_segundos: 3,
    },
    {
      id: "fgts-atual",
      tipo_no: "pergunta_opcoes",
      titulo: "FGTS",
      descricao: null,
      posicao_x: 720,
      posicao_y: 0,
      configuracao_json: {
        mensagem: "Possui FGTS?",
        opcoes: [
          { valor: "sim", titulo: "Sim" },
          { valor: "nao", titulo: "Nao" },
        ],
      },
      delay_segundos: 3,
    },
    {
      id: "fim-atual",
      tipo_no: "encerrar",
      titulo: "Fim",
      descricao: null,
      posicao_x: 1080,
      posicao_y: 0,
      configuracao_json: { mensagem: "Fim." },
      delay_segundos: 3,
    },
  ];
  const conexoesAtuais = [
    ["inicio-atual", "renda-atual", "sempre", null],
    ["renda-atual", "fgts-atual", "resposta_contem", "a"],
    ["renda-atual", "fgts-atual", "resposta_contem", "b"],
    ["renda-atual", "fgts-atual", "resposta_contem", "c"],
    ["fgts-atual", "fim-atual", "sempre", null],
  ].map(([origem, destino, tipo, valor], index) => ({
    id: `conexao-${index}`,
    no_origem_id: String(origem),
    no_destino_id: String(destino),
    rotulo: null,
    ordem: index + 1,
    condicao_json: { tipo, ...(valor ? { valor } : {}) },
    usar_ia: false,
    descricao_ia: null,
  }));
  const plano = normalizarPlanoAssistente({
    nome_fluxo: "Triagem com composicao",
    objetivo: "Inserir desvio",
    resumo: "A e B passam pela composicao; C segue ao FGTS.",
    etapas: [
      {
        ref: "composicao",
        tipo: "pergunta_opcoes",
        titulo: "Composicao de renda",
        mensagem: "Pode compor renda?",
        variavel: null,
        tipo_captura: null,
        setor_id: null,
        setor_nome: null,
        resultado: null,
        opcoes: [
          { id: "sim", texto: "Sim" },
          { id: "nao", texto: "Nao" },
        ],
      },
    ],
    rotas: [
      ["inicio-atual", "renda-atual", "sempre", null],
      ["renda-atual", "composicao", "resposta_contem", "a"],
      ["renda-atual", "composicao", "resposta_contem", "b"],
      ["renda-atual", "fgts-atual", "resposta_contem", "c"],
      ["composicao", "fgts-atual", "resposta_contem", "sim"],
      ["composicao", "fgts-atual", "resposta_contem", "nao"],
      ["fgts-atual", "fim-atual", "resposta_contem", "sim"],
      ["fgts-atual", "fim-atual", "resposta_contem", "nao"],
    ].map(([origem, destino, condicao, valor]) => ({
      origem,
      destino,
      condicao,
      valor,
      rotulo: null,
      descricao_ia: null,
      timeout_segundos: null,
    })),
    mensagens_revisadas: [],
    variaveis_sugeridas: [],
    avisos: [],
  });

  const resultado = compilarPlanoAssistente({
    modo: "adicionar_etapa",
    plano,
    fluxoAtual: { nos: nosAtuais, conexoes: conexoesAtuais },
  });
  const saidasRenda = resultado.conexoes.filter(
    (conexao) => conexao.no_origem_id === "renda-atual"
  );

  assert.equal(resultado.validacao.valido, true);
  assert.equal(saidasRenda.length, 3);
  assert.deepEqual(
    saidasRenda.map((conexao) => conexao.condicao_json.valor).sort(),
    ["a", "b", "c"]
  );
  assert.equal(
    saidasRenda.filter((conexao) => conexao.condicao_json.valor === "a")
      .length,
    1
  );
});
