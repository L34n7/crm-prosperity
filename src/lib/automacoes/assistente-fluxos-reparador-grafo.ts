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
  ehAbrirLocalizacao,
  ehAgendamento,
  ehAntesDepois,
  ehConteudoProcedimento,
  ehEspecialista,
  ehFaq,
  ehLocalizacao,
  ehMenuFaq,
  ehVoltarMenu,
  ehMenuProcedimento,
  ehPergunta,
  ehTerminal,
  ehValores,
  encontrarPorTipo,
  indicePorId,
  melhorMenuPrincipal,
  normalizarId,
  respostaCorrespondeFaq,
  servicoDoNo,
  servicoDoTexto,
  type Servico,
} from "./assistente-fluxos-reparador-semantica";
import {
  clonarDestinoParaOpcao,
  criarConexaoOpcao,
  criarConexaoSempre,
  criarNoEncerrar,
  deduplicarSempre,
  escolherDestinoSemantico,
  idsAlcancaveis,
  opcoesDaPergunta,
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

function ehConfirmacaoHorario(no: AssistenteAutomacaoNo) {
  if (no.tipo_no !== "enviar_botoes") return false;
  const botoes = Array.isArray(no.configuracao_json?.botoes)
    ? no.configuracao_json.botoes
    : [];
  const ids = new Set(
    botoes.map((botao) => normalizarId(botao?.id)).filter(Boolean)
  );
  return ids.has("confirmar_horario") && ids.has("escolher_outro_horario");
}

function destinoOriginalCorresponde(params: {
  origem: AssistenteAutomacaoNo;
  destino: AssistenteAutomacaoNo;
  opcao: { id: string; titulo: string };
  mainMenu: AssistenteAutomacaoNo | null;
  menusProcedimento: Map<Servico, AssistenteAutomacaoNo>;
  menusFaq: Map<Servico, AssistenteAutomacaoNo>;
}) {
  const { origem, destino, opcao, mainMenu, menusProcedimento, menusFaq } =
    params;
  const servicoOrigem = servicoDoNo(origem);
  const servicoOpcao = servicoDoTexto(opcao.titulo);
  const origemFaq = ehMenuFaq(origem, servicoOrigem);

  if (origemFaq) {
    if (ehVoltarMenu(opcao.titulo)) {
      return Boolean(
        servicoOrigem && menusProcedimento.get(servicoOrigem)?.id === destino.id
      );
    }
    return respostaCorrespondeFaq(opcao, destino);
  }
  if (ehVoltarMenu(opcao.titulo)) return mainMenu?.id === destino.id;
  if (servicoOpcao) return servicoDoNo(destino) === servicoOpcao;
  if (ehAgendamento(opcao.titulo)) {
    return destino.tipo_no === "agenda_escolher_horario";
  }
  if (ehAbrirLocalizacao(opcao.titulo)) return destino.tipo_no === "botao_redirect";
  if (ehLocalizacao(opcao.titulo)) return ehLocalizacao(conteudoNo(destino));
  if (ehEspecialista(opcao.titulo)) return destino.tipo_no === "transferir_setor";
  if (ehAntesDepois(opcao.titulo)) {
    return destino.tipo_no === "enviar_imagem" || ehAntesDepois(conteudoNo(destino));
  }
  if (ehValores(opcao.titulo)) return ehValores(conteudoNo(destino));
  if (ehFaq(opcao.titulo)) {
    return Boolean(servicoOrigem && menusFaq.get(servicoOrigem)?.id === destino.id);
  }
  return true;
}

function garantirConfirmacoesAgenda(params: {
  nos: AssistenteAutomacaoNo[];
  conexoes: AssistenteAutomacaoConexao[];
  avisos: string[];
}) {
  const nos = [...params.nos];
  let conexoes = [...params.conexoes];
  const nosPorId = new Map(nos.map((no) => [no.id, no]));

  for (const escolher of nos.filter(
    (no) => no.tipo_no === "agenda_escolher_horario"
  )) {
    const saidas = conexoes.filter(
      (conexao) => conexao.no_origem_id === escolher.id
    );
    if (saidas.some((conexao) => {
      const destino = nosPorId.get(conexao.no_destino_id);
      return destino ? ehConfirmacaoHorario(destino) : false;
    })) {
      continue;
    }

    const agendaId = String(escolher.configuracao_json?.agenda_id || "");
    const criar =
      nos.find(
        (no) =>
          no.tipo_no === "agenda_criar_agendamento" &&
          agendaId &&
          String(no.configuracao_json?.agenda_id || "") === agendaId
      ) || nos.find((no) => no.tipo_no === "agenda_criar_agendamento");
    if (!criar) continue;

    const confirmacao: AssistenteAutomacaoNo = {
      id: randomUUID(),
      tipo_no: "enviar_botoes",
      titulo: "Confirmar horário",
      descricao: null,
      posicao_x: escolher.posicao_x + 300,
      posicao_y: escolher.posicao_y,
      configuracao_json: {
        mensagem:
          "Confirma o horário escolhido para {{agenda_data_nova}} às {{agenda_hora_nova}}?",
        delay_segundos: 3,
        botoes: [
          { id: "confirmar_horario", titulo: "Sim" },
          { id: "escolher_outro_horario", titulo: "Escolher outro" },
        ],
        max_tentativas_invalidas: 3,
        max_tentativas_sem_resposta: 3,
        acao_excesso_tentativas: "transferir_atendimento",
        setor_excesso_tentativas: null,
        mensagem_excesso_tentativas:
          "Não consegui confirmar o horário. Vou encaminhar você para um atendente.",
        notificar_excesso_tentativas: true,
        notificar_email_excesso_tentativas: true,
      },
      delay_segundos: 3,
    };

    nos.push(confirmacao);
    nosPorId.set(confirmacao.id, confirmacao);
    conexoes = conexoes.filter(
      (conexao) =>
        conexao.no_origem_id !== escolher.id ||
        conexao.condicao_json?.tipo === "timeout_sem_resposta"
    );
    conexoes.push(
      criarConexaoSempre(escolher.id, confirmacao.id, conexoes.length + 1),
      criarConexaoOpcao({
        origem: confirmacao.id,
        destino: criar.id,
        opcao: { id: "confirmar_horario", titulo: "Sim" },
        ordem: conexoes.length + 2,
      }),
      criarConexaoOpcao({
        origem: confirmacao.id,
        destino: escolher.id,
        opcao: {
          id: "escolher_outro_horario",
          titulo: "Escolher outro",
        },
        ordem: conexoes.length + 3,
      })
    );
    params.avisos.push(
      `Foi adicionada confirmação antes de criar o agendamento em “${escolher.titulo}”.`
    );
  }

  return { nos, conexoes };
}

export function repararGrafoAssistente(params: {
  nos: AssistenteAutomacaoNo[];
  conexoes: AssistenteAutomacaoConexao[];
  estrito?: boolean;
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
      const destinoOriginalSeguro = Boolean(
        destinoAtual &&
          destinoAtual.id !== pergunta.id &&
          (params.estrito === false || !usadas.has(destinoAtual.id)) &&
          (params.estrito === false ||
            destinoOriginalCorresponde({
              origem: pergunta,
              destino: destinoAtual,
              opcao,
              mainMenu,
              menusProcedimento,
              menusFaq,
            }))
      );
      const servicoOrigem = servicoDoNo(pergunta);
      let destino = destinoOriginalSeguro
        ? destinoAtual
        : escolherDestinoSemantico({
          origem: pergunta,
          opcao,
          nos,
          usados: usadas,
          mainMenu,
          menusProcedimento,
          primeirosConteudos,
          menusFaq,
          ordemNos,
        });

      if (!destino && ehVoltarMenu(opcao.titulo)) {
        destino =
          (destinoAtual && destinoAtual.id !== pergunta.id
            ? destinoAtual
            : null) ||
          (servicoOrigem
            ? nos.find((no) => ehMenuProcedimento(no, servicoOrigem))
            : null) || mainMenu;
      }

      if (!destino) {
        avisos.push(
          `A opção “${opcao.titulo}” não possui um destino semanticamente seguro. O plano deve ser gerado novamente.`
        );
        continue;
      }

      if (params.estrito !== false && usadas.has(destino.id)) {
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

  const confirmacoesAgenda = garantirConfirmacoesAgenda({
    nos,
    conexoes,
    avisos,
  });
  nos = confirmacoesAgenda.nos;
  conexoes = confirmacoesAgenda.conexoes;

  const destinoInicioExistente = params.conexoes
    .filter((conexao) => conexao.no_origem_id === inicio.id)
    .sort((a, b) => a.ordem - b.ordem)
    .map((conexao) => nosPorId.get(conexao.no_destino_id))
    .find((no) => no && no.id !== inicio.id);
  const destinoInicio =
    mainMenu ||
    destinoInicioExistente ||
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
  const restantes = nos.filter((no) => !alcancaveis.has(no.id));
  const terminaisRedundantes = new Set<string>();

  for (const no of restantes) {
    if (ehTerminal(no) && nos.some(
      (item) => item.id !== no.id && alcancaveis.has(item.id) && ehTerminal(item)
    )) {
      terminaisRedundantes.add(no.id);
    }
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
    avisos.push(
      `${aindaInalcancaveis.length} bloco(s) permaneceram inalcançáveis porque não havia relação segura para inseri-los. A validação deve bloquear o plano e solicitar nova geração.`
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
