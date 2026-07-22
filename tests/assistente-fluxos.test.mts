import assert from "node:assert/strict";
import test from "node:test";
import {
  compilarPlanoAssistente,
  completarRotasDeOpcoesPlano,
  normalizarPlanoAssistente,
} from "../src/lib/automacoes/assistente-fluxos.ts";
import {
  aplicarRespostaPerguntaAssistente,
  criarPerguntasAssistenteFluxo,
  errosQueBloqueiamCriacao,
  errosQueExigemReparo,
  proximaPerguntaAssistente,
} from "../src/lib/automacoes/assistente-fluxos-conversa.ts";

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

  assert.equal(
    resultado.validacao.valido,
    true,
    JSON.stringify(resultado.validacao.erros)
  );
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
test("assistente coleta midia, URL e setor antes de compilar", () => {
  let plano = normalizarPlanoAssistente({
    nome_fluxo: "Fluxo guiado",
    objetivo: "Enviar material e transferir",
    resumo: "Fluxo com campos tecnicos confirmados pelo usuario.",
    etapas: [
      { ref: "inicio", tipo: "inicio", opcoes: [] },
      {
        ref: "material",
        tipo: "midia_arquivo",
        titulo: "Enviar catalogo",
        mensagem: "Segue nosso catalogo.",
        midia_id: "midia-catalogo",
        midia_tipo: "arquivo",
        opcoes: [],
      },
      {
        ref: "site",
        tipo: "redirect",
        titulo: "Conheca o site",
        mensagem: "Veja mais detalhes em nosso site.",
        botao_texto: "Abrir site",
        opcoes: [],
      },
      {
        ref: "comercial",
        tipo: "transferir",
        titulo: "Falar com comercial",
        mensagem: "Vou encaminhar voce.",
        opcoes: [],
      },
    ],
    rotas: [
      { origem: "inicio", destino: "material", condicao: "sempre" },
      { origem: "material", destino: "site", condicao: "sempre" },
      { origem: "site", destino: "comercial", condicao: "sempre" },
    ],
    mensagens_revisadas: [],
    variaveis_sugeridas: [],
    avisos: [],
  });
  const setores = [{ id: "setor-vendas", nome: "Vendas" }];
  const midias = [
    {
      id: "midia-catalogo",
      nome: "Catalogo.pdf",
      tipo: "arquivo" as const,
      url: "https://arquivos.exemplo.com/catalogo.pdf",
    },
  ];
  const perguntas = criarPerguntasAssistenteFluxo({ plano, setores, midias });

  assert.deepEqual(
    perguntas.map((pergunta) => pergunta.campo),
    ["midia_id", "url", "setor_id"]
  );
  assert.equal(perguntas[0]?.valor_sugerido, null);

  const respostas = [
    "midia-catalogo",
    "https://exemplo.com/imovel",
    "setor-vendas",
  ];
  const respondidas: string[] = [];

  for (const resposta of respostas) {
    const pergunta = proximaPerguntaAssistente({ perguntas, respondidas });
    if (!pergunta) throw new Error("Pergunta esperada nao encontrada.");
    const aplicada = aplicarRespostaPerguntaAssistente({
      plano,
      pergunta,
      resposta,
      setores,
      midias,
    });
    plano = aplicada.plano;
    respondidas.push(pergunta.id);
  }

  assert.equal(
    proximaPerguntaAssistente({ perguntas, respondidas }),
    null
  );

  const resultado = compilarPlanoAssistente({
    modo: "criar_fluxo",
    plano,
    setores,
    midias,
  });

  assert.equal(resultado.validacao.valido, true);
  assert.equal(
    resultado.nos.find((no) => no.tipo_no === "enviar_arquivo")
      ?.configuracao_json.midia_id,
    "midia-catalogo"
  );
  assert.equal(
    resultado.nos.find((no) => no.tipo_no === "botao_redirect")
      ?.configuracao_json.url,
    "https://exemplo.com/imovel"
  );
});

test("assistente permite criar rascunho sem midia selecionada", () => {
  const plano = normalizarPlanoAssistente({
    nome_fluxo: "Fluxo sem midia",
    etapas: [
      { ref: "inicio", tipo: "inicio", opcoes: [] },
      { ref: "foto", tipo: "midia_imagem", titulo: "Foto", opcoes: [] },
      { ref: "fim", tipo: "encerrar", titulo: "Fim", opcoes: [] },
    ],
    rotas: [
      { origem: "inicio", destino: "foto", condicao: "sempre" },
      { origem: "foto", destino: "fim", condicao: "sempre" },
    ],
    mensagens_revisadas: [],
    variaveis_sugeridas: [],
    avisos: [],
  });
  const perguntas = criarPerguntasAssistenteFluxo({
    plano,
    setores: [],
    midias: [],
  });

  assert.equal(perguntas.length, 1);
  assert.equal(perguntas[0].bloqueada, false);
  assert.equal(perguntas[0].obrigatoria, false);
  assert.equal(perguntas[0].opcoes.length, 0);

  const aplicada = aplicarRespostaPerguntaAssistente({
    plano,
    pergunta: perguntas[0],
    resposta: "",
    setores: [],
    midias: [],
  });
  const etapaMidia = aplicada.plano.etapas.find((etapa) => etapa.ref === "foto");

  assert.equal(aplicada.resumoResposta, "Continuar sem mídia");
  assert.equal(etapaMidia?.midia_id, null);
  assert.equal(etapaMidia?.midia_url, null);

  const compilacao = compilarPlanoAssistente({
    modo: "criar_fluxo",
    plano: aplicada.plano,
    setores: [],
    midias: [],
  });

  assert.equal(compilacao.validacao.valido, false);
  assert.deepEqual(
    compilacao.validacao.erros.map((erro) => erro.codigo),
    ["MIDIA_AUSENTE"]
  );
  assert.equal(errosQueBloqueiamCriacao(compilacao.validacao.erros).length, 0);
});

test("assistente pergunta ambiguidades antes dos detalhes tecnicos", () => {
  const planoComClarificacao = normalizarPlanoAssistente({
    nome_fluxo: "Qualificacao",
    etapas: [
      { ref: "inicio", tipo: "inicio", opcoes: [] },
      { ref: "handoff", tipo: "transferir", titulo: "Atendimento", opcoes: [] },
    ],
    rotas: [{ origem: "inicio", destino: "handoff", condicao: "sempre" }],
    clarificacoes: [
      {
        id: "objetivo_final",
        pergunta: "Qual deve ser o objetivo final?",
        tipo: "selecao",
        opcoes: [
          { id: "venda", texto: "Concluir venda" },
          { id: "agendamento", texto: "Agendar visita" },
        ],
        valor_sugerido: "venda",
        motivo: "A resposta altera o encerramento.",
      },
    ],
    mensagens_revisadas: [],
    variaveis_sugeridas: [],
    avisos: [],
  });

  const perguntas = criarPerguntasAssistenteFluxo({
    plano: planoComClarificacao,
    setores: [{ id: "vendas", nome: "Vendas" }],
    midias: [],
  });

  assert.equal(perguntas.length, 1);
  assert.equal(perguntas[0].campo, "clarificacao");
  assert.deepEqual(
    perguntas[0].opcoes.map((opcao) => opcao.id),
    ["venda", "agendamento"]
  );

  const planoEsclarecido = normalizarPlanoAssistente({
    ...planoComClarificacao,
    clarificacoes: [],
  });
  const perguntasTecnicas = criarPerguntasAssistenteFluxo({
    plano: planoEsclarecido,
    setores: [{ id: "vendas", nome: "Vendas" }],
    midias: [],
  });

  assert.deepEqual(
    perguntasTecnicas.map((pergunta) => pergunta.campo),
    ["setor_id"]
  );
});

test("assistente separa reparos estruturais de pendencias tecnicas", () => {
  const erros = [
    { codigo: "MIDIA_AUSENTE", mensagem: "Selecione uma midia." },
    { codigo: "SETOR_AUSENTE", mensagem: "Selecione um setor." },
    { codigo: "OPCAO_SEM_ROTA", mensagem: "A opcao precisa de uma rota." },
  ];

  assert.deepEqual(
    errosQueExigemReparo(erros).map((erro) => erro.codigo),
    ["OPCAO_SEM_ROTA"]
  );
  assert.deepEqual(
    errosQueBloqueiamCriacao(erros).map((erro) => erro.codigo),
    ["SETOR_AUSENTE", "OPCAO_SEM_ROTA"]
  );
});

test("assistente corrige captura de nome e reutiliza a variavel no fluxo", () => {
  const plano = normalizarPlanoAssistente({
    nome_fluxo: "Captura de nome",
    etapas: [
      { ref: "inicio", tipo: "inicio", opcoes: [] },
      {
        ref: "captura",
        tipo: "capturar_resposta",
        titulo: "Capturar nome",
        mensagem: "Como posso te chamar?",
        variavel: "nome",
        tipo_captura: "texto",
        opcoes: [],
      },
      {
        ref: "proxima",
        tipo: "mensagem",
        titulo: "Boas-vindas",
        mensagem: "Muito prazer! Vamos continuar.",
        opcoes: [],
      },
      { ref: "fim", tipo: "encerrar", titulo: "Fim", opcoes: [] },
    ],
    rotas: [
      { origem: "inicio", destino: "captura", condicao: "sempre" },
      { origem: "captura", destino: "proxima", condicao: "sempre" },
      { origem: "proxima", destino: "fim", condicao: "sempre" },
    ],
    mensagens_revisadas: [],
    variaveis_sugeridas: [{ chave: "nome", descricao: "Nome do contato" }],
    avisos: [],
  });

  const resultado = compilarPlanoAssistente({
    modo: "criar_fluxo",
    plano,
  });
  const captura = resultado.nos.find((no) => no.tipo_no === "capturar_resposta");
  const proxima = resultado.nos.find((no) => no.id !== captura?.id && no.titulo === "Boas-vindas");

  assert.equal(captura?.configuracao_json.variavel, "nome_cliente");
  assert.equal(captura?.configuracao_json.tipo_captura, "nome");
  assert.match(String(proxima?.configuracao_json.mensagem), /\{\{nome_cliente\}\}/);
  assert.equal(
    resultado.variaveis_sugeridas.some((item) => item.chave === "nome"),
    false
  );
  assert.equal(
    resultado.validacao.valido,
    true,
    JSON.stringify(resultado.validacao.erros)
  );
});

test("assistente completa a rota ausente de cada opcao de botoes", () => {
  const plano = normalizarPlanoAssistente({
    nome_fluxo: "Pergunta com rotas",
    etapas: [
      { ref: "inicio", tipo: "inicio", opcoes: [] },
      {
        ref: "pergunta",
        tipo: "pergunta_botoes",
        mensagem: "Escolha",
        opcoes: [
          { id: "a", texto: "A" },
          { id: "b", texto: "B" },
        ],
      },
      { ref: "fim", tipo: "encerrar", titulo: "Fim", opcoes: [] },
    ],
    rotas: [
      { origem: "inicio", destino: "pergunta", condicao: "sempre" },
      {
        origem: "pergunta",
        destino: "fim",
        condicao: "resposta_contem",
        valor: "a",
      },
    ],
    mensagens_revisadas: [],
    variaveis_sugeridas: [],
    avisos: [],
  });

  const resultado = compilarPlanoAssistente({
    modo: "criar_fluxo",
    plano: completarRotasDeOpcoesPlano(plano),
  });
  const pergunta = resultado.nos.find((no) => no.tipo_no === "enviar_botoes");
  const valores = resultado.conexoes
    .filter((conexao) => conexao.no_origem_id === pergunta?.id)
    .map((conexao) => conexao.condicao_json.valor)
    .sort();

  assert.deepEqual(valores, ["a", "b"]);
  assert.equal(resultado.validacao.valido, true);
});

test("assistente cria um destino diferente para cada opcao mesmo quando a IA agrupou a proxima etapa", () => {
  const plano = normalizarPlanoAssistente({
    nome_fluxo: "Pergunta com ramificacoes",
    etapas: [
      { ref: "inicio", tipo: "inicio", opcoes: [] },
      {
        ref: "pergunta",
        tipo: "pergunta_botoes",
        titulo: "Perfil",
        mensagem: "Qual perfil?",
        opcoes: [
          { id: "a", texto: "A" },
          { id: "b", texto: "B" },
        ],
      },
      {
        ref: "proxima",
        tipo: "mensagem",
        titulo: "Proxima etapa",
        mensagem: "Vamos continuar.",
        opcoes: [],
      },
      {
        ref: "fim",
        tipo: "encerrar",
        titulo: "Fim",
        mensagem: "Encerrado.",
        resultado: "positivo",
        opcoes: [],
      },
    ],
    rotas: [
      { origem: "inicio", destino: "pergunta", condicao: "sempre" },
      {
        origem: "pergunta",
        destino: "proxima",
        condicao: "resposta_contem",
        valor: "a",
      },
      {
        origem: "pergunta",
        destino: "proxima",
        condicao: "resposta_contem",
        valor: "b",
      },
      { origem: "proxima", destino: "fim", condicao: "sempre" },
    ],
    mensagens_revisadas: [],
    variaveis_sugeridas: [],
    avisos: [],
  });

  const resultado = compilarPlanoAssistente({
    modo: "criar_fluxo",
    plano,
  });
  const pergunta = resultado.nos.find((no) => no.tipo_no === "enviar_botoes");
  const saidas = resultado.conexoes.filter(
    (conexao) => conexao.no_origem_id === pergunta?.id
  );

  assert.equal(saidas.length, 2);
  assert.equal(new Set(saidas.map((conexao) => conexao.no_destino_id)).size, 2);
  assert.equal(
    resultado.nos.filter((no) => no.titulo.startsWith("Proxima etapa")).length,
    2
  );
  assert.equal(resultado.validacao.valido, true);
});

test("assistente normaliza titulos de botoes e sincroniza rotulos das conexoes", () => {
  const plano = normalizarPlanoAssistente({
    nome_fluxo: "Botoes longos",
    etapas: [
      { ref: "inicio", tipo: "inicio", opcoes: [] },
      {
        ref: "menu",
        tipo: "pergunta_botoes",
        titulo: "Dúvidas Frequentes",
        mensagem: "Como deseja seguir?",
        opcoes: [
          { id: "especialista", texto: "👩‍⚕️ Falar com Especialista" },
          { id: "localizacao", texto: "🗺️ Abrir Localização" },
        ],
      },
      {
        ref: "fim_a",
        tipo: "transferir",
        titulo: "Falar com especialista",
        setor_id: "setor-atendimento",
        opcoes: [],
      },
      {
        ref: "fim_b",
        tipo: "redirect",
        titulo: "Abrir Localização",
        url: "https://maps.example.com",
        opcoes: [],
      },
    ],
    rotas: [
      { origem: "inicio", destino: "menu", condicao: "sempre" },
      {
        origem: "menu",
        destino: "fim_a",
        condicao: "resposta_contem",
        valor: "especialista",
        rotulo: "👩‍⚕️ Falar com Especialista",
      },
      {
        origem: "menu",
        destino: "fim_b",
        condicao: "resposta_contem",
        valor: "localizacao",
        rotulo: "🗺️ Abrir Localização",
      },
    ],
    mensagens_revisadas: [],
    variaveis_sugeridas: [],
    avisos: [],
  });

  const resultado = compilarPlanoAssistente({
    modo: "criar_fluxo",
    plano,
    setores: [{ id: "setor-atendimento", nome: "Atendimento" }],
  });
  const menu = resultado.nos.find((no) => no.titulo === "Dúvidas Frequentes");
  const botoes = (menu?.configuracao_json.botoes || []) as Array<{
    id: string;
    titulo: string;
  }>;
  const rotulos = resultado.conexoes
    .filter((conexao) => conexao.no_origem_id === menu?.id)
    .map((conexao) => conexao.rotulo);

  assert.deepEqual(
    botoes.map((botao) => botao.titulo),
    ["Falar especialista", "Abrir Localização"],
    JSON.stringify(
      resultado.nos.map((no) => ({
        titulo: no.titulo,
        tipo: no.tipo_no,
        configuracao: no.configuracao_json,
      }))
    )
  );
  assert.deepEqual(rotulos, ["Falar especialista", "Abrir Localização"]);
  assert.equal(botoes.every((botao) => botao.titulo.length <= 20), true);
  assert.equal(resultado.validacao.valido, true);
});

test("separa mensagem e opcoes colocadas indevidamente no inicio", () => {
  const plano = normalizarPlanoAssistente({
    nome_fluxo: "Abertura no início",
    etapas: [
      {
        ref: "inicio",
        tipo: "inicio",
        titulo: "Menu Principal",
        mensagem: "Bem-vindo. Como podemos ajudar?",
        opcoes: [
          { id: "informacoes", texto: "Informações" },
          { id: "encerrar", texto: "Encerrar" },
        ],
      },
      { ref: "info", tipo: "encerrar", titulo: "Informações", opcoes: [] },
      { ref: "fim", tipo: "encerrar", titulo: "Encerrar", opcoes: [] },
    ],
    rotas: [
      {
        origem: "inicio",
        destino: "info",
        condicao: "resposta_contem",
        valor: "informacoes",
      },
      {
        origem: "inicio",
        destino: "fim",
        condicao: "resposta_contem",
        valor: "encerrar",
      },
    ],
    mensagens_revisadas: [],
    variaveis_sugeridas: [],
    avisos: [],
  });

  const resultado = compilarPlanoAssistente({ modo: "criar_fluxo", plano });
  const inicio = resultado.nos.find((no) => no.tipo_no === "inicio");
  const menu = resultado.nos.find((no) => no.titulo === "Menu Principal");

  assert.ok(inicio && menu);
  assert.deepEqual(inicio.configuracao_json, {});
  assert.equal(menu.tipo_no, "enviar_botoes");
  assert.ok(
    resultado.conexoes.some(
      (conexao) =>
        conexao.no_origem_id === inicio.id &&
        conexao.no_destino_id === menu.id &&
        conexao.condicao_json.tipo === "sempre"
    )
  );
  assert.equal(resultado.validacao.valido, true);
});

test("prioriza Menu Principal explícito e não usa Antes e Depois como entrada", () => {
  const plano = normalizarPlanoAssistente({
    nome_fluxo: "Menu canônico",
    etapas: [
      { ref: "inicio", tipo: "inicio", opcoes: [] },
      { ref: "harm", tipo: "mensagem", titulo: "Harmonização", mensagem: "Conteúdo", opcoes: [] },
      {
        ref: "resultados",
        tipo: "pergunta_opcoes",
        titulo: "Antes e Depois",
        mensagem: "Escolha um resultado",
        opcoes: [
          { id: "harmonizacao", texto: "Harmonização" },
          { id: "melasma", texto: "Melasma" },
          { id: "botox", texto: "Botox" },
          { id: "voltar", texto: "Voltar" },
        ],
      },
      {
        ref: "menu",
        tipo: "pergunta_opcoes",
        titulo: "Menu Principal",
        mensagem: "Como podemos ajudar?",
        opcoes: [
          { id: "harmonizacao", texto: "Harmonização" },
          { id: "encerrar", texto: "Encerrar" },
        ],
      },
      { ref: "fim", tipo: "encerrar", titulo: "Encerrar", opcoes: [] },
    ],
    rotas: [
      { origem: "inicio", destino: "harm", condicao: "sempre" },
      { origem: "menu", destino: "harm", condicao: "resposta_contem", valor: "harmonizacao" },
      { origem: "menu", destino: "fim", condicao: "resposta_contem", valor: "encerrar" },
      { origem: "resultados", destino: "harm", condicao: "resposta_contem", valor: "harmonizacao" },
      { origem: "resultados", destino: "harm", condicao: "resposta_contem", valor: "melasma" },
      { origem: "resultados", destino: "harm", condicao: "resposta_contem", valor: "botox" },
      { origem: "resultados", destino: "menu", condicao: "resposta_contem", valor: "voltar" },
    ],
    mensagens_revisadas: [],
    variaveis_sugeridas: [],
    avisos: [],
  });

  const resultado = compilarPlanoAssistente({ modo: "criar_fluxo", plano });
  const inicio = resultado.nos.find((no) => no.tipo_no === "inicio");
  const menu = resultado.nos.find((no) => no.titulo === "Menu Principal");
  const saidaInicio = resultado.conexoes.find(
    (conexao) => conexao.no_origem_id === inicio?.id
  );

  assert.equal(saidaInicio?.no_destino_id, menu?.id);
});

test("corrige FAQ por intenção exata e não cruza dor com duração", () => {
  const plano = normalizarPlanoAssistente({
    nome_fluxo: "FAQ semântica",
    etapas: [
      { ref: "inicio", tipo: "inicio", opcoes: [] },
      {
        ref: "menu",
        tipo: "pergunta_botoes",
        titulo: "Menu Principal",
        mensagem: "Como podemos ajudar?",
        opcoes: [
          { id: "botox", texto: "Botox" },
          { id: "encerrar", texto: "Encerrar" },
        ],
      },
      {
        ref: "menu_botox",
        tipo: "pergunta_botoes",
        titulo: "Menu Botox",
        mensagem: "Escolha uma opção",
        opcoes: [
          { id: "duvidas", texto: "Dúvidas" },
          { id: "voltar_menu", texto: "Menu Principal" },
        ],
      },
      {
        ref: "faq_botox",
        tipo: "pergunta_opcoes",
        titulo: "Dúvidas Frequentes - Botox",
        mensagem: "Escolha uma dúvida",
        opcoes: [
          { id: "doi", texto: "Dói?" },
          { id: "duracao", texto: "Quanto tempo dura?" },
          { id: "voltar", texto: "Voltar" },
        ],
      },
      { ref: "dor", tipo: "mensagem", titulo: "Resposta FAQ Botox - dor", mensagem: "A sensibilidade é leve e usamos medidas de conforto.", opcoes: [] },
      { ref: "duracao", tipo: "mensagem", titulo: "Resposta FAQ Botox - duração", mensagem: "A duração do efeito varia conforme o organismo.", opcoes: [] },
      { ref: "fim", tipo: "encerrar", titulo: "Encerrar", opcoes: [] },
    ],
    rotas: [
      { origem: "inicio", destino: "menu", condicao: "sempre" },
      { origem: "menu", destino: "menu_botox", condicao: "resposta_contem", valor: "botox" },
      { origem: "menu", destino: "fim", condicao: "resposta_contem", valor: "encerrar" },
      { origem: "menu_botox", destino: "faq_botox", condicao: "resposta_contem", valor: "duvidas" },
      { origem: "menu_botox", destino: "menu", condicao: "resposta_contem", valor: "voltar_menu" },
      { origem: "faq_botox", destino: "duracao", condicao: "resposta_contem", valor: "doi" },
      { origem: "faq_botox", destino: "dor", condicao: "resposta_contem", valor: "duracao" },
      { origem: "faq_botox", destino: "menu_botox", condicao: "resposta_contem", valor: "voltar" },
    ],
    mensagens_revisadas: [],
    variaveis_sugeridas: [],
    avisos: [],
  });

  const resultado = compilarPlanoAssistente({ modo: "criar_fluxo", plano });
  const faq = resultado.nos.find((no) => no.titulo === "Dúvidas Frequentes - Botox");
  const dor = resultado.nos.find((no) => no.titulo === "Resposta FAQ Botox - dor");
  const duracao = resultado.nos.find((no) => no.titulo === "Resposta FAQ Botox - duração");
  const saidas = resultado.conexoes.filter(
    (conexao) => conexao.no_origem_id === faq?.id
  );

  assert.equal(
    saidas.find((conexao) => conexao.condicao_json.valor === "doi")?.no_destino_id,
    dor?.id
  );
  assert.equal(
    saidas.find((conexao) => conexao.condicao_json.valor === "duracao")?.no_destino_id,
    duracao?.id
  );
  assert.equal(
    resultado.validacao.valido,
    true,
    JSON.stringify(resultado.validacao.erros)
  );
});

test("bloqueia ciclo composto somente por Sempre seguir", () => {
  const plano = normalizarPlanoAssistente({
    nome_fluxo: "Loop automático",
    etapas: [
      { ref: "inicio", tipo: "inicio", opcoes: [] },
      { ref: "a", tipo: "mensagem", titulo: "A", mensagem: "A", opcoes: [] },
      { ref: "b", tipo: "mensagem", titulo: "B", mensagem: "B", opcoes: [] },
    ],
    rotas: [
      { origem: "inicio", destino: "a", condicao: "sempre" },
      { origem: "a", destino: "b", condicao: "sempre" },
      { origem: "b", destino: "a", condicao: "sempre" },
    ],
    mensagens_revisadas: [],
    variaveis_sugeridas: [],
    avisos: [],
  });

  const resultado = compilarPlanoAssistente({ modo: "criar_fluxo", plano });
  assert.ok(
    resultado.validacao.erros.some(
      (erro) => erro.codigo === "CICLO_AUTOMATICO"
    )
  );
  assert.equal(resultado.validacao.valido, false);
});

test("assistente confirma o horario antes de criar o agendamento", () => {
  const plano = normalizarPlanoAssistente({
    nome_fluxo: "Agendamento confirmado",
    etapas: [
      { ref: "inicio", tipo: "inicio", opcoes: [] },
      {
        ref: "escolher",
        tipo: "agenda_escolher_horario",
        titulo: "Escolher horário",
        agenda_id: "agenda-teste",
        opcoes: [],
      },
      {
        ref: "criar",
        tipo: "agenda_criar_agendamento",
        titulo: "Criar agendamento",
        agenda_id: "agenda-teste",
        opcoes: [],
      },
      { ref: "fim", tipo: "encerrar", titulo: "Fim", opcoes: [] },
    ],
    rotas: [
      { origem: "inicio", destino: "escolher", condicao: "sempre" },
      { origem: "escolher", destino: "criar", condicao: "sempre" },
      { origem: "criar", destino: "fim", condicao: "sempre" },
    ],
    mensagens_revisadas: [],
    variaveis_sugeridas: [],
    avisos: [],
  });

  const resultado = compilarPlanoAssistente({ modo: "criar_fluxo", plano });
  const escolher = resultado.nos.find(
    (no) => no.tipo_no === "agenda_escolher_horario"
  );
  const criar = resultado.nos.find(
    (no) => no.tipo_no === "agenda_criar_agendamento"
  );
  const confirmar = resultado.nos.find(
    (no) => no.titulo === "Confirmar horário"
  );
  const saidasConfirmacao = resultado.conexoes.filter(
    (conexao) => conexao.no_origem_id === confirmar?.id
  );

  assert.ok(escolher && criar && confirmar);
  assert.ok(
    resultado.conexoes.some(
      (conexao) =>
        conexao.no_origem_id === escolher.id &&
        conexao.no_destino_id === confirmar.id &&
        conexao.condicao_json.tipo === "sempre"
    )
  );
  assert.ok(
    saidasConfirmacao.some(
      (conexao) =>
        conexao.condicao_json.valor === "confirmar_horario" &&
        conexao.no_destino_id === criar.id
    )
  );
  assert.ok(
    saidasConfirmacao.some(
      (conexao) =>
        conexao.condicao_json.valor === "escolher_outro_horario" &&
        conexao.no_destino_id === escolher.id
    )
  );
  assert.equal(resultado.validacao.valido, true);
});

test("compilador reconstrui jornada desconectada sem pular boas-vindas", () => {
  const plano = normalizarPlanoAssistente({
    nome_fluxo: "Clinica",
    etapas: [
      { ref: "inicio", tipo: "inicio", opcoes: [] },
      {
        ref: "boas_vindas",
        tipo: "mensagem",
        titulo: "Boas-vindas",
        mensagem: "Seja bem-vindo.",
        opcoes: [],
      },
      {
        ref: "menu",
        tipo: "pergunta_botoes",
        titulo: "Menu Principal",
        mensagem: "Como podemos ajudar?",
        opcoes: [
          { id: "agendar", texto: "Agendar Avaliacao" },
          { id: "especialista", texto: "Falar com Especialista" },
        ],
      },
      {
        ref: "escolher",
        tipo: "agenda_escolher_horario",
        titulo: "Escolher horario",
        agenda_id: "agenda-teste",
        opcoes: [],
      },
      {
        ref: "confirmar",
        tipo: "pergunta_botoes",
        titulo: "Confirmar agendamento",
        mensagem: "Confirma o horario?",
        opcoes: [
          { id: "confirmar_horario", texto: "Sim" },
          { id: "escolher_outro_horario", texto: "Escolher outro" },
        ],
      },
      {
        ref: "criar",
        tipo: "agenda_criar_agendamento",
        titulo: "Criar agendamento",
        agenda_id: "agenda-teste",
        opcoes: [],
      },
      {
        ref: "confirmado",
        tipo: "mensagem",
        titulo: "Agendamento confirmado",
        mensagem: "Agendamento confirmado com sucesso.",
        opcoes: [],
      },
      {
        ref: "transferir",
        tipo: "transferir",
        titulo: "Falar com especialista",
        setor_id: "setor-atendimento",
        mensagem: "Vou encaminhar voce.",
        opcoes: [],
      },
    ],
    rotas: [{ origem: "inicio", destino: "boas_vindas", condicao: "sempre" }],
    mensagens_revisadas: [],
    variaveis_sugeridas: [],
    avisos: [],
  });

  const resultado = compilarPlanoAssistente({
    modo: "criar_fluxo",
    plano,
    setores: [{ id: "setor-atendimento", nome: "Atendimento" }],
  });
  const porTitulo = new Map(resultado.nos.map((no) => [no.titulo, no]));
  const inicio = resultado.nos.find((no) => no.tipo_no === "inicio");
  const boasVindas = porTitulo.get("Boas-vindas");
  const confirmar = porTitulo.get("Confirmar agendamento");
  const criar = porTitulo.get("Criar agendamento");
  const confirmado = porTitulo.get("Agendamento confirmado");

  assert.equal(resultado.validacao.valido, true, JSON.stringify(resultado.validacao.erros));
  assert.equal(
    resultado.conexoes.find((conexao) => conexao.no_origem_id === inicio?.id)
      ?.no_destino_id,
    boasVindas?.id
  );
  assert.equal(
    resultado.nos.filter((no) => no.titulo === "Confirmar agendamento").length,
    1
  );
  assert.ok(
    resultado.conexoes.some(
      (conexao) =>
        conexao.no_origem_id === confirmar?.id &&
        conexao.no_destino_id === criar?.id &&
        conexao.condicao_json.valor === "confirmar_horario"
    )
  );
  assert.ok(
    resultado.conexoes.some(
      (conexao) =>
        conexao.no_origem_id === criar?.id &&
        conexao.no_destino_id === confirmado?.id
    )
  );
});
