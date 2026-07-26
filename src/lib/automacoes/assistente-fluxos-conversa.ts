import type {
  AssistenteMidia,
  AssistenteSetor,
  PlanoAssistenteFluxos,
  ValidacaoItemAssistente,
} from "@/lib/automacoes/assistente-fluxos";
import {
  aplicarRespostaPerguntaAssistente as aplicarRespostaOriginal,
  criarPerguntasAssistenteFluxo as criarPerguntasOriginais,
  urlHttpValida,
  type CampoPerguntaAssistente as CampoPerguntaOriginal,
  type OpcaoPerguntaAssistente,
  type PerguntaAssistenteFluxo as PerguntaAssistenteOriginal,
} from "@/lib/automacoes/assistente-fluxos-conversa-original";

export { urlHttpValida };
export type { OpcaoPerguntaAssistente };

export type CampoPerguntaAssistente =
  | CampoPerguntaOriginal
  | "setor_excesso_tentativas";

export type PerguntaAssistenteFluxo = Omit<
  PerguntaAssistenteOriginal,
  "campo"
> & {
  campo: CampoPerguntaAssistente;
};

type EtapaComDistribuicao = PlanoAssistenteFluxos["etapas"][number] & {
  estrategia_transferencia?: string | null;
  atendente_id?: string | null;
  setor_excesso_tentativas?: string | null;
  estrategia_excesso_tentativas?: string | null;
  atendente_excesso_tentativas?: string | null;
};

type PlanoPreparado = PlanoAssistenteFluxos & {
  confirmacoes_individuais_atendimento_v4?: boolean;
};

const TIMEOUT_MINIMO_SEGUNDOS = 15 * 60;
const ESTRATEGIAS_DISTRIBUICAO = new Set([
  "fila_setor",
  "atendente_especifico",
  "rodizio_aleatorio",
  "menos_conversas",
]);

const TIPOS_COM_TRANSFERENCIA_POR_EXCESSO = new Set([
  "pergunta_opcoes",
  "pergunta_botoes",
  "pergunta_livre_ia",
  "capturar_resposta",
  "avaliacao",
  "agenda_escolher_horario",
  "agenda_buscar_agendamento",
  "interpretar_arquivo_ia",
]);

function tipoMidiaPorEtapa(tipo: string): AssistenteMidia["tipo"] | null {
  if (tipo === "midia_imagem") return "imagem";
  if (tipo === "midia_video") return "video";
  if (tipo === "midia_audio") return "audio";
  if (tipo === "midia_arquivo") return "arquivo";
  return null;
}

function setorValido(
  setores: AssistenteSetor[],
  setorId: unknown
): string | null {
  const id = String(setorId || "").trim();
  return setores.some((setor) => setor.id === id) ? id : null;
}

function normalizarRefTecnica(valor: unknown) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function rotaEhTimeout(rota: PlanoAssistenteFluxos["rotas"][number]) {
  const condicao = normalizarRefTecnica(rota.condicao);
  return condicao === "timeout" || condicao === "timeout_sem_resposta";
}

function criarRefTimeoutUnica(
  origemRef: string,
  etapas: EtapaComDistribuicao[]
) {
  const base = `timeout_${normalizarRefTecnica(origemRef) || "resposta"}_atendimento`;
  const existente = etapas.find(
    (etapa) => etapa.ref === base && etapa.tipo === "transferir"
  );
  if (existente) return base;

  const refs = new Set(etapas.map((etapa) => etapa.ref));
  let ref = base;
  let indice = 2;
  while (refs.has(ref)) {
    ref = `${base}_${indice}`;
    indice += 1;
  }
  return ref;
}

function criarEtapaTransferenciaTimeout(params: {
  ref: string;
  origem: EtapaComDistribuicao;
}): EtapaComDistribuicao {
  const tituloOrigem = String(
    params.origem.titulo || params.origem.ref || "Captura"
  )
    .trim()
    .slice(0, 88);

  return {
    ref: params.ref,
    tipo: "transferir",
    titulo: `Timeout · ${tituloOrigem}`.slice(0, 120),
    mensagem:
      "O contato ficou sem responder. Vou encaminhar o atendimento para a equipe.",
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
    estrategia_transferencia: null,
    atendente_id: null,
    setor_excesso_tentativas: null,
    estrategia_excesso_tentativas: null,
    atendente_excesso_tentativas: null,
  };
}

/**
 * Prepara o plano em memoria antes de montar a fila de confirmacoes.
 *
 * - perguntas com ate tres respostas usam botoes;
 * - cada captura recebe um timeout de pelo menos quinze minutos;
 * - cada timeout termina em uma transferencia exclusiva e confirmavel;
 * - excesso de tentativas permanece individual por bloco, sem consolidacao.
 *
 * A funcao e idempotente porque e executada novamente ao retomar a sessao.
 */
function prepararPlanoParaConfirmacoes(params: {
  plano: PlanoAssistenteFluxos;
  setores: AssistenteSetor[];
}) {
  const plano = params.plano as PlanoPreparado;
  const etapas = plano.etapas as EtapaComDistribuicao[];

  for (const etapa of etapas) {
    if (
      etapa.tipo === "pergunta_opcoes" &&
      Array.isArray(etapa.opcoes) &&
      etapa.opcoes.length >= 1 &&
      etapa.opcoes.length <= 3
    ) {
      etapa.tipo = "pergunta_botoes";
    }
  }

  const origensTimeout = new Set(
    plano.rotas.filter(rotaEhTimeout).map((rota) => rota.origem)
  );
  for (const etapa of etapas) {
    if (etapa.tipo === "capturar_resposta") {
      origensTimeout.add(etapa.ref);
    }
  }

  for (const origemRef of origensTimeout) {
    const origem = etapas.find((etapa) => etapa.ref === origemRef);
    if (!origem) continue;

    const rotasTimeout = plano.rotas.filter(
      (rota) => rota.origem === origemRef && rotaEhTimeout(rota)
    );
    const timeoutSegundos = Math.max(
      TIMEOUT_MINIMO_SEGUNDOS,
      ...rotasTimeout.map((rota) => {
        const valor = Number(rota.timeout_segundos);
        return Number.isFinite(valor) ? Math.floor(valor) : 0;
      })
    );

    const refTransferencia = criarRefTimeoutUnica(origemRef, etapas);
    if (!etapas.some((etapa) => etapa.ref === refTransferencia)) {
      etapas.push(
        criarEtapaTransferenciaTimeout({
          ref: refTransferencia,
          origem,
        })
      );
    }

    plano.rotas = plano.rotas.filter(
      (rota) => !(rota.origem === origemRef && rotaEhTimeout(rota))
    );
    plano.rotas.push({
      origem: origemRef,
      destino: refTransferencia,
      condicao: "timeout_sem_resposta",
      valor: null,
      rotulo: "Sem resposta",
      descricao_ia: null,
      timeout_segundos: timeoutSegundos,
    });
  }

  if (plano.confirmacoes_individuais_atendimento_v4) return;

  const setorFallback = params.setores[0]?.id || null;
  for (const etapa of etapas) {
    if (!TIPOS_COM_TRANSFERENCIA_POR_EXCESSO.has(etapa.tipo)) continue;

    etapa.setor_excesso_tentativas =
      setorValido(params.setores, etapa.setor_excesso_tentativas) ||
      setorFallback;
    etapa.estrategia_excesso_tentativas = ESTRATEGIAS_DISTRIBUICAO.has(
      String(etapa.estrategia_excesso_tentativas || "")
    )
      ? etapa.estrategia_excesso_tentativas
      : "fila_setor";

    // A fila estavel usa este campo apenas para distinguir configuracoes antes
    // das confirmacoes. A resposta de distribuicao substitui ou remove o valor.
    etapa.atendente_excesso_tentativas = `__confirmar_${
      normalizarRefTecnica(etapa.ref) || "etapa"
    }`;
  }

  plano.confirmacoes_individuais_atendimento_v4 = true;
}

function recursoJaResolvido(params: {
  pergunta: PerguntaAssistenteFluxo;
  plano: PlanoAssistenteFluxos;
  setores: AssistenteSetor[];
  midias: AssistenteMidia[];
}) {
  const etapa = params.plano.etapas.find(
    (item) => item.ref === params.pergunta.etapa_ref
  );
  if (!etapa) return false;

  // Setor nunca e considerado resolvido automaticamente. Mesmo que a IA tenha
  // sugerido um ID real, o usuario precisa confirmar conscientemente o destino.
  if (
    params.pergunta.campo === "setor_id" ||
    params.pergunta.campo === "setor_excesso_tentativas"
  ) {
    return false;
  }

  if (params.pergunta.campo === "midia_id") {
    const tipoEsperado = tipoMidiaPorEtapa(etapa.tipo);
    return params.midias.some(
      (midia) =>
        midia.id === etapa.midia_id &&
        midia.tipo === tipoEsperado &&
        midia.url === etapa.midia_url
    );
  }

  if (params.pergunta.campo === "url") {
    return urlHttpValida(etapa.url);
  }

  return false;
}

function criarPerguntasSetorExcesso(params: {
  plano: PlanoAssistenteFluxos;
  setores: AssistenteSetor[];
}): PerguntaAssistenteFluxo[] {
  return params.plano.etapas.flatMap((etapaBase) => {
    if (!TIPOS_COM_TRANSFERENCIA_POR_EXCESSO.has(etapaBase.tipo)) return [];

    const etapa = etapaBase as EtapaComDistribuicao;
    const titulo = String(etapa.titulo || "esta etapa").trim().slice(0, 120);
    const opcoes = params.setores.map((setor) => ({
      id: setor.id,
      label: setor.nome,
      descricao: null,
    }));

    return [
      {
        id: `setor_excesso:${etapa.ref}`,
        etapa_ref: etapa.ref,
        campo: "setor_excesso_tentativas",
        tipo: "selecao",
        mensagem: `Para qual setor o bloco “${titulo}” deve transferir o contato quando exceder tentativas?`,
        ajuda:
          opcoes.length > 0
            ? "Esta configuracao vale somente para o excesso de tentativas deste bloco. O timeout, quando existir, possui transferencia propria."
            : "Cadastre e ative um setor antes de concluir este fluxo.",
        obrigatoria: true,
        bloqueada: opcoes.length === 0,
        valor_sugerido: setorValido(
          params.setores,
          etapa.setor_excesso_tentativas
        ),
        opcoes,
      },
    ];
  });
}

/**
 * A IA entrega o plano completo em uma unica chamada. Antes das confirmacoes, o
 * CRM garante botoes para perguntas curtas, fallback de timeout nas capturas e
 * confirmacao individual de todos os destinos humanos.
 */
export function criarPerguntasAssistenteFluxo(params: {
  plano: PlanoAssistenteFluxos;
  setores: AssistenteSetor[];
  midias: AssistenteMidia[];
}) {
  prepararPlanoParaConfirmacoes({
    plano: params.plano,
    setores: params.setores,
  });

  const planoFinal = {
    ...params.plano,
    clarificacoes: [],
  };

  const perguntasOriginais = criarPerguntasOriginais({
    ...params,
    plano: planoFinal,
  }) as PerguntaAssistenteFluxo[];

  const perguntas = [
    ...perguntasOriginais,
    ...criarPerguntasSetorExcesso({
      plano: planoFinal,
      setores: params.setores,
    }),
  ];

  const ids = new Set<string>();

  return perguntas.filter((pergunta) => {
    if (ids.has(pergunta.id)) return false;
    ids.add(pergunta.id);

    return !recursoJaResolvido({
      pergunta,
      plano: planoFinal,
      setores: params.setores,
      midias: params.midias,
    });
  });
}

export function aplicarRespostaPerguntaAssistente(params: {
  plano: PlanoAssistenteFluxos;
  pergunta: PerguntaAssistenteFluxo;
  resposta: unknown;
  setores: AssistenteSetor[];
  midias: AssistenteMidia[];
}) {
  if (params.pergunta.campo !== "setor_excesso_tentativas") {
    return aplicarRespostaOriginal({
      ...params,
      pergunta: params.pergunta as PerguntaAssistenteOriginal,
    });
  }

  const resposta = String(params.resposta || "").trim();
  const setor = params.setores.find((item) => item.id === resposta);

  if (!setor) {
    throw new Error("Selecione um setor valido da empresa.");
  }

  const etapas = params.plano.etapas.map((etapaBase) => {
    if (etapaBase.ref !== params.pergunta.etapa_ref) return etapaBase;

    const etapa = etapaBase as EtapaComDistribuicao;
    const estrategia =
      String(etapa.estrategia_excesso_tentativas || "").trim() || "fila_setor";

    return {
      ...etapa,
      setor_excesso_tentativas: setor.id,
      estrategia_excesso_tentativas: estrategia,
      atendente_excesso_tentativas:
        estrategia === "atendente_especifico"
          ? etapa.atendente_excesso_tentativas || null
          : null,
    };
  });

  return {
    plano: {
      ...params.plano,
      etapas,
    } as PlanoAssistenteFluxos,
    resumoResposta: setor.nome,
  };
}

export function proximaPerguntaAssistente(params: {
  perguntas: PerguntaAssistenteFluxo[];
  respondidas: string[];
}) {
  const respondidas = new Set(params.respondidas);
  return params.perguntas.find((pergunta) => !respondidas.has(pergunta.id)) || null;
}

/** O sistema nao repara nem solicita nova geracao da IA. */
export function errosQueExigemReparo(
  _erros: ValidacaoItemAssistente[]
): ValidacaoItemAssistente[] {
  return [];
}

/** Erros estruturais objetivos continuam bloqueando a persistencia insegura. */
export function errosQueBloqueiamCriacao(
  erros: ValidacaoItemAssistente[]
): ValidacaoItemAssistente[] {
  return erros;
}
