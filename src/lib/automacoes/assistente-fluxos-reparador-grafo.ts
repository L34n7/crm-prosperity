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
  ehEncerrar,
  ehEspecialista,
  ehFaq,
  ehLocalizacao,
  ehMenuAntesDepois,
  ehMenuFaq,
  ehMenuPrincipal,
  intencaoFaq,
  ehVoltarMenu,
  ehMenuProcedimento,
  ehPergunta,
  ehTerminal,
  ehValores,
  encontrarPorTipo,
  indicePorId,
  melhorMenuPrincipal,
  normalizar,
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
  if (!ehPergunta(no)) return false;
  const opcoes = opcoesDaPergunta(no);
  return (
    opcoes.some((opcao) =>
      /\b(confirmar|confirmo|sim)\b/.test(normalizar(`${opcao.id} ${opcao.titulo}`))
    ) &&
    opcoes.some((opcao) =>
      /\b(escolher|outro|alterar|trocar)\b/.test(
        normalizar(`${opcao.id} ${opcao.titulo}`)
      )
    )
  );
}

function ehMensagemAgendamentoConfirmado(no: AssistenteAutomacaoNo) {
  if (no.tipo_no !== "enviar_texto") return false;
  return /\b(agendamento confirmado|horario confirmado|horario reservado|agendado com sucesso)\b/.test(
    conteudoNo(no)
  );
}

const TITULOS_INTENCAO_FAQ = {
  dor: "Dói?",
  duracao: "Quanto tempo dura?",
  resultado: "Quando vejo o resultado?",
  recorrencia: "Pode voltar?",
  naturalidade: "O resultado fica natural?",
  sessoes: "Quantas sessões são necessárias?",
} as const;

const ROTULOS_SERVICO: Record<Servico, string> = {
  harmonizacao: "Harmonização Facial",
  melasma: "Tratamento de Melasma e Manchas",
  botox: "Aplicação de Botox",
};

const ORDEM_CONTEUDO_PROCEDIMENTO = {
  visao_geral: 0,
  beneficios: 1,
  cuidados: 2,
  resultados: 3,
} as const;

type SecaoProcedimento = keyof typeof ORDEM_CONTEUDO_PROCEDIMENTO;

function formatarMensagemWhatsApp(no: AssistenteAutomacaoNo) {
  const atual = no.configuracao_json?.mensagem;
  if (typeof atual !== "string" || !atual.trim()) return;

  let mensagem = atual
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\s+•\s*/g, "\n• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (ehLocalizacao(`${no.titulo} ${mensagem}`)) {
    mensagem = mensagem
      .replace(/\n•\s*/g, "\n")
      .replace(/\n(?=(?:🕐|horario(?: de atendimento)?\b))/gi, "\n\n")
      .replace(/\n(?=(?:segunda a sexta|sabado)\s*:)/gi, "\n\n");
  } else {
    mensagem = mensagem.replace(/([^\n])\n• /, "$1\n\n• ");
  }

  const servico = servicoDoNo(no);
  if (servico) {
    const nomeServico = normalizar(ROTULOS_SERVICO[servico]);
    const linhas = mensagem.split("\n");
    let nomeJaApresentado = false;
    mensagem = linhas
      .filter((linha) => {
        const normalizada = normalizar(linha);
        const apresentaNome = normalizada.includes(nomeServico);
        const apenasNome =
          normalizada === nomeServico ||
          normalizada === `${nomeServico} visao geral` ||
          (servicoDoTexto(linha) === servico &&
            normalizada.split(" ").length <= 4 &&
            !/\b(visao|beneficios?|indicacoes?|cuidados?|resultados?)\b/.test(
              normalizada
            ));
        if (apresentaNome && !nomeJaApresentado) {
          nomeJaApresentado = true;
          return true;
        }
        return !(nomeJaApresentado && apenasNome);
      })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  no.configuracao_json = { ...no.configuracao_json, mensagem };
}

function secaoProcedimento(no: AssistenteAutomacaoNo): SecaoProcedimento {
  const titulo = normalizar(no.titulo);
  const mensagem = normalizar(no.configuracao_json?.mensagem);
  const tituloAmbiguo =
    /\bcuidados?\b/.test(titulo) && /\bresultados?\b/.test(titulo);

  if (tituloAmbiguo) {
    if (/\b(beneficios?|indicacoes?)\b/.test(mensagem)) return "beneficios";
    if (/\b(cuidados?|recuperacao|duracao|tempo medio)\b/.test(mensagem)) {
      return "cuidados";
    }
    if (/\b(resultados? esperados?|evolucao|efeito aparece)\b/.test(mensagem)) {
      return "resultados";
    }
  }

  if (/\b(beneficios?|indicacoes?)\b/.test(titulo)) return "beneficios";
  if (/\b(cuidados?|recuperacao|duracao|tempo medio)\b/.test(titulo)) {
    return "cuidados";
  }
  if (/\b(resultados? esperados?|evolucao esperada)\b/.test(titulo)) {
    return "resultados";
  }
  if (/\b(beneficios?|indicacoes?)\b/.test(mensagem)) return "beneficios";
  if (/\b(cuidados?|recuperacao|duracao|tempo medio)\b/.test(mensagem)) {
    return "cuidados";
  }
  if (/\b(resultados? esperados?|evolucao|efeito aparece)\b/.test(mensagem)) {
    return "resultados";
  }
  return "visao_geral";
}

function unirMensagensProcedimento(nos: AssistenteAutomacaoNo[]) {
  const partes: string[] = [];
  const vistas = new Set<string>();

  for (const no of nos) {
    const mensagem = String(no.configuracao_json?.mensagem || "").trim();
    for (const parte of mensagem.split(/\n{2,}/)) {
      const chave = normalizar(parte);
      if (!chave || vistas.has(chave)) continue;
      vistas.add(chave);
      partes.push(parte.trim());
    }
  }

  return partes.join("\n\n");
}

function consolidarConteudosProcedimento(params: {
  nos: AssistenteAutomacaoNo[];
  conexoes: AssistenteAutomacaoConexao[];
  servico: Servico;
  avisos: string[];
}) {
  let { nos, conexoes } = params;
  const candidatos = nos.filter((no) =>
    ehConteudoProcedimento(no, params.servico)
  );
  const porSecao = new Map<SecaoProcedimento, AssistenteAutomacaoNo[]>();

  for (const no of candidatos) {
    const secao = secaoProcedimento(no);
    porSecao.set(secao, [...(porSecao.get(secao) || []), no]);
  }

  const remover = new Set<string>();
  for (const [secao, blocos] of porSecao) {
    const canonico = blocos[0];
    if (!canonico || blocos.length === 1) continue;
    canonico.configuracao_json = {
      ...canonico.configuracao_json,
      mensagem: unirMensagensProcedimento(blocos),
    };
    for (const duplicado of blocos.slice(1)) remover.add(duplicado.id);
    canonico.titulo = `${ROTULOS_SERVICO[params.servico]} — ${
      secao === "beneficios"
        ? "Benefícios e indicações"
        : secao === "cuidados"
          ? "Cuidados, duração e recuperação"
          : secao === "resultados"
            ? "Resultados esperados"
            : "Visão geral"
    }`;
  }

  if (candidatos.length >= 2 && !porSecao.has("resultados")) {
    const referencia = candidatos.at(-1)!;
    const resultado: AssistenteAutomacaoNo = {
      ...clonarNo(referencia),
      id: randomUUID(),
      titulo: `${ROTULOS_SERVICO[params.servico]} — Resultados esperados`,
      configuracao_json: {
        ...referencia.configuracao_json,
        mensagem:
          "✨ Resultados esperados\n\nOs resultados variam conforme a avaliação, o protocolo indicado e a resposta individual. A especialista explicará as expectativas de forma personalizada.",
      },
    };
    nos.push(resultado);
    params.avisos.push(
      `Foi adicionada uma conclusão de resultados esperados para ${ROTULOS_SERVICO[params.servico]}.`
    );
  }

  if (remover.size > 0) {
    nos = nos.filter((no) => !remover.has(no.id));
    conexoes = conexoes.filter(
      (conexao) =>
        !remover.has(conexao.no_origem_id) &&
        !remover.has(conexao.no_destino_id)
    );
    params.avisos.push(
      `Conteúdos repetidos de ${ROTULOS_SERVICO[params.servico]} foram consolidados.`
    );
  }

  return { nos, conexoes };
}

function garantirOpcaoEncerrar(
  menu: AssistenteAutomacaoNo | null,
  avisos: string[]
) {
  if (!menu) return;
  const opcoes = opcoesDaPergunta(menu);
  if (opcoes.some((opcao) => ehEncerrar(opcao.titulo))) return;
  if (opcoes.length >= 10) {
    avisos.push(
      "O Menu Principal já possui 10 opções e não comporta a opção de encerramento."
    );
    return;
  }
  aplicarOpcoes(menu, [
    ...opcoes,
    { id: "encerrar_atendimento", titulo: "Encerrar atendimento" },
  ]);
  avisos.push("A opção “Encerrar atendimento” foi adicionada ao Menu Principal.");
}

function propagarSetorExcessoTentativas(
  nos: AssistenteAutomacaoNo[],
  avisos: string[]
) {
  const setores = new Set(
    nos
      .filter((no) => no.tipo_no === "transferir_setor")
      .map((no) => String(no.configuracao_json?.setor_id || "").trim())
      .filter(Boolean)
  );
  if (setores.size !== 1) return;
  const setorId = [...setores][0];
  let corrigidos = 0;

  for (const no of nos) {
    const config = no.configuracao_json || {};
    if (
      config.acao_excesso_tentativas === "transferir_atendimento" &&
      !String(config.setor_excesso_tentativas || "").trim()
    ) {
      no.configuracao_json = {
        ...config,
        setor_excesso_tentativas: setorId,
      };
      corrigidos += 1;
    }
  }

  if (corrigidos > 0) {
    avisos.push(
      `O setor de transferência foi aplicado a ${corrigidos} bloco(s) com excesso de tentativas.`
    );
  }
}

function tituloGenerico(no: AssistenteAutomacaoNo) {
  return /^(mensagem|pergunta|pergunta com botoes|pergunta com opcoes)$/i.test(
    normalizar(no.titulo)
  );
}

/**
 * A IA às vezes divide uma tela longa em blocos contíguos sem repetir o nome
 * do procedimento. O compilador preserva a ordem original, então podemos
 * herdar o contexto até surgir outro procedimento ou uma seção global.
 */
function enriquecerTitulosPorContexto(nos: AssistenteAutomacaoNo[]) {
  let servicoAtual: Servico | null = null;
  let contextoFaq = false;
  let intencoesFaqPendentes: Array<NonNullable<ReturnType<typeof intencaoFaq>>> = [];

  for (const no of nos) {
    const titulo = normalizar(no.titulo);
    const secaoGlobal =
      no.tipo_no.startsWith("agenda_") ||
      ehTerminal(no) ||
      /\b(valores?|antes e depois|localizacao|especialista|encerrar)\b/.test(
        titulo
      );

    if (secaoGlobal && !servicoDoNo(no)) {
      servicoAtual = null;
      contextoFaq = false;
      intencoesFaqPendentes = [];
      continue;
    }

    const servicoExplicito = servicoDoNo(no);
    if (servicoExplicito) {
      servicoAtual = servicoExplicito;
      contextoFaq =
        ehMenuFaq(no, servicoExplicito) ||
        /\b(duvida|faq)\b/.test(titulo);
      if (ehMenuFaq(no, servicoExplicito)) {
        intencoesFaqPendentes = opcoesDaPergunta(no)
          .map((opcao) => intencaoFaq(`${opcao.id} ${opcao.titulo}`))
          .filter(Boolean) as Array<NonNullable<ReturnType<typeof intencaoFaq>>>;
      }
      if (tituloGenerico(no)) {
        const rotulo = ROTULOS_SERVICO[servicoExplicito];
        no.titulo = contextoFaq
          ? ehPergunta(no)
            ? `Dúvidas - ${rotulo}`
            : `Dúvida - ${rotulo}`
          : ehPergunta(no)
            ? `${rotulo} · Próximos passos`
            : `${rotulo} · Detalhes`;
      }
      continue;
    }

    if (!servicoAtual || !tituloGenerico(no)) continue;

    const rotulo = ROTULOS_SERVICO[servicoAtual];
    if (contextoFaq) {
      if (ehPergunta(no)) {
        no.titulo = `Dúvidas - ${rotulo} · Continuar`;
      } else {
        const intencao = intencoesFaqPendentes.shift();
        no.titulo = intencao
          ? `Dúvida - ${rotulo} · ${TITULOS_INTENCAO_FAQ[intencao]}`
          : `Dúvida - ${rotulo}`;
      }
    } else {
      if (ehPergunta(no)) {
        no.titulo = `${rotulo} · Próximos passos`;
      } else {
        const conteudo = normalizar(no.configuracao_json?.mensagem);
        no.titulo = /\b(cuidado|recuperacao|tempo medio)\b/.test(conteudo)
          ? `${rotulo} — Cuidados e recuperação`
          : /\b(resultados? esperados?|aparencia|expressao suavizada)\b/.test(
                conteudo
              )
            ? `${rotulo} — Resultados esperados`
            : `${rotulo} — Visão geral`;
      }
    }
  }
}

function aplicarOpcoes(no: AssistenteAutomacaoNo, opcoes: ReturnType<typeof opcoesDaPergunta>) {
  const unicas = new Map<string, (typeof opcoes)[number]>();
  for (const opcao of opcoes) {
    const chave = normalizarId(opcao.titulo) || opcao.id;
    if (!unicas.has(chave)) unicas.set(chave, opcao);
  }
  const finais = [...unicas.values()];

  if (finais.length > 3) {
    no.tipo_no = "pergunta_opcoes";
    no.configuracao_json = {
      ...no.configuracao_json,
      opcoes: finais.map((opcao) => ({ valor: opcao.id, titulo: opcao.titulo })),
    };
    delete no.configuracao_json.botoes;
  } else {
    no.tipo_no = "enviar_botoes";
    no.configuracao_json = {
      ...no.configuracao_json,
      botoes: finais.map((opcao) => ({ id: opcao.id, titulo: opcao.titulo })),
    };
    delete no.configuracao_json.opcoes;
  }
}

function aplicarOpcoesFaq(
  no: AssistenteAutomacaoNo,
  opcoes: ReturnType<typeof opcoesDaPergunta>
) {
  const unicas = new Map<string, (typeof opcoes)[number]>();
  for (const opcao of opcoes) {
    const intencao = intencaoFaq(`${opcao.id} ${opcao.titulo}`);
    const chave = intencao || normalizarId(opcao.titulo) || opcao.id;
    if (!unicas.has(chave)) unicas.set(chave, opcao);
  }
  aplicarOpcoes(no, [...unicas.values()]);
}

function consolidarMenusFragmentados(params: {
  nos: AssistenteAutomacaoNo[];
  conexoes: AssistenteAutomacaoConexao[];
  avisos: string[];
}) {
  let nos = params.nos;
  let conexoes = params.conexoes;
  const remover = new Set<string>();
  const principal = melhorMenuPrincipal(nos);

  if (principal) {
    for (const no of nos) {
      if (
        no.id !== principal.id &&
        ehPergunta(no) &&
        !ehMenuPrincipal(no) &&
        /\b(mais opcoes|ultimas opcoes|continuacao do menu)\b/.test(conteudoNo(no))
      ) {
        remover.add(no.id);
      }
    }
  }

  for (const servico of ["harmonizacao", "melasma", "botox"] as Servico[]) {
    const candidatos = nos.filter(
      (no) =>
        !remover.has(no.id) &&
        ehMenuProcedimento(no, servico) &&
        !/\b(duvidas?|faq)\b/.test(normalizar(no.titulo))
    );
    if (candidatos.length > 1) {
      const canonico = candidatos[0];
      aplicarOpcoes(
        canonico,
        candidatos.flatMap((candidato) => opcoesDaPergunta(candidato))
      );
      for (const duplicado of candidatos.slice(1)) remover.add(duplicado.id);
      params.avisos.push(
        `Os menus fragmentados de ${ROTULOS_SERVICO[servico]} foram consolidados em uma única pergunta.`
      );
    }

    const menusFaqDoServico = nos.filter(
      (no) =>
        !remover.has(no.id) &&
        ehMenuFaq(no, servico) &&
        /\b(duvidas?|faq|frequentes?)\b/.test(normalizar(no.titulo))
    );
    if (menusFaqDoServico.length > 1) {
      const faqCanonica = menusFaqDoServico[0];
      aplicarOpcoesFaq(
        faqCanonica,
        menusFaqDoServico.flatMap((menu) => opcoesDaPergunta(menu))
      );
      for (const duplicada of menusFaqDoServico.slice(1)) {
        remover.add(duplicada.id);
      }
      params.avisos.push(
        `As perguntas duplicadas de FAQ de ${ROTULOS_SERVICO[servico]} foram consolidadas.`
      );
    }
  }

  if (remover.size > 0) {
    nos = nos.filter((no) => !remover.has(no.id));
    conexoes = conexoes.filter(
      (conexao) =>
        !remover.has(conexao.no_origem_id) &&
        !remover.has(conexao.no_destino_id)
    );
    params.avisos.push(
      `${remover.size} fragmento(s) redundante(s) de menu foram removidos.`
    );
  }

  return { nos, conexoes };
}

function reconstruirMenusFaqMalformados(
  nos: AssistenteAutomacaoNo[],
  avisos: string[]
) {
  for (const servico of ["harmonizacao", "melasma", "botox"] as Servico[]) {
    const candidato = nos.find(
      (no) =>
        ehPergunta(no) &&
        servicoDoNo(no) === servico &&
        /\b(duvidas?|faq|frequentes?)\b/.test(
          normalizarId(no.titulo).replace(/_/g, " ")
        )
    );
    if (!candidato || ehMenuFaq(candidato, servico)) continue;

    const respostas = nos.filter((no) => {
      if (no.tipo_no !== "enviar_texto" || servicoDoNo(no) !== servico) {
        return false;
      }
      return (
        /\b(duvidas?|faq|respostas?)\b/.test(normalizar(no.titulo)) &&
        !ehConteudoProcedimento(no, servico) &&
        Boolean(intencaoFaq(conteudoNo(no)))
      );
    });
    if (respostas.length === 0) continue;

    const intencoes = new Map<
      NonNullable<ReturnType<typeof intencaoFaq>>,
      AssistenteAutomacaoNo
    >();
    for (const resposta of respostas) {
      const intencao = intencaoFaq(conteudoNo(resposta));
      if (intencao && !intencoes.has(intencao)) intencoes.set(intencao, resposta);
    }
    if (intencoes.size === 0) continue;

    candidato.tipo_no = "pergunta_opcoes";
    candidato.configuracao_json = {
      ...candidato.configuracao_json,
      mensagem: "Qual dúvida você gostaria de esclarecer?",
      opcoes: [
        ...[...intencoes.keys()].map((intencao) => ({
          valor: `faq_${intencao}`,
          titulo: TITULOS_INTENCAO_FAQ[intencao],
        })),
        { valor: "voltar", titulo: "Voltar" },
      ],
    };
    delete candidato.configuracao_json.botoes;
    avisos.push(
      `O menu de dúvidas “${candidato.titulo}” foi reconstruído a partir das respostas existentes.`
    );
  }
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
  if (ehEncerrar(opcao.titulo)) return destino.tipo_no === "encerrar";
  if (ehVoltarMenu(opcao.titulo)) return mainMenu?.id === destino.id;
  if (servicoOpcao) {
    if (ehMenuAntesDepois(origem)) {
      return (
        servicoDoNo(destino) === servicoOpcao &&
        (destino.tipo_no === "enviar_imagem" || ehAntesDepois(conteudoNo(destino)))
      );
    }
    return servicoDoNo(destino) === servicoOpcao;
  }
  if (ehAgendamento(opcao.titulo)) {
    return destino.tipo_no === "agenda_escolher_horario";
  }
  if (ehAbrirLocalizacao(opcao.titulo)) return destino.tipo_no === "botao_redirect";
  if (ehLocalizacao(opcao.titulo)) return ehLocalizacao(conteudoNo(destino));
  if (ehEspecialista(opcao.titulo)) return destino.tipo_no === "transferir_setor";
  if (ehAntesDepois(opcao.titulo)) {
    if (mainMenu?.id === origem.id && destino.tipo_no === "enviar_imagem") {
      return false;
    }
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

    const confirmacaoExistente = nos.find(
      (no) => no.id !== escolher.id && ehConfirmacaoHorario(no)
    );
    const confirmacao: AssistenteAutomacaoNo =
      confirmacaoExistente || {
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

    if (!confirmacaoExistente) {
      nos.push(confirmacao);
      nosPorId.set(confirmacao.id, confirmacao);
    }
    conexoes = conexoes.filter(
      (conexao) =>
        ![escolher.id, confirmacao.id].includes(conexao.no_origem_id) ||
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
      confirmacaoExistente
        ? `A confirmação existente foi conectada ao agendamento em “${escolher.titulo}”.`
        : `Foi adicionada confirmação antes de criar o agendamento em “${escolher.titulo}”.`
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
  nos.forEach(formatarMensagemWhatsApp);
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
  enriquecerTitulosPorContexto(nos);
  const menusConsolidados = consolidarMenusFragmentados({
    nos,
    conexoes,
    avisos,
  });
  nos = menusConsolidados.nos;
  conexoes = menusConsolidados.conexoes;
  const mainMenu = melhorMenuPrincipal(nos);
  reconstruirMenusFaqMalformados(nos, avisos);
  for (const servico of ["harmonizacao", "melasma", "botox"] as Servico[]) {
    const consolidados = consolidarConteudosProcedimento({
      nos,
      conexoes,
      servico,
      avisos,
    });
    nos = consolidados.nos;
    conexoes = consolidados.conexoes;
  }
  let terminal = nos.find((no) => no.tipo_no === "encerrar");
  if (!terminal) {
    terminal = criarNoEncerrar();
    nos.push(terminal);
    avisos.push("Um bloco de encerramento foi adicionado ao rascunho.");
  }
  garantirOpcaoEncerrar(mainMenu, avisos);
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
          ORDEM_CONTEUDO_PROCEDIMENTO[secaoProcedimento(a)] -
            ORDEM_CONTEUDO_PROCEDIMENTO[secaoProcedimento(b)] ||
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
  const menuAntesDepois =
    nos.find(ehMenuAntesDepois) ||
    nos.find((no, indice) => {
      if (!ehPergunta(no)) return false;
      const servicos = new Set(
        opcoesDaPergunta(no)
          .map((opcao) => servicoDoTexto(opcao.titulo))
          .filter(Boolean)
      );
      const anterior = nos[indice - 1];
      return Boolean(
        servicos.size >= 2 && anterior && ehAntesDepois(conteudoNo(anterior))
      );
    }) ||
    null;
  const indiceMenuAntesDepois = menuAntesDepois
    ? (ordemNos.get(menuAntesDepois.id) ?? -1)
    : -1;
  if (menuAntesDepois && !ehMenuAntesDepois(menuAntesDepois)) {
    menuAntesDepois.titulo = "Antes e Depois · Escolha o procedimento";
  }
  const menuDepoisDaGaleria =
    indiceMenuAntesDepois >= 0
      ? nos.find((no) => {
          const indice = ordemNos.get(no.id) ?? Number.MAX_SAFE_INTEGER;
          const opcoes = opcoesDaPergunta(no);
          return (
            ehPergunta(no) &&
            indice > indiceMenuAntesDepois &&
            indice <= indiceMenuAntesDepois + 2 &&
            opcoes.length >= 2 &&
            opcoes.every(
              (opcao) =>
                ehAgendamento(opcao.titulo) || ehVoltarMenu(opcao.titulo)
            )
          );
        }) || null
      : null;

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
  propagarSetorExcessoTentativas(nos, avisos);

  const destinoInicioExistente = params.conexoes
    .filter((conexao) => conexao.no_origem_id === inicio.id)
    .sort((a, b) => a.ordem - b.ordem)
    .map((conexao) => nosPorId.get(conexao.no_destino_id))
    .find((no) => no && no.id !== inicio.id);
  const destinoInicioEhBoasVindas = Boolean(
    destinoInicioExistente &&
      /\b(boas vindas|bem vindo|bem vinda|seja bem vindo|seja bem vinda)\b/.test(
        conteudoNo(destinoInicioExistente)
      )
  );
  const destinoInicio =
    (destinoInicioEhBoasVindas ? destinoInicioExistente : null) ||
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
    } else if (no.tipo_no === "agenda_criar_agendamento") {
      destino =
        nos.find(
          (item) => item.id !== no.id && ehMensagemAgendamentoConfirmado(item)
        ) || mainMenu;
    } else if (servico && ehFaq(conteudoNo(no))) {
      destino =
        menusFaq.get(servico) ||
        menusProcedimento.get(servico) ||
        mainMenu;
    } else if (servico && ehConteudoProcedimento(no, servico)) {
      destino = menusProcedimento.get(servico) || mainMenu;
    } else if (no.tipo_no === "enviar_imagem") {
      destino = menuDepoisDaGaleria || mainMenu;
    } else if (
      no.tipo_no === "botao_redirect" ||
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
  const faqAlcancaveis = nos.filter(
    (no) => alcancaveis.has(no.id) && ehMenuFaq(no, servicoDoNo(no))
  );
  const respostasFaqAlcancaveis = nos.filter(
    (no) =>
      alcancaveis.has(no.id) &&
      no.tipo_no === "enviar_texto" &&
      /\b(duvida|faq|resposta)\b/.test(normalizar(no.titulo))
  );
  const faqRedundantes = new Set<string>();

  for (const no of nos.filter((item) => !alcancaveis.has(item.id))) {
    const servico = servicoDoNo(no);
    if (!servico) continue;

    if (ehMenuFaq(no, servico)) {
      const intencoes = new Set(
        opcoesDaPergunta(no)
          .map((opcao) => intencaoFaq(`${opcao.id} ${opcao.titulo}`))
          .filter(Boolean)
      );
      const coberto = faqAlcancaveis.some((menu) => {
        if (servicoDoNo(menu) !== servico) return false;
        const existentes = new Set(
          opcoesDaPergunta(menu)
            .map((opcao) => intencaoFaq(`${opcao.id} ${opcao.titulo}`))
            .filter(Boolean)
        );
        return [...intencoes].every((intencao) => existentes.has(intencao));
      });
      if (coberto) faqRedundantes.add(no.id);
      continue;
    }

    const intencao = intencaoFaq(conteudoNo(no));
    if (
      intencao &&
      respostasFaqAlcancaveis.some(
        (resposta) =>
          servicoDoNo(resposta) === servico &&
          intencaoFaq(conteudoNo(resposta)) === intencao
      )
    ) {
      faqRedundantes.add(no.id);
    }
  }

  if (faqRedundantes.size > 0) {
    nos = nos.filter((no) => !faqRedundantes.has(no.id));
    conexoes = conexoes.filter(
      (conexao) =>
        !faqRedundantes.has(conexao.no_origem_id) &&
        !faqRedundantes.has(conexao.no_destino_id)
    );
    avisos.push(
      `${faqRedundantes.size} bloco(s) de FAQ redundante(s) foram consolidados.`
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
