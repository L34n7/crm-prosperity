import type { ContextoAssistenteFluxos } from "./route-contexto-ia";
import {
  extrairTextoSaida,
  substituirTextoSaida,
  type RespostaOpenAI,
} from "./route-validacao-ia";

type Objeto = Record<string, unknown>;

function objeto(v: unknown): Objeto {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Objeto) : {};
}
function texto(v: unknown, limite = 3000) {
  return String(v || "").trim().slice(0, limite);
}
function norm(v: unknown) {
  return texto(v)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function refBase(v: unknown) {
  return norm(v).replace(/\s+/g, "_").slice(0, 120) || "etapa";
}
function linhasSecao(instrucao: string, inicio: RegExp, fim: RegExp) {
  const a = inicio.exec(instrucao);
  if (!a) return [];
  const resto = instrucao.slice(a.index + a[0].length);
  const b = fim.exec(resto);
  const secao = b ? resto.slice(0, b.index) : resto;
  return secao
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]+|\d+[.)-])\s*/, "").trim())
    .filter((l) => l.length >= 2 && l.length <= 140 && !/^[-–—]+$/.test(l));
}
function listaSecao(instrucao: string, inicio: RegExp, fim: RegExp) {
  const linhas = linhasSecao(instrucao, inicio, fim);
  const marcador = linhas.findIndex((l) => /^bot[õo]es?\s*:?$/i.test(l));
  return (marcador >= 0 ? linhas.slice(marcador + 1) : linhas).filter(
    (l) => !/^(mensagem|exemplo|sempre|nunca|criar|informar|mostrar|utilize|escreva)\b/i.test(l)
  );
}
function servicos(instrucao: string) {
  return listaSecao(instrucao, /^\s*SERVI[ÇC]OS\s*$/im, /^\s*OBJETIVO\s*$/im);
}
function opcoesMenu(instrucao: string) {
  return listaSecao(instrucao, /^\s*MENU\s+PRINCIPAL\s*$/im, /^\s*PARA\s+CADA\s+PROCEDIMENTO\s*$/im);
}
function opcoesProcedimento(instrucao: string) {
  return listaSecao(instrucao, /^\s*PARA\s+CADA\s+PROCEDIMENTO\s*$/im, /^\s*VALORES\s*$/im);
}
function opcoesAntesDepois(instrucao: string) {
  return listaSecao(instrucao, /^\s*ANTES\s+E\s+DEPOIS\s*$/im, /^\s*D[ÚU]VIDAS\s+FREQUENTES\s*$/im);
}
function perguntasFaq(instrucao: string) {
  const linhas = linhasSecao(
    instrucao,
    /^\s*D[ÚU]VIDAS\s+FREQUENTES\s*$/im,
    /^\s*AGENDAMENTO\s*$/im
  );
  const perguntas = linhas.filter(
    (l) =>
      /\?$/.test(l) &&
      !/^(exemplo|mensagem|bot[õo]es?)\b/i.test(l) &&
      !/cada resposta|sempre finalizar/i.test(l)
  );
  return [...new Map(perguntas.map((p) => [norm(p), p])).values()].slice(0, 10);
}
function etapa(ref: string, tipo: string, titulo: string, mensagem: string, extras: Objeto = {}) {
  return {
    ref,
    tipo,
    titulo,
    mensagem,
    variavel: null,
    tipo_captura: null,
    setor_id: null,
    setor_nome: null,
    resultado: null,
    midia_id: null,
    midia_nome: null,
    midia_tipo: null,
    midia_url: null,
    url: null,
    botao_texto: null,
    opcoes: [],
    agenda_id: null,
    agenda_nome: null,
    ...extras,
  };
}
function opcao(textoOpcao: string, indice: number) {
  return { id: refBase(textoOpcao) || `opcao_${indice + 1}`, texto: textoOpcao };
}
function primeiroTermoRelevante(valor: string) {
  return norm(valor)
    .split(" ")
    .find((p) => p.length >= 4) || norm(valor);
}
function identificarMenu(etapas: Objeto[], esperadas: string[], servico?: string) {
  const termoServico = servico ? primeiroTermoRelevante(servico) : "";
  return (
    etapas
      .filter((e) => ["pergunta_opcoes", "pergunta_botoes"].includes(String(e.tipo || "")))
      .map((e) => {
        const ops = Array.isArray(e.opcoes) ? e.opcoes.map(objeto) : [];
        const identificacao = norm(`${texto(e.titulo)} ${texto(e.mensagem)}`);
        const pontosOpcoes = esperadas.filter((x) => {
          const termo = primeiroTermoRelevante(x);
          return ops.some((o) => norm(o.texto || o.id).includes(termo));
        }).length;
        const pontosServico = termoServico && identificacao.includes(termoServico) ? 100 : 0;
        return { e, pontos: pontosServico + pontosOpcoes };
      })
      .filter((item) => !servico || item.pontos >= 100)
      .sort((a, b) => b.pontos - a.pontos)[0]?.e || null
  );
}
function completarOpcoes(menu: Objeto, esperadas: string[]) {
  const atuais = Array.isArray(menu.opcoes) ? menu.opcoes.map(objeto) : [];
  for (const item of esperadas) {
    const chave = primeiroTermoRelevante(item);
    if (!atuais.some((o) => norm(o.texto || o.id).includes(chave))) {
      atuais.push(opcao(item, atuais.length));
    }
  }
  menu.opcoes = atuais;
  menu.tipo = atuais.length > 3 ? "pergunta_opcoes" : "pergunta_botoes";
}
function refUnica(base: string, refs: Set<string>) {
  let ref = refBase(base);
  let i = 2;
  while (refs.has(ref)) ref = `${refBase(base)}_${i++}`;
  refs.add(ref);
  return ref;
}
function intencaoFaq(pergunta: string) {
  const n = norm(pergunta);
  if (/doi|dor|dolor/.test(n)) return "dor";
  if (/quanto tempo dura|duracao/.test(n)) return "duracao";
  if (/quando|em quanto tempo.*resultado|vejo resultado/.test(n)) return "inicio_resultado";
  if (/melasma.*volta|volta.*melasma|recorr/.test(n)) return "recorrencia";
  if (/natural/.test(n)) return "naturalidade";
  if (/quantas sessoes|numero de sessoes/.test(n)) return "sessoes";
  return refBase(pergunta);
}
function respostaFaq(servico: string, pergunta: string) {
  const intencao = intencaoFaq(pergunta);
  const respostas: Record<string, string> = {
    dor: "A sensibilidade varia de pessoa para pessoa e conforme a técnica indicada. A especialista explica previamente as medidas de conforto disponíveis.",
    duracao: "O tempo do procedimento depende do protocolo definido na avaliação. Antes de iniciar, a especialista informa a duração estimada para o seu caso.",
    inicio_resultado: "O início e a evolução dos resultados variam conforme o procedimento e a resposta individual. Na avaliação, a especialista apresenta uma expectativa realista.",
    recorrencia: "O melasma pode exigir acompanhamento contínuo, pois fatores internos e externos podem influenciar novas manchas. O protocolo inclui orientações de manutenção.",
    naturalidade: "O planejamento busca respeitar seus traços e preservar uma aparência natural. A quantidade e a técnica são definidas individualmente.",
    sessoes: "A quantidade de sessões depende da avaliação, do objetivo e da resposta ao tratamento. A especialista monta um plano personalizado.",
  };
  return `${respostas[intencao] || `A resposta depende da avaliação e do protocolo indicado para ${servico}. A especialista orienta cada etapa de forma personalizada.`}\n\nSe desejar, você pode agendar uma avaliação.`;
}
function garantirFaq(params: {
  etapas: Objeto[];
  refs: Set<string>;
  servico: string;
  perguntas: string[];
}) {
  const termo = primeiroTermoRelevante(params.servico);
  let faq = params.etapas.find(
    (e) =>
      ["pergunta_opcoes", "pergunta_botoes"].includes(String(e.tipo || "")) &&
      norm(`${texto(e.titulo)} ${texto(e.mensagem)}`).includes(termo) &&
      /duvida|faq|frequente/.test(norm(`${texto(e.titulo)} ${texto(e.mensagem)}`))
  );
  const perguntas = params.perguntas.length
    ? params.perguntas
    : ["Dói?", "Quanto tempo dura?", "Voltar"];
  if (!perguntas.some((p) => /voltar/i.test(p))) perguntas.push("Voltar");

  if (!faq) {
    faq = etapa(
      refUnica(`${refBase(params.servico)}_faq`, params.refs),
      perguntas.length > 3 ? "pergunta_opcoes" : "pergunta_botoes",
      `Dúvidas Frequentes - ${params.servico}`,
      "Escolha uma dúvida:",
      { opcoes: perguntas.map(opcao) }
    );
    params.etapas.push(faq);
  } else {
    completarOpcoes(faq, perguntas);
  }

  for (const pergunta of perguntas.filter((p) => !/voltar/i.test(p))) {
    const intencao = intencaoFaq(pergunta);
    const existe = params.etapas.some(
      (e) =>
        e.tipo === "mensagem" &&
        norm(`${texto(e.titulo)} ${texto(e.mensagem)}`).includes(termo) &&
        String(e.faq_intencao || "") === intencao
    );
    if (!existe) {
      params.etapas.push(
        etapa(
          refUnica(`${refBase(params.servico)}_faq_${intencao}`, params.refs),
          "mensagem",
          `${pergunta.replace(/\?$/, "")} - ${params.servico}`,
          respostaFaq(params.servico, pergunta),
          { faq_intencao: intencao }
        )
      );
    }
  }
}

export function completarRespostaPlano(
  resposta: RespostaOpenAI,
  contexto: ContextoAssistenteFluxos | undefined
) {
  if (!contexto?.ativo || contexto.modo !== "criar_fluxo") return resposta;
  const saida = extrairTextoSaida(resposta);
  if (!saida) return resposta;

  try {
    const plano = objeto(JSON.parse(saida));
    const etapas = Array.isArray(plano.etapas) ? plano.etapas.map(objeto) : [];
    const refs = new Set(etapas.map((e) => texto(e.ref, 160)).filter(Boolean));
    const instrucao = contexto.instrucaoCompleta || "";
    const menus = opcoesMenu(instrucao);
    const procedimentos = opcoesProcedimento(instrucao);
    const antesDepois = opcoesAntesDepois(instrucao);
    const faqEsperadas = perguntasFaq(instrucao);
    const listaServicos = servicos(instrucao);
    let alterado = false;

    if (menus.length) {
      let menu = identificarMenu(etapas, menus);
      if (!menu) {
        menu = etapa(
          refUnica("menu_principal", refs),
          menus.length > 3 ? "pergunta_opcoes" : "pergunta_botoes",
          "Menu principal",
          "Como podemos ajudar?",
          { opcoes: menus.map(opcao) }
        );
        etapas.push(menu);
      } else {
        completarOpcoes(menu, menus);
      }
      alterado = true;
    }

    for (const servico of listaServicos) {
      const termoServico = primeiroTermoRelevante(servico);
      const mensagens = etapas.filter(
        (e) =>
          e.tipo === "mensagem" &&
          norm(`${texto(e.titulo)} ${texto(e.mensagem)}`).includes(termoServico)
      );
      const textos = [
        `✨ ${servico} — Visão geral\n\n• Procedimento planejado de forma individual, conforme seus objetivos e características.`,
        `🤍 ${servico} — Benefícios e indicações\n\n• Benefícios, indicações e limites são definidos após avaliação profissional.`,
        `🩺 ${servico} — Cuidados, recuperação e resultados\n\n• A especialista explica cuidados, tempo médio, recuperação e expectativas antes do procedimento.`,
      ];
      while (mensagens.length < 3) {
        const i = mensagens.length;
        const nova = etapa(
          refUnica(`${refBase(servico)}_${i + 1}`, refs),
          "mensagem",
          textos[i].split("\n")[0],
          textos[i]
        );
        etapas.push(nova);
        mensagens.push(nova);
        alterado = true;
      }

      if (procedimentos.length) {
        let menuProc = identificarMenu(etapas, procedimentos, servico);
        if (!menuProc) {
          menuProc = etapa(
            refUnica(`${refBase(servico)}_menu`, refs),
            procedimentos.length > 3 ? "pergunta_opcoes" : "pergunta_botoes",
            servico,
            "Como deseja seguir?",
            { opcoes: procedimentos.map(opcao) }
          );
          etapas.push(menuProc);
        } else {
          completarOpcoes(menuProc, procedimentos);
        }
        alterado = true;
      }

      garantirFaq({ etapas, refs, servico, perguntas: faqEsperadas });
      alterado = true;
    }

    if (antesDepois.length) {
      const menuAntesDepois = etapas.find(
        (e) =>
          ["pergunta_opcoes", "pergunta_botoes"].includes(String(e.tipo || "")) &&
          /antes e depois/.test(norm(`${texto(e.titulo)} ${texto(e.mensagem)}`))
      );
      if (menuAntesDepois) {
        completarOpcoes(menuAntesDepois, antesDepois);
        alterado = true;
      }
    }

    const n = norm(instrucao);
    if (n.includes("antes e depois") && !etapas.some((e) => e.tipo === "midia_imagem")) {
      etapas.push(
        etapa(
          refUnica("antes_depois_imagem", refs),
          "midia_imagem",
          "Antes e Depois",
          "Confira um resultado autorizado."
        )
      );
      alterado = true;
    }
    if (/\b(agendar|agendamento|marcar horario|agenda)\b/.test(n)) {
      const agenda = contexto.agendas[0];
      if (!etapas.some((e) => e.tipo === "agenda_escolher_horario")) {
        etapas.push(
          etapa(
            refUnica("agenda_escolher_horario", refs),
            "agenda_escolher_horario",
            "Escolher horário",
            "Qual dia você prefere?",
            { agenda_id: agenda?.id || null, agenda_nome: agenda?.nome || null }
          )
        );
        alterado = true;
      }
      if (!etapas.some((e) => e.tipo === "agenda_criar_agendamento")) {
        etapas.push(
          etapa(
            refUnica("agenda_criar_agendamento", refs),
            "agenda_criar_agendamento",
            "Criar agendamento",
            "Agendado! Seu horário foi reservado.",
            { agenda_id: agenda?.id || null, agenda_nome: agenda?.nome || null }
          )
        );
        alterado = true;
      }
    }
    if (n.includes("abrir localizacao") && !etapas.some((e) => e.tipo === "redirect")) {
      const url = instrucao.match(/https?:\/\/[^\s)]+/i)?.[0] || null;
      etapas.push(
        etapa(
          refUnica("abrir_localizacao", refs),
          "redirect",
          "Abrir Localização",
          "Toque no botão para abrir o mapa.",
          { url, botao_texto: "Abrir mapa" }
        )
      );
      alterado = true;
    }
    if (
      /falar com especialista|falar com atendente|direcionado para um especialista/.test(n) &&
      !etapas.some((e) => e.tipo === "transferir")
    ) {
      etapas.push(
        etapa(
          refUnica("falar_com_especialista", refs),
          "transferir",
          "Falar com especialista",
          "Vou encaminhar você para uma especialista."
        )
      );
      alterado = true;
    }

    if (alterado) {
      plano.etapas = etapas;
      plano.avisos = [
        ...(Array.isArray(plano.avisos) ? plano.avisos : []),
        "O sistema validou a cobertura de menus, procedimentos e FAQs sem descartar opções solicitadas.",
      ];
      substituirTextoSaida(resposta, JSON.stringify(plano));
    }
  } catch {
    return resposta;
  }

  return resposta;
}
