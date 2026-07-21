import type {
  AssistenteMidia,
  AssistenteSetor,
  PlanoAssistenteFluxos,
  ValidacaoItemAssistente,
} from "@/lib/automacoes/assistente-fluxos";

export type CampoPerguntaAssistente =
  | "clarificacao"
  | "setor_id"
  | "midia_id"
  | "url";

export type OpcaoPerguntaAssistente = {
  id: string;
  label: string;
  descricao: string | null;
};

export type PerguntaAssistenteFluxo = {
  id: string;
  etapa_ref: string;
  campo: CampoPerguntaAssistente;
  tipo: "selecao" | "texto";
  mensagem: string;
  ajuda: string | null;
  obrigatoria: boolean;
  bloqueada: boolean;
  valor_sugerido: string | null;
  opcoes: OpcaoPerguntaAssistente[];
};

function texto(valor: unknown, limite = 1800) {
  return String(valor || "").trim().slice(0, limite);
}

function tipoMidiaPorEtapa(tipo: string): AssistenteMidia["tipo"] | null {
  if (tipo === "midia_imagem") return "imagem";
  if (tipo === "midia_video") return "video";
  if (tipo === "midia_audio") return "audio";
  if (tipo === "midia_arquivo") return "arquivo";
  return null;
}

export function urlHttpValida(valor: unknown) {
  try {
    const url = new URL(texto(valor));
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

export function criarPerguntasAssistenteFluxo(params: {
  plano: PlanoAssistenteFluxos;
  setores: AssistenteSetor[];
  midias: AssistenteMidia[];
}) {
  if (params.plano.clarificacoes.length > 0) {
    return params.plano.clarificacoes.map(
      (clarificacao): PerguntaAssistenteFluxo => ({
        id: `clarificacao:${clarificacao.id}`,
        etapa_ref: clarificacao.id,
        campo: "clarificacao",
        tipo:
          clarificacao.tipo === "selecao" && clarificacao.opcoes.length > 0
            ? "selecao"
            : "texto",
        mensagem: clarificacao.pergunta,
        ajuda:
          clarificacao.motivo ||
          "Esta resposta ajuda a definir corretamente os caminhos do fluxo.",
        obrigatoria: true,
        bloqueada: false,
        valor_sugerido: clarificacao.valor_sugerido,
        opcoes: clarificacao.opcoes.map((opcao) => ({
          id: opcao.id,
          label: opcao.texto,
          descricao: null,
        })),
      })
    );
  }

  const perguntas: PerguntaAssistenteFluxo[] = [];

  for (const etapa of params.plano.etapas) {
    const titulo = texto(etapa.titulo, 120) || "esta etapa";

    if (etapa.tipo === "transferir") {
      const opcoes = params.setores.map((setor) => ({
        id: setor.id,
        label: setor.nome,
        descricao: null,
      }));
      const sugestao = params.setores.some(
        (setor) => setor.id === etapa.setor_id
      )
        ? etapa.setor_id
        : null;

      perguntas.push({
        id: `setor:${etapa.ref}`,
        etapa_ref: etapa.ref,
        campo: "setor_id",
        tipo: "selecao",
        mensagem: `Para qual setor o bloco “${titulo}” deve transferir o contato?`,
        ajuda:
          opcoes.length > 0
            ? "Escolha um setor ativo da sua empresa."
            : "Cadastre e ative um setor antes de concluir este fluxo.",
        obrigatoria: true,
        bloqueada: opcoes.length === 0,
        valor_sugerido: sugestao,
        opcoes,
      });
    }

    const tipoMidia = tipoMidiaPorEtapa(etapa.tipo);

    if (tipoMidia) {
      const midiasCompativeis = params.midias.filter(
        (midia) => midia.tipo === tipoMidia
      );
      perguntas.push({
        id: `midia:${etapa.ref}`,
        etapa_ref: etapa.ref,
        campo: "midia_id",
        tipo: "selecao",
        mensagem: `Qual ${tipoMidia} deve ser usada no bloco “${titulo}”?`,
        ajuda:
          midiasCompativeis.length > 0
            ? "Selecione uma mídia ou continue sem ela. O fluxo não poderá ser ativado enquanto este bloco estiver incompleto."
            : `Você pode continuar sem mídia e selecioná-la depois, antes de ativar o fluxo.`,
        obrigatoria: false,
        bloqueada: false,
        // O tipo da mídia não é suficiente para concluir que seu conteúdo
        // corresponde ao pedido (ex.: uma arte de planos não é "antes e
        // depois"). Exija uma escolha consciente do usuário.
        valor_sugerido: null,
        opcoes: midiasCompativeis.map((midia) => ({
          id: midia.id,
          label: midia.nome,
          descricao: tipoMidia,
        })),
      });
    }

    if (etapa.tipo === "redirect") {
      perguntas.push({
        id: `url:${etapa.ref}`,
        etapa_ref: etapa.ref,
        campo: "url",
        tipo: "texto",
        mensagem: `Qual link deve ser aberto pelo bloco “${titulo}”?`,
        ajuda: "Informe uma URL completa iniciando com http:// ou https://.",
        obrigatoria: true,
        bloqueada: false,
        valor_sugerido: urlHttpValida(etapa.url) ? etapa.url : null,
        opcoes: [],
      });
    }
  }

  return perguntas;
}

export function aplicarRespostaPerguntaAssistente(params: {
  plano: PlanoAssistenteFluxos;
  pergunta: PerguntaAssistenteFluxo;
  resposta: unknown;
  setores: AssistenteSetor[];
  midias: AssistenteMidia[];
}) {
  const resposta = texto(params.resposta);

  if (!resposta && params.pergunta.obrigatoria) {
    throw new Error("Esta resposta e obrigatoria.");
  }

  const etapaExiste = params.plano.etapas.some(
    (etapa) => etapa.ref === params.pergunta.etapa_ref
  );

  if (!etapaExiste) {
    throw new Error("A etapa relacionada a esta pergunta nao existe mais.");
  }

  let resumoResposta = resposta;
  const etapas = params.plano.etapas.map((etapa) => {
    if (etapa.ref !== params.pergunta.etapa_ref) return etapa;

    if (params.pergunta.campo === "setor_id") {
      const setor = params.setores.find((item) => item.id === resposta);

      if (!setor) {
        throw new Error("Selecione um setor valido da empresa.");
      }

      resumoResposta = setor.nome;
      return {
        ...etapa,
        setor_id: setor.id,
        setor_nome: setor.nome,
      };
    }

    if (params.pergunta.campo === "midia_id") {
      if (!resposta) {
        resumoResposta = "Continuar sem mídia";
        return {
          ...etapa,
          midia_id: null,
          midia_nome: null,
          midia_tipo: tipoMidiaPorEtapa(etapa.tipo),
          midia_url: null,
        };
      }

      const midia = params.midias.find((item) => item.id === resposta);
      const tipoEsperado = tipoMidiaPorEtapa(etapa.tipo);

      if (!midia || !tipoEsperado || midia.tipo !== tipoEsperado) {
        throw new Error("Selecione uma midia valida para este bloco.");
      }

      resumoResposta = midia.nome;
      return {
        ...etapa,
        midia_id: midia.id,
        midia_nome: midia.nome,
        midia_tipo: midia.tipo,
        midia_url: midia.url,
      };
    }

    if (!urlHttpValida(resposta)) {
      throw new Error("Informe uma URL valida iniciando com http:// ou https://.");
    }

    return {
      ...etapa,
      url: resposta,
    };
  });

  return {
    plano: {
      ...params.plano,
      etapas,
    },
    resumoResposta,
  };
}

export function proximaPerguntaAssistente(params: {
  perguntas: PerguntaAssistenteFluxo[];
  respondidas: string[];
}) {
  const respondidas = new Set(params.respondidas);
  return params.perguntas.find((pergunta) => !respondidas.has(pergunta.id)) || null;
}

const ERROS_AGUARDANDO_CONFIRMACAO = new Set([
  "SETOR_AUSENTE",
  "SETOR_INVALIDO",
  "MIDIA_AUSENTE",
  "MIDIA_INVALIDA",
  "REDIRECT_URL_INVALIDA",
]);

const ERROS_PERMITIDOS_NO_RASCUNHO = new Set([
  "MIDIA_AUSENTE",
  "MIDIA_INVALIDA",
]);

export function errosQueExigemReparo(
  erros: ValidacaoItemAssistente[]
) {
  return erros.filter(
    (erro) => !ERROS_AGUARDANDO_CONFIRMACAO.has(erro.codigo)
  );
}

export function errosQueBloqueiamCriacao(
  erros: ValidacaoItemAssistente[]
) {
  return erros.filter(
    (erro) => !ERROS_PERMITIDOS_NO_RASCUNHO.has(erro.codigo)
  );
}
