import type {
  AssistenteAutomacaoConexao,
  AssistenteAutomacaoNo,
} from "./assistente-fluxos-base";

export type OpcaoNo = { id: string; titulo: string };
export type Servico = "harmonizacao" | "melasma" | "botox";
export type IntencaoFaq =
  | "dor"
  | "duracao"
  | "resultado"
  | "recorrencia"
  | "naturalidade"
  | "sessoes";

const TIPOS_PERGUNTA = new Set(["pergunta_opcoes", "enviar_botoes"]);
const TIPOS_TERMINAIS = new Set(["encerrar", "transferir_setor"]);

export function texto(valor: unknown, limite = 2400) {
  return String(valor || "").trim().slice(0, limite);
}

export function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

export function normalizar(valor: unknown) {
  return texto(valor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s_-]/g, " ")
    .replace(/[\s_-]+/g, " ")
    .trim();
}

export function normalizarId(valor: unknown) {
  return normalizar(valor).replace(/\s+/g, "_").slice(0, 160);
}

export function clonarNo(no: AssistenteAutomacaoNo): AssistenteAutomacaoNo {
  return { ...no, configuracao_json: structuredClone(no.configuracao_json || {}) };
}

export function clonarConexao(
  conexao: AssistenteAutomacaoConexao
): AssistenteAutomacaoConexao {
  return { ...conexao, condicao_json: structuredClone(conexao.condicao_json || {}) };
}

export function ehPergunta(no: AssistenteAutomacaoNo | undefined) {
  return Boolean(no && TIPOS_PERGUNTA.has(no.tipo_no));
}

export function ehTerminal(no: AssistenteAutomacaoNo | undefined) {
  return Boolean(no && TIPOS_TERMINAIS.has(no.tipo_no));
}

export function conteudoNo(no: AssistenteAutomacaoNo) {
  const config = no.configuracao_json || {};
  return normalizar(
    [
      no.titulo,
      config.mensagem,
      config.mensagem_encontrado,
      config.mensagem_listar_horarios,
      config.botao_texto,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

export function opcoesNo(no: AssistenteAutomacaoNo): OpcaoNo[] {
  const config = no.configuracao_json || {};

  if (no.tipo_no === "pergunta_opcoes") {
    const opcoes = Array.isArray(config.opcoes) ? config.opcoes : [];
    return opcoes
      .map((valor, indice) => {
        const opcao = objeto(valor);
        const titulo = texto(opcao.titulo || opcao.valor, 80);
        const id =
          normalizarId(opcao.valor || opcao.titulo) || `opcao_${indice + 1}`;
        return titulo ? { id, titulo } : null;
      })
      .filter(Boolean) as OpcaoNo[];
  }

  if (no.tipo_no === "enviar_botoes") {
    const botoes = Array.isArray(config.botoes) ? config.botoes : [];
    return botoes
      .map((valor, indice) => {
        const botao = objeto(valor);
        const titulo = texto(botao.titulo || botao.id, 80);
        const id =
          normalizarId(botao.id || botao.titulo) || `opcao_${indice + 1}`;
        return titulo ? { id, titulo } : null;
      })
      .filter(Boolean) as OpcaoNo[];
  }

  return [];
}

export function servicoDoTexto(valor: unknown): Servico | null {
  const alvo = normalizar(valor);
  if (/harmoniza/.test(alvo)) return "harmonizacao";
  if (/melasma|mancha/.test(alvo)) return "melasma";
  if (/botox|toxina botulinica/.test(alvo)) return "botox";
  return null;
}

export function servicoDoNo(no: AssistenteAutomacaoNo) {
  return servicoDoTexto(conteudoNo(no));
}

function contem(valor: unknown, expressao: RegExp) {
  return expressao.test(normalizar(valor));
}

export const ehVoltarMenu = (v: unknown) =>
  contem(v, /\b(voltar|menu( principal)?|inicio)\b/);
export const ehAgendamento = (v: unknown) =>
  contem(v, /\b(agendar|agendamento|avaliacao|marcar horario)\b/);
export const ehValores = (v: unknown) =>
  contem(v, /\b(valor|valores|investimento|preco)\b/);
export const ehAntesDepois = (v: unknown) =>
  contem(v, /\b(antes e depois|resultado real|resultados reais|galeria|foto|imagem)\b/);
export const ehFaq = (v: unknown) =>
  contem(v, /\b(duvidas?|faq|frequentes?|doi|quanto tempo|duracao|sessoes)\b/);
export const ehAbrirLocalizacao = (v: unknown) =>
  contem(v, /\b(abrir localizacao|abrir mapa|google maps|ver mapa)\b/);
export const ehLocalizacao = (v: unknown) =>
  contem(v, /\b(localizacao|endereco|como chegar|mapa)\b/);
export const ehEspecialista = (v: unknown) =>
  contem(v, /\b(especialista|atendente|atendimento humano|falar com|equipe|transferir)\b/);
export const ehEncerrar = (v: unknown) =>
  contem(v, /\b(encerrar|finalizar|fim do atendimento|sair)\b/);

export function ehMenuPrincipal(no: AssistenteAutomacaoNo) {
  if (!ehPergunta(no)) return false;
  const conteudo = conteudoNo(no);
  const titulo = normalizar(no.titulo);

  if (/\b(antes e depois|valores?|duvidas?|faq|frequentes?)\b/.test(titulo)) {
    return false;
  }

  if (/\b(menu principal|como podemos ajudar)\b/.test(conteudo)) {
    return true;
  }

  const servicos = new Set(
    opcoesNo(no).map((opcao) => servicoDoTexto(opcao.titulo)).filter(Boolean)
  );
  const opcoes = opcoesNo(no);
  const navegacoes = [
    opcoes.some((opcao) => ehAntesDepois(opcao.titulo)),
    opcoes.some((opcao) => ehValores(opcao.titulo)),
    opcoes.some((opcao) => ehAgendamento(opcao.titulo)),
    opcoes.some((opcao) => ehLocalizacao(opcao.titulo)),
    opcoes.some((opcao) => ehEspecialista(opcao.titulo)),
  ].filter(Boolean).length;

  return servicos.size >= 2 && opcoes.length >= 6 && navegacoes >= 3;
}

export function intencaoFaq(valor: unknown): IntencaoFaq | null {
  const alvo = normalizar(valor);
  if (/\b(doi|dor|dolor|sensibilidade|desconforto)\b/.test(alvo)) return "dor";
  if (/\b(quanto (tempo )?dura|duracao|durar|efeito dura)\b/.test(alvo)) {
    return "duracao";
  }
  if (/\b(natural|naturalidade|artificial|preservar.*identidade|leveza|elegante)\b/.test(alvo)) {
    return "naturalidade";
  }
  if (/\b(quantas sessoes|numero de sessoes|sessoes necessarias)\b/.test(alvo)) {
    return "sessoes";
  }
  if (/\b(quando vejo|em quanto tempo|resultado|resultados|efeito aparece)\b/.test(alvo)) {
    return "resultado";
  }
  if (/\b(volta|retorna|reaparece|recorrencia|manutencao)\b/.test(alvo)) {
    return "recorrencia";
  }
  return null;
}

export function respostaCorrespondeFaq(
  opcao: OpcaoNo,
  destino: AssistenteAutomacaoNo
) {
  const esperada = intencaoFaq(`${opcao.id} ${opcao.titulo}`);
  if (!esperada || destino.tipo_no !== "enviar_texto") return false;
  if (!/\b(duvidas?|faq|respostas?)\b/.test(normalizar(destino.titulo))) {
    return false;
  }
  return intencaoFaq(conteudoNo(destino)) === esperada;
}

export function ehMenuProcedimento(
  no: AssistenteAutomacaoNo,
  servico: Servico
) {
  if (!ehPergunta(no) || servicoDoNo(no) !== servico) return false;
  return (
    opcoesNo(no).filter(
      (opcao) =>
        ehAntesDepois(opcao.titulo) ||
        ehValores(opcao.titulo) ||
        ehFaq(opcao.titulo) ||
        ehAgendamento(opcao.titulo) ||
        ehVoltarMenu(opcao.titulo)
    ).length >= 2
  );
}

export function ehMenuFaq(
  no: AssistenteAutomacaoNo,
  servico?: Servico | null
) {
  if (!ehPergunta(no)) return false;
  if (servico && servicoDoNo(no) !== servico) return false;
  const identificacao = normalizar(
    `${no.titulo} ${no.configuracao_json?.mensagem || ""}`
  );
  const intencoes = new Set(
    opcoesNo(no)
      .map((opcao) => intencaoFaq(`${opcao.id} ${opcao.titulo}`))
      .filter(Boolean)
  );
  return (
    intencoes.size >= 2 ||
    (intencoes.size >= 1 &&
      /\b(duvidas? frequentes?|menu faq|escolha uma duvida)\b/.test(
        identificacao
      ))
  );
}

export function ehMenuAntesDepois(no: AssistenteAutomacaoNo) {
  if (!ehPergunta(no)) return false;
  const identificacao = normalizar(
    `${no.titulo} ${no.configuracao_json?.mensagem || ""}`
  );
  if (!ehAntesDepois(identificacao)) return false;

  const servicos = new Set(
    opcoesNo(no).map((opcao) => servicoDoTexto(opcao.titulo)).filter(Boolean)
  );
  return servicos.size >= 2;
}

export function ehConteudoProcedimento(
  no: AssistenteAutomacaoNo,
  servico: Servico
) {
  if (no.tipo_no !== "enviar_texto" || servicoDoNo(no) !== servico) {
    return false;
  }
  const conteudo = conteudoNo(no);
  const titulo = normalizar(no.titulo);

  if (/\b(duvida|faq|pergunta|resposta)\b/.test(titulo)) return false;

  // Blocos de detalhamento gerados pelo normalizador mencionam duracao,
  // recuperacao e resultados. Esses termos tambem aparecem em FAQs, mas o
  // titulo deixa claro que fazem parte da sequencia explicativa.
  if (
    /\b(visao geral|beneficios?|indicacoes?|cuidados?|resultados esperados?)\b/.test(
      titulo
    ) &&
    !/\b(duvida|faq|pergunta|resposta)\b/.test(titulo)
  ) {
    return true;
  }

  return !(
    ehValores(conteudo) ||
    ehFaq(conteudo) ||
    ehAntesDepois(conteudo) ||
    ehLocalizacao(conteudo) ||
    ehAgendamento(conteudo)
  );
}

export function assinaturaNo(no: AssistenteAutomacaoNo) {
  return JSON.stringify({
    tipo: no.tipo_no,
    titulo: normalizar(no.titulo),
    mensagem: normalizar(no.configuracao_json?.mensagem),
    opcoes: opcoesNo(no).map((opcao) => opcao.id),
  });
}

export function indicePorId(nos: AssistenteAutomacaoNo[]) {
  return new Map(nos.map((no, indice) => [no.id, indice]));
}

export function melhorMenuPrincipal(nos: AssistenteAutomacaoNo[]) {
  const candidatas = nos
    .filter(ehPergunta)
    .map((no) => {
      const conteudo = conteudoNo(no);
      const titulo = normalizar(no.titulo);
      const servicos = new Set(
        opcoesNo(no).map((opcao) => servicoDoTexto(opcao.titulo)).filter(Boolean)
      );
      const explicitamentePrincipal = /\bmenu principal\b/.test(titulo);
      const mensagemPrincipal = /\bcomo podemos ajudar\b/.test(conteudo);
      const contextoProibido =
        /\b(antes e depois|valores?|duvidas?|faq|frequentes?)\b/.test(titulo);
      return {
        no,
        pontos:
          (explicitamentePrincipal ? 1000 : 0) +
          (mensagemPrincipal ? 500 : 0) +
          (ehMenuPrincipal(no) ? 100 : 0) +
          (contextoProibido ? -2000 : 0) +
          servicos.size * 30 +
          opcoesNo(no).length,
      };
    })
    .sort((a, b) => b.pontos - a.pontos);
  return candidatas[0]?.pontos && candidatas[0].pontos >= 100
    ? candidatas[0].no
    : null;
}

export function encontrarPorTipo(
  nos: AssistenteAutomacaoNo[],
  tipos: string[],
  filtro?: (no: AssistenteAutomacaoNo) => boolean
) {
  return nos.find(
    (no) => tipos.includes(no.tipo_no) && (!filtro || filtro(no))
  );
}
