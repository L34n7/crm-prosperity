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
