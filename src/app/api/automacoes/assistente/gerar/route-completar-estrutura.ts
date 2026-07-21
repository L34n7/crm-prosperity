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
function listaSecao(instrucao: string, inicio: RegExp, fim: RegExp) {
  const a = inicio.exec(instrucao);
  if (!a) return [];
  const resto = instrucao.slice(a.index + a[0].length);
  const b = fim.exec(resto);
  const secao = b ? resto.slice(0, b.index) : resto;
  const marcador = /^\s*(?:depois\s+adicionar\s+os\s+)?bot[õo]es?\s*:?\s*$/im.exec(secao);
  const corpo = marcador ? secao.slice(marcador.index + marcador[0].length) : secao;
  return corpo
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]+|\d+[.)-])\s*/, "").trim())
    .filter((l) => l.length >= 2 && l.length <= 100 && !/^[-–—]+$/.test(l));
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
function identificarMenu(etapas: Objeto[], esperadas: string[], servico?: string) {
  return etapas
    .filter((e) => ["pergunta_opcoes", "pergunta_botoes"].includes(String(e.tipo || "")))
    .map((e) => {
      const ops = Array.isArray(e.opcoes) ? e.opcoes.map(objeto) : [];
      const identificacao = norm(`${texto(e.titulo)} ${texto(e.mensagem)}`);
      const pontos = esperadas.filter((x) => ops.some((o) => norm(o.texto || o.id).includes(norm(x).split(" ").find((p) => p.length >= 3) || ""))).length;
      return { e, pontos: pontos + (servico && identificacao.includes(norm(servico).split(" ")[0]) ? 20 : 0) };
    })
    .sort((a, b) => b.pontos - a.pontos)[0]?.e || null;
}
function completarOpcoes(menu: Objeto, esperadas: string[]) {
  const atuais = Array.isArray(menu.opcoes) ? menu.opcoes.map(objeto) : [];
  for (const item of esperadas) {
    const chave = norm(item).split(" ").find((p) => p.length >= 3) || norm(item);
    if (!atuais.some((o) => norm(o.texto || o.id).includes(chave))) atuais.push(opcao(item, atuais.length));
  }
  menu.opcoes = atuais;
  if (atuais.length > 3) menu.tipo = "pergunta_opcoes";
}
function refUnica(base: string, refs: Set<string>) {
  let ref = refBase(base);
  let i = 2;
  while (refs.has(ref)) ref = `${refBase(base)}_${i++}`;
  refs.add(ref);
  return ref;
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
    const listaServicos = servicos(instrucao);
    let alterado = false;

    if (menus.length) {
      let menu = identificarMenu(etapas, menus);
      if (!menu) {
        menu = etapa(refUnica("menu_principal", refs), menus.length > 3 ? "pergunta_opcoes" : "pergunta_botoes", "Menu principal", "Como podemos ajudar?", { opcoes: menus.map(opcao) });
        etapas.push(menu);
        alterado = true;
      } else {
        completarOpcoes(menu, menus);
        alterado = true;
      }
    }

    for (const servico of listaServicos) {
      const mensagens = etapas.filter((e) => e.tipo === "mensagem" && norm(`${texto(e.titulo)} ${texto(e.mensagem)}`).includes(norm(servico).split(" ")[0]));
      const textos = [
        `✨ ${servico} — Visão geral\n• Conheça como funciona o procedimento e para quais objetivos ele pode ser indicado.`,
        `🤍 ${servico} — Benefícios e indicações\n• A indicação é individual e considera as necessidades de cada paciente.`,
        `🩺 ${servico} — Cuidados e resultados\n• Cuidados, recuperação e resultados são orientados após avaliação profissional.`,
      ];
      while (mensagens.length < 3) {
        const i = mensagens.length;
        const nova = etapa(refUnica(`${refBase(servico)}_${i + 1}`, refs), "mensagem", textos[i].split("\n")[0], textos[i]);
        etapas.push(nova);
        mensagens.push(nova);
        alterado = true;
      }

      if (procedimentos.length) {
        let menuProc = identificarMenu(etapas, procedimentos, servico);
        if (!menuProc) {
          menuProc = etapa(refUnica(`${refBase(servico)}_menu`, refs), procedimentos.length > 3 ? "pergunta_opcoes" : "pergunta_botoes", servico, "Como deseja seguir?", { opcoes: procedimentos.map(opcao) });
          etapas.push(menuProc);
          alterado = true;
        } else {
          completarOpcoes(menuProc, procedimentos);
          alterado = true;
        }
      }

      let faq = etapas.find((e) => ["pergunta_opcoes", "pergunta_botoes"].includes(String(e.tipo || "")) && norm(`${texto(e.titulo)} ${texto(e.mensagem)}`).includes(norm(servico).split(" ")[0]) && /duvida|faq|frequente/.test(norm(`${texto(e.titulo)} ${texto(e.mensagem)}`)));
      if (!faq) {
        faq = etapa(refUnica(`${refBase(servico)}_faq`, refs), "pergunta_opcoes", `Dúvidas Frequentes - ${servico}`, "Escolha uma dúvida:", { opcoes: [opcao("Dói?", 0), opcao("Quanto tempo dura?", 1), opcao("Voltar", 2)] });
        etapas.push(faq);
        etapas.push(etapa(refUnica(`${refBase(servico)}_faq_dor`, refs), "mensagem", `Dúvida - ${servico}`, "A sensibilidade varia conforme o procedimento. A especialista explicará as medidas de conforto disponíveis."));
        etapas.push(etapa(refUnica(`${refBase(servico)}_faq_tempo`, refs), "mensagem", `Dúvida - ${servico}`, "A duração varia conforme o protocolo definido na avaliação."));
        alterado = true;
      }
    }

    const n = norm(instrucao);
    if (n.includes("antes e depois") && !etapas.some((e) => e.tipo === "midia_imagem")) {
      etapas.push(etapa(refUnica("antes_depois_imagem", refs), "midia_imagem", "Antes e Depois", "Confira um resultado autorizado."));
      alterado = true;
    }
    if (/\b(agendar|agendamento|marcar horario|agenda)\b/.test(n)) {
      const agenda = contexto.agendas[0];
      if (!etapas.some((e) => e.tipo === "agenda_escolher_horario")) {
        etapas.push(etapa(refUnica("agenda_escolher_horario", refs), "agenda_escolher_horario", "Escolher horário", "Qual dia você prefere?", { agenda_id: agenda?.id || null, agenda_nome: agenda?.nome || null }));
        alterado = true;
      }
      if (!etapas.some((e) => e.tipo === "agenda_criar_agendamento")) {
        etapas.push(etapa(refUnica("agenda_criar_agendamento", refs), "agenda_criar_agendamento", "Criar agendamento", "Agendado! Seu horário foi reservado.", { agenda_id: agenda?.id || null, agenda_nome: agenda?.nome || null }));
        alterado = true;
      }
    }
    if (n.includes("abrir localizacao") && !etapas.some((e) => e.tipo === "redirect")) {
      const url = instrucao.match(/https?:\/\/[^\s)]+/i)?.[0] || null;
      etapas.push(etapa(refUnica("abrir_localizacao", refs), "redirect", "Abrir Localização", "Toque no botão para abrir o mapa.", { url, botao_texto: "Abrir mapa" }));
      alterado = true;
    }
    if (/falar com especialista|falar com atendente|direcionado para um especialista/.test(n) && !etapas.some((e) => e.tipo === "transferir")) {
      etapas.push(etapa(refUnica("falar_com_especialista", refs), "transferir", "Falar com especialista", "Vou encaminhar você para uma especialista."));
      alterado = true;
    }

    if (alterado) {
      plano.etapas = etapas;
      plano.avisos = [
        ...(Array.isArray(plano.avisos) ? plano.avisos : []),
        "O sistema completou automaticamente os blocos e menus obrigatórios que não vieram na resposta da IA.",
      ];
      substituirTextoSaida(resposta, JSON.stringify(plano));
    }
  } catch {
    return resposta;
  }

  return resposta;
}
