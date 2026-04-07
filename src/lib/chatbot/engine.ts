import { normalizeText } from "@/lib/chatbot/normalize";
import type {
  ChatbotDecision,
  ProcessIncomingMessageInput,
  WhatsAppAutomacaoOpcao,
  WhatsAppAutomacaoPalavraChave,
} from "@/lib/chatbot/types";

function buildNoReplyDecision(): ChatbotDecision {
  return {
    shouldReply: false,
    action: "none",
    messages: [],
    updates: {},
    matchedOption: null,
    matchedKeyword: null,
  };
}

function isFirstInteraction(input: ProcessIncomingMessageInput): boolean {
  if (typeof input.isPrimeiraMensagem === "boolean") {
    return input.isPrimeiraMensagem;
  }

  return (
    !input.conversa.automacao_id ||
    !input.conversa.fluxo_etapa ||
    input.conversa.fluxo_etapa === null
  );
}

function findOptionByMessage(
  mensagemNormalizada: string,
  opcoes: WhatsAppAutomacaoOpcao[]
): WhatsAppAutomacaoOpcao | null {
  return (
    opcoes.find((opcao) => normalizeText(opcao.opcao) === mensagemNormalizada) ??
    null
  );
}

function findKeywordByMessage(
  mensagemNormalizada: string,
  palavrasChave: WhatsAppAutomacaoPalavraChave[]
): WhatsAppAutomacaoPalavraChave | null {
  return (
    palavrasChave.find(
      (item) => normalizeText(item.palavra_chave) === mensagemNormalizada
    ) ?? null
  );
}

function buildInitialMenuDecision(
  mensagemBoasVindas: string | null,
  mensagemMenu: string | null,
  automacaoId: string
): ChatbotDecision {
  const messages = [mensagemBoasVindas, mensagemMenu].filter(
    (item): item is string => !!item && item.trim().length > 0
  );

  return {
    shouldReply: messages.length > 0,
    action: "menu_inicial",
    messages,
    updates: {
      bot_ativo: true,
      fluxo_etapa: "aguardando_opcao",
      menu_aguardando_resposta: true,
      tentativas_invalidas: 0,
      ultima_interacao_bot_em: new Date().toISOString(),
      automacao_id: automacaoId,
      ultima_opcao_escolhida: null,
      status: "bot",
    },
    matchedOption: null,
    matchedKeyword: null,
  };
}

function buildInvalidOptionDecision(params: {
  mensagemOpcaoInvalida: string | null;
  mensagemMenu: string | null;
  tentativasInvalidasAtual: number;
}): ChatbotDecision {
  const messages = [params.mensagemOpcaoInvalida, params.mensagemMenu].filter(
    (item): item is string => !!item && item.trim().length > 0
  );

  return {
    shouldReply: messages.length > 0,
    action: "opcao_invalida",
    messages,
    updates: {
      bot_ativo: true,
      fluxo_etapa: "aguardando_opcao",
      menu_aguardando_resposta: true,
      tentativas_invalidas: params.tentativasInvalidasAtual + 1,
      ultima_interacao_bot_em: new Date().toISOString(),
      status: "bot",
    },
    matchedOption: null,
    matchedKeyword: null,
  };
}

function buildLimitTentativasDecision(
  mensagemTransferencia: string | null
): ChatbotDecision {
  const messages = [mensagemTransferencia].filter(
    (item): item is string => !!item && item.trim().length > 0
  );

  return {
    shouldReply: messages.length > 0,
    action: "limite_tentativas",
    messages,
    updates: {
      bot_ativo: false,
      fluxo_etapa: "transferido_humano",
      menu_aguardando_resposta: false,
      tentativas_invalidas: 0,
      ultima_interacao_bot_em: new Date().toISOString(),
    },
    matchedOption: null,
    matchedKeyword: null,
  };
}

function buildDecisionFromAction(params: {
  origem: "opcao" | "palavra_chave";
  tipo: string;
  mensagemResposta: string | null;
  mensagemMenu: string | null;
  mensagemEncerramento: string | null;
  valorEscolhido: string;
  setorId: string | null;
  registro: WhatsAppAutomacaoOpcao | WhatsAppAutomacaoPalavraChave;
}): ChatbotDecision {
  const nowIso = new Date().toISOString();

  if (params.tipo === "enviar_mensagem") {
    const messages = [params.mensagemResposta, params.mensagemMenu].filter(
      (item): item is string => !!item && item.trim().length > 0
    );

    return {
      shouldReply: messages.length > 0,
      action: params.origem === "opcao" ? "opcao_valida" : "palavra_chave",
      messages,
      updates: {
        bot_ativo: true,
        fluxo_etapa: "aguardando_opcao",
        menu_aguardando_resposta: true,
        ultima_opcao_escolhida: params.valorEscolhido,
        tentativas_invalidas: 0,
        ultima_interacao_bot_em: nowIso,
        status: "bot",
      },
      matchedOption:
        params.origem === "opcao"
          ? (params.registro as WhatsAppAutomacaoOpcao)
          : null,
      matchedKeyword:
        params.origem === "palavra_chave"
          ? (params.registro as WhatsAppAutomacaoPalavraChave)
          : null,
    };
  }

  if (params.tipo === "transferir_setor") {
    const messages = [params.mensagemResposta].filter(
      (item): item is string => !!item && item.trim().length > 0
    );

    return {
      shouldReply: messages.length > 0,
      action: "transferir_setor",
      messages,
      updates: {
        bot_ativo: false,
        fluxo_etapa: "transferido_setor",
        menu_aguardando_resposta: false,
        ultima_opcao_escolhida: params.valorEscolhido,
        tentativas_invalidas: 0,
        ultima_interacao_bot_em: nowIso,
      },
      matchedOption:
        params.origem === "opcao"
          ? (params.registro as WhatsAppAutomacaoOpcao)
          : null,
      matchedKeyword:
        params.origem === "palavra_chave"
          ? (params.registro as WhatsAppAutomacaoPalavraChave)
          : null,
    };
  }

  if (params.tipo === "transferir_humano") {
    const messages = [params.mensagemResposta].filter(
      (item): item is string => !!item && item.trim().length > 0
    );

    return {
      shouldReply: messages.length > 0,
      action: "transferir_humano",
      messages,
      updates: {
        bot_ativo: false,
        fluxo_etapa: "transferido_humano",
        menu_aguardando_resposta: false,
        ultima_opcao_escolhida: params.valorEscolhido,
        tentativas_invalidas: 0,
        ultima_interacao_bot_em: nowIso,
      },
      matchedOption:
        params.origem === "opcao"
          ? (params.registro as WhatsAppAutomacaoOpcao)
          : null,
      matchedKeyword:
        params.origem === "palavra_chave"
          ? (params.registro as WhatsAppAutomacaoPalavraChave)
          : null,
    };
  }

  if (params.tipo === "reiniciar_menu") {
    const messages = [params.mensagemMenu].filter(
      (item): item is string => !!item && item.trim().length > 0
    );

    return {
      shouldReply: messages.length > 0,
      action: "reiniciar_menu",
      messages,
      updates: {
        bot_ativo: true,
        fluxo_etapa: "aguardando_opcao",
        menu_aguardando_resposta: true,
        ultima_opcao_escolhida: params.valorEscolhido,
        tentativas_invalidas: 0,
        ultima_interacao_bot_em: nowIso,
        status: "bot",
      },
      matchedOption:
        params.origem === "opcao"
          ? (params.registro as WhatsAppAutomacaoOpcao)
          : null,
      matchedKeyword:
        params.origem === "palavra_chave"
          ? (params.registro as WhatsAppAutomacaoPalavraChave)
          : null,
    };
  }

  if (params.tipo === "finalizar_conversa") {
    const messages = [params.mensagemResposta || params.mensagemEncerramento].filter(
      (item): item is string => !!item && item.trim().length > 0
    );

    return {
      shouldReply: messages.length > 0,
      action: "finalizar_conversa",
      messages,
      updates: {
        bot_ativo: false,
        fluxo_etapa: "finalizado_bot",
        menu_aguardando_resposta: false,
        ultima_opcao_escolhida: params.valorEscolhido,
        tentativas_invalidas: 0,
        ultima_interacao_bot_em: nowIso,
        status: "encerrada",
      },
      matchedOption:
        params.origem === "opcao"
          ? (params.registro as WhatsAppAutomacaoOpcao)
          : null,
      matchedKeyword:
        params.origem === "palavra_chave"
          ? (params.registro as WhatsAppAutomacaoPalavraChave)
          : null,
    };
  }

  return buildNoReplyDecision();
}

export function processIncomingChatbotMessage(
  input: ProcessIncomingMessageInput
): ChatbotDecision {
  if (input.isMensagemCliente === false) {
    return buildNoReplyDecision();
  }

  if (!input.automacaoCompleta?.automacao || !input.automacaoCompleta.automacao.ativa) {
    return buildNoReplyDecision();
  }

  const { automacao, opcoes, palavrasChave } = input.automacaoCompleta;

  if (input.isHorarioAtendimento === false) {
    const messages = [automacao.mensagem_fora_horario].filter(
      (item): item is string => !!item && item.trim().length > 0
    );

    return {
      shouldReply: messages.length > 0,
      action: "none",
      messages,
      updates: {
        bot_ativo: false,
        fluxo_etapa: "fora_horario",
        menu_aguardando_resposta: false,
        ultima_interacao_bot_em: new Date().toISOString(),
        automacao_id: automacao.id,
      },
      matchedOption: null,
      matchedKeyword: null,
    };
  }

  const mensagemNormalizada = normalizeText(input.mensagem);

  if (!mensagemNormalizada) {
    return buildNoReplyDecision();
  }

  const primeiraInteracao = isFirstInteraction(input);

  if (primeiraInteracao && automacao.iniciar_primeira_mensagem) {
    return buildInitialMenuDecision(
      automacao.mensagem_boas_vindas,
      automacao.usar_menu_principal ? automacao.mensagem_menu : null,
      automacao.id
    );
  }

  const aguardandoOpcao =
    input.conversa.bot_ativo && input.conversa.menu_aguardando_resposta;

  if (!aguardandoOpcao) {
    return buildNoReplyDecision();
  }

  const matchedOption = findOptionByMessage(mensagemNormalizada, opcoes);

  if (matchedOption) {
    return buildDecisionFromAction({
      origem: "opcao",
      tipo: matchedOption.acao_tipo,
      mensagemResposta:
        matchedOption.mensagem_resposta || automacao.mensagem_transferencia,
      mensagemMenu: automacao.mensagem_menu,
      mensagemEncerramento: automacao.mensagem_encerramento,
      valorEscolhido: matchedOption.opcao,
      setorId: matchedOption.setor_id,
      registro: matchedOption,
    });
  }

  if (automacao.usar_palavras_chave) {
    const matchedKeyword = findKeywordByMessage(mensagemNormalizada, palavrasChave);

    if (matchedKeyword) {
      return buildDecisionFromAction({
        origem: "palavra_chave",
        tipo: matchedKeyword.acao_tipo,
        mensagemResposta:
          matchedKeyword.mensagem_resposta || automacao.mensagem_transferencia,
        mensagemMenu: automacao.mensagem_menu,
        mensagemEncerramento: automacao.mensagem_encerramento,
        valorEscolhido: matchedKeyword.palavra_chave,
        setorId: matchedKeyword.setor_id,
        registro: matchedKeyword,
      });
    }
  }

  const proximaTentativa = (input.conversa.tentativas_invalidas ?? 0) + 1;

  if (proximaTentativa >= automacao.max_tentativas_invalidas) {
    return buildLimitTentativasDecision(
      automacao.mensagem_transferencia || automacao.mensagem_sem_atendente
    );
  }

  return buildInvalidOptionDecision({
    mensagemOpcaoInvalida:
      automacao.mensagem_opcao_invalida ||
      "Opção inválida. Por favor, escolha uma opção válida.",
    mensagemMenu: automacao.mensagem_menu,
    tentativasInvalidasAtual: input.conversa.tentativas_invalidas ?? 0,
  });
}