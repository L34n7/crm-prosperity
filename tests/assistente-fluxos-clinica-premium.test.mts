import assert from "node:assert/strict";
import test from "node:test";

import {
  compilarPlanoAssistente,
  normalizarPlanoAssistente,
} from "../src/lib/automacoes/assistente-fluxos-compilador-seguro.ts";
import { idsAlcancaveis } from "../src/lib/automacoes/assistente-fluxos-reparador-rotas.ts";

const SERVICOS = [
  ["harmonizacao", "Harmonização Facial"],
  ["melasma", "Tratamento de Melasma e Manchas"],
  ["botox", "Aplicação de Botox"],
] as const;

function etapasProcedimento(ref: string, titulo: string) {
  return [
    {
      ref: `${ref}_conteudo`,
      tipo: "mensagem",
      titulo: `${titulo} — Visão geral`,
      mensagem: `Conheça ${titulo}. Benefícios, indicações, cuidados, duração, recuperação e resultados são definidos de forma personalizada.`,
      opcoes: [],
    },
    {
      ref: `${ref}_menu`,
      tipo: "pergunta_opcoes",
      titulo: `${titulo} · Próximos passos`,
      mensagem: "Como deseja continuar?",
      opcoes: [
        { id: "antes_depois", texto: "Antes e Depois" },
        { id: "valores", texto: "Valores" },
        { id: "duvidas", texto: "Dúvidas Frequentes" },
        { id: "agendar", texto: "Agendar" },
        { id: "voltar", texto: "Voltar ao Menu" },
      ],
    },
    {
      ref: `${ref}_faq`,
      tipo: "pergunta_opcoes",
      titulo: `FAQ ${titulo}`,
      mensagem: "Qual dúvida você gostaria de esclarecer?",
      opcoes: [
        { id: "doi", texto: "Dói?" },
        { id: "duracao", texto: "Quanto tempo dura?" },
        { id: "resultado", texto: "Quando vejo resultado?" },
        { id: "voltar", texto: "Voltar" },
      ],
    },
  ];
}

test("torna determinístico o fluxo premium completo mesmo quando a IA omite rotas e respostas", () => {
  const plano = normalizarPlanoAssistente({
    nome_fluxo: "Graciele Honorato Estética Avançada",
    objetivo: "Atendimento premium e agendamento",
    resumo: "Caso de regressão do prompt real da clínica.",
    etapas: [
      { ref: "inicio", tipo: "inicio", titulo: "Início", opcoes: [] },
      {
        ref: "boas_vindas",
        tipo: "mensagem",
        titulo: "Boas-vindas",
        mensagem: "🤍 Bem-vindo(a) à Graciele Honorato Estética Avançada.",
        opcoes: [],
      },
      {
        ref: "menu",
        tipo: "pergunta_opcoes",
        titulo: "Menu Principal",
        mensagem: "Como podemos ajudar?",
        opcoes: [
          { id: "harmonizacao", texto: "Harmonização Facial" },
          { id: "melasma", texto: "Melasma e Manchas" },
          { id: "botox", texto: "Botox" },
          { id: "antes_depois", texto: "Antes e Depois" },
          { id: "valores", texto: "Valores" },
          { id: "agendar", texto: "Agendar Avaliação" },
          { id: "localizacao", texto: "Localização" },
          { id: "especialista", texto: "Falar com Especialista" },
        ],
      },
      ...SERVICOS.flatMap(([ref, titulo]) => etapasProcedimento(ref, titulo)),
      {
        ref: "harmonizacao_duracao",
        tipo: "mensagem",
        titulo: "Resposta FAQ Harmonização — duração",
        mensagem: "Quanto tempo dura? A duração varia conforme o protocolo e o organismo.",
        opcoes: [],
      },
      {
        ref: "antes_depois",
        tipo: "pergunta_opcoes",
        titulo: "Antes e Depois",
        mensagem: "Resultados reais de pacientes autorizados.",
        opcoes: [
          { id: "harmonizacao", texto: "Harmonização" },
          { id: "melasma", texto: "Melasma" },
          { id: "botox", texto: "Botox" },
          { id: "agendar", texto: "Agendar" },
          { id: "voltar", texto: "Menu" },
        ],
      },
      {
        ref: "valores",
        tipo: "mensagem",
        titulo: "Valores",
        mensagem: "O investimento varia conforme a necessidade de cada paciente.",
        opcoes: [],
      },
      {
        ref: "agendar",
        tipo: "mensagem",
        titulo: "Agendar avaliação",
        mensagem: "Envie nome completo, telefone, melhor dia e melhor horário.",
        opcoes: [],
      },
      {
        ref: "localizacao",
        tipo: "pergunta_opcoes",
        titulo: "Localização",
        mensagem: "Graciele Honorato Estética Avançada\nLoja Império\nR. João Bento Silvares, Nº 266\nCentro\nSão Mateus - ES\nCEP 29930-020",
        opcoes: [
          { id: "abrir_localizacao", texto: "Abrir Localização" },
          { id: "agendar", texto: "Agendar" },
          { id: "voltar", texto: "Menu" },
        ],
      },
      {
        ref: "especialista",
        tipo: "transferir",
        titulo: "Falar com Especialista",
        mensagem: "Você será direcionado para um especialista da nossa equipe.",
        setor_id: "setor-atendimento",
        opcoes: [],
      },
      {
        ref: "fragmento_duplicado",
        tipo: "mensagem",
        titulo: "Pergunta com botões",
        mensagem: "Fragmento sem relação segura criado durante o reparo da IA.",
        opcoes: [],
      },
      { ref: "fim", tipo: "encerrar", titulo: "Encerrar", opcoes: [] },
    ],
    rotas: [
      { origem: "inicio", destino: "boas_vindas", condicao: "sempre" },
      { origem: "boas_vindas", destino: "menu", condicao: "sempre" },
      {
        origem: "menu",
        destino: "harmonizacao_conteudo",
        condicao: "resposta_contem",
        valor: "harmonizacao",
      },
      {
        origem: "localizacao",
        destino: "redirect_mapa_inexistente",
        condicao: "resposta_contem",
        valor: "abrir_localizacao",
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
  const alcancaveis = idsAlcancaveis(resultado.nos, resultado.conexoes);

  assert.equal(
    resultado.validacao.valido,
    true,
    JSON.stringify(resultado.validacao.erros)
  );
  assert.equal(alcancaveis.size, resultado.nos.length);
  assert.equal(
    resultado.conexoes.some(
      (conexao) =>
        !resultado.nos.some((no) => no.id === conexao.no_origem_id) ||
        !resultado.nos.some((no) => no.id === conexao.no_destino_id)
    ),
    false
  );

  for (const pergunta of resultado.nos.filter((no) =>
    ["pergunta_opcoes", "enviar_botoes"].includes(no.tipo_no)
  )) {
    const opcoesConfig =
      pergunta.tipo_no === "pergunta_opcoes"
        ? pergunta.configuracao_json.opcoes
        : pergunta.configuracao_json.botoes;
    const opcoes = Array.isArray(opcoesConfig) ? opcoesConfig : [];
    const saidas = resultado.conexoes.filter(
      (conexao) =>
        conexao.no_origem_id === pergunta.id &&
        conexao.condicao_json.tipo !== "timeout_sem_resposta"
    );
    assert.equal(
      saidas.length,
      opcoes.length,
      `Todas as opções de “${pergunta.titulo}” devem possuir rota.`
    );
  }

  assert.ok(
    resultado.nos.some(
      (no) =>
        no.tipo_no === "botao_redirect" &&
        String(no.configuracao_json.url || "").startsWith("https://")
    ),
    "Abrir Localização deve receber um redirect válido."
  );
  assert.equal(
    resultado.nos.some((no) => no.titulo === "Pergunta com botões"),
    false,
    "Fragmentos sem relação segura não devem sobreviver no fluxo final."
  );
});
