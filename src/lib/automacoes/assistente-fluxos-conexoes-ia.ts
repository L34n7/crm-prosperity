import { compilarPlanoAssistente as compilarEstrutural } from "./assistente-fluxos-compilador-seguro";
import type {
  AssistenteAutomacaoNo,
  ModoAssistenteFluxos,
  PlanoAssistenteClarificacao,
  PlanoAssistenteEtapa,
  PlanoAssistenteFluxos,
  PlanoAssistenteMensagemRevisada,
  PlanoAssistenteOpcao,
  PlanoAssistenteRota,
  PlanoAssistenteVariavelSugerida,
  ResultadoCompilacaoAssistente,
} from "./assistente-fluxos-base";

export type EstrategiaDistribuicaoAtendimento =
  | "fila_setor"
  | "atendente_especifico"
  | "rodizio_aleatorio"
  | "menos_conversas";

type EtapaDistribuicao = PlanoAssistenteEtapa & {
  agenda_id?: string | null;
  agenda_nome?: string | null;
  estrategia_transferencia?: EstrategiaDistribuicaoAtendimento | null;
  atendente_id?: string | null;
  setor_excesso_tentativas?: string | null;
  estrategia_excesso_tentativas?: EstrategiaDistribuicaoAtendimento | null;
  atendente_excesso_tentativas?: string | null;
};

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function texto(valor: unknown, limite = 20000) {
  return String(valor || "").trim().slice(0, limite);
}

function textoOuNull(valor: unknown, limite = 20000) {
  const resultado = texto(valor, limite);
  return resultado || null;
}

function numeroOuNull(valor: unknown) {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function estrategia(valor: unknown, atendente?: unknown) {
  const informada = texto(valor, 80);
  if (
    [
      "fila_setor",
      "atendente_especifico",
      "rodizio_aleatorio",
      "menos_conversas",
    ].includes(informada)
  ) {
    return informada as EstrategiaDistribuicaoAtendimento;
  }
  return texto(atendente, 120) ? "atendente_especifico" : "fila_setor";
}

function estrategiaOpcional(valor: unknown, atendente?: unknown) {
  return texto(valor, 80) || texto(atendente, 120)
    ? estrategia(valor, atendente)
    : null;
}

function opcao(valor: unknown): PlanoAssistenteOpcao {
  const item = objeto(valor);
  return {
    id: texto(item.id, 160),
    texto: texto(item.texto, 240),
  };
}

function etapa(valor: unknown): EtapaDistribuicao {
  const item = objeto(valor);
  return {
    ref: texto(item.ref, 180),
    tipo: texto(item.tipo, 80),
    titulo: textoOuNull(item.titulo, 160),
    mensagem: textoOuNull(item.mensagem, 4000),
    variavel: textoOuNull(item.variavel, 160),
    tipo_captura: textoOuNull(item.tipo_captura, 80),
    setor_id: textoOuNull(item.setor_id, 160),
    setor_nome: textoOuNull(item.setor_nome, 200),
    resultado: textoOuNull(item.resultado, 80),
    midia_id: textoOuNull(item.midia_id, 160),
    midia_nome: textoOuNull(item.midia_nome, 300),
    midia_tipo: textoOuNull(item.midia_tipo, 80),
    midia_url: textoOuNull(item.midia_url, 2400),
    url: textoOuNull(item.url, 2400),
    botao_texto: textoOuNull(item.botao_texto, 40),
    opcoes: Array.isArray(item.opcoes) ? item.opcoes.map(opcao) : [],
    agenda_id: textoOuNull(item.agenda_id, 160),
    agenda_nome: textoOuNull(item.agenda_nome, 200),
    estrategia_transferencia: estrategiaOpcional(
      item.estrategia_transferencia,
      item.atendente_id
    ),
    atendente_id: textoOuNull(item.atendente_id, 160),
    setor_excesso_tentativas: textoOuNull(
      item.setor_excesso_tentativas,
      160
    ),
    estrategia_excesso_tentativas: estrategiaOpcional(
      item.estrategia_excesso_tentativas,
      item.atendente_excesso_tentativas
    ),
    atendente_excesso_tentativas: textoOuNull(
      item.atendente_excesso_tentativas,
      160
    ),
  };
}

function rota(valor: unknown): PlanoAssistenteRota {
  const item = objeto(valor);
  return {
    origem: texto(item.origem, 180),
    destino: texto(item.destino, 180),
    condicao: texto(item.condicao, 80),
    valor: textoOuNull(item.valor, 200),
    rotulo: textoOuNull(item.rotulo, 200),
    descricao_ia: textoOuNull(item.descricao_ia, 700),
    timeout_segundos: numeroOuNull(item.timeout_segundos),
  };
}

function mensagemRevisada(valor: unknown): PlanoAssistenteMensagemRevisada {
  const item = objeto(valor);
  return {
    ref: texto(item.ref, 180),
    mensagem: texto(item.mensagem, 4000),
    motivo: textoOuNull(item.motivo, 600),
  };
}

function variavelSugerida(valor: unknown): PlanoAssistenteVariavelSugerida {
  const item = objeto(valor);
  return {
    chave: texto(item.chave, 160),
    descricao: textoOuNull(item.descricao, 600),
  };
}

function clarificacao(valor: unknown): PlanoAssistenteClarificacao {
  const item = objeto(valor);
  const tipo = texto(item.tipo, 40);
  return {
    id: texto(item.id, 180),
    pergunta: texto(item.pergunta, 1000),
    tipo: tipo === "selecao" ? "selecao" : "texto",
    opcoes: Array.isArray(item.opcoes) ? item.opcoes.map(opcao) : [],
    valor_sugerido: textoOuNull(item.valor_sugerido, 600),
    motivo: textoOuNull(item.motivo, 600),
  };
}

/**
 * Le o JSON estruturado sem completar rotas, renomear refs, inserir blocos ou
 * reescrever mensagens. Pequenos limites existem apenas para proteger os campos
 * persistidos; a arquitetura e a intencao permanecem exatamente as da IA.
 */
export function normalizarPlanoAssistente(
  valor: unknown
): PlanoAssistenteFluxos {
  const raiz = objeto(valor);
  return {
    nome_fluxo: texto(raiz.nome_fluxo, 160),
    objetivo: texto(raiz.objetivo, 1200),
    resumo: texto(raiz.resumo, 1800),
    etapas: Array.isArray(raiz.etapas) ? raiz.etapas.map(etapa) : [],
    rotas: Array.isArray(raiz.rotas) ? raiz.rotas.map(rota) : [],
    mensagens_revisadas: Array.isArray(raiz.mensagens_revisadas)
      ? raiz.mensagens_revisadas.map(mensagemRevisada)
      : [],
    variaveis_sugeridas: Array.isArray(raiz.variaveis_sugeridas)
      ? raiz.variaveis_sugeridas.map(variavelSugerida)
      : [],
    clarificacoes: Array.isArray(raiz.clarificacoes)
      ? raiz.clarificacoes.map(clarificacao)
      : [],
    avisos: Array.isArray(raiz.avisos)
      ? raiz.avisos.map((aviso) => texto(aviso, 1000)).filter(Boolean)
      : [],
  };
}

function tipoNo(tipo: string) {
  const mapa: Record<string, string> = {
    inicio: "inicio",
    mensagem: "enviar_texto",
    pergunta_opcoes: "pergunta_opcoes",
    pergunta_botoes: "enviar_botoes",
    pergunta_livre_ia: "pergunta_livre_ia",
    capturar_resposta: "capturar_resposta",
    midia_imagem: "enviar_imagem",
    midia_video: "enviar_video",
    midia_audio: "enviar_audio",
    midia_arquivo: "enviar_arquivo",
    redirect: "botao_redirect",
    transferir: "transferir_setor",
    encerrar: "encerrar",
    avaliacao: "avaliacao",
  };
  return mapa[tipo] || (tipo.startsWith("agenda_") ? tipo : "enviar_texto");
}

/** Aplica somente IDs e estrategia de distribuicao presentes no JSON final. */
function aplicarDistribuicao(
  nos: AssistenteAutomacaoNo[],
  etapas: EtapaDistribuicao[]
) {
  const usados = new Set<string>();

  for (const etapaPlano of etapas) {
    const esperado = tipoNo(etapaPlano.tipo);
    const no =
      nos.find(
        (item) =>
          !usados.has(item.id) &&
          item.tipo_no === esperado &&
          texto(item.titulo, 160).toLowerCase() ===
            texto(etapaPlano.titulo, 160).toLowerCase()
      ) ||
      nos.find(
        (item) => !usados.has(item.id) && item.tipo_no === esperado
      );

    if (!no) continue;
    usados.add(no.id);
    const configuracao = { ...objeto(no.configuracao_json) };

    if (no.tipo_no === "transferir_setor") {
      const modo = estrategia(
        etapaPlano.estrategia_transferencia,
        etapaPlano.atendente_id
      );
      configuracao.estrategia_transferencia = modo;
      configuracao.atendente_id =
        modo === "atendente_especifico"
          ? etapaPlano.atendente_id || null
          : null;
    }

    if (etapaPlano.setor_excesso_tentativas) {
      const modo = estrategia(
        etapaPlano.estrategia_excesso_tentativas,
        etapaPlano.atendente_excesso_tentativas
      );
      configuracao.setor_excesso_tentativas =
        etapaPlano.setor_excesso_tentativas;
      configuracao.estrategia_excesso_tentativas = modo;
      configuracao.atendente_excesso_tentativas =
        modo === "atendente_especifico"
          ? etapaPlano.atendente_excesso_tentativas || null
          : null;
    }

    no.configuracao_json = configuracao;
  }

  return nos;
}

export function compilarPlanoAssistente(params: {
  modo: ModoAssistenteFluxos;
  plano: PlanoAssistenteFluxos;
  fluxoAtual?: Parameters<typeof compilarEstrutural>[0]["fluxoAtual"];
  setores?: Parameters<typeof compilarEstrutural>[0]["setores"];
  variaveis?: Parameters<typeof compilarEstrutural>[0]["variaveis"];
  midias?: Parameters<typeof compilarEstrutural>[0]["midias"];
}): ResultadoCompilacaoAssistente {
  const resultado = compilarEstrutural(params);
  if (params.modo !== "criar_fluxo") return resultado;

  const nos = aplicarDistribuicao(
    resultado.nos.map((no) => ({
      ...no,
      configuracao_json: { ...no.configuracao_json },
    })),
    params.plano.etapas as EtapaDistribuicao[]
  );

  return { ...resultado, nos };
}
