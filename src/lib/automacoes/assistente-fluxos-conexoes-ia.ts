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

type OpcaoMapeada = {
  idAnterior: string;
  idVisivel: string;
  titulo: string;
};

const TIPOS_PERGUNTA = new Set(["pergunta_opcoes", "pergunta_botoes"]);
const TIPOS_MIDIA = new Set([
  "midia_imagem",
  "midia_video",
  "midia_audio",
  "midia_arquivo",
]);
const LIMITE_OPCOES_MENU = 10;

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

function normalizarComparacao(valor: unknown) {
  return texto(valor, 1000)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizarRefTecnica(valor: unknown) {
  return (
    normalizarComparacao(valor)
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 120) || "item"
  );
}

function otimizarEspacamentoMensagem(valor: unknown) {
  const mensagem = texto(valor, 4000);
  if (!mensagem) return null;

  const compactada = mensagem
    .split(/\r?\n/)
    .map((linha) => linha.trimEnd())
    .join("\n")
    .replace(/\n[ \t]+\n/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const blocosUsados = new Set<string>();
  const blocos = compactada.split(/\n{2,}/).filter((bloco) => {
    const chave = normalizarComparacao(bloco);
    if (!chave || blocosUsados.has(chave)) return false;
    blocosUsados.add(chave);
    return true;
  });

  return blocos.join("\n\n").trim() || null;
}

function removerPrefixoOpcao(linha: string) {
  return linha
    .trim()
    .replace(/^[-•*▪◦‣]\s*/u, "")
    .replace(/^(?:\d{1,2}|[A-Za-z])(?:[.)\]:-]|\s+-)\s*/u, "")
    .trim();
}

function mensagemSemListaDuplicada(
  mensagem: string | null,
  opcoes: PlanoAssistenteOpcao[],
  tituloEtapa: string | null
) {
  if (!mensagem || opcoes.length === 0) return mensagem;

  const titulos = new Set(
    opcoes
      .map((item) => normalizarComparacao(item.texto))
      .filter(Boolean)
  );
  if (titulos.size === 0) return mensagem;

  const linhas = mensagem.split(/\r?\n/);
  const filtradas = linhas.filter((linha) => {
    const semPrefixo = removerPrefixoOpcao(linha);
    const normalizada = normalizarComparacao(semPrefixo);
    if (!normalizada) return true;
    if (titulos.has(normalizada)) return false;

    const partes = semPrefixo.split(/\s+-\s+/);
    const ultimaParte = partes.length > 1 ? partes[partes.length - 1] : "";
    return !ultimaParte || !titulos.has(normalizarComparacao(ultimaParte));
  });

  const resultado = filtradas
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!resultado) return "Selecione uma opção para continuar.";

  const mensagemNormalizada = normalizarComparacao(resultado);
  const tituloNormalizado = normalizarComparacao(tituloEtapa);
  const introducaoGenerica = [
    "selecione uma opcao para seguir com seu atendimento",
    "selecione uma opcao para continuar",
    "selecione uma opcao para seguir",
    "como deseja seguir agora",
    "como voce deseja seguir agora",
    "como voce quer seguir agora",
  ].includes(mensagemNormalizada);

  if (!introducaoGenerica) return resultado;
  if (/faq|duvida/.test(tituloNormalizado)) {
    return "Selecione a dúvida que deseja consultar.";
  }
  if (/pos faq|pos agendamento/.test(tituloNormalizado)) {
    return "Escolha como deseja continuar.";
  }
  return "Escolha uma opção para continuar.";
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
    mensagem: otimizarEspacamentoMensagem(item.mensagem),
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

function ehPergunta(etapa: EtapaDistribuicao) {
  return TIPOS_PERGUNTA.has(etapa.tipo);
}

function ehRotaNormalDeResposta(rotaAtual: PlanoAssistenteRota) {
  const condicao = normalizarRefTecnica(rotaAtual.condicao);
  return (
    Boolean(rotaAtual.origem && rotaAtual.destino && rotaAtual.valor) &&
    !["sempre", "timeout", "timeout_sem_resposta"].includes(condicao)
  );
}

function contemAntesDepois(valor: unknown) {
  const normalizado = normalizarComparacao(valor);
  return /\bantes\b/.test(normalizado) && /\bdepois\b/.test(normalizado);
}

function contextoIgnoradoParaAntesDepois(etapaAtual: EtapaDistribuicao) {
  const normalizado = normalizarComparacao(
    `${etapaAtual.ref} ${etapaAtual.titulo || ""}`
  );
  return (
    /\b(menu principal|principal|galeria|portfolio|faq|duvidas?)\b/.test(
      normalizado
    ) || contemAntesDepois(normalizado)
  );
}

function limparNomeContexto(etapaAtual: EtapaDistribuicao) {
  const base = texto(etapaAtual.titulo || etapaAtual.ref, 160)
    .replace(/^ações?\s+(?:da|do|de)\s+/i, "")
    .replace(/^menu\s+(?:da|do|de)?\s*/i, "")
    .replace(/^procedimento\s*\|\s*/i, "")
    .replace(/\s*\|\s*.+$/i, "")
    .trim();

  return base || texto(etapaAtual.ref, 160) || "contexto";
}

function refUnica(base: string, existentes: Set<string>) {
  let ref = normalizarRefTecnica(base);
  let indice = 2;
  while (existentes.has(ref)) {
    ref = `${normalizarRefTecnica(base)}_${indice}`;
    indice += 1;
  }
  existentes.add(ref);
  return ref;
}

function tipoMidiaPorEtapa(tipo: string, atual: string | null) {
  if (tipo === "midia_imagem") return "imagem";
  if (tipo === "midia_video") return "video";
  if (tipo === "midia_audio") return "audio";
  if (tipo === "midia_arquivo") return "arquivo";
  return atual;
}

function normalizarTipoMenusPorQuantidade(etapas: EtapaDistribuicao[]) {
  return etapas.map((item) => {
    if (item.tipo !== "pergunta_botoes" || item.opcoes.length <= 3) {
      return item;
    }

    return {
      ...item,
      tipo: "pergunta_opcoes",
    };
  });
}

function normalizarAntesDepoisPorContexto(params: {
  etapas: EtapaDistribuicao[];
  rotas: PlanoAssistenteRota[];
}) {
  const etapas = params.etapas.map((item) => ({
    ...item,
    opcoes: [...(item.opcoes || [])],
  }));
  const rotas = params.rotas.map((item) => ({ ...item }));
  const avisos: string[] = [];
  const porRef = new Map(etapas.map((item) => [item.ref, item]));
  const refsExistentes = new Set(etapas.map((item) => item.ref));

  const rotasAntesDepois = rotas.filter((rotaAtual) => {
    if (!ehRotaNormalDeResposta(rotaAtual)) return false;
    const destino = porRef.get(rotaAtual.destino);
    return (
      contemAntesDepois(`${rotaAtual.rotulo || ""} ${rotaAtual.valor || ""}`) &&
      Boolean(destino) &&
      (TIPOS_MIDIA.has(destino?.tipo || "") ||
        contemAntesDepois(`${destino?.titulo || ""} ${destino?.mensagem || ""}`))
    );
  });

  const porDestino = new Map<string, PlanoAssistenteRota[]>();
  for (const rotaAtual of rotasAntesDepois) {
    porDestino.set(rotaAtual.destino, [
      ...(porDestino.get(rotaAtual.destino) || []),
      rotaAtual,
    ]);
  }

  for (const [destinoRef, rotasDoDestino] of porDestino.entries()) {
    if (rotasDoDestino.length < 2) continue;
    const destino = porRef.get(destinoRef);
    if (!destino) continue;

    const contextuais = rotasDoDestino.filter((rotaAtual) => {
      const origem = porRef.get(rotaAtual.origem);
      return Boolean(
        origem &&
          ehPergunta(origem) &&
          !contextoIgnoradoParaAntesDepois(origem)
      );
    });

    if (contextuais.length < 2) continue;

    for (const rotaAtual of contextuais) {
      const origem = porRef.get(rotaAtual.origem);
      if (!origem) continue;

      const contexto = limparNomeContexto(origem);
      const novaRef = refUnica(
        `${destinoRef}_${normalizarRefTecnica(contexto)}`,
        refsExistentes
      );
      const tituloBase = destino.titulo || "Antes e Depois";
      const titulo = `${tituloBase.split("|")[0].trim()} | ${contexto}`
        .slice(0, 160)
        .trim();
      const mensagemBase =
        destino.mensagem ||
        "Confira os resultados visuais autorizados deste procedimento.";
      const mensagem = `Antes e depois de ${contexto}.\n\n${mensagemBase}`
        .replace(/\n{3,}/g, "\n\n")
        .slice(0, 4000)
        .trim();

      etapas.push({
        ...destino,
        ref: novaRef,
        titulo,
        mensagem,
        midia_id: null,
        midia_nome: null,
        midia_tipo: tipoMidiaPorEtapa(destino.tipo, destino.midia_tipo),
        midia_url: null,
        opcoes: [...(destino.opcoes || [])],
      });

      rotaAtual.destino = novaRef;
      rotas.push({
        origem: novaRef,
        destino: origem.ref,
        condicao: "sempre",
        valor: null,
        rotulo: "Voltar ao procedimento",
        descricao_ia: null,
        timeout_segundos: null,
      });

      avisos.push(
        `Criado antes e depois especifico para ${contexto} com midia pendente.`
      );
    }
  }

  return { etapas, rotas, avisos };
}

function normalizarIdsVisiveisDasOpcoes(params: {
  etapas: EtapaDistribuicao[];
  rotas: PlanoAssistenteRota[];
}) {
  const mapeamentos = new Map<string, OpcaoMapeada[]>();

  const etapas = params.etapas.map((item) => {
    if (!item.ref || item.opcoes.length === 0) return item;

    const opcoesOriginais = item.opcoes;
    const opcoes = opcoesOriginais.map((opcaoAtual, indice) => ({
      ...opcaoAtual,
      id: String(indice + 1),
    }));

    mapeamentos.set(
      item.ref,
      opcoesOriginais.map((opcaoAtual, indice) => ({
        idAnterior: texto(opcaoAtual.id, 160),
        idVisivel: String(indice + 1),
        titulo: texto(opcaoAtual.texto, 240),
      }))
    );

    return {
      ...item,
      mensagem: mensagemSemListaDuplicada(
        item.mensagem,
        opcoes,
        item.titulo
      ),
      opcoes,
    };
  });

  const idsUsadosPorOrigem = new Map<string, Set<string>>();
  const rotas = params.rotas.map((item) => {
    const opcoes = mapeamentos.get(item.origem);
    if (!opcoes || !item.valor) return item;

    const usados = idsUsadosPorOrigem.get(item.origem) || new Set<string>();
    idsUsadosPorOrigem.set(item.origem, usados);

    const valor = normalizarComparacao(item.valor);
    const rotulo = normalizarComparacao(item.rotulo);
    const disponiveis = opcoes.filter((opcaoAtual) => !usados.has(opcaoAtual.idVisivel));

    const escolhida =
      disponiveis.find(
        (opcaoAtual) =>
          normalizarComparacao(opcaoAtual.idAnterior) === valor &&
          Boolean(rotulo) &&
          normalizarComparacao(opcaoAtual.titulo) === rotulo
      ) ||
      disponiveis.find(
        (opcaoAtual) => normalizarComparacao(opcaoAtual.idAnterior) === valor
      ) ||
      disponiveis.find(
        (opcaoAtual) =>
          Boolean(rotulo) && normalizarComparacao(opcaoAtual.titulo) === rotulo
      ) ||
      (() => {
        const indice = Number(item.valor);
        return Number.isInteger(indice) && indice >= 1 && indice <= opcoes.length
          ? opcoes[indice - 1]
          : null;
      })();

    if (!escolhida) return item;
    usados.add(escolhida.idVisivel);

    return {
      ...item,
      valor: escolhida.idVisivel,
      rotulo: item.rotulo || escolhida.titulo || escolhida.idVisivel,
    };
  });

  return { etapas, rotas };
}

function sincronizarRotasComOpcoesVisiveis(params: {
  etapas: EtapaDistribuicao[];
  rotas: PlanoAssistenteRota[];
}) {
  const avisos: string[] = [];
  const etapas = params.etapas.map((item) => ({
    ...item,
    opcoes: [...(item.opcoes || [])],
  }));
  const porRef = new Map(etapas.map((item) => [item.ref, item]));

  for (const rotaAtual of params.rotas) {
    if (!ehRotaNormalDeResposta(rotaAtual)) continue;

    const origem = porRef.get(rotaAtual.origem);
    if (!origem || !ehPergunta(origem)) continue;

    const valor = texto(rotaAtual.valor, 200);
    if (!valor) continue;

    const valoresVisiveis = new Set(
      origem.opcoes.map((opcaoAtual) => texto(opcaoAtual.id, 200))
    );

    if (valoresVisiveis.has(valor)) continue;
    if (origem.opcoes.length >= LIMITE_OPCOES_MENU) continue;

    origem.opcoes.push({
      id: valor,
      texto:
        texto(rotaAtual.rotulo, 240) ||
        `Opção ${String(origem.opcoes.length + 1)}`,
    });

    if (origem.opcoes.length > 3 && origem.tipo === "pergunta_botoes") {
      origem.tipo = "pergunta_opcoes";
    }

    avisos.push(
      `A rota "${rotaAtual.rotulo || valor}" foi adicionada como opcao visivel.`
    );
  }

  return { etapas, avisos };
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
 * Le o JSON estruturado e normaliza dados tecnicos seguros antes da
 * materializacao: limites de menus, IDs visiveis, rotas que perderiam opcao
 * visivel e midias de antes/depois por contexto.
 */
export function normalizarPlanoAssistente(
  valor: unknown
): PlanoAssistenteFluxos {
  const raiz = objeto(valor);
  const etapasBase = normalizarTipoMenusPorQuantidade(
    Array.isArray(raiz.etapas) ? raiz.etapas.map(etapa) : []
  );
  const rotasBase = Array.isArray(raiz.rotas) ? raiz.rotas.map(rota) : [];
  const antesDepois = normalizarAntesDepoisPorContexto({
    etapas: etapasBase,
    rotas: rotasBase,
  });
  const estrutura = normalizarIdsVisiveisDasOpcoes({
    etapas: normalizarTipoMenusPorQuantidade(antesDepois.etapas),
    rotas: antesDepois.rotas,
  });
  const sincronizadas = sincronizarRotasComOpcoesVisiveis(estrutura);

  return {
    nome_fluxo: texto(raiz.nome_fluxo, 160),
    objetivo: texto(raiz.objetivo, 1200),
    resumo: texto(raiz.resumo, 1800),
    etapas: normalizarTipoMenusPorQuantidade(sincronizadas.etapas),
    rotas: estrutura.rotas,
    mensagens_revisadas: Array.isArray(raiz.mensagens_revisadas)
      ? raiz.mensagens_revisadas.map(mensagemRevisada)
      : [],
    variaveis_sugeridas: Array.isArray(raiz.variaveis_sugeridas)
      ? raiz.variaveis_sugeridas.map(variavelSugerida)
      : [],
    clarificacoes: Array.isArray(raiz.clarificacoes)
      ? raiz.clarificacoes.map(clarificacao)
      : [],
    avisos: [
      ...(Array.isArray(raiz.avisos)
        ? raiz.avisos.map((aviso) => texto(aviso, 1000)).filter(Boolean)
        : []),
      ...antesDepois.avisos,
      ...sincronizadas.avisos,
    ],
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
