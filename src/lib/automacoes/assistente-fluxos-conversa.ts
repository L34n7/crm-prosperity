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
  clarificacao: PlanoAssistenteClarificacao;
  etapa: PlanoAssistenteEtapa;
  setores: AssistenteSetor[];
}): PerguntaAssistenteFluxo {
  const opcoes = params.setores.map((setor) => ({
    id: setor.id,
    label: setor.nome,
    descricao: null,
  }));
  const sugestao = params.setores.some(
    (setor) => setor.id === params.etapa.setor_id
  )
    ? params.etapa.setor_id
    : null;
  const titulo = texto(params.etapa.titulo, 120);

  return {
    id: `setor:${params.etapa.ref}`,
    etapa_ref: params.etapa.ref,
    campo: "setor_id",
    tipo: "selecao",
    mensagem: titulo
      ? `Para qual setor o contato deve ser encaminhado na etapa “${titulo}”?`
      : "Para qual setor o contato deve ser encaminhado quando solicitar atendimento humano?",
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

export function criarPerguntasAssistenteFluxo(params: Parameters<
  typeof criarPerguntasOriginais
>[0]) {
  if (params.plano.clarificacoes.length === 0) {
    return criarPerguntasOriginais(params);
  }

  return params.plano.clarificacoes.map((clarificacao) => {
    if (ehClarificacaoTecnicaDeSetor(clarificacao)) {
      const etapa = encontrarEtapaTransferencia(params.plano, clarificacao);

      if (etapa) {
        return perguntaTecnicaDeSetor({
          clarificacao,
          etapa,
          setores: params.setores,
        });
      }
    }

    return perguntaClarificacao(clarificacao);
  });
}
