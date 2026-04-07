export type AcaoTipo =
  | "enviar_mensagem"
  | "transferir_setor"
  | "transferir_humano"
  | "reiniciar_menu"
  | "finalizar_conversa";

export type FluxoEtapa =
  | null
  | "boas_vindas_enviada"
  | "menu_enviado"
  | "aguardando_opcao"
  | "opcao_processada"
  | "transferido_setor"
  | "transferido_humano"
  | "finalizado_bot"
  | "fora_horario";

export type WhatsAppAutomacao = {
  id: string;
  empresa_id: string;
  integracao_whatsapp_id: string | null;
  nome: string;
  ativa: boolean;

  iniciar_primeira_mensagem: boolean;
  usar_menu_principal: boolean;
  usar_palavras_chave: boolean;
  transferir_para_humano_apos_menu: boolean;

  mensagem_boas_vindas: string | null;
  mensagem_menu: string | null;
  mensagem_opcao_invalida: string | null;
  mensagem_fora_horario: string | null;
  mensagem_transferencia: string | null;
  mensagem_encerramento: string | null;
  mensagem_sem_atendente: string | null;

  max_tentativas_invalidas: number;
  tempo_inatividade_minutos: number;

  setor_padrao_id: string | null;

  criado_em: string;
  atualizado_em: string;
};

export type WhatsAppAutomacaoOpcao = {
  id: string;
  automacao_id: string;
  ordem: number;
  opcao: string;
  titulo: string;
  descricao: string | null;
  acao_tipo: AcaoTipo;
  setor_id: string | null;
  mensagem_resposta: string | null;
  ativa: boolean;
  criado_em: string;
  atualizado_em: string;
};

export type WhatsAppAutomacaoPalavraChave = {
  id: string;
  automacao_id: string;
  palavra_chave: string;
  acao_tipo: AcaoTipo;
  setor_id: string | null;
  mensagem_resposta: string | null;
  ativa: boolean;
  criado_em: string;
  atualizado_em: string;
};

export type ConversaAutomacaoEstado = {
  id: string;
  empresa_id: string;

  bot_ativo: boolean;
  fluxo_etapa: FluxoEtapa;
  menu_aguardando_resposta: boolean;
  ultima_opcao_escolhida: string | null;
  tentativas_invalidas: number;
  ultima_interacao_bot_em: string | null;
  automacao_id: string | null;

  status?: "aberta" | "bot" | "fila" | "em_atendimento" | "aguardando_cliente" | "encerrada" | null;
  setor_id?: string | null;
  responsavel_id?: string | null;
};

export type AutomacaoCompleta = {
  automacao: WhatsAppAutomacao;
  opcoes: WhatsAppAutomacaoOpcao[];
  palavrasChave: WhatsAppAutomacaoPalavraChave[];
};

export type ChatbotDecisionAction =
  | "none"
  | "menu_inicial"
  | "opcao_valida"
  | "palavra_chave"
  | "opcao_invalida"
  | "transferir_setor"
  | "transferir_humano"
  | "finalizar_conversa"
  | "reiniciar_menu"
  | "limite_tentativas";

export type ChatbotDecision = {
  shouldReply: boolean;
  action: ChatbotDecisionAction;
  messages: string[];
  updates: Partial<ConversaAutomacaoEstado> & {
    setor_id?: string | null;
    status?: "aberta" | "bot" | "fila" | "em_atendimento" | "aguardando_cliente" | "encerrada" | null;
    responsavel_id?: string | null;
  };
  matchedOption?: WhatsAppAutomacaoOpcao | null;
  matchedKeyword?: WhatsAppAutomacaoPalavraChave | null;
};

export type ProcessIncomingMessageInput = {
  mensagem: string;
  conversa: ConversaAutomacaoEstado;
  automacaoCompleta: AutomacaoCompleta | null;
  isMensagemCliente?: boolean;
  isPrimeiraMensagem?: boolean;
  isHorarioAtendimento?: boolean;
};