import { randomUUID } from "crypto";

import type {
  AssistenteAutomacaoConexao,
  AssistenteAutomacaoNo,
} from "./assistente-fluxos-base";
import {
  assinaturaNo,
  clonarConexao,
  clonarNo,
  conteudoNo,
  ehAgendamento,
  ehAntesDepois,
  ehConteudoProcedimento,
  ehFaq,
  ehLocalizacao,
  ehMenuFaq,
  ehMenuProcedimento,
  ehPergunta,
  ehTerminal,
  ehValores,
  encontrarPorTipo,
  indicePorId,
  melhorMenuPrincipal,
  normalizarId,
  servicoDoNo,
  type Servico,
} from "./assistente-fluxos-reparador-semantica";
import {
  clonarDestinoParaOpcao,
  criarConexaoOpcao,
  criarConexaoSempre,
  criarNoEncerrar,
  criarNoFallback,
  deduplicarSempre,
  escolherDestinoSemantico,
  idsAlcancaveis,
  opcoesDaPergunta,
  pontuarAncora,
  substituirSempre,
} from "./assistente-fluxos-reparador-rotas";

export type ResultadoReparoGrafoAssistente = {
  nos: AssistenteAutomacaoNo[];
  conexoes: AssistenteAutomacaoConexao[];
  avisos: string[];
};

function garantirInicio(
  nos: AssistenteAutomacaoNo[],
  conexoes: AssistenteAutomacaoConexao[],
  avisos: string[]
) {
  const inicios = nos.filter((no) => no.tipo_no === "inicio");

  if (inicios.length === 0) {
    const inicio: AssistenteAutomacaoNo = {
      id: randomUUID(),
      tipo_no: "inicio",
      titulo: "Início",
      descricao: null,
      posicao_x: 0,
      posicao_y: 0,
      configuracao_json: {},
      delay_segundos: null,
    };
    nos.unshift(inicio);
    avisos.push("O bloco de início ausente foi recriado.");
    return { nos, conexoes, inicio };
  }

  const inicio = inicios[0];

  if (inicios.length === 1) return { nos, conexoes, inicio };

  const remover = new Set(inicios.slice(1).map((no) => no.id));
  avisos.push(
    `${remover.size} bloco(s) de início duplicado(s) foram removidos.`
  );

  return {
    nos: nos.filter((no) => !remover.has(no.id)),
    conexoes: conexoes.filter(
      (conexao) =>
        !remover.has(conexao.no_origem_id) &&
        !remover.has(conexao.no_destino_id)
    ),
    inicio,
  };
}

export function repararGrafoAssistente(params: {
  nos: AssistenteAutomacaoNo[];
  conexoes: AssistenteAutomacaoConexao[];
}): ResultadoReparoGrafoAssistente {
  let nos = params.nos.map(clonarNo);
  let conexoes = params.conexoes.map(clonarConexao);
  const avisos: string[] = [];
  const ids = new Set(nos.map((no) => no.id));

  conexoes = conexoes.filter(
    (conexao) =>
      ids.has(conexao.no_origem_id) &&
      ids.has(conexao.no_destino_id) &&
      conexao.no_origem_id !== conexao.no_destino_id
  );

  const inicioReparado = garantirInicio(nos, conexoes, avisos);
  nos = inicioReparado.nos;
  conexoes = inicioReparado.conexoes;
  const inicio = inicioReparado.inicio;
  const mainMenu = melhorMenuPrincipal(nos);
  const ordemNos = indicePorId(nos);
  const menusProcedimento = new Map<Servico, AssistenteAutomacaoNo>();
  const primeirosConteudos = new Map<Servico, AssistenteAutomacaoNo>();
  const menusFaq = new Map<Servico, AssistenteAutomacaoNo>();

  for (const servico of ["harmonizacao", "melasma", "botox"] as Servico[]) {
    const menu = nos.find((no) => ehMenuProcedimento(no, servico));
    const faq = nos.find((no) => ehMenuFaq(no, servico));
    const conteudos = nos
      .filter((no) => ehConteudoProcedimento(no, servico))
      .sort(
        (a, b) =>
          (ordemNos.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (ordemNos.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      );

    if (menu) menusProcedimento.set(servico, menu);
    if (faq) menusFaq.set(servico, faq);
    if (conteudos[0]) primeirosConteudos.set(servico, conteudos[0]);

    for (let indice = 0; indice < conteudos.length - 1; indice += 1) {
      conexoes = substituirSempre({
        origem: conteudos[indice],
        destino: conteudos[indice + 1],
        conexoes,
      });
    }

    const ultimo = conteudos.at(-1);
    if (ultimo && menu) {
      conexoes = substituirSempre({ origem: ultimo, destino: menu, conexoes });
    }
  }

  const nosPorId = new Map(nos.map((no) => [no.id, no]));

  for (const pergunta of nos.filter(ehPergunta)) {
    const timeout = conexoes
      .filter(
        (conexao) =>
          conexao.no_origem_id === pergunta.id &&
          conexao.condicao_json?.tipo === "timeout_sem_resposta"
      )
      .slice(0, 1);
    const saidasAtuais = conexoes.filter(
      (conexao) => conexao.no_origem_id === pergunta.id
    );
    const usadas = new Set<string>();
    const novas: AssistenteAutomacaoConexao[] = [];

    for (const opcao of opcoesDaPergunta(pergunta)) {
      const atual = saidasAtuais.find(
        (conexao) =>
          conexao.condicao_json?.tipo !== "timeout_sem_resposta" &&
          normalizarId(conexao.condicao_json?.valor || conexao.rotulo) ===
            opcao.id
      );
      const destinoAtual = atual
        ? nosPorId.get(atual.no_destino_id) || null
        : null;
      let destino =
        escolherDestinoSemantico({
          origem: pergunta,
          opcao,
          nos,
          usados: usadas,
          mainMenu,
          menusProcedimento,
          primeirosConteudos,
          menusFaq,
          ordemNos,
        }) ||
        (destinoAtual && destinoAtual.id !== pergunta.id
          ? destinoAtual
          : null);

      if (!destino) {
        destino = criarNoFallback(opcao);
        nos.push(destino);
        nosPorId.set(destino.id, destino);
        avisos.push(
          `Foi criado um bloco de apoio para a opção “${opcao.titulo}”.`
        );
      }

      if (usadas.has(destino.id)) {
        destino = clonarDestinoParaOpcao({
          destino,
          opcao,
          nos,
          conexoes,
        });
        nosPorId.set(destino.id, destino);
      }

      usadas.add(destino.id);
      novas.push(
        criarConexaoOpcao({
          origem: pergunta.id,
          destino: destino.id,
          opcao,
          ordem: conexoes.length + novas.length + 1,
        })
      );
    }

    conexoes = conexoes.filter(
      (conexao) => conexao.no_origem_id !== pergunta.id
    );
    conexoes.push(...novas, ...timeout);
  }

  const destinoInicioExistente = params.conexoes
    .filter((conexao) => conexao.no_origem_id === inicio.id)
    .sort((a, b) => a.ordem - b.ordem)
    .map((conexao) => nosPorId.get(conexao.no_destino_id))
    .find((no) => no && no.id !== inicio.id);
  const destinoInicio =
    destinoInicioExistente ||
    mainMenu ||
    nos.find((no) => no.id !== inicio.id && !ehTerminal(no)) ||
    nos.find((no) => no.id !== inicio.id);

  conexoes = conexoes.filter(
    (conexao) => conexao.no_origem_id !== inicio.id
  );

  if (destinoInicio) {
    conexoes.push(
      criarConexaoSempre(inicio.id, destinoInicio.id, conexoes.length + 1)
    );
  }

  let terminal = nos.find(ehTerminal);

  if (!terminal) {
    terminal = criarNoEncerrar();
    nos.push(terminal);
    nosPorId.set(terminal.id, terminal);
    avisos.push("Um bloco de encerramento foi adicionado ao rascunho.");
  }

  for (const no of nos) {
    if (
      no.id === inicio.id ||
      ehPergunta(no) ||
      ehTerminal(no) ||
      conexoes.some((conexao) => conexao.no_origem_id === no.id)
    ) {
      continue;
    }

    const servico = servicoDoNo(no);
    let destino: AssistenteAutomacaoNo | null = null;

    if (no.tipo_no === "agenda_escolher_horario") {
      destino =
        encontrarPorTipo(nos, ["agenda_criar_agendamento"]) || null;
    } else if (servico && ehFaq(conteudoNo(no))) {
      destino =
        menusFaq.get(servico) ||
        menusProcedimento.get(servico) ||
        mainMenu;
    } else if (servico && ehConteudoProcedimento(no, servico)) {
      destino = menusProcedimento.get(servico) || mainMenu;
    } else if (
      no.tipo_no === "agenda_criar_agendamento" ||
      no.tipo_no === "botao_redirect" ||
      no.tipo_no === "enviar_imagem" ||
      ehValores(conteudoNo(no)) ||
      ehLocalizacao(conteudoNo(no)) ||
      ehAntesDepois(conteudoNo(no))
    ) {
      destino = mainMenu;
    } else {
      destino = mainMenu;
    }

    if (!destino || destino.id === no.id) destino = terminal;
    if (destino && destino.id !== no.id) {
      conexoes.push(
        criarConexaoSempre(no.id, destino.id, conexoes.length + 1)
      );
    }
  }

  conexoes = deduplicarSempre(conexoes, avisos);
  let alcancaveis = idsAlcancaveis(nos, conexoes);
  const assinaturas = new Set(
    nos.filter((no) => alcancaveis.has(no.id)).map(assinaturaNo)
  );
  const duplicados = new Set(
    nos
      .filter(
        (no) =>
          !alcancaveis.has(no.id) && assinaturas.has(assinaturaNo(no))
      )
      .map((no) => no.id)
  );

  if (duplicados.size > 0) {
    nos = nos.filter((no) => !duplicados.has(no.id));
    conexoes = conexoes.filter(
      (conexao) =>
        !duplicados.has(conexao.no_origem_id) &&
        !duplicados.has(conexao.no_destino_id)
    );
    avisos.push(
      `${duplicados.size} bloco(s) duplicado(s) e desconectado(s) foram consolidado(s).`
    );
  }

  alcancaveis = idsAlcancaveis(nos, conexoes);
  const restantes = nos
    .filter((no) => !alcancaveis.has(no.id))
    .sort((a, b) => Number(ehTerminal(a)) - Number(ehTerminal(b)));
  const terminalAlcancavel = nos.some(
    (no) => alcancaveis.has(no.id) && ehTerminal(no)
  );
  const terminaisRedundantes = new Set<string>();

  for (const no of restantes) {
    if (ehTerminal(no) && terminalAlcancavel) {
      terminaisRedundantes.add(no.id);
      continue;
    }

    const servico = servicoDoNo(no);
    const alvo =
      (servico && menusProcedimento.get(servico)) ||
      mainMenu ||
      terminal;
    const ancoraClassificada = nos
      .filter(
        (item) =>
          alcancaveis.has(item.id) &&
          item.id !== inicio.id &&
          !ehPergunta(item) &&
          !ehTerminal(item) &&
          item.id !== no.id &&
          conexoes.some(
            (conexao) =>
              conexao.no_origem_id === item.id &&
              conexao.condicao_json?.tipo === "sempre"
          )
      )
      .map((item) => ({ item, pontos: pontuarAncora(no, item) }))
      .sort((a, b) => b.pontos - a.pontos);
    const ancora =
      ancoraClassificada[0] && ancoraClassificada[0].pontos > 0
        ? ancoraClassificada[0].item
        : null;

    if (!ancora) continue;

    const saida = conexoes.find(
      (conexao) =>
        conexao.no_origem_id === ancora.id &&
        conexao.condicao_json?.tipo === "sempre"
    );
    if (!saida) continue;

    const destinoAnterior = saida.no_destino_id;
    saida.no_destino_id = no.id;

    if (
      !ehPergunta(no) &&
      !ehTerminal(no) &&
      !conexoes.some((conexao) => conexao.no_origem_id === no.id)
    ) {
      conexoes.push(
        criarConexaoSempre(
          no.id,
          alvo && alvo.id !== no.id ? alvo.id : destinoAnterior,
          conexoes.length + 1
        )
      );
    }

    alcancaveis = idsAlcancaveis(nos, conexoes);
  }

  if (terminaisRedundantes.size > 0) {
    nos = nos.filter((no) => !terminaisRedundantes.has(no.id));
    conexoes = conexoes.filter(
      (conexao) =>
        !terminaisRedundantes.has(conexao.no_origem_id) &&
        !terminaisRedundantes.has(conexao.no_destino_id)
    );
  }

  conexoes = deduplicarSempre(conexoes, avisos);
  alcancaveis = idsAlcancaveis(nos, conexoes);
  const aindaInalcancaveis = nos.filter(
    (no) => !alcancaveis.has(no.id)
  );

  if (aindaInalcancaveis.length > 0) {
    const remover = new Set(aindaInalcancaveis.map((no) => no.id));
    nos = nos.filter((no) => !remover.has(no.id));
    conexoes = conexoes.filter(
      (conexao) =>
        !remover.has(conexao.no_origem_id) &&
        !remover.has(conexao.no_destino_id)
    );
    avisos.push(
      `${aindaInalcancaveis.length} bloco(s) sem relação segura com o pedido foram removido(s) somente após a reconstrução completa das rotas.`
    );
  }

  const idsFinais = new Set(nos.map((no) => no.id));
  conexoes = conexoes
    .filter(
      (conexao) =>
        idsFinais.has(conexao.no_origem_id) &&
        idsFinais.has(conexao.no_destino_id) &&
        conexao.no_origem_id !== conexao.no_destino_id
    )
    .map((conexao, indice) => ({ ...conexao, ordem: indice + 1 }));

  return { nos, conexoes, avisos };
}
