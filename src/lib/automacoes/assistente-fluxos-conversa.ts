import type {
  AssistenteMidia,
  AssistenteSetor,
  PlanoAssistenteFluxos,
  ValidacaoItemAssistente,
} from "@/lib/automacoes/assistente-fluxos";
import {
  aplicarRespostaPerguntaAssistente,
  criarPerguntasAssistenteFluxo as criarPerguntasOriginais,
  proximaPerguntaAssistente,
  urlHttpValida,
  type PerguntaAssistenteFluxo,
} from "@/lib/automacoes/assistente-fluxos-conversa-original";

export {
  aplicarRespostaPerguntaAssistente,
  proximaPerguntaAssistente,
  urlHttpValida,
};

export type {
  CampoPerguntaAssistente,
  OpcaoPerguntaAssistente,
  PerguntaAssistenteFluxo,
} from "@/lib/automacoes/assistente-fluxos-conversa-original";

function tipoMidiaPorEtapa(tipo: string): AssistenteMidia["tipo"] | null {
  if (tipo === "midia_imagem") return "imagem";
  if (tipo === "midia_video") return "video";
  if (tipo === "midia_audio") return "audio";
  if (tipo === "midia_arquivo") return "arquivo";
  return null;
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

  if (params.pergunta.campo === "setor_id") {
    return params.setores.some((setor) => setor.id === etapa.setor_id);
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

/**
 * A IA sempre entrega o plano completo em uma unica chamada. Clarificacoes de
 * conteudo nao geram uma segunda chamada. A interface pergunta apenas por um
 * recurso concreto que realmente esteja ausente ou invalido: setor, midia ou URL.
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

  return criarPerguntasOriginais({
    ...params,
    plano: planoFinal,
  }).filter(
    (pergunta) =>
      !recursoJaResolvido({
        pergunta,
        plano: planoFinal,
        setores: params.setores,
        midias: params.midias,
      })
  );
}

/** O sistema nao repara nem solicita nova geracao da IA. */
export function errosQueExigemReparo(
  _erros: ValidacaoItemAssistente[]
): ValidacaoItemAssistente[] {
  return [];
}

/**
 * O compilador novo produz somente erros estruturais objetivos. Esses erros
 * continuam bloqueantes porque impedem a persistencia segura do JSON.
 */
export function errosQueBloqueiamCriacao(
  erros: ValidacaoItemAssistente[]
): ValidacaoItemAssistente[] {
  return erros;
}
