import type {
  ResultadoEncerramentoFluxo,
  TipoValorConversao,
} from "./types";

export const TIPO_NO_PERGUNTA_LIVRE_IA = "pergunta_livre_ia";

export const RESULTADOS_ENCERRAMENTO: ResultadoEncerramentoFluxo[] = [
  "positivo",
  "negativo",
  "neutro",
];

export const TIPOS_VALOR_CONVERSAO: TipoValorConversao[] = [
  "sem_valor",
  "valor_fixo",
  "variavel",
];

export const LIMITE_STORAGE_MIDIAS_EMPRESA_BYTES = 50 * 1024 * 1024;
export const LIMITE_VIDEO_BYTES = 16 * 1024 * 1024;
export const LIMITE_IMAGEM_BYTES = 5 * 1024 * 1024;
export const LIMITE_AUDIO_BYTES = 16 * 1024 * 1024;
export const LIMITE_ARQUIVO_BYTES = 50 * 1024 * 1024;
export const LIMITE_DELAY_SEGUNDOS = 23 * 60 * 60;

export const ACCEPT_ARQUIVOS =
  ".pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf,text/plain,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation";

export const VARIAVEIS_FIXAS_CONTATO_HELP =
  "Variáveis do sistema: {{nome_empresa}}, {{nome_contato}}, {{nome_whatsapp}}, {{email_contato}}, {{numero_contato}}, {{calendario_nome}}, {{agendamento_titulo}}, {{campanha}}, {{origem}}, {{status_lead}}, {{classificacao_lead}}, {{protocolo_atual}}, {{ultimo_protocolo}} e {{pagamento.pix_pendentes_resumo}}.";

export const VARIAVEIS_FIXAS_SISTEMA = [
  {
    chave: "nome_empresa",
    exemplo: "{{nome_empresa}}",
    descricao: "Nome da empresa salvo em Configurações Gerais.",
  },
  {
    chave: "calendario_nome",
    exemplo: "{{calendario_nome}}",
    descricao: "Nome do calendário vinculado ao agendamento atual.",
  },
  {
    chave: "calendario_nome_novo",
    exemplo: "{{calendario_nome_novo}}",
    descricao: "Nome do calendário usado no novo horário selecionado.",
  },
  {
    chave: "agendamento_titulo",
    exemplo: "{{agendamento_titulo}}",
    descricao: "Título salvo no agendamento atual.",
  },
  {
    chave: "nome_contato",
    exemplo: "{{nome_contato}}",
    descricao: "Nome salvo no cadastro do contato.",
  },
  {
    chave: "nome",
    exemplo: "{{nome}}",
    descricao: "Nome do contato.",
  },
  {
    chave: "nome_whatsapp",
    exemplo: "{{nome_whatsapp}}",
    descricao:
      "Nome do perfil do WhatsApp quando existir; se não existir, usa o nome salvo no contato.",
  },
  {
    chave: "email_contato",
    exemplo: "{{email_contato}}",
    descricao: "E-mail salvo no cadastro do contato.",
  },
  {
    chave: "numero_contato",
    exemplo: "{{numero_contato}}",
    descricao: "Número/telefone salvo no cadastro do contato.",
  },
  {
    chave: "campanha",
    exemplo: "{{campanha}}",
    descricao: "Campanha vinculada ao contato.",
  },
  {
    chave: "origem",
    exemplo: "{{origem}}",
    descricao: "Origem do contato.",
  },
  {
    chave: "status_lead",
    exemplo: "{{status_lead}}",
    descricao: "Classificacao atual do lead.",
  },
  {
    chave: "classificacao_lead",
    exemplo: "{{classificacao_lead}}",
    descricao: "Classificacao global do lead.",
  },
  {
    chave: "protocolo_atual",
    exemplo: "{{protocolo_atual}}",
    descricao: "Protocolo ativo da conversa atual do contato.",
  },
  {
    chave: "ultimo_protocolo",
    exemplo: "{{ultimo_protocolo}}",
    descricao: "Último protocolo encerrado/inativo do contato.",
  },
  {
    chave: "pagamento.pix_pendentes_resumo",
    exemplo: "{{pagamento.pix_pendentes_resumo}}",
    descricao:
      "Resume os PIX pendentes das últimas 12 horas do cliente no CRM Prosperity.",
  },
] as const;

export const VARIAVEIS_FIXAS_CONTATO_RESERVADAS = [
  "nome_empresa",
  "empresa_nome",
  "calendario_nome",
  "calendario_nome_novo",
  "agendamento_titulo",
  "nome",
  "nome_contato",
  "contato_nome",
  "nome_whatsapp",
  "whatsapp_nome",
  "nome_perfil_whatsapp",
  "perfil_whatsapp_nome",
  "email",
  "email_contato",
  "contato_email",
  "telefone",
  "numero",
  "numero_contato",
  "contato_numero",
  "telefone_contato",
  "contato_telefone",
  "campanha",
  "origem",
  "status",
  "status_lead",
  "protocolo_atual",
  "ultimo_protocolo",
  "pagamento.pix_pendentes_resumo",
];

export const TIPOS_NO_MIDIA = new Set([
  "enviar_imagem",
  "enviar_video",
  "enviar_audio",
  "enviar_arquivo",
]);

export const CHAVES_REFERENCIA_MIDIA_NODE = [
  "midia_url",
  "midia_nome",
  "midia_id",
  "media_url",
  "media_nome",
  "media_id",
  "arquivo_url",
  "arquivo_nome",
  "arquivo_id",
  "storage_path",
  "storagePath",
] as const;

export const TOKENS_SAIDA_MAX_DESCRICAO_IA = 180;
export const TOKENS_PROMPT_FIXO_DESCRICAO_IA_ESTIMADOS = 190;

export const AVISO_FLUXO_CONEXAO_ERRO_ARQUIVO_IA =
  "Este fluxo possui um ou mais blocos Interp. arquivo IA sem a saída erro. Revise os blocos sinalizados no canvas.";

export const AVISO_BLOCO_CONEXAO_ERRO_ARQUIVO_IA =
  "Este bloco precisa de uma CONEXÃO com palavra 'ERRO' em RESPOSTA ESPERADA para tratar falhas de IA e tokens esgotados.";

export const AVISO_BLOCO_TEMPLATE_WABA_AGENDAR_DISPARO =
  "Este fluxo atende WABAs diferentes. Selecione um template aprovado para cada número neste bloco.";

export const NODE_CARD_WIDTH = 160;
export const NODE_CARD_HEIGHT = 95;
export const NODE_GAP_X = 70;
export const NODE_GAP_Y = 40;

export const LIMITE_MENSAGENS_PREVIA_WHATSAPP = 48;

export const EXEMPLOS_VARIAVEIS_PREVIA_WHATSAPP: Record<string, string> = {
  nome: "Ana",
  nome_contato: "Ana",
  nome_whatsapp: "Ana",
  email_contato: "ana@email.com",
  numero_contato: "(11) 99999-0000",
  campanha: "Campanha principal",
  origem: "Instagram",
  status_lead: "Novo lead",
  protocolo_atual: "PROTO-1024",
  ultimo_protocolo: "PROTO-1008",
  "pagamento.pix_pendentes_resumo":
    "*Plano Básico* — gerado em 26/08 às 14:12\nPIX Copia e Cola:\n000201...",
  agenda_data: "12/07",
  agenda_hora: "14:30",
  agenda_nome: "Agenda principal",
  agenda_data_nova: "12/07",
  agenda_preferencia_solicitada: "14h",
  agenda_data_sugestao_ano: "12/07/2026",
};
