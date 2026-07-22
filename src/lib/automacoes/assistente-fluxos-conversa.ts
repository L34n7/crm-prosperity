import type {
  AssistenteSetor,
  PlanoAssistenteClarificacao,
  PlanoAssistenteEtapa,
  PlanoAssistenteFluxos,
} from "@/lib/automacoes/assistente-fluxos";
import {
  aplicarRespostaPerguntaAssistente,
  criarPerguntasAssistenteFluxo as criarPerguntasOriginais,
  errosQueBloqueiamCriacao,
  errosQueExigemReparo,
  proximaPerguntaAssistente,
  urlHttpValida,
  type PerguntaAssistenteFluxo,
} from "@/lib/automacoes/assistente-fluxos-conversa-original";

export {
  aplicarRespostaPerguntaAssistente,
  errosQueBloqueiamCriacao,
  errosQueExigemReparo,
  proximaPerguntaAssistente,
  urlHttpValida,
};

export type {
  CampoPerguntaAssistente,
  OpcaoPerguntaAssistente,
  PerguntaAssistenteFluxo,
} from "@/lib/automacoes/assistente-fluxos-conversa-original";

const TERMOS_CONFIRMACAO_SETOR =
  /\b(setor|atendente|atendimento humano|especialista|equipe|comercial|handoff|encaminhar|encaminhado|transferir|transferencia)\b/i;

function texto(valor: unknown, limite = 1800) {
  return String(valor || "").trim().slice(0, limite);
}

const TIPOS_COM_EXCESSO_TENTATIVAS = new Set([
  "pergunta_opcoes",
  "pergunta_botoes",
  "pergunta_livre_ia",
  "capturar_resposta",
  "avaliacao",
]);

function descricaoCaminho(
  plano: PlanoAssistenteFluxos,
  etapa: PlanoAssistenteEtapa
) {
  const entradas = plano.rotas.filter((rota) => rota.destino === etapa.ref);
  const partes = entradas.slice(0, 2).map((rota) => {
    const origem = plano.etapas.find((item) => item.ref === rota.origem);
    const opcao = origem?.opcoes.find(
      (item) => item.id === rota.valor || item.texto === rota.rotulo
    );
    const origemTitulo = rotuloEtapa(origem, rota.origem);
    const escolha = texto(opcao?.texto || rota.rotulo || rota.valor, 80);
    return escolha ? `${origemTitulo} → ${escolha}` : origemTitulo;
  });

  if (partes.length > 0) return partes.join(" ou ");
  return texto(etapa.titulo, 120) || etapa.ref;
}

function opcoesSetor(setores: AssistenteSetor[]) {
  return setores.map((setor) => ({
    id: setor.id,
    label: setor.nome,
    descricao: null,
  }));
}

function rotuloEtapa(etapa: PlanoAssistenteEtapa | undefined, fallback: string) {
  const titulo = texto(etapa?.titulo, 120);
  if (titulo) return titulo;
  const ref = texto(etapa?.ref || fallback, 120);
  if (normalizar(ref) === "inicio") return "Início";
  return ref.replace(/[_-]+/g, " ").replace(/^./, (letra) => letra.toUpperCase());
}

function perguntaSetorExcessoTentativas(params: {
  plano: PlanoAssistenteFluxos;
  etapa: PlanoAssistenteEtapa;
  setores: AssistenteSetor[];
}): PerguntaAssistenteFluxo {
  const opcoes = opcoesSetor(params.setores);
  const caminhoAnterior = descricaoCaminho(params.plano, params.etapa);
  const tituloEtapa = texto(params.etapa.titulo, 120) || params.etapa.ref;
  const caminho = caminhoAnterior === tituloEtapa
    ? tituloEtapa
    : `${caminhoAnterior} → ${tituloEtapa}`;
  const sugestao = params.setores.some(
    (setor) => setor.id === params.etapa.setor_id
  )
    ? params.etapa.setor_id
    : null;

  return {
    id: `setor_excesso:${params.etapa.ref}`,
    etapa_ref: params.etapa.ref,
    campo: "setor_id",
    tipo: "selecao",
    mensagem: `Se o contato exceder as tentativas no caminho “${caminho}”, para qual setor ele deve ser transferido?`,
    ajuda:
      opcoes.length > 0
        ? `Este encaminhamento ocorre quando não há uma resposta válida no bloco “${tituloEtapa}”. Confirme o setor adequado para esse assunto.`
        : "Cadastre e ative um setor antes de concluir este fluxo.",
    obrigatoria: true,
    bloqueada: opcoes.length === 0,
    valor_sugerido: sugestao,
    opcoes,
  };
}

function adicionarConfirmacoesExcesso(params: {
  plano: PlanoAssistenteFluxos;
  setores: AssistenteSetor[];
  perguntas: PerguntaAssistenteFluxo[];
}) {
  const existentes = new Set(params.perguntas.map((pergunta) => pergunta.id));
  const perguntas = [...params.perguntas];

  for (const etapa of params.plano.etapas) {
    if (!TIPOS_COM_EXCESSO_TENTATIVAS.has(etapa.tipo)) continue;
    const pergunta = perguntaSetorExcessoTentativas({
      plano: params.plano,
      etapa,
      setores: params.setores,
    });
    if (!existentes.has(pergunta.id)) perguntas.push(pergunta);
  }

  return perguntas;
}

function normalizar(valor: unknown) {
  return texto(valor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ehClarificacaoTecnicaDeSetor(
  clarificacao: PlanoAssistenteClarificacao
) {
  return TERMOS_CONFIRMACAO_SETOR.test(
    `${clarificacao.pergunta || ""} ${clarificacao.motivo || ""}`
  );
}

function palavrasRelevantes(valor: unknown) {
  const ignoradas = new Set([
    "para",
    "qual",
    "setor",
    "contato",
    "deve",
    "deseja",
    "botao",
    "leve",
    "atendimento",
    "humano",
    "especifico",
    "crm",
    "equipe",
    "falar",
    "com",
  ]);

  return normalizar(valor)
    .split(" ")
    .filter((palavra) => palavra.length >= 4 && !ignoradas.has(palavra));
}

function pontuarEtapaTransferencia(
  etapa: PlanoAssistenteEtapa,
  clarificacao: PlanoAssistenteClarificacao
) {
  const alvo = normalizar(
    `${etapa.titulo || ""} ${etapa.mensagem || ""} ${etapa.setor_nome || ""}`
  );

  return palavrasRelevantes(
    `${clarificacao.pergunta || ""} ${clarificacao.motivo || ""}`
  ).reduce((pontos, palavra) => pontos + (alvo.includes(palavra) ? 1 : 0), 0);
}

function encontrarEtapaTransferencia(
  plano: PlanoAssistenteFluxos,
  clarificacao: PlanoAssistenteClarificacao
) {
  const transferencias = plano.etapas.filter(
    (etapa) => etapa.tipo === "transferir"
  );

  if (transferencias.length <= 1) return transferencias[0] || null;

  return [...transferencias].sort(
    (a, b) =>
      pontuarEtapaTransferencia(b, clarificacao) -
      pontuarEtapaTransferencia(a, clarificacao)
  )[0];
}

function perguntaTecnicaDeSetor(params: {
  plano: PlanoAssistenteFluxos;
  clarificacao: PlanoAssistenteClarificacao;
  etapa: PlanoAssistenteEtapa;
  setores: AssistenteSetor[];
}): PerguntaAssistenteFluxo {
  const opcoes = opcoesSetor(params.setores);
  const sugestao = params.setores.some(
    (setor) => setor.id === params.etapa.setor_id
  )
    ? params.etapa.setor_id
    : null;
  const titulo = texto(params.etapa.titulo, 120);
  const caminho = descricaoCaminho(params.plano, params.etapa);

  return {
    id: `setor:${params.etapa.ref}`,
    etapa_ref: params.etapa.ref,
    campo: "setor_id",
    tipo: "selecao",
    mensagem: `No caminho “${caminho}”, para qual setor o contato deve ser encaminhado${titulo ? ` pelo bloco “${titulo}”` : ""}?`,
    ajuda:
      opcoes.length > 0
        ? "Escolha um setor ativo da sua empresa. Esta confirmação não altera os demais caminhos do fluxo."
        : "Cadastre e ative um setor antes de concluir este fluxo.",
    obrigatoria: true,
    bloqueada: opcoes.length === 0,
    valor_sugerido: sugestao,
    opcoes,
  };
}

function perguntaClarificacao(
  clarificacao: PlanoAssistenteClarificacao
): PerguntaAssistenteFluxo {
  return {
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
  };
}

function removerSugestaoDeUrl(
  perguntas: PerguntaAssistenteFluxo[]
): PerguntaAssistenteFluxo[] {
  return perguntas.map((pergunta) =>
    pergunta.campo === "url"
      ? {
          ...pergunta,
          valor_sugerido: null,
        }
      : pergunta
  );
}

export function criarPerguntasAssistenteFluxo(params: Parameters<
  typeof criarPerguntasOriginais
>[0]) {
  if (params.plano.clarificacoes.length === 0) {
    const originais = criarPerguntasOriginais(params).map((pergunta) => {
      if (pergunta.campo !== "setor_id") return pergunta;
      const etapa = params.plano.etapas.find(
        (item) => item.ref === pergunta.etapa_ref
      );
      if (!etapa || etapa.tipo !== "transferir") return pergunta;
      return perguntaTecnicaDeSetor({
        plano: params.plano,
        clarificacao: {
          id: pergunta.id,
          pergunta: pergunta.mensagem,
          motivo: pergunta.ajuda,
          tipo: "selecao",
          opcoes: [],
          valor_sugerido: pergunta.valor_sugerido,
        },
        etapa,
        setores: params.setores,
      });
    });
    return removerSugestaoDeUrl(
      adicionarConfirmacoesExcesso({
        plano: params.plano,
        setores: params.setores,
        perguntas: originais,
      })
    );
  }

  return removerSugestaoDeUrl(
    params.plano.clarificacoes.map((clarificacao) => {
      if (ehClarificacaoTecnicaDeSetor(clarificacao)) {
        const etapa = encontrarEtapaTransferencia(params.plano, clarificacao);

        if (etapa) {
          return perguntaTecnicaDeSetor({
            plano: params.plano,
            clarificacao,
            etapa,
            setores: params.setores,
          });
        }
      }

      return perguntaClarificacao(clarificacao);
    })
  );
}
