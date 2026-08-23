export type Fluxo = {
  id: string;
  nome: string;
  descricao: string | null;
  status: "rascunho" | "ativo" | "pausado" | "arquivado";
  canal: string;
  fluxo_padrao?: boolean;
  created_at?: string;
  configuracao_json?: Record<string, any>;
  alertas_configuracao?: {
    interpretar_arquivo_ia_sem_conexao_erro?: number;
  };
};

export type AutomacaoNo = {
  id: string;
  tipo_no: string;
  titulo: string;
  descricao: string | null;
  posicao_x: number;
  posicao_y: number;
  configuracao_json: Record<string, any>;
  delay_segundos: number | null;
};

export type AutomacaoConexao = {
  id: string;
  no_origem_id: string;
  no_destino_id: string;
  rotulo: string | null;
  ordem: number;
  condicao_json: Record<string, any>;
  usar_ia?: boolean;
  descricao_ia?: string | null;
};

export type PreviaGeracaoDescricaoIa = {
  modo: "conexao" | "bloco";
  titulo: string;
  conexoes: Array<{
    edgeId: string;
    nome: string;
    tokensEstimados: number;
  }>;
  tokensMin: number;
  tokensMax: number;
};

export type GatilhoFluxo = {
  id: string;
  tipo_gatilho: string;
  valor: string;
  condicao: "contem" | "exata" | "inicia_com" | "regex";
  ativo: boolean;
};

export type SetorOpcao = {
  id: string;
  nome: string;
};

export type EstrategiaTransferenciaNode =
  | "fila_setor"
  | "atendente_especifico"
  | "rodizio_aleatorio"
  | "menos_conversas";

export type EscopoFilaNode = "setor" | "geral";

export type AtendenteOpcao = {
  id: string;
  nome: string;
  email?: string | null;
  setor_ids: string[];
  is_administrador?: boolean;
};

export type MidiaOpcao = {
  id: string;
  nome: string;
  tipo: "imagem" | "video" | "audio" | "arquivo";
  url: string;
  mime_type: string | null;
  tamanho_bytes: number | null;
  created_at?: string;
};

export type ImpactoExclusaoMidia = {
  total_blocos_afetados?: number;
  total_fluxos_afetados?: number;
  total_fluxos_pausados?: number;
  fluxos_afetados?: Array<{
    id: string;
    nome?: string | null;
    status_anterior?: string | null;
    status_atual?: string | null;
    pausado?: boolean;
  }>;
};

export type TemplateWhatsappOpcao = {
  id: string;
  nome: string;
  idioma: string;
  status: string;
  categoria?: string | null;
  integracao_whatsapp_id: string;
  waba_id?: string | null;
  payload?: any;
};

export type IntegracaoWhatsappOpcao = {
  id: string;
  nome_conexao?: string | null;
  numero?: string | null;
  status?: string | null;
  posicao?: number | null;
  waba_id?: string | null;
};

export type EscopoIntegracoesModo = "todas" | "selecionadas";

export type EscopoIntegracoesFluxo = {
  modo: EscopoIntegracoesModo;
  ids: string[];
};

export type PreviewTemplateWhatsapp = {
  titulo: string;
  corpo: string;
  rodape: string;
  botoes: string[];
};

export type VariavelPersonalizada = {
  id: string;
  chave: string;
  valor: string;
  descricao: string | null;
  escopo: "global" | "disparos" | "fluxos";
  ativo: boolean;
};

export type AlvoVariavelFluxo =
  | "mensagem"
  | "agendar_disparo"
  | "agenda_lembrete";

export type AgendaOpcao = {
  id: string;
  nome: string;
  timezone: string;
  duracao_minutos: number;
  intervalo_minutos: number;
  janela_dias: number;
  status: string;
};

export type ResultadoEncerramentoFluxo = "positivo" | "negativo" | "neutro";
export type TipoValorConversao = "sem_valor" | "valor_fixo" | "variavel";
