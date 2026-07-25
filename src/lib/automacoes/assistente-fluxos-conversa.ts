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
  setor_excesso_tentativas?: string | null;
  estrategia_excesso_tentativas?: string | null;
  atendente_excesso_tentativas?: string | null;
};

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
        mensagem: `Para qual setor o bloco “${titulo}” deve transferir o contato quando exceder tentativas ou ficar sem resposta?`,
        ajuda:
          opcoes.length > 0
            ? "Confirme o setor usado tanto no excesso de respostas invalidas quanto no timeout por falta de resposta."
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
 * A IA entrega o plano completo em uma unica chamada. A interface pergunta por
 * recursos concretos e exige confirmacao explicita de todo setor de transferencia,
 * inclusive no excesso de tentativas e no timeout sem resposta.
 */
export function criarPerguntasAssistenteFluxo(params: {
  plano: PlanoAssistenteFluxos;
  setores: AssistenteSetor[];
  midias: AssistenteMidia[];
}) {
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
