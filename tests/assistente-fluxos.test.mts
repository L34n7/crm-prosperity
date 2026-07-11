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

test("validador avisa quando opcao de pergunta nao possui rota", () => {
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

  assert.equal(resultado.validacao.erros.length, 0);
  assert.ok(
    resultado.validacao.avisos.some(
      (aviso) => aviso.codigo === "OPCAO_SEM_ROTA"
    )
  );
});
