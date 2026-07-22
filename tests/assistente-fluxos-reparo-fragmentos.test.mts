import assert from "node:assert/strict";
import test from "node:test";

import { repararGrafoAssistente } from "../src/lib/automacoes/assistente-fluxos-reparador-grafo.ts";
import { idsAlcancaveis } from "../src/lib/automacoes/assistente-fluxos-reparador-rotas.ts";
import {
  ehVoltarMenu,
  intencaoFaq,
  opcoesNo,
} from "../src/lib/automacoes/assistente-fluxos-reparador-semantica.ts";
import type {
  AssistenteAutomacaoConexao,
  AssistenteAutomacaoNo,
} from "../src/lib/automacoes/assistente-fluxos-base.ts";
import { normalizarPlanoAssistente } from "../src/lib/automacoes/assistente-fluxos-base.ts";

function no(
  id: string,
  tipo_no: string,
  titulo: string,
  mensagem: string,
  opcoes: Array<{ id: string; titulo: string }> = []
): AssistenteAutomacaoNo {
  return {
    id,
    tipo_no,
    titulo,
    descricao: null,
    posicao_x: 0,
    posicao_y: 0,
    configuracao_json: {
      mensagem,
      ...(tipo_no === "pergunta_opcoes"
        ? { opcoes: opcoes.map((item) => ({ valor: item.id, titulo: item.titulo })) }
        : tipo_no === "enviar_botoes"
          ? { botoes: opcoes }
          : {}),
    },
    delay_segundos: null,
  };
}

function sempre(origem: string, destino: string, ordem: number): AssistenteAutomacaoConexao {
  return {
    id: `c-${ordem}`,
    no_origem_id: origem,
    no_destino_id: destino,
    rotulo: "Sempre seguir",
    ordem,
    condicao_json: { tipo: "sempre" },
    usar_ia: false,
    descricao_ia: null,
  };
}

test("reconhece menu simples e prioriza naturalidade sobre resultado generico", () => {
  assert.equal(ehVoltarMenu("⬅️ Menu"), true);
  assert.equal(
    intencaoFaq("O resultado fica natural, leve e elegante."),
    "naturalidade"
  );
});

test("consolida telas fragmentadas e respostas de FAQ sem titulo", () => {
  const nos: AssistenteAutomacaoNo[] = [
    no("inicio", "inicio", "Início", ""),
    no("main", "pergunta_opcoes", "Menu Principal", "Como podemos ajudar?", [
      { id: "harm", titulo: "Harmonização Facial" },
    ]),
    no("harm-1", "enviar_texto", "Harmonização Facial — Visão geral", "Explicação da harmonização."),
    no("harm-2", "enviar_texto", "Mensagem", "Cuidados, tempo médio e recuperação."),
    no("harm-3", "enviar_texto", "Mensagem", "Resultados esperados com aparência equilibrada."),
    no("menu-1", "enviar_botoes", "Pergunta com botoes", "Escolha o próximo passo:", [
      { id: "valores", titulo: "Valores" },
      { id: "faq", titulo: "Dúvidas Frequentes" },
    ]),
    no("menu-2", "enviar_botoes", "Pergunta com botoes", "Para seguir com a harmonização:", [
      { id: "agendar", titulo: "Agendar" },
      { id: "menu", titulo: "Voltar ao Menu" },
    ]),
    no("valores", "enviar_texto", "Valores", "O investimento varia conforme a avaliação."),
    no("faq", "pergunta_opcoes", "Dúvidas Frequentes", "Escolha sua dúvida sobre Harmonização Facial:", [
      { id: "natural", titulo: "Fica natural?" },
      { id: "resultado", titulo: "Quando vejo resultado?" },
    ]),
    no("faq-natural", "enviar_texto", "Mensagem", "Preservamos sua identidade com leveza e elegância."),
    no("faq-resultado", "enviar_texto", "Mensagem", "O resultado aparece progressivamente."),
    no("faq-continuar", "enviar_botoes", "Pergunta com botoes", "Deseja seguir para agendamento?", [
      { id: "agendar", titulo: "Agendar" },
      { id: "menu", titulo: "Menu" },
    ]),
    no("agenda", "agenda_escolher_horario", "Escolher horário", "Escolha um horário."),
    no("criar", "agenda_criar_agendamento", "Criar agendamento", "Agendamento criado."),
    no("fim", "encerrar", "Encerrar", "Até logo."),
  ];
  const resultado = repararGrafoAssistente({
    nos,
    conexoes: [
      sempre("inicio", "main", 1),
      sempre("harm-3", "menu-1", 2),
    ],
    estrito: true,
  });
  const alcancaveis = idsAlcancaveis(resultado.nos, resultado.conexoes);
  for (const id of [
    "harm-1",
    "harm-2",
    "harm-3",
    "valores",
    "faq",
    "faq-natural",
    "faq-resultado",
    "agenda",
  ]) {
    assert.equal(alcancaveis.has(id), true, `${id} deve permanecer alcançável`);
  }
  const menusProcedimento = resultado.nos.filter((item) => {
    const titulos = new Set(opcoesNo(item).map((opcao) => opcao.titulo));
    return titulos.has("Valores") && titulos.has("Dúvidas Frequentes");
  });
  assert.equal(menusProcedimento.length, 1);
  const menu = menusProcedimento[0];
  assert.equal(alcancaveis.has(menu.id), true);
  assert.deepEqual(
    new Set(opcoesNo(menu!).map((item) => item.titulo)),
    new Set(["Valores", "Dúvidas Frequentes", "Agendar", "Voltar ao Menu"])
  );
  const faq = resultado.nos.find((item) => item.id === "faq");
  assert.equal(
    resultado.conexoes.filter((item) => item.no_origem_id === faq?.id).length,
    2
  );
});

test("cria um ramo de midia para cada opcao da galeria e alcanca o menu final", () => {
  const nos: AssistenteAutomacaoNo[] = [
    no("inicio", "inicio", "Início", ""),
    no("main", "pergunta_opcoes", "Menu Principal", "Como podemos ajudar?", [
      { id: "galeria", titulo: "Antes e Depois" },
    ]),
    no("texto-galeria", "enviar_texto", "Antes e Depois", "Resultados reais autorizados."),
    no("galeria", "enviar_botoes", "Pergunta com botoes", "Escolha o procedimento:", [
      { id: "harm", titulo: "Harmonização" },
      { id: "melasma", titulo: "Melasma" },
      { id: "botox", titulo: "Botox" },
    ]),
    no("pos-galeria", "enviar_botoes", "Pergunta com botoes", "Quer avançar para o agendamento?", [
      { id: "agendar", titulo: "Agendar" },
      { id: "menu", titulo: "Menu" },
    ]),
    no("imagem", "enviar_imagem", "Antes e Depois", "Confira um resultado autorizado."),
    no("agenda", "agenda_escolher_horario", "Escolher horário", "Escolha um horário."),
    no("criar", "agenda_criar_agendamento", "Criar agendamento", "Agendamento criado."),
    no("fim", "encerrar", "Encerrar", "Até logo."),
  ];
  const resultado = repararGrafoAssistente({
    nos,
    conexoes: [
      sempre("inicio", "main", 1),
      sempre("texto-galeria", "galeria", 2),
    ],
    estrito: true,
  });
  const alcancaveis = idsAlcancaveis(resultado.nos, resultado.conexoes);
  const imagens = resultado.nos.filter((item) => item.tipo_no === "enviar_imagem");

  assert.equal(imagens.length, 3);
  assert.equal(imagens.every((item) => alcancaveis.has(item.id)), true);
  assert.equal(alcancaveis.has("pos-galeria"), true);
});

test("preserva listas e quebras de linha ao normalizar mensagens", () => {
  const plano = normalizarPlanoAssistente({
    nome_fluxo: "Clínica",
    objetivo: "Atender",
    resumo: "Teste",
    etapas: [
      {
        ref: "cuidados",
        tipo: "mensagem",
        titulo: "Cuidados",
        mensagem:
          "🩺 Cuidados e recuperação • Siga as orientações. • A recuperação será orientada individualmente.",
        opcoes: [],
      },
    ],
    rotas: [],
    mensagens_revisadas: [],
    variaveis_sugeridas: [],
    clarificacoes: [],
    avisos: [],
  });

  assert.equal(
    plano.etapas[0]?.mensagem,
    "🩺 Cuidados e recuperação\n• Siga as orientações.\n• A recuperação será orientada individualmente."
  );
});

test("ordena procedimentos, consolida cuidados e completa menu e setor", () => {
  const tentativas = {
    acao_excesso_tentativas: "transferir_atendimento",
    setor_excesso_tentativas: null,
  };
  const nos: AssistenteAutomacaoNo[] = [
    no("inicio", "inicio", "Início", ""),
    no("main", "pergunta_opcoes", "Menu Principal", "Como podemos ajudar?", [
      { id: "harm", titulo: "Harmonização" },
      { id: "melasma", titulo: "Melasma" },
      { id: "botox", titulo: "Botox" },
      { id: "antes", titulo: "Antes e Depois" },
      { id: "valores", titulo: "Valores" },
      { id: "agenda", titulo: "Agendar" },
      { id: "local", titulo: "Localização" },
      { id: "especialista", titulo: "Especialista" },
    ]),
    no(
      "visao",
      "enviar_texto",
      "Harmonização Facial — Visão geral",
      "✨ Harmonização Facial — Visão geral\n💉 Harmonização Facial\nProcedimentos personalizados."
    ),
    no(
      "cuidados-1",
      "enviar_texto",
      "Harmonização Facial — Cuidados e recuperação",
      "🩺 Cuidados • Siga as orientações."
    ),
    no(
      "resultado",
      "enviar_texto",
      "Harmonização Facial — Resultados esperados",
      "Resultados esperados de forma individualizada."
    ),
    no(
      "beneficios",
      "enviar_texto",
      "Harmonização Facial — Benefícios e indicações",
      "Benefícios e indicações após avaliação."
    ),
    no(
      "cuidados-2",
      "enviar_texto",
      "Harmonização Facial — Cuidados e resultados",
      "Tempo médio e recuperação variam conforme o protocolo."
    ),
    no("menu-harm", "enviar_botoes", "Menu Harmonização", "Próximos passos", [
      { id: "agendar", titulo: "Agendar" },
      { id: "menu", titulo: "Menu" },
    ]),
    no(
      "localizacao",
      "enviar_texto",
      "Localização",
      "📍 Clínica • Loja Império • R. João Bento, 266 • Centro • 🕐 Horário de atendimento • Segunda a sexta: 08h às 18h"
    ),
    {
      ...no("transferir", "transferir_setor", "Falar com especialista", "Aguarde."),
      configuracao_json: { mensagem: "Aguarde.", setor_id: "setor-clinica" },
    },
    no("fim", "encerrar", "Encerrar", "Até logo."),
  ];
  nos.find((item) => item.id === "main")!.configuracao_json = {
    ...nos.find((item) => item.id === "main")!.configuracao_json,
    ...tentativas,
  };
  nos.find((item) => item.id === "menu-harm")!.configuracao_json = {
    ...nos.find((item) => item.id === "menu-harm")!.configuracao_json,
    ...tentativas,
  };

  const resultado = repararGrafoAssistente({
    nos,
    conexoes: [sempre("inicio", "main", 1)],
    estrito: true,
  });
  const main = resultado.nos.find((item) => item.id === "main")!;
  const opcaoEncerrar = opcoesNo(main).find((item) =>
    item.titulo.includes("Encerrar")
  );
  assert.ok(opcaoEncerrar);
  assert.equal(
    resultado.conexoes.some(
      (item) =>
        item.no_origem_id === main.id &&
        item.condicao_json?.valor === opcaoEncerrar.id &&
        resultado.nos.find((no) => no.id === item.no_destino_id)?.tipo_no ===
          "encerrar"
    ),
    true
  );

  const blocosOrdenados = ["visao", "beneficios", "cuidados-1", "resultado"];
  for (let indice = 0; indice < blocosOrdenados.length - 1; indice += 1) {
    assert.equal(
      resultado.conexoes.some(
        (item) =>
          item.no_origem_id === blocosOrdenados[indice] &&
          item.no_destino_id === blocosOrdenados[indice + 1]
      ),
      true
    );
  }
  assert.equal(resultado.nos.some((item) => item.id === "cuidados-2"), false);
  assert.equal(
    String(
      resultado.nos.find((item) => item.id === "visao")?.configuracao_json
        ?.mensagem
    ).includes("\n💉 Harmonização Facial"),
    false
  );
  assert.equal(
    resultado.nos
      .filter(
        (item) =>
          item.configuracao_json?.acao_excesso_tentativas ===
          "transferir_atendimento"
      )
      .every(
        (item) =>
          item.configuracao_json?.setor_excesso_tentativas === "setor-clinica"
      ),
    true
  );
  const mensagemLocal = String(
    resultado.nos.find((item) => item.id === "localizacao")?.configuracao_json
      ?.mensagem
  );
  assert.equal(mensagemLocal.includes(" • "), false);
  assert.equal(mensagemLocal.includes("\n\n🕐 Horário"), true);
});

test("consolida menus principais duplicados e remove FAQ recursiva sem rota", () => {
  const nos: AssistenteAutomacaoNo[] = [
    no("inicio", "inicio", "Início", ""),
    no("main-1", "pergunta_opcoes", "Menu Principal", "Como podemos ajudar?", [
      { id: "harm", titulo: "Harmonização" },
      { id: "melasma", titulo: "Melasma" },
      { id: "botox", titulo: "Botox" },
      { id: "valores", titulo: "Valores" },
      { id: "agenda", titulo: "Agendar" },
      { id: "local", titulo: "Localização" },
    ]),
    no("main-2", "pergunta_opcoes", "Menu Principal", "Como podemos ajudar?", [
      { id: "especialista", titulo: "Especialista" },
    ]),
    no("harm-texto", "enviar_texto", "Harmonização Facial — Visão geral", "Explicação."),
    no("harm-menu", "enviar_botoes", "Menu Harmonização", "Próximos passos", [
      { id: "faq", titulo: "Dúvidas Frequentes" },
      { id: "menu", titulo: "Menu" },
    ]),
    no("faq", "enviar_botoes", "Dúvidas Frequentes - Harmonização Facial", "Dúvidas", [
      { id: "faq", titulo: "Dúvidas Frequentes" },
      { id: "valores", titulo: "Valores" },
    ]),
    no("faq-dor", "enviar_texto", "Dúvida - Harmonização Facial", "O desconforto costuma ser leve."),
    no("valores", "enviar_texto", "Valores", "O investimento depende da avaliação."),
    no("transferir", "transferir_setor", "Falar com especialista", "Aguarde."),
    no("fim", "encerrar", "Encerrar", "Até logo."),
  ];
  nos.find((item) => item.id === "transferir")!.configuracao_json.setor_id = "setor-clinica";

  const resultado = repararGrafoAssistente({
    nos,
    conexoes: [sempre("inicio", "main-1", 1)],
    estrito: true,
  });
  const alcancaveis = idsAlcancaveis(resultado.nos, resultado.conexoes);
  assert.equal(
    resultado.nos.every((item) => alcancaveis.has(item.id)),
    true,
    "nenhum bloco consolidado deve permanecer isolado"
  );
  const menusPrincipais = resultado.nos.filter((item) =>
    item.titulo === "Menu Principal"
  );
  assert.equal(menusPrincipais.length, 1);
  assert.equal(alcancaveis.has(menusPrincipais[0].id), true);

  const menuFaq = resultado.nos.find((item) => item.id === "faq")!;
  assert.equal(
    opcoesNo(menuFaq).some((opcao) => opcao.titulo === "Dúvidas Frequentes"),
    false
  );
  assert.equal(
    resultado.conexoes.filter((item) => item.no_origem_id === menuFaq.id).length,
    opcoesNo(menuFaq).length
  );
});
