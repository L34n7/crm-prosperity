import { processIncomingChatbotMessage } from "@/lib/chatbot/engine";
import type { AutomacaoCompleta, ConversaAutomacaoEstado } from "@/lib/chatbot/types";

const automacaoCompletaMock: AutomacaoCompleta = {
  automacao: {
    id: "automacao-1",
    empresa_id: "empresa-1",
    integracao_whatsapp_id: null,
    nome: "Atendimento Principal",
    ativa: true,
    iniciar_primeira_mensagem: true,
    usar_menu_principal: true,
    usar_palavras_chave: true,
    transferir_para_humano_apos_menu: true,
    mensagem_boas_vindas: "Olá, seja bem-vindo à empresa.",
    mensagem_menu:
      "Digite uma opção:\n1 - Comercial\n2 - Suporte\n3 - Financeiro\n4 - Atendente",
    mensagem_opcao_invalida: "Opção inválida. Escolha uma opção do menu.",
    mensagem_fora_horario:
      "Estamos fora do horário de atendimento no momento.",
    mensagem_transferencia: "Vou direcionar seu atendimento.",
    mensagem_encerramento: "Atendimento encerrado.",
    mensagem_sem_atendente: "No momento não há atendentes disponíveis.",
    max_tentativas_invalidas: 3,
    tempo_inatividade_minutos: 60,
    setor_padrao_id: null,
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  },
  opcoes: [
    {
      id: "opcao-1",
      automacao_id: "automacao-1",
      ordem: 1,
      opcao: "1",
      titulo: "Comercial",
      descricao: null,
      acao_tipo: "transferir_setor",
      setor_id: "setor-comercial",
      mensagem_resposta: "Você será direcionado para o comercial.",
      ativa: true,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    },
    {
      id: "opcao-2",
      automacao_id: "automacao-1",
      ordem: 2,
      opcao: "4",
      titulo: "Atendente",
      descricao: null,
      acao_tipo: "transferir_humano",
      setor_id: null,
      mensagem_resposta: "Certo. Vou chamar um atendente.",
      ativa: true,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    },
  ],
  palavrasChave: [
    {
      id: "palavra-1",
      automacao_id: "automacao-1",
      palavra_chave: "financeiro",
      acao_tipo: "transferir_setor",
      setor_id: "setor-financeiro",
      mensagem_resposta: "Vou direcionar para o financeiro.",
      ativa: true,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    },
  ],
};

const conversaInicial: ConversaAutomacaoEstado = {
  id: "conversa-1",
  empresa_id: "empresa-1",
  bot_ativo: false,
  fluxo_etapa: null,
  menu_aguardando_resposta: false,
  ultima_opcao_escolhida: null,
  tentativas_invalidas: 0,
  ultima_interacao_bot_em: null,
  automacao_id: null,
  status: null,
  setor_id: null,
  atendente_id: null,
};

export function runEngineManualTest() {
  const result1 = processIncomingChatbotMessage({
    mensagem: "Oi",
    conversa: conversaInicial,
    automacaoCompleta: automacaoCompletaMock,
    isMensagemCliente: true,
    isPrimeiraMensagem: true,
    isHorarioAtendimento: true,
  });

  console.log("TESTE 1 - PRIMEIRA MENSAGEM");
  console.log(JSON.stringify(result1, null, 2));

  const conversaAguardando: ConversaAutomacaoEstado = {
    ...conversaInicial,
    bot_ativo: true,
    fluxo_etapa: "aguardando_opcao",
    menu_aguardando_resposta: true,
    automacao_id: "automacao-1",
  };

  const result2 = processIncomingChatbotMessage({
    mensagem: "1",
    conversa: conversaAguardando,
    automacaoCompleta: automacaoCompletaMock,
    isMensagemCliente: true,
    isHorarioAtendimento: true,
  });

  console.log("TESTE 2 - OPÇÃO 1");
  console.log(JSON.stringify(result2, null, 2));

  const result3 = processIncomingChatbotMessage({
    mensagem: "financeiro",
    conversa: conversaAguardando,
    automacaoCompleta: automacaoCompletaMock,
    isMensagemCliente: true,
    isHorarioAtendimento: true,
  });

  console.log("TESTE 3 - PALAVRA-CHAVE");
  console.log(JSON.stringify(result3, null, 2));

  const result4 = processIncomingChatbotMessage({
    mensagem: "banana",
    conversa: conversaAguardando,
    automacaoCompleta: automacaoCompletaMock,
    isMensagemCliente: true,
    isHorarioAtendimento: true,
  });

  console.log("TESTE 4 - OPÇÃO INVÁLIDA");
  console.log(JSON.stringify(result4, null, 2));
}