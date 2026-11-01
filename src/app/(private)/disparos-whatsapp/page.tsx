"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronDown,
  CircleStop,
  FileSpreadsheet,
  FileText,
  Info,
  Link2,
  Minus,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import FeedbackToast from "@/components/FeedbackToast";
import Header from "@/components/Header";
import { solicitarAtualizacaoDisparosPendentesHeader } from "@/lib/header-summary/events";
import styles from "./disparos-whatsapp.module.css";
import { createClient } from "@/lib/supabase/client";
import { podeRealizarDisparos as usuarioPodeRealizarDisparos } from "@/lib/whatsapp/disparo-permissoes";
import {
  descreverErroMetaWhatsApp,
  formatarErroMetaWhatsApp,
  gravidadeErroMetaWhatsApp,
  identificarCodigoErroMetaWhatsApp,
  type GravidadeErroMetaWhatsApp,
} from "@/lib/whatsapp/meta-error-messages";

type IntegracaoWhatsApp = {
  id: string;
  nome_conexao: string;
  numero: string | null;
  status: string | null;
  waba_id: string | null;
  phone_number_status?: string | null;
  quality_rating?: string | null;
  meta_account_mode?: string | null;
  meta_saude_ultima_verificacao_em?: string | null;
};

type LimiteMeta = {
  limite: number;
  usados: number;
  restantes: number;
  percentual: number;
  tier: string | null;
  origem: string;
  alerta: "normal" | "amarelo" | "vermelho";
  proxima_liberacao_em?: string | null;
  quantidade_proxima_liberacao?: number;
  liberacoes_previstas?: Array<{
    horario: string;
    quantidadeLiberada: number;
    disponivelAcumulado: number;
  }>;
};

type TemplateButton = {
  type?: string;
  text?: string;
  url?: string;
  phone_number?: string;
};

type TemplateComponent = {
  type: string;
  text?: string;
  format?: string;
  buttons?: TemplateButton[];
  example?: {
    header_handle?: string[];
  };
};

type WhatsAppTemplate = {
  id: string;
  empresa_id: string;
  integracao_whatsapp_id: string;
  waba_id: string;
  meta_template_id: string | null;
  nome: string;
  categoria: string;
  idioma: string;
  status: string;
  opt_out_habilitado: boolean;
  quality_rating: string | null;
  rejeicao_motivo: string | null;
  payload: {
    name?: string;
    category?: string;
    language?: string;
    components?: TemplateComponent[];
  } | null;
  created_at: string;
  updated_at: string;
};

type PerfilDinamico = {
  id: string;
  nome: string;
  descricao?: string | null;
  ativo?: boolean;
};

type UsuarioSetorVinculo = {
  id?: string;
  usuario_id: string;
  setor_id: string;
  is_principal?: boolean;
  created_at?: string;
};

type UsuarioLogado = {
  id: string;
  empresa_id?: string | null;
  setores_ids?: string[];
  usuarios_setores?: UsuarioSetorVinculo[];
  setor_principal_id?: string | null;
  permissoes?: string[];
  perfis_dinamicos?: PerfilDinamico[];
};

type ResultadoDisparo = {
  id?: string;
  created_at?: string;
  numero: string;
  nome_contato?: string | null;
  ok: boolean;
  status?: number | null;
  status_disparo?: string | null;
  status_label?: string | null;
  template_nome?: string | null;
  template_categoria?: string | null;
  categoria?: string | null;
  mensagem_template?: string | null;
  message_id?: string | null;
  conversa_id?: string | null;
  conversa_protocolo_id?: string | null;
  erro?: string | null;
  erro_codigo_meta?: number | string | null;
  erro_amigavel?: string | null;
  erro_tecnico?: string | null;
  metadata_json?: any;
  origem_historico?: string | null;
  campanha_id?: string | null;
  campanha_nome?: string | null;
  status_campanha?: string | null;
  total_itens?: number | null;
  total_enviados?: number | null;
  total_falhas?: number | null;
  total_cancelados?: number | null;
  pausa_motivo?: string | null;
};

type CampanhaDisparoAndamento = {
  id: string;
  nome?: string | null;
  integracao_whatsapp_id?: string | null;
  integracao_nome?: string | null;
  integracao_numero?: string | null;
  usuario_id?: string | null;
  status: string | null;
  template_nome?: string | null;
  total?: number;
  enviados?: number;
  aguardando_confirmacao?: number;
  falhas?: number;
  cancelados?: number;
  pendentes?: number;
  processando?: number;
  processados?: number;
  motivo?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  started_at?: string | null;
  paused_at?: string | null;
  finished_at?: string | null;
  aguardando_meta?: boolean;
  aguardando_meta_codigo?: number | null;
  aguardando_meta_retomar_em?: string | null;
};

type DisparoAndamentoPayload = {
  ok?: boolean;
  bloquear_disparos?: boolean;
  bloqueio_escopo?: "usuario" | "integracao" | "empresa";
  campanha?: CampanhaDisparoAndamento | null;
  campanhas?: CampanhaDisparoAndamento[];
};

type CampanhaDisparoRealtimeRow = {
  id?: unknown;
  nome?: unknown;
  empresa_id?: unknown;
  integracao_whatsapp_id?: unknown;
  usuario_id?: unknown;
  status?: unknown;
  template_nome?: unknown;
  total_itens?: unknown;
  total_pendentes?: unknown;
  total_processando?: unknown;
  total_enviados?: unknown;
  total_falhas?: unknown;
  total_cancelados?: unknown;
  pausa_motivo?: unknown;
  erro?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  started_at?: unknown;
  paused_at?: unknown;
  finished_at?: unknown;
  metadata_json?: unknown;
};

type ContatoOpcao = {
  id: string;
  empresa_id: string;
  nome: string | null;
  whatsapp_profile_name?: string | null;
  telefone: string | null;
  telefone_revisar?: boolean;
  email: string | null;
  campo_contato?: string | null;
  interesse?: string | null;
  classificacao?: string | null;
  origem: string | null;
  campanha: string | null;
  origem_exibicao?: string | null;
  campanha_exibicao?: string | null;
  status_lead: string | null;
  opt_in_whatsapp?: boolean | null;
  whatsapp_opt_out?: boolean;
  whatsapp_opt_out_geral?: boolean;
  whatsapp_opt_out_marketing?: boolean;
  whatsapp_opt_out_utility?: boolean;
  whatsapp_disparo_cooldown_ativo?: boolean;
  whatsapp_disparo_cooldown_categoria?: string | null;
  whatsapp_disparo_cooldown_expira_em?: string | null;
  whatsapp_disparo_cooldown_ocorrencias?: number | null;
  whatsapp_disparo_cooldown_horas?: number | null;
  ja_recebeu_disparo?: boolean;
  contexto_integracao_whatsapp_id?: string | null;
  contexto_integracao_nome?: string | null;
  contexto_integracao_numero?: string | null;
  ultima_mensagem_contato_em?: string | null;
  ultimo_atendente_id?: string | null;
  ultimo_atendente_nome?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type AtendenteFiltro = {
  id: string;
  nome: string;
};

type ListaContatoFiltro = {
  id: string;
  nome: string;
  arquivo_nome?: string | null;
  created_at?: string | null;
  permitir_contatos_existentes?: boolean | null;
  total_contatos?: number | null;
};

type FiltrosConsultaContatos = {
  busca?: string;
  origem?: string;
  campanha?: string;
  interesse?: string;
  classificacao?: string;
  disparoAnteriorId?: string;
  telefoneRevisar?: string;
  mensagemDataInicio?: string;
  mensagemDataFim?: string;
  ultimoAtendenteId?: string;
  optIn?: string;
  optOut?: string;
  somenteIntegracao?: boolean;
};

function obterOrigemContato(contato: ContatoOpcao) {
  return contato.origem_exibicao || contato.origem || "";
}

function obterCampanhaContato(contato: ContatoOpcao) {
  return contato.campanha_exibicao || contato.campanha || "";
}

function contatoTemOptOutParaCategoria(
  contato: ContatoOpcao,
  categoria: string
) {
  if (contato.whatsapp_opt_out_geral === true) return true;

  const possuiEscoposDetalhados =
    contato.whatsapp_opt_out_marketing !== undefined ||
    contato.whatsapp_opt_out_utility !== undefined ||
    contato.whatsapp_opt_out_geral !== undefined;

  if (!possuiEscoposDetalhados && contato.whatsapp_opt_out === true) {
    return true;
  }

  if (categoria === "marketing") {
    return contato.whatsapp_opt_out_marketing === true;
  }

  if (categoria === "utility") {
    return contato.whatsapp_opt_out_utility === true;
  }

  return false;
}

function contatoTemAlgumOptOut(contato: ContatoOpcao) {
  return (
    contato.whatsapp_opt_out === true ||
    contato.whatsapp_opt_out_geral === true ||
    contato.whatsapp_opt_out_marketing === true ||
    contato.whatsapp_opt_out_utility === true
  );
}

function rotuloOptOutContato(contato: ContatoOpcao) {
  if (contato.whatsapp_opt_out_geral === true) return "Opt-out de disparos";

  const marketing = contato.whatsapp_opt_out_marketing === true;
  const utility = contato.whatsapp_opt_out_utility === true;

  if (marketing && utility) return "Opt-out Marketing e Utility";
  if (marketing) return "Opt-out Marketing";
  if (utility) return "Opt-out Utility";
  return contato.whatsapp_opt_out === true ? "Opt-out de disparos" : null;
}

function contatoTemCooldownMarketing(contato: ContatoOpcao) {
  return (
    contato.whatsapp_disparo_cooldown_ativo === true &&
    String(contato.whatsapp_disparo_cooldown_categoria || "marketing")
      .trim()
      .toLowerCase() === "marketing"
  );
}

// CRM_RATE_LIMIT_CONTACT_12H_V1
function contatoTemCooldownRateLimit(contato: ContatoOpcao) {
  return (
    contato.whatsapp_disparo_cooldown_ativo === true &&
    Number(contato.whatsapp_disparo_cooldown_horas || 0) === 12
  );
}

function contatoEstaEmCooldownAplicavel(
  contato: ContatoOpcao,
  categoriaTemplate: string
) {
  if (contatoTemCooldownRateLimit(contato)) return true;
  return (
    categoriaTemplate !== "utility" &&
    contatoTemCooldownMarketing(contato)
  );
}

function formatarDuracaoCooldownContato(contato: ContatoOpcao) {
  const horas = Math.max(
    1,
    Math.floor(Number(contato.whatsapp_disparo_cooldown_horas || 6))
  );

  if (horas >= 24 && horas % 24 === 0) {
    const dias = horas / 24;
    return `${dias}d`;
  }

  return `${horas}hr`;
}

type CampanhaHistoricoFiltro = {
  id: string;
  nome?: string | null;
  template_nome?: string | null;
  template_categoria?: string | null;
  integracao_whatsapp_id?: string | null;
  total_itens?: number | null;
  total_enviados?: number | null;
  total_falhas?: number | null;
  total_cancelados?: number | null;
  total_pendentes?: number | null;
  total_processando?: number | null;
  pausa_motivo?: string | null;
  erro?: string | null;
  erro_exemplo?: string | null;
  erro_codigo_meta_exemplo?: number | string | null;
  erros_resumo?: Array<{
    erro?: string | null;
    erro_codigo_meta?: number | string | null;
    quantidade?: number | null;
  }>;
  metadata_json?: {
    agendamento_chave?: string | null;
    executar_em?: string | null;
    [chave: string]: unknown;
  } | null;
  created_at?: string | null;
  finished_at?: string | null;
  status?: string | null;
};

type TotaisHistorico = {
  total: number;
  sucesso: number;
  processando: number;
  falha: number;
};

type FiltroRelatorioCampanha =
  | "todos"
  | "enviado"
  | "entregue"
  | "lido"
  | "respondido"
  | "falha"
  | "pendente"
  | "cancelado";

type LinhaRelatorioCampanha = {
  numero?: string | null;
  nome_contato?: string | null;
  status_disparo?: string | null;
  status_final?: string | null;
  status_label?: string | null;
  situacao?: string | null;
  primeira_resposta?: string | null;
  enviado_em?: string | null;
  lido_em?: string | null;
  resposta_em?: string | null;
  status_mensagem?: string | null;
  erro?: string | null;
  erro_codigo_meta?: number | string | null;
};

type RelatorioCampanhaDetalhado = {
  campanha: {
    id: string;
    nome: string;
    template_nome?: string | null;
    template_categoria?: string | null;
    status?: string | null;
    total_itens: number;
    total_enviados: number;
    total_falhas: number;
    total_cancelados: number;
    created_at?: string | null;
    finished_at?: string | null;
  };
  totais: {
    total: number;
    enviado: number;
    entregue: number;
    lido: number;
    falha: number;
    cancelado: number;
    pendente: number;
    respondido: number;
  };
  custo_estimado: {
    disponivel: boolean;
    categoria?: string | null;
    quantidadeCobravelEstimada: number;
    valorUnitarioUsd: number;
    valorTotalUsd: number;
    cotacaoUsdBrl: number;
    valorTotalBrlEstimado: number;
    fonteCotacao?: string | null;
    cotacaoDataHora?: string | null;
    cotacaoFallback?: boolean;
    criterio?: string | null;
  };
  linhas: LinhaRelatorioCampanha[];
};

type PaginaHistoricoCache = {
  resultados: ResultadoDisparo[];
  temMais: boolean;
  proximoCursor: string | null;
};

type ConsultaHistoricoCache = {
  atualizadoEm: number;
  paginaAtual: number;
  paginas: Record<string, PaginaHistoricoCache>;
  totais: TotaisHistorico | null;
};

type CampanhasHistoricoCache = {
  atualizadoEm: number;
  campanhas: CampanhaHistoricoFiltro[];
};

type HistoricoCachePersistido = {
  versao: 1;
  consultas: Record<string, ConsultaHistoricoCache>;
  campanhasPorEmpresa: Record<string, CampanhasHistoricoCache>;
};

type CampanhaConflitoContato = {
  campanha_id: string;
  campanha_nome: string;
  template_nome?: string | null;
  enviado_em?: string | null;
};

type GrupoConflitoDisparo = {
  campanha_id: string;
  campanha_nome: string;
  template_nome?: string | null;
  total_contatos: number;
  contatos_ids: string[];
  ultimo_envio_em?: string | null;
};

type DecisaoConflitoDisparo = {
  acao: "incluir" | "remover";
  contatoIds: string[];
};

const PARAMETRO_RELATORIO_DISPAROS = "relatorioDisparos";
const MARCADOR_HISTORICO_RELATORIO = "crmDisparosRelatorio";
const EVENTO_DISPARO_ANDAMENTO = "crm:whatsapp-disparo-andamento";
const EVENTO_DISPARO_REFRESH = "crm:whatsapp-disparo-refresh";
const EVENTO_DISPARO_PREPARANDO = "crm:whatsapp-disparo-preparando";
const TEMPO_MAXIMO_LOADING_PREPARACAO_MS = 15_000;
const STATUS_CAMPANHAS_ATIVAS = new Set(["pendente", "enviando"]);
const TESTE_CARD_PAGINA_DISPARO_KEY =
  "crm-whatsapp-disparo-page-card-test";
const HISTORICO_CACHE_STORAGE_KEY = "crm:disparos:historico-cache:v5";
const HISTORICO_CACHE_TTL_MS = 5 * 60 * 1000;
const HISTORICO_CACHE_MAX_CONSULTAS = 20;

let historicoCacheMemoria: HistoricoCachePersistido | null = null;

function criarHistoricoCacheVazio(): HistoricoCachePersistido {
  return {
    versao: 1,
    consultas: {},
    campanhasPorEmpresa: {},
  };
}

function carregarHistoricoCachePersistido() {
  if (historicoCacheMemoria) return historicoCacheMemoria;

  if (typeof window === "undefined") {
    historicoCacheMemoria = criarHistoricoCacheVazio();
    return historicoCacheMemoria;
  }

  try {
    const valor = window.sessionStorage.getItem(HISTORICO_CACHE_STORAGE_KEY);
    const parsed = valor
      ? (JSON.parse(valor) as HistoricoCachePersistido)
      : null;

    historicoCacheMemoria =
      parsed?.versao === 1 ? parsed : criarHistoricoCacheVazio();
  } catch {
    historicoCacheMemoria = criarHistoricoCacheVazio();
  }

  return historicoCacheMemoria;
}

function persistirHistoricoCache() {
  if (typeof window === "undefined" || !historicoCacheMemoria) return;

  try {
    window.sessionStorage.setItem(
      HISTORICO_CACHE_STORAGE_KEY,
      JSON.stringify(historicoCacheMemoria)
    );
  } catch {
    // O cache em memória continua disponível se o limite da sessão for atingido.
  }
}

function chaveConsultaHistorico(
  empresaId: string,
  status: string,
  integracaoWhatsappId: string,
  campanhaId: string,
  busca: string
) {
  return JSON.stringify([
    empresaId,
    status,
    integracaoWhatsappId,
    campanhaId,
    busca.trim().toLocaleLowerCase("pt-BR"),
  ]);
}

function obterConsultaHistoricoCache(chave: string) {
  const cache = carregarHistoricoCachePersistido();
  const consulta = cache.consultas[chave];

  if (!consulta) return null;

  if (Date.now() - consulta.atualizadoEm > HISTORICO_CACHE_TTL_MS) {
    delete cache.consultas[chave];
    persistirHistoricoCache();
    return null;
  }

  return consulta;
}

function salvarConsultaHistoricoCache(
  chave: string,
  consulta: ConsultaHistoricoCache
) {
  const cache = carregarHistoricoCachePersistido();
  cache.consultas[chave] = consulta;

  const chaves = Object.entries(cache.consultas).sort(
    ([, a], [, b]) => b.atualizadoEm - a.atualizadoEm
  );

  for (const [chaveAntiga] of chaves.slice(HISTORICO_CACHE_MAX_CONSULTAS)) {
    delete cache.consultas[chaveAntiga];
  }

  persistirHistoricoCache();
}

function obterCampanhasHistoricoCache(empresaId: string) {
  const cache = carregarHistoricoCachePersistido();
  const registro = cache.campanhasPorEmpresa[empresaId];

  if (!registro) return null;

  if (Date.now() - registro.atualizadoEm > HISTORICO_CACHE_TTL_MS) {
    delete cache.campanhasPorEmpresa[empresaId];
    persistirHistoricoCache();
    return null;
  }

  return registro.campanhas;
}

function salvarCampanhasHistoricoCache(
  empresaId: string,
  campanhas: CampanhaHistoricoFiltro[]
) {
  const cache = carregarHistoricoCachePersistido();
  cache.campanhasPorEmpresa[empresaId] = {
    atualizadoEm: Date.now(),
    campanhas,
  };
  persistirHistoricoCache();
}

function invalidarHistoricoCacheEmpresa(empresaId: string) {
  const cache = carregarHistoricoCachePersistido();

  for (const chave of Object.keys(cache.consultas)) {
    try {
      const [empresaConsulta] = JSON.parse(chave) as string[];
      if (empresaConsulta === empresaId) {
        delete cache.consultas[chave];
      }
    } catch {
      delete cache.consultas[chave];
    }
  }

  delete cache.campanhasPorEmpresa[empresaId];
  persistirHistoricoCache();
}

type VariavelPersonalizada = {
  id: string;
  chave: string;
  valor: string;
  descricao: string | null;
  escopo: "global" | "disparos" | "fluxos";
  ativo: boolean;
};

type OpcaoVariavelTemplate = {
  chave: string;
  descricao: string;
  categoria: "Fixa" | "Personalizada";
};

type ProtocolosContatoMap = Record<
  string,
  {
    protocolo_atual: string;
    ultimo_protocolo: string;
  }
>;

const VARIAVEIS_FIXAS_SISTEMA = [
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
    chave: "nome_captura",
    exemplo: "{{nome_captura}}",
    descricao:
      "Último nome confirmado e capturado durante o atendimento/agendamento; se não existir, usa o nome do contato.",
  },
  {
    chave: "primeiro_nome_captura",
    exemplo: "{{primeiro_nome_captura}}",
    descricao:
      "Primeiro nome derivado do último nome confirmado e capturado durante o atendimento/agendamento.",
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
    chave: "campo_contato",
    exemplo: "{{campo_contato}}",
    descricao:
      "Valor individual salvo no campo do contato, como profissão, veículo, código, plano, unidade, produto, vendedor ou link.",
  },
  {
    chave: "interesse",
    exemplo: "{{interesse}}",
    descricao: "Interesse principal informado manualmente no cadastro do contato.",
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
    descricao: "Classificação atual do lead.",
  },
  {
    chave: "classificacao_lead",
    exemplo: "{{classificacao_lead}}",
    descricao: "Classificação global do lead.",
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
];

function extrairBody(payload: WhatsAppTemplate["payload"]) {
  const body = payload?.components?.find((item) => item.type === "BODY");
  return body?.text || "";
}

function extrairHeader(payload: WhatsAppTemplate["payload"]) {
  const header = payload?.components?.find((item) => item.type === "HEADER");
  return header?.text || "";
}

function extrairFooter(payload: WhatsAppTemplate["payload"]) {
  const footer = payload?.components?.find((item) => item.type === "FOOTER");
  return footer?.text || "";
}

function extrairQuickReplies(payload: WhatsAppTemplate["payload"]) {
  const buttons = payload?.components?.find((item) => item.type === "BUTTONS");

  return (
    buttons?.buttons
      ?.filter((button) => button?.type === "QUICK_REPLY" && button?.text)
      .map((button) => button.text || "")
      .filter(Boolean) || []
  );
}

function extrairRedirectButtons(payload: WhatsAppTemplate["payload"]) {
  const buttons = payload?.components?.find((item) => item.type === "BUTTONS");

  return (
    buttons?.buttons
      ?.filter(
        (button) =>
          String(button?.type || "").toUpperCase() === "URL" &&
          button?.text &&
          button?.url
      )
      .map((button) => ({
        text: String(button.text || "").trim(),
        url: String(button.url || "").trim(),
      }))
      .filter((button) => button.text && button.url) || []
  );
}

function contarVariaveisTemplate(template: WhatsAppTemplate | null) {
  if (!template?.payload?.components?.length) return 0;

  const components = template.payload.components;
  const header = components.find(
    (item) => String(item.type || "").toUpperCase() === "HEADER"
  );
  const body = components.find(
    (item) => String(item.type || "").toUpperCase() === "BODY"
  );
  const buttons = components.find(
    (item) => String(item.type || "").toUpperCase() === "BUTTONS"
  );

  function contarTexto(texto?: string | null) {
    const matches = String(texto || "").match(/\{\{\d+\}\}/g) || [];
    const numeros = matches
      .map((item) => Number(item.replace(/[{}]/g, "")))
      .filter((n) => !Number.isNaN(n));

    if (numeros.length === 0) return 0;
    return Math.max(...numeros);
  }

  const totalButtons = (buttons?.buttons || []).reduce(
    (total, button) =>
      String(button?.type || "").toUpperCase() === "URL"
        ? total + contarTexto(button?.url)
        : total,
    0
  );

  return contarTexto(header?.text) + contarTexto(body?.text) + totalButtons;
}

function substituirPreviewSequencial(
  texto: string,
  variaveis: string[],
  offset: number
) {
  return String(texto || "").replace(/\{\{(\d+)\}\}/g, (_, numero) => {
    const index = offset + Number(numero) - 1;
    return variaveis[index]?.trim() || `{{${numero}}}`;
  });
}

function montarPreviewTemplateDisparo(
  template: WhatsAppTemplate | null,
  variaveis: string[]
) {
  if (!template) return null;

  const components = template.payload?.components || [];
  const header = components.find(
    (item) => String(item.type || "").toUpperCase() === "HEADER"
  );
  const body = components.find(
    (item) => String(item.type || "").toUpperCase() === "BODY"
  );
  const footer = components.find(
    (item) => String(item.type || "").toUpperCase() === "FOOTER"
  );
  const headerFormat = String(header?.format || "").toUpperCase();

  const imagemUrl =
    headerFormat === "IMAGE"
      ? (header?.example?.header_handle || [])
          .map((item) => String(item || "").trim())
          .find((item) => /^https?:\/\//i.test(item)) || ""
      : "";

  let offset = 0;
  const headerTexto =
    headerFormat === "TEXT"
      ? substituirPreviewSequencial(
          header?.text || "",
          variaveis,
          offset
        ).trim()
      : "";

  offset += contarVariaveisTemplate({
    ...template,
    payload: {
      ...template.payload,
      components: header ? [header] : [],
    },
  });

  let bodyTexto = substituirPreviewSequencial(
    body?.text || "",
    variaveis,
    offset
  ).trim();

  let tituloVisual = headerTexto;
  if (!tituloVisual && headerFormat === "IMAGE") {
    const tituloNoBody = bodyTexto.match(/^\*([^*\n]+)\*\s*(?:\n+|$)/);

    if (tituloNoBody) {
      tituloVisual = tituloNoBody[1].trim();
      bodyTexto = bodyTexto.slice(tituloNoBody[0].length).trim();
    }
  }

  return {
    titulo: tituloVisual,
    corpo: bodyTexto || "Template sem conteúdo para prévia.",
    rodape: String(footer?.text || "").trim() || "Equipe de atendimento",
    imagemUrl,
    possuiImagem: headerFormat === "IMAGE",
    redirectButtons: extrairRedirectButtons(template.payload),
  };
}

function normalizarVariavelTemplate(valor: string) {
  return String(valor || "")
    .replace(/[{}]/g, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function normalizarEntradaVariavelTemplate(valor: string) {
  return String(valor || "")
    .replace(/[{}]/g, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+/g, "");
}

function normalizarBuscaVariavelTemplate(valor: string) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function SeletorVariavelTemplate({
  label,
  value,
  onChange,
  opcoes,
  carregando,
}: {
  label: string;
  value: string;
  onChange: (chave: string) => void;
  opcoes: OpcaoVariavelTemplate[];
  carregando: boolean;
}) {
  const inputId = useId();
  const listboxId = useId();
  const descricaoId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosicao, setMenuPosicao] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState(value);
  const [buscando, setBuscando] = useState(false);
  const [indiceAtivo, setIndiceAtivo] = useState(-1);

  const opcaoSelecionada = useMemo(
    () => opcoes.find((opcao) => opcao.chave === value) || null,
    [opcoes, value]
  );

  const opcoesFiltradas = useMemo(() => {
    if (!buscando) return opcoes;

    const termo = normalizarBuscaVariavelTemplate(busca);
    if (!termo) return opcoes;

    return opcoes.filter((opcao) => {
      const conteudo = normalizarBuscaVariavelTemplate(
        `${opcao.chave} ${opcao.descricao} ${opcao.categoria}`
      );
      return conteudo.includes(termo);
    });
  }, [busca, buscando, opcoes]);

  const fecharLista = useCallback(() => {
    setAberto(false);
    setMenuPosicao(null);
    setBuscando(false);
    setBusca(value);
    setIndiceAtivo(-1);
  }, [value]);

  const abrirLista = useCallback(() => {
    const indiceSelecionado = opcoes.findIndex(
      (opcao) => opcao.chave === value
    );

    setAberto(true);
    setBuscando(false);
    setBusca(value);
    setIndiceAtivo(
      indiceSelecionado >= 0 ? indiceSelecionado : opcoes.length > 0 ? 0 : -1
    );
  }, [opcoes, value]);

  const atualizarPosicaoMenu = useCallback(() => {
    const controle = inputRef.current?.parentElement;
    if (!controle) return;

    const rect = controle.getBoundingClientRect();
    const margem = 12;
    const espacoAbaixo = Math.max(0, window.innerHeight - rect.bottom - margem);
    const espacoAcima = Math.max(0, rect.top - margem);
    const alturaDesejada = Math.min(360, Math.max(120, opcoesFiltradas.length * 60 + 18));
    const abrirParaCima = espacoAbaixo < Math.min(240, alturaDesejada) && espacoAcima > espacoAbaixo;
    const espacoDisponivel = abrirParaCima ? espacoAcima : espacoAbaixo;
    const altura = Math.min(alturaDesejada, Math.max(96, espacoDisponivel - 8));
    const largura = Math.min(Math.max(rect.width, 270), 390, window.innerWidth - 2 * margem);

    setMenuPosicao({
      top: abrirParaCima ? Math.max(margem, rect.top - altura - 6) : rect.bottom + 6,
      left: Math.max(margem, Math.min(rect.left, window.innerWidth - largura - margem)),
      width: largura,
      maxHeight: altura,
    });
  }, [opcoesFiltradas.length]);

  useEffect(() => {
    if (!aberto) return;
    atualizarPosicaoMenu();
    const atualizar = () => atualizarPosicaoMenu();
    window.addEventListener("resize", atualizar);
    document.addEventListener("scroll", atualizar, true);
    return () => {
      window.removeEventListener("resize", atualizar);
      document.removeEventListener("scroll", atualizar, true);
    };
  }, [aberto, atualizarPosicaoMenu]);

  useEffect(() => {
    if (!aberto) return;

    function fecharAoClicarFora(event: PointerEvent) {
      const alvo = event.target as Node;
      if (
        !containerRef.current?.contains(alvo) &&
        !menuRef.current?.contains(alvo)
      ) {
        fecharLista();
      }
    }

    document.addEventListener("pointerdown", fecharAoClicarFora);
    return () => document.removeEventListener("pointerdown", fecharAoClicarFora);
  }, [aberto, fecharLista]);

  useEffect(() => {
    if (
      !aberto ||
      indiceAtivo < 0 ||
      indiceAtivo >= opcoesFiltradas.length
    ) {
      return;
    }

    document
      .getElementById(`${listboxId}-option-${indiceAtivo}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [aberto, indiceAtivo, listboxId, opcoesFiltradas.length]);

  function selecionarOpcao(opcao: OpcaoVariavelTemplate) {
    onChange(opcao.chave);
    setBusca(opcao.chave);
    setBuscando(false);
    setAberto(false);
    setIndiceAtivo(-1);
  }

  function navegarOpcoes(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && aberto) {
      event.preventDefault();
      fecharLista();
      return;
    }

    if (event.key === "Tab") {
      fecharLista();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();

      if (!aberto) {
        abrirLista();
        return;
      }

      if (opcoesFiltradas.length === 0) return;

      const direcao = event.key === "ArrowDown" ? 1 : -1;
      setIndiceAtivo((indiceAtual) => {
        if (indiceAtual < 0) {
          return direcao > 0 ? 0 : opcoesFiltradas.length - 1;
        }

        return (
          (indiceAtual + direcao + opcoesFiltradas.length) %
          opcoesFiltradas.length
        );
      });
      return;
    }

    if (
      event.key === "Enter" &&
      aberto &&
      indiceAtivo >= 0 &&
      opcoesFiltradas[indiceAtivo]
    ) {
      event.preventDefault();
      selecionarOpcao(opcoesFiltradas[indiceAtivo]);
    }
  }

  return (
    <div className={styles.variableComboboxField} ref={containerRef}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>

      <div
        className={`${styles.variableComboboxControl} ${
          aberto ? styles.variableComboboxControlOpen : ""
        }`}
      >
        <Search
          size={16}
          strokeWidth={2}
          className={styles.variableComboboxSearchIcon}
          aria-hidden="true"
        />
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={aberto}
          aria-controls={listboxId}
          aria-describedby={descricaoId}
          aria-activedescendant={
            aberto &&
            indiceAtivo >= 0 &&
            indiceAtivo < opcoesFiltradas.length
              ? `${listboxId}-option-${indiceAtivo}`
              : undefined
          }
          autoComplete="off"
          spellCheck={false}
          value={aberto ? busca : value}
          placeholder="Selecione uma variável"
          className={styles.variableComboboxInput}
          onFocus={(event) => {
            abrirLista();
            event.currentTarget.select();
          }}
          onClick={(event) => {
            if (!aberto) abrirLista();
            if (!buscando) event.currentTarget.select();
          }}
          onChange={(event) => {
            setBusca(event.target.value);
            setBuscando(true);
            setAberto(true);
            setIndiceAtivo(0);
          }}
          onKeyDown={navegarOpcoes}
        />
        <button
          type="button"
          className={styles.variableComboboxToggle}
          aria-label={aberto ? "Fechar variáveis" : "Abrir variáveis"}
          aria-expanded={aberto}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (aberto) {
              fecharLista();
            } else {
              abrirLista();
              inputRef.current?.focus();
            }
          }}
        >
          <ChevronDown
            size={18}
            aria-hidden="true"
            className={aberto ? styles.variableComboboxChevronOpen : ""}
          />
        </button>
      </div>

      {aberto && menuPosicao && typeof document !== "undefined" ? createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          role="listbox"
          aria-label={`Opções para ${label}`}
          className={`${styles.variableComboboxMenu} ${styles.variableComboboxMenuPortal}`}
          style={{
            top: menuPosicao.top,
            left: menuPosicao.left,
            width: menuPosicao.width,
            maxHeight: menuPosicao.maxHeight,
          }}
        >
          {opcoesFiltradas.map((opcao, index) => {
            const selecionada = opcao.chave === value;
            const ativa = index === indiceAtivo;

            return (
              <button
                id={`${listboxId}-option-${index}`}
                key={`${opcao.categoria}-${opcao.chave}`}
                type="button"
                role="option"
                aria-selected={selecionada}
                className={`${styles.variableComboboxOption} ${
                  ativa ? styles.variableComboboxOptionActive : ""
                } ${selecionada ? styles.variableComboboxOptionSelected : ""}`}
                onMouseEnter={() => setIndiceAtivo(index)}
                onClick={() => selecionarOpcao(opcao)}
              >
                <span className={styles.variableComboboxOptionHeader}>
                  <strong>{`{{${opcao.chave}}}`}</strong>
                  <span className={styles.variableComboboxCategory}>
                    {opcao.categoria}
                  </span>
                  {selecionada ? (
                    <Check
                      size={16}
                      strokeWidth={2.5}
                      aria-hidden="true"
                      className={styles.variableComboboxCheck}
                    />
                  ) : null}
                </span>
                <small>{opcao.descricao}</small>
              </button>
            );
          })}

          {opcoesFiltradas.length === 0 ? (
            <div className={styles.variableComboboxEmpty}>
              Nenhuma variável encontrada.
            </div>
          ) : null}

          {carregando ? (
            <div className={styles.variableComboboxLoading}>
              Carregando variáveis personalizadas...
            </div>
          ) : null}
        </div>,
        document.body
      ) : null}

      <p id={descricaoId} className={styles.variableComboboxDescription}>
        {opcaoSelecionada
          ? opcaoSelecionada.descricao
          : "Selecione uma variável disponível para este campo."}
      </p>
    </div>
  );
}

function resolverVariavelContato(
  valor: string,
  contato: ContatoOpcao,
  variaveisPersonalizadas: VariavelPersonalizada[] = [],
  protocolosPorContato: ProtocolosContatoMap = {}
) {
  const texto = String(valor || "").trim();
  const chave = normalizarVariavelTemplate(texto);

  if (!texto) return "";

  if (chave === "nome" || chave === "nome_contato" || chave === "contato_nome") {
    return contato.nome || "Cliente";
  }

  if (
    chave === "nome_whatsapp" ||
    chave === "whatsapp_nome" ||
    chave === "nome_perfil_whatsapp" ||
    chave === "perfil_whatsapp_nome"
  ) {
    return contato.whatsapp_profile_name || contato.nome || "";
  }

  if (
    chave === "telefone" ||
    chave === "numero" ||
    chave === "numero_contato" ||
    chave === "contato_numero"
  ) {
    return contato.telefone || "";
  }

  if (chave === "email" || chave === "email_contato" || chave === "contato_email") {
    return contato.email || "";
  }

  if (chave === "campo_contato" || chave === "variavel_contato") {
    return contato.campo_contato || "";
  }

  if (chave === "interesse") {
    return contato.interesse || "";
  }

  if (chave === "campanha") {
    return (
      obterCampanhaContato(contato) ||
      contato.status_lead ||
      contato.telefone ||
      ""
    );
  }

  if (chave === "status_lead" || chave === "status") {
    return (
      contato.status_lead ||
      obterCampanhaContato(contato) ||
      contato.telefone ||
      ""
    );
  }

  if (chave === "origem") {
    return obterOrigemContato(contato);
  }

  if (chave === "protocolo_atual") {
    return protocolosPorContato[contato.id]?.protocolo_atual || "";
  }

  if (chave === "ultimo_protocolo") {
    return protocolosPorContato[contato.id]?.ultimo_protocolo || "";
  }

  const variavelPersonalizada = variaveisPersonalizadas.find(
    (item) => normalizarVariavelTemplate(item.chave) === chave
  );

  if (variavelPersonalizada) {
    return variavelPersonalizada.valor || "";
  }

  return texto;
}

function formatarStatusIntegracao(status?: string | null) {
  if (!status) return "Sem status";

  switch (status.toLowerCase()) {
    case "ativo":
      return "Ativa";
    case "conectado":
      return "Conectada";
    case "inativo":
      return "Inativa";
    default:
      return status;
  }
}

function formatarCategoriaMeta(categoria: string | null | undefined) {
  switch (String(categoria || "").toUpperCase()) {
    case "UTILITY":
      return "UTILITY";
    case "MARKETING":
      return "MARKETING";
    case "AUTHENTICATION":
      return "Autenticação";
    default:
      return categoria || "-";
  }
}

function normalizarMetadataJson(metadata: any) {
  if (!metadata) return null;

  if (typeof metadata === "string") {
    try {
      return JSON.parse(metadata);
    } catch {
      return null;
    }
  }

  return metadata;
}

function obterFeedbackErroDisparo(item: ResultadoDisparo) {
  if (disparoEstaProcessando(item)) return null;
  if (disparoTeveSucesso(item)) return null;

  const metadata = normalizarMetadataJson(item.metadata_json);
  const erroMeta =
    metadata?.whatsapp_status?.raw_status?.errors?.[0] ||
    metadata?.meta_response?.error ||
    metadata?.meta_error ||
    null;

  const codigo =
    item.erro_codigo_meta ||
    erroMeta?.code ||
    metadata?.whatsapp_status?.error_code ||
    null;

  const mensagemTecnica =
    item.erro_tecnico ||
    item.erro ||
    metadata?.whatsapp_status?.error_message ||
    erroMeta?.message ||
    erroMeta?.title ||
    null;

  const descricao = descreverErroMetaWhatsApp(codigo, mensagemTecnica);

  return {
    titulo: descricao.codigo
      ? `${descricao.codigo} · ${descricao.nome}`
      : `Código não informado · ${descricao.nome}`,
    descricao: descricao.significado,
    acao: descricao.acao,
  };
}

function getTemplateStatusClass(status: string | null | undefined) {
  if (!status) return styles.badgeGray;

  switch (status.toUpperCase()) {
    case "PENDING":
      return styles.badgeYellow;
    case "APPROVED":
      return styles.badgeGreen;
    case "REJECTED":
      return styles.badgeRed;
    case "PAUSED":
    case "DISABLED":
    case "ARCHIVED":
      return styles.badgeGray;
    default:
      return styles.badgeBlue;
  }
}

function limparNumero(valor: string | null | undefined) {
  return String(valor || "").replace(/\D/g, "");
}

function formatarTelefone(numero: string | null | undefined) {
  const limpo = limparNumero(numero);

  if (!limpo) return "Sem telefone";
  return limpo;
}

function formatarNumeroMeta(valor?: number | null) {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return "0";
  return new Intl.NumberFormat("pt-BR").format(valor);
}

function formatarPercentualMeta(valor?: number | null) {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return "0%";
  return `${Math.round(valor * 100)}%`;
}

function contatoTemTelefoneValido(contato: ContatoOpcao) {
  if (contato.telefone_revisar === true) return false;

  const telefone = limparNumero(contato.telefone);
  return telefone.length >= 10;
}

function formatarDataHora(data?: string | null) {
  if (!data) return "";

  try {
    return new Date(data).toLocaleString("pt-BR");
  } catch {
    return "";
  }
}

function dataHojeParaInput() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function camposDataHoraLocal(data?: string | null) {
  if (!data) return null;

  const valor = new Date(data);

  if (Number.isNaN(valor.getTime())) return null;

  const dataLocal = new Date(
    valor.getTime() - valor.getTimezoneOffset() * 60 * 1000
  )
    .toISOString()
    .slice(0, 16);

  return {
    data: dataLocal.slice(0, 10),
    hora: dataLocal.slice(11, 16),
  };
}

function dataCampanhaParaFiltro(createdAt?: string | null) {
  if (!createdAt) return "";

  const data = new Date(createdAt);
  if (Number.isNaN(data.getTime())) return "";

  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(data);

  const ano = partes.find((parte) => parte.type === "year")?.value || "";
  const mes = partes.find((parte) => parte.type === "month")?.value || "";
  const dia = partes.find((parte) => parte.type === "day")?.value || "";

  return ano && mes && dia ? `${ano}-${mes}-${dia}` : "";
}

function formatarDataHoraListaFiltro(createdAt?: string | null) {
  if (!createdAt) return "";

  const data = new Date(createdAt);

  if (Number.isNaN(data.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(data)
    .replace(",", "");
}

function formatarDataHoraCurta(data?: string | null) {
  if (!data) return "";

  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .format(new Date(data))
      .replace(",", "");
  } catch {
    return "";
  }
}

// CRM_HISTORICO_ORDEM_DECRESCENTE_V2
function timestampHistoricoDisparo(item: ResultadoDisparo) {
  const timestamp = Date.parse(String(item.created_at || ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function ordenarHistoricoPorDataHoraDecrescente(
  itens: ResultadoDisparo[]
) {
  return [...itens].sort((a, b) => {
    const diferencaData =
      timestampHistoricoDisparo(b) - timestampHistoricoDisparo(a);

    if (diferencaData !== 0) return diferencaData;

    return String(b.id || "").localeCompare(
      String(a.id || ""),
      "pt-BR"
    );
  });
}

function nomeCampanhaHistorico(campanha?: CampanhaHistoricoFiltro | null) {
  if (!campanha) return "Disparo em massa";
  if (campanha.nome) return campanha.nome;

  const total = Number(campanha.total_itens || 0);
  const unidade = total === 1 ? "contato" : "contatos";
  const data = formatarDataHoraCurta(campanha.created_at) || "data nao informada";

  return `Disparo em massa - ${data} - ${total} ${unidade}`;
}

function statusCampanhaHistorico(campanha: CampanhaHistoricoFiltro) {
  const status = String(campanha.status || "").trim().toLowerCase();

  if (status === "pendente" || status === "enviando") return "Processando";
  if (status === "concluida") {
    const falhas = Math.max(0, Number(campanha.total_falhas || 0));
    const cancelados = Math.max(0, Number(campanha.total_cancelados || 0));
    return falhas > 0 || cancelados > 0 ? "Concluído com falhas" : "Concluído";
  }
  if (status === "cancelada") return "Cancelado";
  if (status.startsWith("pausada_")) return "Interrompido";
  if (status === "erro") return "Interrompido";

  return status ? status : "Concluído";
}

function campanhaHistoricoTemProblema(campanha: CampanhaHistoricoFiltro) {
  const status = String(campanha.status || "").trim().toLowerCase();
  return (
    status === "cancelada" ||
    status === "erro" ||
    status.startsWith("pausada_") ||
    Number(campanha.total_falhas || 0) > 0 ||
    Number(campanha.total_cancelados || 0) > 0
  );
}

function campanhaHistoricoFoiAgendada(campanha: CampanhaHistoricoFiltro) {
  const metadata = campanha.metadata_json;

  if (!metadata || typeof metadata !== "object") return false;

  return Boolean(
    String(metadata.agendamento_chave || "").trim() ||
      String(metadata.executar_em || "").trim()
  );
}


function tituloProblemaCampanhaHistorico(c: CampanhaHistoricoFiltro) {
  const status = String(c.status || "").toLowerCase();
  const falhas = Number(c.total_falhas || 0);
  if (status === "cancelada") return "Disparo em massa cancelado";
  if (status === "concluida" && falhas > 0) return "Campanha concluída com falhas";
  if (status === "erro" || status.startsWith("pausada_")) return "Disparo em massa interrompido";
  return falhas > 0 ? "Falhas durante o disparo" : "Ocorrência no disparo";
}

type FalhaAgrupadaCampanha = {
  chave: string;
  codigo: number | null;
  quantidade: number;
  nome: string;
  significado: string;
  resumo: string;
  acao: string;
  gravidade: GravidadeErroMetaWhatsApp;
  detalheTecnico: string | null;
};

function agruparFalhasCampanhaHistorico(c: CampanhaHistoricoFiltro): FalhaAgrupadaCampanha[] {
  const grupos = new Map<string, FalhaAgrupadaCampanha>();
  for (const item of Array.isArray(c.erros_resumo) ? c.erros_resumo : []) {
    const quantidade = Math.max(0, Math.trunc(Number(item.quantidade || 0)));
    if (!Number.isFinite(quantidade) || !quantidade) continue;
    const detalhe = String(item.erro || "").trim();
    const codigo = identificarCodigoErroMetaWhatsApp(item.erro_codigo_meta, detalhe);
    const chave = codigo ? `codigo:${codigo}` : `texto:${detalhe.toLowerCase() || "desconhecido"}`;
    const existente = grupos.get(chave);
    if (existente) {
      existente.quantidade += quantidade;
      continue;
    }
    const descricao = descreverErroMetaWhatsApp(codigo, detalhe);
    grupos.set(chave, {
      chave, codigo, quantidade,
      nome: codigo ? descricao.nome : "Falha não classificada",
      significado: codigo ? descricao.significado : "A Meta não informou um código que permita identificar a causa desta falha.",
      resumo: codigo ? descricao.resumo || descricao.significado : "A falha não possui um código informado pela Meta.",
      acao: descricao.acao,
      gravidade: gravidadeErroMetaWhatsApp(codigo, detalhe),
      detalheTecnico: !codigo && detalhe ? detalhe : null,
    });
  }
  const totalFalhas = Math.max(0, Math.trunc(Number(c.total_falhas || 0)));
  const totalAgrupado = Array.from(grupos.values()).reduce((total, g) => total + g.quantidade, 0);
  if (totalFalhas > totalAgrupado) {
    grupos.set("sem-detalhes", {
      chave: "sem-detalhes", codigo: null, quantidade: totalFalhas - totalAgrupado,
      nome: "Falhas sem classificação detalhada",
      significado: "Essas falhas foram contabilizadas, mas ainda não há dados suficientes para identificar cada causa.",
      resumo: "Não há dados suficientes para identificar a causa.",
      gravidade: 1,
      acao: "Abra o relatório detalhado para consultar os contatos afetados. Não reenvie sem analisar a causa.",
      detalheTecnico: null,
    });
  }
  return Array.from(grupos.values()).sort(
    (x,y) => y.quantidade-x.quantidade || x.chave.localeCompare(y.chave,"pt-BR")
  );
}

function timestampRelatorio(valor?: string | null) {
  const timestamp = Date.parse(String(valor || ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function ordenarLinhasRelatorioCampanha(
  linhas: LinhaRelatorioCampanha[]
) {
  return [...linhas].sort((a, b) => {
    // Prioridade do relatório:
    // 1) respondeu -> Respondido em mais recente primeiro;
    // 2) leu e não respondeu -> Lido em mais recente primeiro;
    // 3) não leu e não respondeu -> Enviado em mais recente primeiro.
    const grupoA = a.resposta_em ? 0 : a.lido_em ? 1 : 2;
    const grupoB = b.resposta_em ? 0 : b.lido_em ? 1 : 2;

    if (grupoA !== grupoB) return grupoA - grupoB;

    const dataPrioritariaA =
      grupoA === 0
        ? timestampRelatorio(a.resposta_em)
        : grupoA === 1
        ? timestampRelatorio(a.lido_em)
        : timestampRelatorio(a.enviado_em);
    const dataPrioritariaB =
      grupoB === 0
        ? timestampRelatorio(b.resposta_em)
        : grupoB === 1
        ? timestampRelatorio(b.lido_em)
        : timestampRelatorio(b.enviado_em);

    if (dataPrioritariaA !== dataPrioritariaB) {
      return dataPrioritariaB - dataPrioritariaA;
    }

    // Desempate estável dentro do mesmo grupo.
    const diferencaEnvio =
      timestampRelatorio(b.enviado_em) -
      timestampRelatorio(a.enviado_em);

    if (diferencaEnvio !== 0) return diferencaEnvio;

    return String(b.numero || "").localeCompare(
      String(a.numero || ""),
      "pt-BR"
    );
  });
}

function truncarNomeBadge(valor: string, limite = 34) {
  const texto = String(valor || "").trim();

  if (texto.length <= limite) return texto;

  return `${texto.slice(0, Math.max(0, limite - 3)).trim()}...`;
}

function normalizarTextoBusca(valor?: string | null) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function emitirRefreshDisparoEmMassa() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENTO_DISPARO_REFRESH));
}

function emitirPreparacaoDisparoEmMassa(params: {
  ativo: boolean;
  integracaoWhatsappId: string;
  integracaoNome?: string | null;
  total?: number;
  nome?: string | null;
}) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(EVENTO_DISPARO_PREPARANDO, {
      detail: {
        ativo: params.ativo,
        integracao_whatsapp_id: params.integracaoWhatsappId,
        integracao_nome: params.integracaoNome || null,
        total: Math.max(0, Number(params.total || 0)),
        nome: params.nome || null,
      },
    })
  );
}

function textoCampanha(valor: unknown) {
  return typeof valor === "string" && valor.trim() ? valor : null;
}

function inteiroCampanha(valor: unknown) {
  const numero = Number(valor || 0);
  return Number.isFinite(numero) ? Math.max(0, Math.trunc(numero)) : 0;
}

function campanhaEstaAtiva(campanha?: CampanhaDisparoAndamento | null) {
  return STATUS_CAMPANHAS_ATIVAS.has(String(campanha?.status || ""));
}

function campanhaAguardandoMeta(
  campanha?: CampanhaDisparoAndamento | null
) {
  if (!campanha?.aguardando_meta) return false;

  const retomarEm = String(
    campanha.aguardando_meta_retomar_em || ""
  ).trim();
  const retomarMs = retomarEm ? new Date(retomarEm).getTime() : 0;

  return Number.isFinite(retomarMs) && retomarMs > Date.now();
}

function campanhaFoiConcluida(campanha?: CampanhaDisparoAndamento | null) {
  return String(campanha?.status || "") === "concluida";
}

function campanhaFoiConcluidaComSucesso(
  campanha?: CampanhaDisparoAndamento | null
) {
  return (
    campanhaFoiConcluida(campanha) &&
    inteiroCampanha(campanha?.falhas) === 0 &&
    inteiroCampanha(campanha?.cancelados) === 0
  );
}

function motivoCampanhaRealtime(row: CampanhaDisparoRealtimeRow) {
  const motivo = textoCampanha(row.pausa_motivo) || textoCampanha(row.erro);

  if (motivo) return motivo;

  switch (textoCampanha(row.status)) {
    case "pausada_por_conta_bloqueada":
      return "A Meta bloqueou ou desativou a conta WhatsApp Business durante o disparo.";
    case "pausada_por_lista_invalida":
      return "A lista apresentou muitos numeros invalidos ou indisponiveis.";
    case "pausada_por_erro_meta":
      return "A Meta retornou erros que exigem pausa operacional.";
    case "pausada_por_falhas":
      return "Muitas mensagens falharam no lote processado.";
    case "cancelada":
      return "O disparo foi cancelado antes de concluir todos os envios.";
    case "erro":
      return "O disparo foi interrompido por erro operacional.";
    default:
      return null;
  }
}

function ordenarCampanhasPaginaPorCriacao(
  campanhas: CampanhaDisparoAndamento[]
) {
  return [...campanhas].sort((a, b) => {
    const criadaA = String(a.created_at || "");
    const criadaB = String(b.created_at || "");
    const criadaAMs = Date.parse(criadaA);
    const criadaBMs = Date.parse(criadaB);

    if (Number.isFinite(criadaAMs) && Number.isFinite(criadaBMs)) {
      const diferenca = criadaAMs - criadaBMs;

      if (diferenca !== 0) return diferenca;

      if (criadaA !== criadaB) {
        return criadaA.localeCompare(criadaB, "pt-BR");
      }
    } else if (Number.isFinite(criadaAMs)) {
      return -1;
    } else if (Number.isFinite(criadaBMs)) {
      return 1;
    }

    return String(a.id || "").localeCompare(String(b.id || ""), "pt-BR");
  });
}

function normalizarCampanhaRealtime(
  row: unknown
): CampanhaDisparoAndamento | null {
  if (!row || typeof row !== "object") return null;

  const campanha = row as CampanhaDisparoRealtimeRow;
  const id = textoCampanha(campanha.id);

  if (!id) return null;

  const total = inteiroCampanha(campanha.total_itens);
  const enviadosAceitos = inteiroCampanha(campanha.total_enviados);
  const falhas = inteiroCampanha(campanha.total_falhas);
  const cancelados = inteiroCampanha(campanha.total_cancelados);
  const pendentes = inteiroCampanha(campanha.total_pendentes);
  const processando = inteiroCampanha(campanha.total_processando);
  const metadata =
    campanha.metadata_json &&
    typeof campanha.metadata_json === "object" &&
    !Array.isArray(campanha.metadata_json)
      ? (campanha.metadata_json as Record<string, unknown>)
      : {};
  const retomarEm = String(
    metadata.rate_limit_131048_ate || ""
  ).trim();
  const retomarMs = retomarEm ? new Date(retomarEm).getTime() : 0;
  const aguardandoMeta =
    Number.isFinite(retomarMs) && retomarMs > Date.now();

  return {
    id,
    nome: textoCampanha(campanha.nome),
    integracao_whatsapp_id: textoCampanha(campanha.integracao_whatsapp_id),
    usuario_id: textoCampanha(campanha.usuario_id),
    status: textoCampanha(campanha.status),
    template_nome: textoCampanha(campanha.template_nome),
    total,
    // A tabela da campanha é a fonte de verdade para o card em tempo real.
    // Os contadores são atualizados pela reconciliação agregada dos callbacks,
    // evitando polling e RPCs repetidas no navegador.
    enviados: enviadosAceitos,
    aguardando_confirmacao: processando,
    falhas,
    cancelados,
    pendentes,
    processando,
    processados: Math.min(
      total,
      enviadosAceitos + falhas + cancelados
    ),
    motivo: motivoCampanhaRealtime(campanha),
    aguardando_meta: aguardandoMeta,
    aguardando_meta_codigo: aguardandoMeta ? 131048 : null,
    aguardando_meta_retomar_em: aguardandoMeta ? retomarEm : null,
    created_at: textoCampanha(campanha.created_at),
    updated_at: textoCampanha(campanha.updated_at),
    started_at: textoCampanha(campanha.started_at),
    paused_at: textoCampanha(campanha.paused_at),
    finished_at: textoCampanha(campanha.finished_at),
  };
}

function progressoCampanha(campanha: CampanhaDisparoAndamento) {
  const total = inteiroCampanha(campanha.total);

  if (!total) return 0;

  const processados = Math.min(
    total,
    Math.max(
      inteiroCampanha(campanha.processados),
      inteiroCampanha(campanha.enviados) + inteiroCampanha(campanha.falhas)
    )
  );

  return Math.max(4, Math.min(100, Math.round((processados / total) * 100)));
}

function rotuloStatusCampanha(campanha: CampanhaDisparoAndamento) {
  if (campanhaAguardandoMeta(campanha)) return "Aguardando Meta";
  if (campanhaEstaAtiva(campanha)) return "Processando";
  if (campanhaFoiConcluidaComSucesso(campanha)) return "Concluído";
  if (campanhaFoiConcluida(campanha)) return "Concluído com falhas";
  return "Interrompido";
}

function descricaoCampanhaTerminal(campanha: CampanhaDisparoAndamento) {
  if (campanhaFoiConcluidaComSucesso(campanha)) {
    return "Disparo em massa finalizado com sucesso.";
  }

  if (campanhaFoiConcluida(campanha)) {
    return `Finalizado com ${inteiroCampanha(campanha.falhas)} falha(s) e ${inteiroCampanha(
      campanha.cancelados
    )} cancelado(s).`;
  }

  return (
    campanha.motivo ||
    "Disparo em massa interrompido pelo sistema de segurança."
  );
}

function rotuloResultadoCampanha(campanha: CampanhaDisparoAndamento) {
  if (campanhaFoiConcluidaComSucesso(campanha)) return "Concluído";
  if (campanhaFoiConcluida(campanha)) return "Concluído com falhas";
  if (String(campanha.status || "") === "cancelada") return "Cancelado";
  return "Interrompido";
}

function criarCampanhaPaginaTeste(
  modo: string,
  integracaoWhatsappId?: string | null
): CampanhaDisparoAndamento | null {
  const valor = modo.trim().toLowerCase();

  if (!valor || valor === "off" || valor === "false") return null;

  if (valor === "success" || valor === "sucesso" || valor === "concluida") {
    return {
      id: "teste-pagina-disparo-sucesso",
      integracao_whatsapp_id: integracaoWhatsappId || null,
      status: "concluida",
      template_nome: "teste_visual",
      total: 250,
      enviados: 244,
      falhas: 6,
      cancelados: 0,
      pendentes: 0,
      processando: 0,
      processados: 250,
      motivo: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    };
  }

  if (
    valor === "paused" ||
    valor === "pausado" ||
    valor === "breaker" ||
    valor === "erro"
  ) {
    return {
      id: "teste-pagina-disparo-pausado",
      integracao_whatsapp_id: integracaoWhatsappId || null,
      status: "pausada_por_falhas",
      template_nome: "teste_visual",
      total: 250,
      enviados: 87,
      falhas: 14,
      cancelados: 149,
      pendentes: 149,
      processando: 0,
      processados: 101,
      motivo:
        "Campanha pausada automaticamente porque muitas mensagens falharam no ultimo lote.",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      paused_at: new Date().toISOString(),
    };
  }

  return {
    id: "teste-pagina-disparo-ativo",
    integracao_whatsapp_id: integracaoWhatsappId || null,
    status: "enviando",
    template_nome: "teste_visual",
    total: 250,
    enviados: 72,
    falhas: 2,
    cancelados: 0,
    pendentes: 175,
    processando: 1,
    processados: 74,
    motivo: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
  };
}

function valorNumericoHistorico(...valores: unknown[]) {
  for (const valor of valores) {
    const numero = Number(valor);

    if (Number.isFinite(numero)) {
      return Math.max(0, Math.trunc(numero));
    }
  }

  return 0;
}

function historicoEhCampanhaPausada(item: ResultadoDisparo) {
  const metadata = normalizarMetadataJson(item.metadata_json);

  return (
    item.origem_historico === "campanha_pausada" ||
    metadata?.tipo === "campanha_disparo_pausada"
  );
}

function obterTotaisCampanhaPausada(item: ResultadoDisparo) {
  const metadata = normalizarMetadataJson(item.metadata_json) || {};

  const totalItens = valorNumericoHistorico(
    item.total_itens,
    metadata.total_itens
  );
  const totalEnviados = valorNumericoHistorico(
    item.total_enviados,
    metadata.total_enviados
  );
  const totalFalhas = valorNumericoHistorico(
    item.total_falhas,
    metadata.total_falhas
  );
  const totalCanceladosDireto = valorNumericoHistorico(
    item.total_cancelados,
    metadata.total_cancelados
  );
  const totalCanceladosCalculado = Math.max(
    totalItens - totalEnviados - totalFalhas,
    0
  );

  return {
    totalItens,
    totalEnviados,
    totalFalhas,
    totalCancelados: Math.max(totalCanceladosDireto, totalCanceladosCalculado),
  };
}

function obterTituloCampanhaPausada(item: ResultadoDisparo) {
  if (item.campanha_nome) return item.campanha_nome;

  const totais = obterTotaisCampanhaPausada(item);
  const data = formatarDataHora(item.created_at) || "data não informada";
  const unidade = totais.totalItens === 1 ? "contato" : "contatos";

  return `Disparo em massa dia: ${data}, ${totais.totalItens} ${unidade}`;
}

function obterMotivoCampanhaPausada(item: ResultadoDisparo) {
  const metadata = normalizarMetadataJson(item.metadata_json) || {};
  const motivoMetadata =
    typeof metadata.pausa_motivo === "string" ? metadata.pausa_motivo : "";

  return (
    item.pausa_motivo ||
    item.erro_amigavel ||
    item.erro ||
    motivoMetadata ||
    "O disparo em massa foi cancelado automaticamente para proteger a conta WhatsApp e a estabilidade do sistema."
  );
}

function obterCategoriaHistorico(item: ResultadoDisparo) {
  const metadata = normalizarMetadataJson(item.metadata_json) || {};

  return (
    item.template_categoria ||
    item.categoria ||
    metadata.template_categoria ||
    metadata.categoria ||
    metadata.template?.category ||
    metadata.template?.categoria ||
    null
  );
}

function obterStatusCampanhaPausada(item: ResultadoDisparo) {
  const metadata = normalizarMetadataJson(item.metadata_json) || {};
  const status = String(item.status_campanha || metadata.status_campanha || "");

  switch (status) {
    case "pausada_por_conta_bloqueada":
      return "Cancelado por bloqueio da Meta";
    case "pausada_por_lista_invalida":
      return "Cancelado por lista inválida";
    case "pausada_por_erro_meta":
      return "Cancelado por erro da Meta";
    case "pausada_por_falhas":
      return "Cancelado por muitas falhas";
    case "cancelada":
      return "Disparo em massa cancelado";
    default:
      return item.status_label || "Disparo em massa cancelado";
  }
}

function normalizarStatusDisparo(item: ResultadoDisparo) {
  return String(item.status_disparo || "").toLowerCase().trim();
}

function disparoEstaProcessando(item: ResultadoDisparo) {
  return normalizarStatusDisparo(item) === "processando";
}

function disparoTeveSucesso(item: ResultadoDisparo) {
  return item.ok === true || normalizarStatusDisparo(item) === "sucesso";
}

function disparoTeveFalha(item: ResultadoDisparo) {
  if (historicoEhCampanhaPausada(item)) return true;

  const status = normalizarStatusDisparo(item);

  if (status === "processando") return false;
  if (status === "sucesso") return false;

  return item.ok === false || status === "falha";
}


const ITENS_HISTORICO_POR_PAGINA = 7;
const ITENS_RELATORIO_CAMPANHA_POR_PAGINA = 50;

export default function DisparosWhatsAppPage() {
  const supabaseRealtimeRef = useRef<ReturnType<typeof createClient> | null>(
    null
  );
  const historicoConsultaAtivaRef = useRef("");
  const contatosConsultaAtivaRef = useRef(0);
  const carregandoResultadosConclusaoRef = useRef(false);
  const [usuarioLogado, setUsuarioLogado] = useState<UsuarioLogado | null>(null);

  const [integracoes, setIntegracoes] = useState<IntegracaoWhatsApp[]>([]);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [contatos, setContatos] = useState<ContatoOpcao[]>([]);
  const [contatosSelecionados, setContatosSelecionados] = useState<ContatoOpcao[]>([]);
  // CRM_BULK_CONTACT_SELECTION_V4
  const [quantidadeAdicionarContatos, setQuantidadeAdicionarContatos] = useState("");
  const [quantidadeRemoverContatos, setQuantidadeRemoverContatos] = useState("");
  const [adicionandoContatosEmMassa, setAdicionandoContatosEmMassa] = useState(false);
  const [refreshContatosNonce, setRefreshContatosNonce] = useState(0);

  const [loadingUsuario, setLoadingUsuario] = useState(true);
  const [loadingIntegracoes, setLoadingIntegracoes] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingContatos, setLoadingContatos] = useState(false);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [loadingSaudeMeta, setLoadingSaudeMeta] = useState(false);
  const [disparando, setDisparando] = useState(false);
  const [
    integracaoPreparandoEmSegundoPlanoId,
    setIntegracaoPreparandoEmSegundoPlanoId,
  ] = useState("");
  const [cancelandoCampanha, setCancelandoCampanha] = useState(false);
  const [modalCancelarCampanhaAberto, setModalCancelarCampanhaAberto] =
    useState(false);
  const [disparoEmMassaProcessando, setDisparoEmMassaProcessando] =
    useState(false);
  const [integracaoDisparoProcessando, setIntegracaoDisparoProcessando] =
    useState(false);
  const [campanhaPagina, setCampanhaPagina] =
    useState<CampanhaDisparoAndamento | null>(null);
  const [campanhasPagina, setCampanhasPagina] = useState<
    CampanhaDisparoAndamento[]
  >([]);
  const [modalCampanhaAberto, setModalCampanhaAberto] = useState(false);
  const [carregandoConclusaoDisparo, setCarregandoConclusaoDisparo] = useState(false);
  const [campanhasResultadoConclusao, setCampanhasResultadoConclusao] =
    useState<CampanhaDisparoAndamento[]>([]);
  const [campanhaResultadoConclusaoId, setCampanhaResultadoConclusaoId] =
    useState("");
  const [
    modalResultadoConclusaoAberto,
    setModalResultadoConclusaoAberto,
  ] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<"disparo" | "resultados">("resultados");
  const [modalCriacaoDisparoAberto, setModalCriacaoDisparoAberto] = useState(false);
  const [etapaDisparo, setEtapaDisparo] = useState<1 | 2 | 3 | 4>(1);
  const [quantidadePlanejada, setQuantidadePlanejada] = useState("");
  const [contatosReservaAtivos, setContatosReservaAtivos] = useState(false);
  const [campoPendente, setCampoPendente] = useState("");
  const [planoCapacidadeConfirmado, setPlanoCapacidadeConfirmado] = useState<"imediato" | "agendado" | null>(null);
  const [totalContatosDisponiveis, setTotalContatosDisponiveis] = useState(0);
  const [limiteMeta, setLimiteMeta] = useState<LimiteMeta | null>(null);

  const [integracaoId, setIntegracaoId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [templateVariavel1, setTemplateVariavel1] = useState("");
  const [templateVariavel2, setTemplateVariavel2] = useState("");
  const [templateVariavel3, setTemplateVariavel3] = useState("");
  const [templateVariavel4, setTemplateVariavel4] = useState("");
  const [templateVariavel5, setTemplateVariavel5] = useState("");
  const [templateVariavel6, setTemplateVariavel6] = useState("");
  const [nomeCampanhaDisparo, setNomeCampanhaDisparo] = useState("");
  const [agendarDisparo, setAgendarDisparo] = useState(false);
  const [agendamentoData, setAgendamentoData] = useState("");
  const [agendamentoHora, setAgendamentoHora] = useState("");
  const [buscaContato, setBuscaContato] = useState("");
  const [origemFiltro, setOrigemFiltro] = useState("");
  const [origensDisponiveis, setOrigensDisponiveis] = useState<string[]>([]);

  const [campanhaFiltro, setCampanhaFiltro] = useState("");
  const [campanhasDisponiveis, setCampanhasDisponiveis] = useState<string[]>([]);
  const [listasDisponiveis, setListasDisponiveis] = useState<ListaContatoFiltro[]>([]);
  const [interesseFiltro, setInteresseFiltro] = useState("");
  const [interessesDisponiveis, setInteressesDisponiveis] = useState<string[]>([]);
  const [classificacaoFiltro, setClassificacaoFiltro] = useState("");
  const [disparoAnteriorFiltroContatos, setDisparoAnteriorFiltroContatos] =
    useState("");
  const [telefoneRevisarFiltro, setTelefoneRevisarFiltro] = useState("");
  const [atendentesDisponiveis, setAtendentesDisponiveis] = useState<
    AtendenteFiltro[]
  >([]);
  const [mensagemDataInicioFiltro, setMensagemDataInicioFiltro] = useState("");
  const [mensagemDataFimFiltro, setMensagemDataFimFiltro] = useState("");
  const [ultimoAtendenteFiltro, setUltimoAtendenteFiltro] = useState("");
  const [optInFiltro, setOptInFiltro] = useState("");
  const [optOutFiltro, setOptOutFiltro] = useState("");
  const [somenteIntegracaoFiltro, setSomenteIntegracaoFiltro] = useState(false);
  const [filtrosAvancadosAbertos, setFiltrosAvancadosAbertos] = useState(false);

  const [mensagem, setMensagem] = useState("");
  const [limiteContatosToast, setLimiteContatosToast] = useState("");
  const [erro, setErro] = useState("");
  const [erroConflitos, setErroConflitos] = useState("");
  const [resultado, setResultado] = useState<ResultadoDisparo[]>([]);
  const [totaisHistorico, setTotaisHistorico] = useState<TotaisHistorico>({
    total: 0,
    sucesso: 0,
    processando: 0,
    falha: 0,
  });
  const [historicoTemMais, setHistoricoTemMais] = useState(false);
  const [exportandoRelatorioCampanha, setExportandoRelatorioCampanha] =
    useState(false);
  const [modalRelatorioAcumuladoAberto, setModalRelatorioAcumuladoAberto] =
    useState(false);
  const [campanhasRelatorioAcumuladoIds, setCampanhasRelatorioAcumuladoIds] =
    useState<string[]>([]);
  const [buscaRelatorioAcumulado, setBuscaRelatorioAcumulado] = useState("");
  const [diaRelatorioAcumulado, setDiaRelatorioAcumulado] = useState("");
  const [integracaoRelatorioAcumulado, setIntegracaoRelatorioAcumulado] =
    useState("");
  const [templateRelatorioAcumulado, setTemplateRelatorioAcumulado] =
    useState("");
  const [exportandoRelatorioAcumulado, setExportandoRelatorioAcumulado] =
    useState(false);
  const [loadingRelatorioCampanhaDetalhado, setLoadingRelatorioCampanhaDetalhado] =
    useState(false);
  const [relatorioCampanhaDetalhado, setRelatorioCampanhaDetalhado] =
    useState<RelatorioCampanhaDetalhado | null>(null);
  const [paginaRelatorioCampanha, setPaginaRelatorioCampanha] = useState(1);
  const [filtroRelatorioCampanha, setFiltroRelatorioCampanha] =
    useState<FiltroRelatorioCampanha>("todos");
  const [campanhasHistorico, setCampanhasHistorico] = useState<
    CampanhaHistoricoFiltro[]
  >([]);
  const [mensagensExpandidas, setMensagensExpandidas] = useState<string[]>([]);
  const [falhaModal, setFalhaModal] = useState<(FalhaAgrupadaCampanha & { campanhaNome: string }) | null>(null);
  const [paginaHistorico, setPaginaHistorico] = useState(1);

  const [confirmacaoCobranca, setConfirmacaoCobranca] = useState(false);
  const [
    modalResponsabilidadeListaFriaAberto,
    setModalResponsabilidadeListaFriaAberto,
  ] = useState(false);
  const [
    confirmacaoResponsabilidadeListaFria,
    setConfirmacaoResponsabilidadeListaFria,
  ] = useState(false);
  const [modalVariaveisAberto, setModalVariaveisAberto] = useState(false);
  const [variaveisPersonalizadas, setVariaveisPersonalizadas] = useState<
    VariavelPersonalizada[]
  >([]);
  const [loadingVariaveis, setLoadingVariaveis] = useState(false);
  const [salvandoVariavel, setSalvandoVariavel] = useState(false);
  const [erroVariavelModal, setErroVariavelModal] = useState("");
  const [novaVariavelChave, setNovaVariavelChave] = useState("");
  const [novaVariavelValor, setNovaVariavelValor] = useState("");
  const [novaVariavelDescricao, setNovaVariavelDescricao] = useState("");

  const [filtroHistorico, setFiltroHistorico] = useState<
    "todos" | "sucesso" | "falha" | "processando"
  >("todos");
  const [buscaHistorico, setBuscaHistorico] = useState("");
  const [buscaHistoricoConsulta, setBuscaHistoricoConsulta] = useState("");
  const [filtroHistoricoIntegracao, setFiltroHistoricoIntegracao] = useState("");
  const [filtroHistoricoCampanha, setFiltroHistoricoCampanha] = useState("");

  const selecionarRelatorioCampanha = useCallback((campanhaId: string) => {
    const id = campanhaId.trim();
    const url = new URL(window.location.href);
    const idAtual = url.searchParams.get(PARAMETRO_RELATORIO_DISPAROS) || "";

    if (!id && idAtual && window.history.state?.[MARCADOR_HISTORICO_RELATORIO]) {
      window.history.back();
      return;
    }

    if (id) url.searchParams.set(PARAMETRO_RELATORIO_DISPAROS, id);
    else url.searchParams.delete(PARAMETRO_RELATORIO_DISPAROS);

    if (id !== idAtual) {
      const novoEndereco = `${url.pathname}${url.search}${url.hash}`;
      if (id && !idAtual) {
        window.history.pushState(
          { ...window.history.state, [MARCADOR_HISTORICO_RELATORIO]: true },
          "",
          novoEndereco
        );
      } else {
        window.history.replaceState(window.history.state, "", novoEndereco);
      }
    }

    setFiltroHistoricoCampanha(id);
    setPaginaRelatorioCampanha(1);
    setBuscaHistorico("");
    setErro("");
  }, []);

  useEffect(() => {
    const atualizarFiltroPelaNavegacao = () => {
      const id = new URLSearchParams(window.location.search)
        .get(PARAMETRO_RELATORIO_DISPAROS) || "";
      setFiltroHistoricoCampanha(id);
      setPaginaRelatorioCampanha(1);
      setBuscaHistorico("");
    };
    atualizarFiltroPelaNavegacao();
    window.addEventListener("popstate", atualizarFiltroPelaNavegacao);
    return () => window.removeEventListener("popstate", atualizarFiltroPelaNavegacao);
  }, []);

  const [loadingConflitos, setLoadingConflitos] = useState(false);

  const [gruposConflitoDisparo, setGruposConflitoDisparo] = useState<
    GrupoConflitoDisparo[]
  >([]);
  const [conflitosPorContato, setConflitosPorContato] = useState<
    Record<string, CampanhaConflitoContato[]>
  >({});

  const [historicoDisparosPorContato, setHistoricoDisparosPorContato] = useState<
    Record<string, CampanhaConflitoContato[]>
  >({});

  const [decisoesConflitoDisparo, setDecisoesConflitoDisparo] = useState<
    Record<string, DecisaoConflitoDisparo>
  >({});

  const [previewCusto, setPreviewCusto] = useState<{
    categoria: string;
    totalSelecionados: number;
    totalIsentos: number;
    totalCobrados: number;
    totalTelefonesIsentosUnicos: number;
    totalTelefonesCobradosUnicos: number;
    totalTelefonesConsomemLimiteUnicos: number;
    totalTelefonesIsentosLimiteUnicos: number;
    valorUnitarioUsd: number;
    valorTotalUsd: number;
    cotacaoUsdBrl: number;
    valorTotalBrlEstimado: number;
    valorTotalBrlMin: number;
    valorTotalBrlMax: number;
    margemMinPercent: number;
    margemMaxPercent: number;
    fonteCotacao?: string;
    cotacaoDataHora?: string | null;
    cotacaoFallback?: boolean;
    disponibilidadeAgendamentoMeta?: {
      disponivel: boolean;
      impossivel: boolean;
      horarioConsultado: string;
      disponivelApartirDe: string | null;
      limite: number;
      selecionadosUnicos: number;
      usadosNoHorario: number;
      ocupadosPorOutros: number;
      totalProjetado: number;
      capacidadeDisponivelAgora: number;
      capacidadeDisponivelNoHorario: number;
      selecionadosJaOcupadosNoHorario: number;
      novosNecessariosNoHorario: number;
      liberacoes: Array<{
        horario: string;
        quantidadeLiberada: number;
        disponivelAcumulado: number;
      }>;
    } | null;
  } | null>(null);

  const [loadingPreviewCusto, setLoadingPreviewCusto] = useState(false);
  const previewCustoRequisicaoRef = useRef(0);

  function getSupabaseRealtime() {
    if (!supabaseRealtimeRef.current) {
      supabaseRealtimeRef.current = createClient();
    }

    return supabaseRealtimeRef.current;
  }

  const carregarResultadosConclusao = useCallback(async (mostrarTransicao = false) => {
    if (carregandoResultadosConclusaoRef.current) return;

    carregandoResultadosConclusaoRef.current = true;
    if (mostrarTransicao) setCarregandoConclusaoDisparo(true);

    try {
      const response = await fetch(
        "/api/whatsapp/disparos/resultados-pendentes",
        { cache: "no-store" }
      );
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        campanhas?: CampanhaDisparoAndamento[];
      };

      if (!response.ok || data.ok === false) return;

      const novas = (Array.isArray(data.campanhas) ? data.campanhas : [])
        .filter((campanha) => Boolean(campanha?.id));

      if (novas.length === 0) return;

      setCampanhasResultadoConclusao((atuais) => {
        const porId = new Map(
          atuais.map((campanha) => [campanha.id, campanha])
        );

        novas.forEach((campanha) => {
          porId.set(campanha.id, campanha);
        });

        return Array.from(porId.values()).sort((a, b) => {
          const dataA = Date.parse(
            String(a.finished_at || a.paused_at || a.updated_at || "")
          );
          const dataB = Date.parse(
            String(b.finished_at || b.paused_at || b.updated_at || "")
          );

          if (Number.isFinite(dataA) && Number.isFinite(dataB)) {
            return dataA - dataB;
          }

          return String(a.id).localeCompare(String(b.id), "pt-BR");
        });
      });

      setCampanhaResultadoConclusaoId((atual) => atual || novas[0].id);
      setModalCampanhaAberto(false);
      setModalResultadoConclusaoAberto(true);
    } finally {
      carregandoResultadosConclusaoRef.current = false;
      if (mostrarTransicao) setCarregandoConclusaoDisparo(false);
    }
  }, []);

  const fecharModalResultadoConclusao = useCallback(() => {
    setModalResultadoConclusaoAberto(false);
    setCampanhasResultadoConclusao([]);
    setCampanhaResultadoConclusaoId("");
  }, []);

  const aplicarCampanhaPagina = useCallback(
    (campanhaAtual: CampanhaDisparoAndamento | null) => {
      if (campanhaAtual && !campanhaEstaAtiva(campanhaAtual)) {
        setCampanhasPagina((atuais) =>
          atuais.filter((campanha) => campanha.id !== campanhaAtual.id)
        );
        setCampanhaPagina((atual) =>
          atual?.id === campanhaAtual.id ? null : atual
        );
        setModalCampanhaAberto(false);
        return;
      }

      if (campanhaAtual) {
        setCampanhasPagina((atuais) => {
          const restantes = atuais.filter(
            (campanha) => campanha.id !== campanhaAtual.id
          );
          return ordenarCampanhasPaginaPorCriacao([
            campanhaAtual,
            ...restantes,
          ]).slice(0, 25);
        });
      }

      setCampanhaPagina((atual) => {
        if (!campanhaAtual) return null;
        if (!atual || atual.id !== campanhaAtual.id) return campanhaAtual;

        const atualMs = new Date(atual.updated_at || 0).getTime();
        const novoMs = new Date(campanhaAtual.updated_at || 0).getTime();

        if (
          Number.isFinite(atualMs) &&
          Number.isFinite(novoMs) &&
          atualMs > 0 &&
          novoMs > 0 &&
          novoMs < atualMs
        ) {
          return atual;
        }

        return campanhaAtual;
      });
    },
    []
  );

  const carregarCampanhaPagina = useCallback(
    async (integracaoWhatsappId = "", campanhaPreferidaId = "") => {
      const integracaoConsultaId = integracaoWhatsappId.trim();
      const campanhaPreferida = campanhaPreferidaId.trim();
      const params = new URLSearchParams();
      const campanhaTeste =
        typeof window !== "undefined"
          ? criarCampanhaPaginaTeste(
              window.localStorage.getItem(TESTE_CARD_PAGINA_DISPARO_KEY) || "",
              integracaoConsultaId || null
            )
          : null;

      if (campanhaTeste) {
        aplicarCampanhaPagina(campanhaTeste);
        return;
      }

      if (integracaoConsultaId) {
        params.set("integracao_id", integracaoConsultaId);
      } else {
        params.set("escopo", "empresa");
      }

      try {
        const res = await fetch(
          `/api/whatsapp/disparos/andamento?${params.toString()}`,
          {
            cache: "no-store",
          }
        );
        const json = (await res.json()) as DisparoAndamentoPayload;

        if (!res.ok || json.ok === false) return;

        const lista = ordenarCampanhasPaginaPorCriacao(
          (
            Array.isArray(json.campanhas)
              ? json.campanhas
              : json.campanha
              ? [json.campanha]
              : []
          ).filter(campanhaEstaAtiva)
        );

        if (integracaoConsultaId) {
          setCampanhasPagina((atuais) => {
            const semIntegracao = atuais.filter(
              (campanha) =>
                campanha.integracao_whatsapp_id !== integracaoConsultaId
            );
            return ordenarCampanhasPaginaPorCriacao([
              ...lista,
              ...semIntegracao,
            ]).slice(0, 25);
          });
        } else {
          setCampanhasPagina(lista);
        }

        setCampanhaPagina((atual) => {
          const preferida = campanhaPreferida
            ? lista.find((campanha) => campanha.id === campanhaPreferida) || null
            : null;
          const atualAtualizada = atual
            ? lista.find((campanha) => campanha.id === atual.id) || null
            : null;

          if (campanhaPreferida) {
            return preferida;
          }

          if (atualAtualizada) return atualAtualizada;

          if (integracaoConsultaId) {
            return atual && campanhaEstaAtiva(atual) ? atual : lista[0] || null;
          }

          return lista[0] || null;
        });

        if (
          lista.length === 0 ||
          (campanhaPreferida &&
            !lista.some((campanha) => campanha.id === campanhaPreferida))
        ) {
          setModalCampanhaAberto(false);
        }
      } catch {
        return;
      }
    },
    []
  );

  useEffect(() => {
    const abrirModalCampanha = (event?: Event) => {
      const campanhaIdEvento =
        (event as CustomEvent<{ campanhaId?: string }> | undefined)?.detail
          ?.campanhaId || "";

      setAbaAtiva("resultados");
      setModalCampanhaAberto(true);
      void carregarCampanhaPagina("", campanhaIdEvento);
    };

    const params = new URLSearchParams(window.location.search);
    const campanhaParam = params.get("campanha") || "";

    if (campanhaParam) {
      const campanhaId = campanhaParam === "1" ? "" : campanhaParam;
      setAbaAtiva("resultados");
      setModalCampanhaAberto(true);
      void carregarCampanhaPagina("", campanhaId);

      params.delete("campanha");
      const query = params.toString();
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`
      );
    }

    window.addEventListener("crm:whatsapp-disparo-abrir", abrirModalCampanha);

    return () => {
      window.removeEventListener(
        "crm:whatsapp-disparo-abrir",
        abrirModalCampanha
      );
    };
  }, [carregarCampanhaPagina]);

  const carregarRelatorioCampanhaDetalhado = useCallback(
    async (campanhaId: string) => {
      const id = campanhaId.trim();

      if (!id) {
        setRelatorioCampanhaDetalhado(null);
        return;
      }

      try {
        setLoadingRelatorioCampanhaDetalhado(true);

        const params = new URLSearchParams({
          campanha_id: id,
          formato: "json",
        });
        const res = await fetch(
          `/api/whatsapp/disparos/relatorio?${params.toString()}`,
          { cache: "no-store" }
        );
        const json = await res.json();

        if (!res.ok || !json.ok) {
          throw new Error(
            json?.error || "Não foi possível carregar o relatório da campanha."
          );
        }

        setRelatorioCampanhaDetalhado({
          campanha: json.campanha,
          totais: json.totais,
          custo_estimado: json.custo_estimado,
          linhas: Array.isArray(json.linhas) ? json.linhas : [],
        });
      } catch (error) {
        setRelatorioCampanhaDetalhado(null);
        setErro(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar o relatório da campanha."
        );
      } finally {
        setLoadingRelatorioCampanhaDetalhado(false);
      }
    },
    []
  );


  function abrirModalRelatorioAcumulado() {
    setCampanhasRelatorioAcumuladoIds([]);
    setBuscaRelatorioAcumulado("");
    setDiaRelatorioAcumulado("");
    setIntegracaoRelatorioAcumulado("");
    setTemplateRelatorioAcumulado("");
    setModalRelatorioAcumuladoAberto(true);
  }

  function alternarCampanhaRelatorioAcumulado(campanhaId: string) {
    setCampanhasRelatorioAcumuladoIds((atuais) =>
      atuais.includes(campanhaId)
        ? atuais.filter((id) => id !== campanhaId)
        : [...atuais, campanhaId]
    );
  }

  function alternarTodasCampanhasRelatorioAcumulado(
    campanhasVisiveis: CampanhaHistoricoFiltro[]
  ) {
    if (!campanhasVisiveis.length) return;

    const idsVisiveis = campanhasVisiveis.map((campanha) => campanha.id);

    setCampanhasRelatorioAcumuladoIds((atuais) => {
      const selecionadas = new Set(atuais);
      const todasSelecionadas = idsVisiveis.every((id) =>
        selecionadas.has(id)
      );

      if (todasSelecionadas) {
        idsVisiveis.forEach((id) => selecionadas.delete(id));
      } else {
        idsVisiveis.forEach((id) => selecionadas.add(id));
      }

      return Array.from(selecionadas);
    });
  }

  async function gerarRelatorioExcelAcumulado() {
    if (
      campanhasRelatorioAcumuladoIds.length < 2 ||
      exportandoRelatorioAcumulado
    ) {
      return;
    }

    try {
      setExportandoRelatorioAcumulado(true);
      setErro("");
      setMensagem("");

      const res = await fetch("/api/whatsapp/disparos/relatorio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campanha_ids: campanhasRelatorioAcumuladoIds,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(
          json?.error || "Não foi possível gerar o relatório acumulado."
        );
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get("Content-Disposition") || "";
      const nomeUtf8 = contentDisposition.match(
        /filename\*=UTF-8''([^;]+)/i
      )?.[1];
      const nomeSimples = contentDisposition.match(
        /filename="?([^";]+)"?/i
      )?.[1];
      const nomeArquivo = nomeUtf8
        ? decodeURIComponent(nomeUtf8)
        : nomeSimples || "relatorio-acumulado-disparos.xlsx";

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = nomeArquivo;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setModalRelatorioAcumuladoAberto(false);
      setMensagem(
        `Relatório acumulado de ${campanhasRelatorioAcumuladoIds.length} campanhas gerado com sucesso.`
      );
    } catch (error: any) {
      setErro(
        error?.message || "Não foi possível gerar o relatório acumulado."
      );
    } finally {
      setExportandoRelatorioAcumulado(false);
    }
  }

  async function gerarRelatorioExcelCampanha() {
    if (!filtroHistoricoCampanha || exportandoRelatorioCampanha) {
      if (!filtroHistoricoCampanha) {
        setErro("Selecione um disparo em massa para gerar o relatório.");
      }
      return;
    }

    try {
      setExportandoRelatorioCampanha(true);
      setErro("");
      setMensagem("");

      const params = new URLSearchParams({
        campanha_id: filtroHistoricoCampanha,
      });

      const res = await fetch(
        `/api/whatsapp/disparos/relatorio?${params.toString()}`,
        {
          cache: "no-store",
        }
      );

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(
          json?.error || "Não foi possível gerar o relatório da campanha."
        );
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get("Content-Disposition") || "";
      const nomeUtf8 = contentDisposition.match(
        /filename\*=UTF-8''([^;]+)/i
      )?.[1];
      const nomeSimples = contentDisposition.match(
        /filename="?([^";]+)"?/i
      )?.[1];
      const nomeArquivo = nomeUtf8
        ? decodeURIComponent(nomeUtf8)
        : nomeSimples || "relatorio-campanha-whatsapp.xlsx";

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = nomeArquivo;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setMensagem("Relatório Excel da campanha gerado com sucesso.");
    } catch (error: any) {
      setErro(
        error?.message || "Não foi possível gerar o relatório da campanha."
      );
    } finally {
      setExportandoRelatorioCampanha(false);
    }
  }

  async function carregarUsuarioLogado() {
    try {
      setLoadingUsuario(true);

      const res = await fetch("/api/me", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erro ao carregar usuário logado.");
      }

      setUsuarioLogado(data.usuario || null);
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar usuário logado.");
    } finally {
      setLoadingUsuario(false);
    }
  }

  async function carregarIntegracoes() {
    try {
      setLoadingIntegracoes(true);
      setErro("");

      const res = await fetch("/api/integracoes-whatsapp/listar", {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar integrações.");
      }

      const lista = Array.isArray(json.data) ? json.data : [];
      setIntegracoes(lista);
      setIntegracaoId((integracaoAtual) => {
        if (lista.length === 1) return String(lista[0].id || "");

        return lista.some(
          (integracao: IntegracaoWhatsApp) =>
            integracao.id === integracaoAtual
        )
          ? integracaoAtual
          : "";
      });
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar integrações.");
    } finally {
      setLoadingIntegracoes(false);
    }
  }

  async function carregarTemplates(integracaoSelecionadaId: string) {
    try {
      if (!integracaoSelecionadaId) {
        setTemplates([]);
        return;
      }

      setLoadingTemplates(true);
      setErro("");

      const res = await fetch(
        `/api/whatsapp/templates?integracao_whatsapp_id=${encodeURIComponent(
          integracaoSelecionadaId
        )}`,
        { cache: "no-store" }
      );

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar templates.");
      }

      const lista = Array.isArray(json.data) ? json.data : [];
      const aprovados = lista.filter(
        (item: WhatsAppTemplate) => item.status?.toUpperCase() === "APPROVED"
      );
      

      setTemplates(aprovados);
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar templates.");
    } finally {
      setLoadingTemplates(false);
    }
  }

  const carregarContatos = useCallback(
    async (filtros: FiltrosConsultaContatos = {}) => {
      const requisicaoId = ++contatosConsultaAtivaRef.current;
      const {
        busca = "",
        origem = "",
        campanha = "",
        interesse = "",
        classificacao = "",
        disparoAnteriorId = "",
        telefoneRevisar = "",
        mensagemDataInicio = "",
        mensagemDataFim = "",
        ultimoAtendenteId = "",
        optIn = "",
        optOut = "",
        somenteIntegracao = false,
      } = filtros;

      try {
        setLoadingContatos(true);
        setErro("");

        const params = new URLSearchParams();

        if (busca.trim()) {
          params.set("busca", busca.trim());
        }

        const listaIdDaOrigem = origem.startsWith("lista:")
          ? origem.replace("lista:", "").trim()
          : "";

        if (listaIdDaOrigem) {
          params.set("lista_id", listaIdDaOrigem);
        } else if (origem.trim()) {
          params.set("origem", origem.trim());
        }

        if (campanha.trim()) {
          params.set("campanha", campanha.trim());
        }

        if (interesse.trim()) {
          params.set("interesse", interesse.trim());
        }

        if (classificacao.trim()) {
          params.set("classificacoes", classificacao.trim());
        }

        if (disparoAnteriorId.trim()) {
          params.set("disparo_anterior_id", disparoAnteriorId.trim());
        }

        if (telefoneRevisar === "true" || telefoneRevisar === "false") {
          params.set("telefone_revisar", telefoneRevisar);
        }

        if (integracaoId) {
          params.set("integracao_whatsapp_id", integracaoId);
        }

        if (integracaoId && somenteIntegracao) {
          params.set("filtrar_por_integracao", "true");
        }

        if (mensagemDataInicio) {
          params.set("mensagem_data_inicio", mensagemDataInicio);
        }

        if (mensagemDataFim) {
          params.set("mensagem_data_fim", mensagemDataFim);
        }

        if (ultimoAtendenteId) {
          params.set("ultimo_atendente_id", ultimoAtendenteId);
        }

        if (integracaoId && optIn) {
          params.set("opt_in", optIn);
        }

        if (integracaoId && optOut) {
          params.set("opt_out", optOut);
        }

        params.set("pagina", "1");
        params.set("limite", "2000");
        params.set("contagem_otimizada", "true");

        let res: Response | null = null;
        let json: any = null;
        let ultimoErro: unknown = null;

        for (let tentativa = 0; tentativa < 2; tentativa += 1) {
          const controller = new AbortController();
          const timeoutId = window.setTimeout(
            () => controller.abort(),
            12_000
          );

          try {
            res = await fetch(`/api/contatos?${params.toString()}`, {
              cache: "no-store",
              signal: controller.signal,
            });

            json = await res.json().catch(() => ({}));

            if (res.ok) {
              ultimoErro = null;
              break;
            }

            ultimoErro = new Error(
              json?.error || `Erro ao carregar contatos (HTTP ${res.status}).`
            );

            if (res.status < 500 || tentativa === 1) {
              throw ultimoErro;
            }
          } catch (error) {
            ultimoErro = error;

            if (tentativa === 1) {
              throw error;
            }
          } finally {
            window.clearTimeout(timeoutId);
          }

          // Um único retry curto protege a experiência sem transformar
          // indisponibilidade do banco em avalanche de novas requisições.
          await new Promise((resolve) => window.setTimeout(resolve, 1_200));
        }

        if (!res?.ok) {
          throw (
            ultimoErro ||
            new Error("Não foi possível atualizar os contatos agora.")
          );
        }

        if (contatosConsultaAtivaRef.current !== requisicaoId) return;

        const lista = Array.isArray(json?.contatos) ? json.contatos : [];
        setContatos(lista);
        setTotalContatosDisponiveis(Number(json?.total || 0));
      } catch (error: any) {
        if (contatosConsultaAtivaRef.current !== requisicaoId) return;

        const detalhe =
          error?.name === "AbortError"
            ? "A consulta demorou mais que o esperado."
            : error?.message || "Erro ao carregar contatos.";

        setErro(
          `Não foi possível atualizar os contatos agora. A lista anterior foi mantida. ${detalhe}`
        );
      } finally {
        if (contatosConsultaAtivaRef.current === requisicaoId) {
          setLoadingContatos(false);
        }
      }
    },
    [integracaoId]
  );

  async function carregarOpcoesContatos() {
    try {
      const res = await fetch("/api/contatos/opcoes", {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar filtros de contatos.");
      }

      const origens = Array.isArray(json.origens)
        ? json.origens
            .map((origem: unknown) => String(origem || "").trim())
            .filter(Boolean)
        : [];

      setOrigensDisponiveis(
        origens.filter((origem: string) => !origem.startsWith("Importação - "))
      );
      setCampanhasDisponiveis(
        Array.isArray(json.campanhas) ? json.campanhas : []
      );
      setListasDisponiveis(
        Array.isArray(json.listas) ? json.listas : []
      );
      setInteressesDisponiveis(
        Array.isArray(json.interesses) ? json.interesses : []
      );
      setAtendentesDisponiveis(
        Array.isArray(json.atendentes) ? json.atendentes : []
      );
    } catch (error) {
      console.warn(
        "[DISPAROS WHATSAPP] Erro ao carregar filtros de contatos:",
        error
      );
    }
  }

  const carregarHistorico = useCallback(
    async (
      opcoes: {
        pagina?: number;
        forcar?: boolean;
        restaurarPagina?: boolean;
        silencioso?: boolean;
      } = {}
    ) => {
      const empresaId = usuarioLogado?.empresa_id;

      if (!empresaId) return;

      const forcar = opcoes.forcar ?? true;

      if (forcar) {
        invalidarHistoricoCacheEmpresa(empresaId);
      }

      const chaveConsulta = chaveConsultaHistorico(
        empresaId,
        filtroHistorico,
        filtroHistoricoIntegracao,
        filtroHistoricoCampanha,
        buscaHistoricoConsulta
      );
      let consultaCache = obterConsultaHistoricoCache(chaveConsulta);
      const paginaRestaurada =
        opcoes.restaurarPagina && consultaCache?.paginaAtual
          ? consultaCache.paginaAtual
          : 1;
      const paginaAlvo = Math.max(
        1,
        forcar ? 1 : opcoes.pagina || paginaRestaurada
      );
      const requisicaoId = `${chaveConsulta}:${paginaAlvo}:${Date.now()}`;
      historicoConsultaAtivaRef.current = requisicaoId;

      const campanhasCache = obterCampanhasHistoricoCache(empresaId);

      if (campanhasCache) {
        setCampanhasHistorico(campanhasCache);
      }

      const paginaCache = !forcar
        ? consultaCache?.paginas[String(paginaAlvo)]
        : null;

      if (paginaCache && campanhasCache) {
        consultaCache = {
          ...consultaCache!,
          paginaAtual: paginaAlvo,
          atualizadoEm: Date.now(),
        };
        salvarConsultaHistoricoCache(chaveConsulta, consultaCache);
        setResultado(
          ordenarHistoricoPorDataHoraDecrescente(paginaCache.resultados)
        );
        setHistoricoTemMais(paginaCache.temMais);
        setTotaisHistorico(
          consultaCache.totais || {
            total: paginaCache.resultados.length,
            sucesso: paginaCache.resultados.filter(disparoTeveSucesso).length,
            processando: paginaCache.resultados.filter(disparoEstaProcessando)
              .length,
            falha: paginaCache.resultados.filter(disparoTeveFalha).length,
          }
        );
        setPaginaHistorico(paginaAlvo);
        setLoadingHistorico(false);
        return;
      }

      const paginaAnterior =
        paginaAlvo > 1
          ? consultaCache?.paginas[String(paginaAlvo - 1)]
          : null;

      if (paginaAlvo > 1 && !paginaAnterior?.proximoCursor) {
        setHistoricoTemMais(false);
        return;
      }

      try {
        // Revalidacoes silenciosas preservam os cards visiveis:
        // nao substituimos a lista por "Carregando campanhas...".
        if (!opcoes.silencioso) setLoadingHistorico(true);

        const params = new URLSearchParams({
          limit: String(ITENS_HISTORICO_POR_PAGINA),
          status: filtroHistorico,
          somente_campanhas: "true",
        });

        if (paginaAnterior?.proximoCursor) {
          params.set("cursor", paginaAnterior.proximoCursor);
        }

        if (filtroHistoricoIntegracao) {
          params.set("integracao_whatsapp_id", filtroHistoricoIntegracao);
        }

        if (filtroHistoricoCampanha) {
          params.set("campanha_id", filtroHistoricoCampanha);
        }

        if (buscaHistoricoConsulta) {
          params.set("busca", buscaHistoricoConsulta);
        }

        if (!consultaCache?.totais) {
          params.set("incluir_totais", "true");
        }

        if (!campanhasCache) {
          params.set("incluir_campanhas", "true");
        }

        const res = await fetch(`/api/whatsapp/disparos/historico?${params}`, {
          cache: "no-store",
        });
        const json = await res.json();

        if (!res.ok || !json.ok) {
          throw new Error(
            json.error || "Erro ao carregar histórico de disparos."
          );
        }

        if (historicoConsultaAtivaRef.current !== requisicaoId) return;

        const resultadosPagina = Array.isArray(json.resultados)
          ? (json.resultados as ResultadoDisparo[])
          : [];
        const totaisRecebidos = json.totais
          ? {
              total: Number(json.totais.total || 0),
              sucesso: Number(json.totais.sucesso || 0),
              processando: Number(json.totais.processando || 0),
              falha: Number(json.totais.falha || 0),
            }
          : consultaCache?.totais || null;
        const novaConsulta: ConsultaHistoricoCache = {
          atualizadoEm: Date.now(),
          paginaAtual: paginaAlvo,
          paginas: {
            ...(consultaCache?.paginas || {}),
            [String(paginaAlvo)]: {
              resultados: resultadosPagina,
              temMais: json.tem_mais === true,
              proximoCursor:
                typeof json.proximo_cursor === "string"
                  ? json.proximo_cursor
                  : null,
            },
          },
          totais: totaisRecebidos,
        };

        salvarConsultaHistoricoCache(chaveConsulta, novaConsulta);

        if (Array.isArray(json.campanhas)) {
          const campanhas = json.campanhas as CampanhaHistoricoFiltro[];
          salvarCampanhasHistoricoCache(empresaId, campanhas);
          setCampanhasHistorico(campanhas);
        }

        setResultado(
          ordenarHistoricoPorDataHoraDecrescente(resultadosPagina)
        );
        setHistoricoTemMais(json.tem_mais === true);
        setTotaisHistorico(
          totaisRecebidos || {
            total: resultadosPagina.length,
            sucesso: resultadosPagina.filter(disparoTeveSucesso).length,
            processando: resultadosPagina.filter(disparoEstaProcessando).length,
            falha: resultadosPagina.filter(disparoTeveFalha).length,
          }
        );
        setPaginaHistorico(paginaAlvo);
      } catch (error) {
        if (historicoConsultaAtivaRef.current !== requisicaoId) return;

        const mensagemErro =
          error instanceof Error
            ? error.message
            : "Erro ao carregar histórico de disparos.";

        // O histórico é um painel secundário. Uma falha/timeout na consulta
        // não deve aparecer como erro do formulário enquanto o usuário está
        // preparando ou acompanhando um disparo.
        if (opcoes.silencioso || abaAtiva !== "resultados") {
          console.warn("[DISPAROS WHATSAPP] Falha ao atualizar histórico:", mensagemErro);
        } else {
          setErro(mensagemErro);
        }
      } finally {
        if (historicoConsultaAtivaRef.current === requisicaoId) {
          setLoadingHistorico(false);
        }
      }
    },
    [
      usuarioLogado?.empresa_id,
      filtroHistorico,
      filtroHistoricoIntegracao,
      filtroHistoricoCampanha,
      buscaHistoricoConsulta,
      abaAtiva,
    ]
  );

  async function carregarConflitosDisparo(contatosLista: ContatoOpcao[]) {
    const contatosValidos = contatosLista.filter(contatoTemTelefoneValido);

    if (contatosValidos.length === 0) {
      setGruposConflitoDisparo([]);
      setConflitosPorContato({});
      setDecisoesConflitoDisparo({});
      setErroConflitos("");
      return;
    }

    try {
      setLoadingConflitos(true);
      setErroConflitos("");

      const res = await fetch("/api/whatsapp/disparos/conflitos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          janela_dias: 7,
          contatos: contatosValidos.map((contato) => ({
            id: contato.id,
            telefone: contato.telefone,
          })),
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao verificar contatos repetidos.");
      }

      const grupos = Array.isArray(json.grupos)
        ? (json.grupos as GrupoConflitoDisparo[])
        : [];
      const contatosConflito =
        json.contatos && typeof json.contatos === "object"
          ? (json.contatos as Record<string, CampanhaConflitoContato[]>)
          : {};
      const contatosSelecionadosIds = new Set(contatosLista.map((item) => item.id));
      const campanhasAtuais = new Set(grupos.map((grupo) => grupo.campanha_id));

      setGruposConflitoDisparo(grupos);
      setConflitosPorContato(contatosConflito);
      setDecisoesConflitoDisparo((prev) => {
        const proximo: Record<string, DecisaoConflitoDisparo> = {};

        for (const [campanhaId, decisao] of Object.entries(prev)) {
          if (!campanhasAtuais.has(campanhaId)) continue;

          const contatoIds = decisao.contatoIds.filter((contatoId) =>
            contatosSelecionadosIds.has(contatoId)
          );

          if (contatoIds.length === 0) continue;

          proximo[campanhaId] = {
            ...decisao,
            contatoIds,
          };
        }

        return proximo;
      });
    } catch (error: any) {
      setErroConflitos(
        error?.message || "Erro ao verificar contatos repetidos."
      );
    } finally {
      setLoadingConflitos(false);
    }
  }


    async function carregarHistoricoDisparosDosContatos(contatosLista: ContatoOpcao[]) {
      const contatosValidos = contatosLista.filter(contatoTemTelefoneValido);

      if (contatosValidos.length === 0) {
        setHistoricoDisparosPorContato({});
        return;
      }

      try {
        const res = await fetch("/api/whatsapp/disparos/conflitos", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            janela_dias: 7,
            contatos: contatosValidos.map((contato) => ({
              id: contato.id,
              telefone: contato.telefone,
            })),
          }),
        });

        const json = await res.json();

        if (!res.ok || !json.ok) {
          return;
        }

        const contatosConflito =
          json.contatos && typeof json.contatos === "object"
            ? (json.contatos as Record<string, CampanhaConflitoContato[]>)
            : {};

        setHistoricoDisparosPorContato(contatosConflito);
      } catch {
        return;
      }
    }

  const limparFormularioDisparo = useCallback(() => {
    setContatosSelecionados([]);
    setQuantidadeAdicionarContatos("");
    setQuantidadeRemoverContatos("");
    setLimiteContatosToast("");
    setTemplateId("");
    setTemplateVariavel1("");
    setTemplateVariavel2("");
    setTemplateVariavel3("");
    setTemplateVariavel4("");
    setTemplateVariavel5("");
    setTemplateVariavel6("");
    setNomeCampanhaDisparo("");
    setQuantidadePlanejada("");
    setContatosReservaAtivos(false);
    setCampoPendente("");
    setPlanoCapacidadeConfirmado(null);
    setAgendarDisparo(false);
    setAgendamentoData("");
    setAgendamentoHora("");
    setPreviewCusto(null);
    setConfirmacaoCobranca(false);
    setEtapaDisparo(1);
    setConfirmacaoResponsabilidadeListaFria(false);
    setModalResponsabilidadeListaFriaAberto(false);
    setErroConflitos("");
    setGruposConflitoDisparo([]);
    setConflitosPorContato({});
    setDecisoesConflitoDisparo({});
    setErro("");
  }, []);

  async function carregarBloqueioDisparoEmMassa(integracaoWhatsappId = "") {
    const integracaoConsultaId = integracaoWhatsappId.trim();
    const params = new URLSearchParams();

    if (integracaoConsultaId) {
      params.set("integracao_id", integracaoConsultaId);
    }

    const queryString = params.toString();

    try {
      const res = await fetch(
        `/api/whatsapp/disparos/andamento${
          queryString ? `?${queryString}` : ""
        }`,
        {
          cache: "no-store",
        }
      );

      const json = (await res.json()) as DisparoAndamentoPayload;

      if (!res.ok || json.ok === false) {
        if (integracaoConsultaId) {
          setIntegracaoDisparoProcessando(false);
        } else {
          setDisparoEmMassaProcessando(false);
        }
        return;
      }

      if (integracaoConsultaId) {
        setIntegracaoDisparoProcessando(json.bloquear_disparos === true);
      } else {
        setDisparoEmMassaProcessando(json.bloquear_disparos === true);
      }
    } catch {
      if (integracaoConsultaId) {
        setIntegracaoDisparoProcessando(false);
      } else {
        setDisparoEmMassaProcessando(false);
      }
    }
  }

  async function carregarSaudeMeta(integracaoWhatsappId: string) {
    try {
      setLoadingSaudeMeta(true);

      const params = new URLSearchParams({
        integracao_id: integracaoWhatsappId,
      });
      const res = await fetch(`/api/whatsapp/limite-meta?${params}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar saude Meta.");
      }

      setLimiteMeta(json.limite_meta || null);
      } catch (error: any) {
      setLimiteMeta(null);
        console.warn("[DISPAROS WHATSAPP] Erro ao carregar saude Meta:", error);
    } finally {
      setLoadingSaudeMeta(false);
    }
  }

  useEffect(() => {
    carregarUsuarioLogado();
    carregarIntegracoes();
    carregarOpcoesContatos();
    carregarBloqueioDisparoEmMassa();
    carregarCampanhaPagina();
    carregarVariaveisPersonalizadas();
  }, [carregarCampanhaPagina]);

  useEffect(() => {
    setPaginaRelatorioCampanha(1);
    setFiltroRelatorioCampanha("todos");

    if (!filtroHistoricoCampanha) {
      setRelatorioCampanhaDetalhado(null);
      return;
    }

    void carregarRelatorioCampanhaDetalhado(filtroHistoricoCampanha);
  }, [filtroHistoricoCampanha, carregarRelatorioCampanhaDetalhado]);

  useEffect(() => {
    const handleAndamento = (event: Event) => {
      const detalhe = (event as CustomEvent<DisparoAndamentoPayload>).detail;
      const lista = ordenarCampanhasPaginaPorCriacao(
        Array.isArray(detalhe?.campanhas)
          ? detalhe.campanhas
          : detalhe?.campanha
          ? [detalhe.campanha]
          : []
      );

      const campanhasAtivas = lista.filter(campanhaEstaAtiva);
      const preparacaoLocalAtiva = Boolean(
        integracaoPreparandoEmSegundoPlanoId
      );
      const campanhaPreparadaJaApareceu = Boolean(
        integracaoPreparandoEmSegundoPlanoId &&
          lista.some(
            (campanha) =>
              campanha.integracao_whatsapp_id ===
              integracaoPreparandoEmSegundoPlanoId
          )
      );

      if (campanhaPreparadaJaApareceu) {
        setIntegracaoPreparandoEmSegundoPlanoId("");
      }

      setDisparoEmMassaProcessando(
        campanhasAtivas.length > 0 ||
          (preparacaoLocalAtiva && !campanhaPreparadaJaApareceu)
      );
      setCampanhasPagina(lista);
      setIntegracaoDisparoProcessando(
        Boolean(
          integracaoId &&
            (campanhasAtivas.some(
              (campanha) =>
                campanha.integracao_whatsapp_id === integracaoId
            ) ||
              (integracaoPreparandoEmSegundoPlanoId === integracaoId &&
                !campanhaPreparadaJaApareceu))
        )
      );

      setCampanhaPagina((atual) => {
        if (!atual) return lista[0] || null;
        return (
          lista.find((campanha) => campanha.id === atual.id) ||
          lista[0] ||
          null
        );
      });

      if (lista.length === 0) {
        setModalCampanhaAberto(false);
      }
    };

    window.addEventListener(EVENTO_DISPARO_ANDAMENTO, handleAndamento);

    return () => {
      window.removeEventListener(EVENTO_DISPARO_ANDAMENTO, handleAndamento);
    };
  }, [integracaoId, integracaoPreparandoEmSegundoPlanoId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      carregarContatos({
        busca: buscaContato,
        origem: origemFiltro,
        campanha: campanhaFiltro,
        interesse: interesseFiltro,
        classificacao: classificacaoFiltro,
        disparoAnteriorId: disparoAnteriorFiltroContatos,
        telefoneRevisar: telefoneRevisarFiltro,
        mensagemDataInicio: mensagemDataInicioFiltro,
        mensagemDataFim: mensagemDataFimFiltro,
        ultimoAtendenteId: ultimoAtendenteFiltro,
        optIn: optInFiltro,
        optOut: optOutFiltro,
        somenteIntegracao: somenteIntegracaoFiltro,
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [
    buscaContato,
    origemFiltro,
    campanhaFiltro,
    interesseFiltro,
    classificacaoFiltro,
    disparoAnteriorFiltroContatos,
    telefoneRevisarFiltro,
    integracaoId,
    mensagemDataInicioFiltro,
    mensagemDataFimFiltro,
    ultimoAtendenteFiltro,
    optInFiltro,
    optOutFiltro,
    somenteIntegracaoFiltro,
    carregarContatos,
    refreshContatosNonce,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      carregarHistoricoDisparosDosContatos(contatos);
    }, 500);

    return () => clearTimeout(timer);
  }, [contatos]);

  useEffect(() => {
    const timer = setTimeout(() => {
      carregarConflitosDisparo(contatosSelecionados);
    }, 450);

    return () => clearTimeout(timer);
  }, [contatosSelecionados]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBuscaHistoricoConsulta(buscaHistorico.trim());
    }, 400);

    return () => window.clearTimeout(timer);
  }, [buscaHistorico]);

  useEffect(() => {
    if (!usuarioLogado?.empresa_id) return;

    // Consulta única de recuperação ao abrir a tela. Depois disso, mudanças
    // chegam pelo Realtime da tabela whatsapp_disparo_campanhas.
    void carregarResultadosConclusao();
  }, [usuarioLogado?.empresa_id, carregarResultadosConclusao]);

  useEffect(() => {
    if (!usuarioLogado?.empresa_id) return;

    void carregarHistorico({
      forcar: false,
      restaurarPagina: true,
      silencioso: abaAtiva !== "resultados",
    });
  }, [usuarioLogado?.empresa_id, abaAtiva, carregarHistorico]);

  useEffect(() => {
    setTemplateId("");
    setMensagem("");
    setErro("");

    if (integracaoId) {
      carregarTemplates(integracaoId);
      carregarSaudeMeta(integracaoId);
      carregarBloqueioDisparoEmMassa(integracaoId);
      carregarCampanhaPagina(integracaoId);
    } else {
      setTemplates([]);
      setLimiteMeta(null);
        setIntegracaoDisparoProcessando(false);
      carregarCampanhaPagina();
    }
  }, [integracaoId, carregarCampanhaPagina]);

  useEffect(() => {
    const empresaId = usuarioLogado?.empresa_id;

    if (!empresaId) return;

    const supabase = getSupabaseRealtime();
    const channel = supabase
      .channel(`crm-whatsapp-disparo-page:${empresaId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_disparo_campanhas",
          filter: `empresa_id=eq.${empresaId}`,
        },
        (payload) => {
          const row = payload.new || payload.old;

          if (!row || typeof row !== "object") return;

          const campanhaRealtime = normalizarCampanhaRealtime(row);

          if (!campanhaRealtime) return;

          const campanhaAtiva = campanhaEstaAtiva(campanhaRealtime);

          setCampanhasPagina((atuais) => {
            const existente = atuais.find(
              (campanha) => campanha.id === campanhaRealtime.id
            );
            const restantes = atuais.filter(
              (campanha) => campanha.id !== campanhaRealtime.id
            );

            if (!campanhaAtiva) {
              return restantes;
            }

            const campanhaMesclada = {
              ...existente,
              ...campanhaRealtime,
            };

            return ordenarCampanhasPaginaPorCriacao([
              campanhaMesclada,
              ...restantes,
            ]).slice(0, 25);
          });

          setCampanhaPagina((atual) => {
            if (atual?.id !== campanhaRealtime.id) return atual;
            if (!campanhaAtiva) return null;

            return {
              ...atual,
              ...campanhaRealtime,
            };
          });

          if (!campanhaAtiva) {
            setModalCampanhaAberto(false);
          }

          if (
            campanhaRealtime.integracao_whatsapp_id === integracaoId
          ) {
            setIntegracaoDisparoProcessando(campanhaAtiva);
          }

          if (!campanhaAtiva) {
            invalidarHistoricoCacheEmpresa(empresaId);
            void carregarResultadosConclusao(true);

            // Revalida os contatos após o término para incorporar imediatamente
            // cooldowns/bloqueios registrados durante a campanha.
            if (
              campanhaRealtime.integracao_whatsapp_id === integracaoId
            ) {
              // Mesmo que o usuário tenha começado a montar uma nova seleção
              // enquanto a campanha ainda processava, descartamos esse estado
              // ao finalizar para não reaproveitar contatos com status antigo.
              limparFormularioDisparo();
              setRefreshContatosNonce((atual) => atual + 1);
              void carregarSaudeMeta(integracaoId);
            }

            // O histórico só é atualizado automaticamente quando está visível.
            // Isso impede um timeout do relatório de aparecer no formulário.
            if (abaAtiva === "resultados") {
              void carregarHistorico({
                forcar: true,
                silencioso: true,
              });
            }
          }
        }
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;

        // Reconciliamos uma vez ao estabelecer/reestabelecer o WebSocket para
        // cobrir qualquer evento ocorrido durante uma queda de conexão.
        void carregarCampanhaPagina();
        void carregarResultadosConclusao();
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [
    usuarioLogado?.empresa_id,
    integracaoId,
    abaAtiva,
    carregarHistorico,
    limparFormularioDisparo,
    carregarCampanhaPagina,
    carregarResultadosConclusao,
  ]);

  const permissoes = usuarioLogado?.permissoes || [];
  const podeDisparar = usuarioPodeRealizarDisparos({ permissoes });

  const disparoBloqueado = integracaoDisparoProcessando;
  const textoDisparoBloqueado = "Integração em processamento";

  const integracaoSelecionada = useMemo(() => {
    return integracoes.find((item) => item.id === integracaoId) || null;
  }, [integracoes, integracaoId]);

  const telefonesSelecionadosUnicos = useMemo(() => {
    return Array.from(
      new Set(
        contatosSelecionados.slice(0, Number.parseInt(quantidadePlanejada, 10) || 0)
          .map((contato) => limparNumero(contato.telefone))
          .filter((telefone) => telefone.length >= 10)
      )
    );
  }, [contatosSelecionados, quantidadePlanejada]);

  const totalTelefonesQueConsomemLimite = previewCusto
    ? Number(previewCusto.totalTelefonesConsomemLimiteUnicos || 0)
    : telefonesSelecionadosUnicos.length;
  const saldoEstimadoAposSelecao = limiteMeta
    ? limiteMeta.restantes - totalTelefonesQueConsomemLimite
    : null;
  const selecaoExcedeLimite =
    typeof saldoEstimadoAposSelecao === "number" && saldoEstimadoAposSelecao < 0;
  const disponibilidadeAgendamentoMeta =
    previewCusto?.disponibilidadeAgendamentoMeta || null;
  // O cronograma da integração é consultado independentemente de haver
  // contatos selecionados; a previsão específica vem do custo-preview.
  const liberacoesCapacidadeMeta =
    disponibilidadeAgendamentoMeta?.liberacoes?.length
      ? disponibilidadeAgendamentoMeta.liberacoes
      : limiteMeta?.liberacoes_previstas || [];
  const liberacoesCapacidadeMetaVisiveis =
    liberacoesCapacidadeMeta.slice(0, 8);
  const capacidadeDisponivelAgoraAgendamento =
    disponibilidadeAgendamentoMeta?.capacidadeDisponivelAgora ??
    limiteMeta?.restantes ?? null;
  const capacidadeDisponivelNoHorario =
    disponibilidadeAgendamentoMeta?.capacidadeDisponivelNoHorario ?? null;
  const novosNecessariosNoHorario =
    disponibilidadeAgendamentoMeta?.novosNecessariosNoHorario ?? null;
  const horarioLiberacaoMeta = disponibilidadeAgendamentoMeta?.disponivel
    ? null
    : disponibilidadeAgendamentoMeta?.disponivelApartirDe || null;
  const horarioLiberacaoMetaMs = horarioLiberacaoMeta
    ? new Date(horarioLiberacaoMeta).getTime()
    : null;
  const camposLiberacaoMeta = camposDataHoraLocal(horarioLiberacaoMeta);
  const quantidadeDesejada = Number.parseInt(quantidadePlanejada, 10) || 0;
  const capacidadeTotalPlanejamento = Math.max(0, Number(limiteMeta?.limite || 0));
  const capacidadeAgoraPlanejamento = Math.max(0, Number(limiteMeta?.restantes || 0));
  const liberacoesPlanejamento = [...(limiteMeta?.liberacoes_previstas || [])]
    .filter((item) => Number.isFinite(new Date(item.horario).getTime()))
    .sort((a, b) => new Date(a.horario).getTime() - new Date(b.horario).getTime());
  const totalCapacidadeALiberar = liberacoesPlanejamento.reduce(
    (total, item) => total + Math.max(0, Number(item.quantidadeLiberada || 0)), 0
  );
  const capacidadeMaximaDisponivelAgora =
    capacidadeTotalPlanejamento > 0 && capacidadeAgoraPlanejamento >= capacidadeTotalPlanejamento;
  const horarioCapacidadeMaxima = liberacoesPlanejamento.find(
    (item) => Number(item.disponivelAcumulado || 0) >= capacidadeTotalPlanejamento &&
      capacidadeTotalPlanejamento > 0
  )?.horario || null;
  const horarioCapacidadeDesejada = quantidadeDesejada > capacidadeAgoraPlanejamento
    ? liberacoesPlanejamento.find(
        (item) => Number(item.disponivelAcumulado || 0) >= quantidadeDesejada
      )?.horario || null
    : null;
  // Margem de um minuto após a liberação da janela móvel, sem prometer reserva.
  const horarioSugeridoAgendamento = horarioCapacidadeDesejada
    ? new Date(new Date(horarioCapacidadeDesejada).getTime() + 60_000).toISOString()
    : new Date(Date.now() + 10 * 60_000).toISOString();
  const camposHorarioSugerido = camposDataHoraLocal(horarioSugeridoAgendamento);
  const capacidadeInsuficienteAgora = quantidadeDesejada > capacidadeAgoraPlanejamento;
  const quantidadeExcedeLimiteTotal = quantidadeDesejada > capacidadeTotalPlanejamento;
  const horarioAgendamentoSelecionadoMs =
    agendamentoData && agendamentoHora
      ? new Date(`${agendamentoData}T${agendamentoHora}:00`).getTime()
      : null;
  const capacidadeProjetadaSemSelecao =
    limiteMeta && typeof horarioAgendamentoSelecionadoMs === "number" &&
    Number.isFinite(horarioAgendamentoSelecionadoMs)
      ? (limiteMeta.liberacoes_previstas || []).reduce(
          (disponivel, liberacao) =>
            new Date(liberacao.horario).getTime() <= horarioAgendamentoSelecionadoMs
              ? liberacao.disponivelAcumulado
              : disponivel,
          limiteMeta.restantes
        )
      : null;
  const agendamentoAntesDaLiberacaoMeta =
    typeof horarioLiberacaoMetaMs === "number" &&
    Number.isFinite(horarioLiberacaoMetaMs) &&
    typeof horarioAgendamentoSelecionadoMs === "number" &&
    Number.isFinite(horarioAgendamentoSelecionadoMs) &&
    horarioAgendamentoSelecionadoMs < horarioLiberacaoMetaMs;
  const agendamentoImpossivelPeloLimiteMeta =
    disponibilidadeAgendamentoMeta?.impossivel === true;
  const agendamentoInvalidoPeloLimiteMeta =
    agendarDisparo &&
    Boolean(disponibilidadeAgendamentoMeta) &&
    (disponibilidadeAgendamentoMeta?.disponivel === false ||
      agendamentoAntesDaLiberacaoMeta ||
      agendamentoImpossivelPeloLimiteMeta);

  const templateSelecionado = useMemo(() => {
    return templates.find((item) => item.id === templateId) || null;
  }, [templates, templateId]);

  const categoriaTemplateSelecionado = String(
    templateSelecionado?.categoria || ""
  )
    .trim()
    .toLowerCase();
  const contatosListaFriaSelecionados = useMemo(
    () =>
      contatosSelecionados.filter(
        (contato) =>
          !contatoTemOptOutParaCategoria(
            contato,
            categoriaTemplateSelecionado
          ) &&
          contato.opt_in_whatsapp !== true
      ),
    [contatosSelecionados, categoriaTemplateSelecionado]
  );
  const contatosOptOutSelecionados = useMemo(
    () =>
      contatosSelecionados.filter(
        (contato) =>
          contatoTemOptOutParaCategoria(
            contato,
            categoriaTemplateSelecionado
          )
      ),
    [contatosSelecionados, categoriaTemplateSelecionado]
  );
  const contatosCooldownSelecionados = useMemo(
    () =>
      contatosSelecionados.filter((contato) =>
        contatoEstaEmCooldownAplicavel(
          contato,
          categoriaTemplateSelecionado
        )
      ),
    [contatosSelecionados, categoriaTemplateSelecionado]
  );
  const totalContatosOptOut = contatosOptOutSelecionados.length;
  const temContatosOptOut = totalContatosOptOut > 0;
  const totalContatosCooldown = contatosCooldownSelecionados.length;
  const temContatosCooldown = totalContatosCooldown > 0;
  const totalContatosListaFria = contatosListaFriaSelecionados.length;
  const temContatosListaFria = totalContatosListaFria > 0;
  const marketingComListaFria =
    categoriaTemplateSelecionado === "marketing" && temContatosListaFria;
  const utilityComListaFria =
    categoriaTemplateSelecionado === "utility" && temContatosListaFria;
  const templateComListaFria =
    marketingComListaFria || utilityComListaFria;
  const listaFriaSemOptOut =
    templateComListaFria &&
    templateSelecionado?.opt_out_habilitado !== true;

  const totalVariaveis = useMemo(() => {
    return contarVariaveisTemplate(templateSelecionado);
  }, [templateSelecionado]);

  const variaveisTemplate = useMemo(
    () => [
      templateVariavel1,
      templateVariavel2,
      templateVariavel3,
      templateVariavel4,
      templateVariavel5,
      templateVariavel6,
    ],
    [
      templateVariavel1,
      templateVariavel2,
      templateVariavel3,
      templateVariavel4,
      templateVariavel5,
      templateVariavel6,
    ]
  );

  const temVariaveisObrigatoriasPendentes = useMemo(
    () =>
      totalVariaveis > 0 &&
      variaveisTemplate
        .slice(0, totalVariaveis)
        .map((item) => normalizarVariavelTemplate(item))
        .some((item) => !item),
    [totalVariaveis, variaveisTemplate]
  );

  const opcoesVariaveisTemplate = useMemo<OpcaoVariavelTemplate[]>(() => {
    const chavesAdicionadas = new Set<string>();
    const opcoes: OpcaoVariavelTemplate[] = [];

    for (const variavel of VARIAVEIS_FIXAS_SISTEMA) {
      if (chavesAdicionadas.has(variavel.chave)) continue;

      chavesAdicionadas.add(variavel.chave);
      opcoes.push({
        chave: variavel.chave,
        descricao: variavel.descricao,
        categoria: "Fixa",
      });
    }

    for (const variavel of variaveisPersonalizadas) {
      const chave = normalizarEntradaVariavelTemplate(variavel.chave);
      if (!variavel.ativo || !chave || chavesAdicionadas.has(chave)) continue;

      chavesAdicionadas.add(chave);
      opcoes.push({
        chave,
        descricao:
          variavel.descricao?.trim() ||
          "Variável personalizada cadastrada pela empresa.",
        categoria: "Personalizada",
      });
    }

    return opcoes;
  }, [variaveisPersonalizadas]);

  const previewTemplateSelecionado = useMemo(() => {
    return montarPreviewTemplateDisparo(templateSelecionado, variaveisTemplate);
  }, [templateSelecionado, variaveisTemplate]);

  const quantidadeFiltrosAvancadosAtivos = [
    mensagemDataInicioFiltro,
    mensagemDataFimFiltro,
    ultimoAtendenteFiltro,
    optInFiltro,
    optOutFiltro,
  ].filter(Boolean).length;

  const temFiltrosContatosAtivos = Boolean(
    buscaContato ||
      origemFiltro ||
      campanhaFiltro ||
      interesseFiltro ||
      classificacaoFiltro ||
      disparoAnteriorFiltroContatos ||
      telefoneRevisarFiltro ||
      quantidadeFiltrosAvancadosAtivos > 0
  );

  const filtrosServidorContatosAtivos = Boolean(
    origemFiltro.startsWith("lista:") ||
      disparoAnteriorFiltroContatos ||
      mensagemDataInicioFiltro ||
      mensagemDataFimFiltro ||
      ultimoAtendenteFiltro ||
      optInFiltro ||
      optOutFiltro ||
      somenteIntegracaoFiltro
  );

  const idsContatosConsulta = useMemo(
    () => new Set(contatos.map((contato) => contato.id)),
    [contatos]
  );

  const contatosDisponiveis = useMemo(() => contatos, [contatos]);

  const obterHistoricoDisparosDoContato = useCallback(
    (contatoId: string) => {
      const campanhasHistorico = historicoDisparosPorContato[contatoId] || [];
      const campanhasConflito = conflitosPorContato[contatoId] || [];

      const mapa = new Map<string, CampanhaConflitoContato>();

      for (const campanha of campanhasHistorico) {
        mapa.set(campanha.campanha_id, campanha);
      }

      for (const campanha of campanhasConflito) {
        mapa.set(campanha.campanha_id, campanha);
      }

      return Array.from(mapa.values());
    },
    [historicoDisparosPorContato, conflitosPorContato]
  );

  const contatoPassaFiltrosSelecionados = useCallback(
    (contato: ContatoOpcao) => {
      if (
        filtrosServidorContatosAtivos &&
        !idsContatosConsulta.has(contato.id)
      ) {
        return false;
      }

      const busca = normalizarTextoBusca(buscaContato);

      if (busca) {
        const textoContato = normalizarTextoBusca(
          [
            contato.nome,
            contato.telefone,
            contato.email,
            obterOrigemContato(contato),
            obterCampanhaContato(contato),
            contato.status_lead,
            ...obterHistoricoDisparosDoContato(contato.id).map(
              (campanha) => campanha.campanha_nome
            ),
          ]
            .filter(Boolean)
            .join(" ")
        );

        if (!textoContato.includes(busca)) return false;
      }

      if (
        origemFiltro &&
        !origemFiltro.startsWith("lista:") &&
        obterOrigemContato(contato) !== origemFiltro
      ) {
        return false;
      }
      if (
        campanhaFiltro &&
        obterCampanhaContato(contato) !== campanhaFiltro
      ) {
        return false;
      }

      if (
        interesseFiltro &&
        String(contato.interesse || "").trim() !== interesseFiltro
      ) {
        return false;
      }

      if (
        classificacaoFiltro &&
        String(contato.classificacao || "").trim().toLowerCase() !==
          classificacaoFiltro
      ) {
        return false;
      }

      if (telefoneRevisarFiltro === "true" && contato.telefone_revisar !== true) return false;
      if (telefoneRevisarFiltro === "false" && contato.telefone_revisar === true) return false;

      return true;
    },
    [
      buscaContato,
      campanhaFiltro,
      classificacaoFiltro,
      filtrosServidorContatosAtivos,
      idsContatosConsulta,
      interesseFiltro,
      obterHistoricoDisparosDoContato,
      origemFiltro,
      telefoneRevisarFiltro,
    ]
  );

  const idsContatosSelecionadosParaDisparo = useMemo(
    () => new Set(contatosSelecionados.map((contato) => contato.id)),
    [contatosSelecionados]
  );

  const contatosDisponiveisFiltrados = useMemo(() => {
    return contatosDisponiveis.filter(
      (contato) =>
        contatoPassaFiltrosSelecionados(contato) &&
        !idsContatosSelecionadosParaDisparo.has(contato.id)
    );
  }, [
    contatosDisponiveis,
    contatoPassaFiltrosSelecionados,
    idsContatosSelecionadosParaDisparo,
  ]);

  const contatosDisponiveisValidos = useMemo(() => {
    return contatosDisponiveisFiltrados.filter(
      (contato) =>
        contatoTemTelefoneValido(contato) &&
        !contatoTemOptOutParaCategoria(
          contato,
          categoriaTemplateSelecionado
        ) &&
        !contatoEstaEmCooldownAplicavel(contato, categoriaTemplateSelecionado)
    );
  }, [contatosDisponiveisFiltrados, categoriaTemplateSelecionado]);

  const contatosSelecionadosFiltrados = useMemo(() => {
    return contatosSelecionados.filter(contatoPassaFiltrosSelecionados);
  }, [contatosSelecionados, contatoPassaFiltrosSelecionados]);

  const idsContatosSelecionados = useMemo(
    () => new Set(contatosSelecionados.map((contato) => contato.id)),
    [contatosSelecionados]
  );

  // CRM_AVAILABLE_COUNTER_SELECTED_V5
  const totalContatosDisponiveisRestantes = useMemo(
    () =>
      Math.max(
        totalContatosDisponiveis - contatosSelecionadosFiltrados.length,
        0
      ),
    [totalContatosDisponiveis, contatosSelecionadosFiltrados.length]
  );

  // No envio imediato, a seleção respeita o saldo disponível agora.
  // No agendamento, a seleção pode ocupar a capacidade total da integração,
  // pois o horário futuro será validado pela janela de 24h antes de salvar.
  const limiteContatosReserva = Math.floor(quantidadeDesejada * 0.5);
  const limiteContatosSelecao = quantidadeDesejada +
    (contatosReservaAtivos ? limiteContatosReserva : 0);
  const contatosPrincipais = contatosSelecionados.slice(0, quantidadeDesejada);
  const contatosReserva = contatosReservaAtivos
    ? contatosSelecionados.slice(quantidadeDesejada, limiteContatosSelecao)
    : [];
  // Reservas não são disparos pendentes: a Meta só deve ser consultada
  // e reservar capacidade quando um substituto for realmente acionado.
  const capacidadeBaseParaSelecao = planoCapacidadeConfirmado && limiteMeta
    ? limiteContatosSelecao
    : 0;
  const capacidadeRestanteParaAdicionar =
    typeof capacidadeBaseParaSelecao === "number"
      ? Math.max(
          capacidadeBaseParaSelecao - contatosSelecionados.length,
          0
        )
      : null;

  const gruposConflitoAtivos = useMemo(() => {
    const idsSelecionados = new Set(contatosSelecionados.map((item) => item.id));

    return gruposConflitoDisparo
      .map((grupo) => ({
        ...grupo,
        contatos_ids: grupo.contatos_ids.filter((contatoId) =>
          idsSelecionados.has(contatoId)
        ),
      }))
      .filter((grupo) => grupo.contatos_ids.length > 0);
  }, [contatosSelecionados, gruposConflitoDisparo]);

  const gruposConflitoPendentes = useMemo(() => {
    return gruposConflitoAtivos.filter((grupo) => {
      const decisao = decisoesConflitoDisparo[grupo.campanha_id];
      const decididos = new Set(decisao?.contatoIds || []);

      return grupo.contatos_ids.some((contatoId) => !decididos.has(contatoId));
    });
  }, [decisoesConflitoDisparo, gruposConflitoAtivos]);

  const temConflitosPendentes = gruposConflitoPendentes.length > 0;

  const campanhasDisparoAnteriorFiltro = useMemo(
    () =>
      campanhasHistorico
        .filter((campanha) => Boolean(campanha.id))
        .map((campanha) => ({
          id: campanha.id,
          nome:
            campanha.nome ||
            campanha.template_nome ||
            "Disparo sem nome",
          total: Math.max(
            0,
            Number(campanha.total_enviados ?? campanha.total_itens ?? 0)
          ),
        }))
        .filter((campanha) => campanha.total > 0),
    [campanhasHistorico]
  );

  const campanhasHistoricoFiltradas = useMemo(
    () =>
      filtroHistoricoIntegracao
        ? campanhasHistorico.filter(
            (campanha) =>
              campanha.integracao_whatsapp_id === filtroHistoricoIntegracao
          )
        : campanhasHistorico,
    [campanhasHistorico, filtroHistoricoIntegracao]
  );

  const campanhasHistoricoCards = useMemo(() => {
    const termo = normalizarTextoBusca(buscaHistorico);

    return campanhasHistoricoFiltradas
      .filter((campanha) => {
        if (!termo) return true;

        const integracao = integracoes.find(
          (item) => item.id === campanha.integracao_whatsapp_id
        );

        return normalizarTextoBusca(
          [
            campanha.nome,
            campanha.template_nome,
            campanha.template_categoria,
            statusCampanhaHistorico(campanha),
            integracao?.nome_conexao,
            integracao?.numero,
          ]
            .filter(Boolean)
            .join(" ")
        ).includes(termo);
      })
      .sort(
        (a, b) =>
          timestampRelatorio(b.created_at) -
          timestampRelatorio(a.created_at)
      );
  }, [
    campanhasHistoricoFiltradas,
    buscaHistorico,
    integracoes,
  ]);

  const integracoesRelatorioAcumuladoDisponiveis = useMemo(() => {
    const idsComCampanha = new Set(
      campanhasHistorico
        .map((campanha) => String(campanha.integracao_whatsapp_id || ""))
        .filter(Boolean)
    );

    return integracoes
      .filter((integracao) => idsComCampanha.has(integracao.id))
      .sort((a, b) =>
        String(a.nome_conexao || a.numero || "").localeCompare(
          String(b.nome_conexao || b.numero || ""),
          "pt-BR"
        )
      );
  }, [campanhasHistorico, integracoes]);

  const templatesRelatorioAcumuladoDisponiveis = useMemo(() => {
    return Array.from(
      new Set(
        campanhasHistorico
          .map((campanha) => String(campanha.template_nome || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [campanhasHistorico]);

  const campanhasRelatorioAcumuladoDisponiveis = useMemo(() => {
    const termo = normalizarTextoBusca(buscaRelatorioAcumulado);

    return [...campanhasHistorico]
      .filter((campanha) => {
        if (
          diaRelatorioAcumulado &&
          dataCampanhaParaFiltro(campanha.created_at) !== diaRelatorioAcumulado
        ) {
          return false;
        }

        if (
          integracaoRelatorioAcumulado &&
          campanha.integracao_whatsapp_id !== integracaoRelatorioAcumulado
        ) {
          return false;
        }

        if (
          templateRelatorioAcumulado &&
          String(campanha.template_nome || "").trim() !==
            templateRelatorioAcumulado
        ) {
          return false;
        }

        if (!termo) return true;

        const integracao = integracoes.find(
          (item) => item.id === campanha.integracao_whatsapp_id
        );

        return normalizarTextoBusca(
          [
            nomeCampanhaHistorico(campanha),
            campanha.template_nome,
            campanha.template_categoria,
            statusCampanhaHistorico(campanha),
            integracao?.nome_conexao,
            integracao?.numero,
          ]
            .filter(Boolean)
            .join(" ")
        ).includes(termo);
      })
      .sort(
        (a, b) =>
          timestampRelatorio(b.created_at) -
          timestampRelatorio(a.created_at)
      );
  }, [
    campanhasHistorico,
    integracoes,
    buscaRelatorioAcumulado,
    diaRelatorioAcumulado,
    integracaoRelatorioAcumulado,
    templateRelatorioAcumulado,
  ]);

  const todasCampanhasRelatorioAcumuladoVisiveisSelecionadas = useMemo(
    () =>
      campanhasRelatorioAcumuladoDisponiveis.length > 0 &&
      campanhasRelatorioAcumuladoDisponiveis.every((campanha) =>
        campanhasRelatorioAcumuladoIds.includes(campanha.id)
      ),
    [
      campanhasRelatorioAcumuladoDisponiveis,
      campanhasRelatorioAcumuladoIds,
    ]
  );

  const totalContatosComConflitoSelecionados = useMemo(() => {
    const ids = new Set<string>();

    for (const grupo of gruposConflitoAtivos) {
      for (const contatoId of grupo.contatos_ids) {
        ids.add(contatoId);
      }
    }

    return ids.size;
  }, [gruposConflitoAtivos]);

  const campanhaHistoricoSelecionada = useMemo(
    () =>
      campanhasHistorico.find(
        (campanha) => campanha.id === filtroHistoricoCampanha
      ) || null,
    [campanhasHistorico, filtroHistoricoCampanha]
  );
  const nomeCampanhaRelatorioSelecionada = campanhaHistoricoSelecionada
    ? nomeCampanhaHistorico(campanhaHistoricoSelecionada)
    : relatorioCampanhaDetalhado?.campanha.nome || "Disparo em massa";
  const integracaoCampanhaRelatorioSelecionada = campanhaHistoricoSelecionada
    ? integracoes.find(
        (item) =>
          item.id === campanhaHistoricoSelecionada.integracao_whatsapp_id
      ) || null
    : null;
  const nomeIntegracaoCampanhaRelatorioSelecionada =
    integracaoCampanhaRelatorioSelecionada?.nome_conexao ||
    integracaoCampanhaRelatorioSelecionada?.numero ||
    "Integração";

  const totalSucesso = totaisHistorico.sucesso;
  const totalFalha = totaisHistorico.falha;
  const totalProcessando = totaisHistorico.processando;
  const resultadoFiltrado = resultado;
  const totalResultadosFiltroAtivo =
    filtroHistorico === "sucesso"
      ? totaisHistorico.sucesso
      : filtroHistorico === "processando"
      ? totaisHistorico.processando
      : filtroHistorico === "falha"
      ? totaisHistorico.falha
      : totaisHistorico.total;

  const totalPaginasHistorico = useMemo(() => {
    return Math.max(
      1,
      Math.ceil(totalResultadosFiltroAtivo / ITENS_HISTORICO_POR_PAGINA)
    );
  }, [totalResultadosFiltroAtivo]);

  const resultadoHistoricoPaginado = resultadoFiltrado;


  const falhasRelatorioAgrupadas = useMemo(() => {
    if (!relatorioCampanhaDetalhado) return [];
    return agruparFalhasCampanhaHistorico({
      id: relatorioCampanhaDetalhado.campanha.id,
      total_falhas: relatorioCampanhaDetalhado.totais.falha,
      erros_resumo: relatorioCampanhaDetalhado.linhas
        .filter((linha) => String(linha.status_final || "").toLowerCase() === "falha")
        .map((linha) => ({
          erro: linha.erro,
          erro_codigo_meta: linha.erro_codigo_meta,
          quantidade: 1,
        })),
    });
  }, [relatorioCampanhaDetalhado]);

  const linhasRelatorioCampanhaFiltradas = useMemo(() => {
    let linhas = ordenarLinhasRelatorioCampanha(
      relatorioCampanhaDetalhado?.linhas || []
    );

    if (filtroRelatorioCampanha !== "todos") {
      linhas = linhas.filter((linha) => {
        if (filtroRelatorioCampanha === "respondido") {
          return (
            Boolean(String(linha.resposta_em || "").trim()) ||
            String(linha.situacao || "").trim().toLowerCase() ===
              "respondido" ||
            Boolean(String(linha.primeira_resposta || "").trim())
          );
        }

        return (
          String(linha.status_final || "pendente").toLowerCase() ===
          filtroRelatorioCampanha
        );
      });
    }

    const termo = buscaHistorico.trim().toLocaleLowerCase("pt-BR");

    if (!termo) return linhas;

    return linhas.filter((linha) =>
      [
        linha.numero,
        linha.nome_contato,
        linha.status_label,
        linha.situacao,
        linha.primeira_resposta,
      ].some((valor) =>
        String(valor || "")
          .toLocaleLowerCase("pt-BR")
          .includes(termo)
      )
    );
  }, [
    relatorioCampanhaDetalhado,
    buscaHistorico,
    filtroRelatorioCampanha,
  ]);

  const totalPaginasRelatorioCampanha = Math.max(
    1,
    Math.ceil(
      linhasRelatorioCampanhaFiltradas.length /
        ITENS_RELATORIO_CAMPANHA_POR_PAGINA
    )
  );
  const paginaRelatorioCampanhaSegura = Math.min(
    paginaRelatorioCampanha,
    totalPaginasRelatorioCampanha
  );
  const linhasRelatorioCampanhaPaginadas = useMemo(() => {
    const inicio =
      (paginaRelatorioCampanhaSegura - 1) *
      ITENS_RELATORIO_CAMPANHA_POR_PAGINA;

    return linhasRelatorioCampanhaFiltradas.slice(
      inicio,
      inicio + ITENS_RELATORIO_CAMPANHA_POR_PAGINA
    );
  }, [
    linhasRelatorioCampanhaFiltradas,
    paginaRelatorioCampanhaSegura,
  ]);
  const primeiroItemRelatorioCampanha =
    linhasRelatorioCampanhaFiltradas.length === 0
      ? 0
      : (paginaRelatorioCampanhaSegura - 1) *
          ITENS_RELATORIO_CAMPANHA_POR_PAGINA +
        1;
  const ultimoItemRelatorioCampanha = Math.min(
    primeiroItemRelatorioCampanha +
      linhasRelatorioCampanhaPaginadas.length -
      1,
    linhasRelatorioCampanhaFiltradas.length
  );

  const primeiroItemHistorico =
    totalResultadosFiltroAtivo === 0
      ? 0
      : (paginaHistorico - 1) * ITENS_HISTORICO_POR_PAGINA + 1;

  const ultimoItemHistorico = Math.min(
    resultadoHistoricoPaginado.length === 0
      ? 0
      : primeiroItemHistorico + resultadoHistoricoPaginado.length - 1,
    totalResultadosFiltroAtivo
  );

  const campanhaResultadoConclusao = useMemo(
    () =>
      campanhasResultadoConclusao.find(
        (campanha) => campanha.id === campanhaResultadoConclusaoId
      ) ||
      campanhasResultadoConclusao[0] ||
      null,
    [campanhasResultadoConclusao, campanhaResultadoConclusaoId]
  );
  const resultadoConclusaoSucesso =
    campanhaFoiConcluidaComSucesso(campanhaResultadoConclusao);
  const totalResultadoConclusao = inteiroCampanha(
    campanhaResultadoConclusao?.total
  );
  const enviadosResultadoConclusao = inteiroCampanha(
    campanhaResultadoConclusao?.enviados
  );
  const falhasResultadoConclusao = inteiroCampanha(
    campanhaResultadoConclusao?.falhas
  );
  const canceladosResultadoConclusao = inteiroCampanha(
    campanhaResultadoConclusao?.cancelados
  );
  const aguardandoResultadoConclusao = inteiroCampanha(
    campanhaResultadoConclusao?.aguardando_confirmacao
  );

  const campanhaPaginaAtiva = campanhaEstaAtiva(campanhaPagina);
  const campanhaPaginaConcluida = campanhaFoiConcluida(campanhaPagina);
  const campanhaPaginaSucesso =
    campanhaFoiConcluidaComSucesso(campanhaPagina);
  const progressoCampanhaPagina = campanhaPagina
    ? progressoCampanha(campanhaPagina)
    : 0;
  const totalCampanhaPagina = inteiroCampanha(campanhaPagina?.total);
  const processadosCampanhaPagina = campanhaPagina
    ? Math.min(
        totalCampanhaPagina,
        Math.max(
          inteiroCampanha(campanhaPagina.processados),
          inteiroCampanha(campanhaPagina.enviados) +
            inteiroCampanha(campanhaPagina.falhas) +
            inteiroCampanha(campanhaPagina.cancelados)
        )
      )
    : 0;
  const restantesCampanhaPagina = Math.max(
    totalCampanhaPagina - processadosCampanhaPagina,
    0
  );
  const integracaoCampanhaPagina = useMemo(() => {
    if (!campanhaPagina?.integracao_whatsapp_id) return null;

    return (
      integracoes.find(
        (item) => item.id === campanhaPagina.integracao_whatsapp_id
      ) || null
    );
  }, [integracoes, campanhaPagina?.integracao_whatsapp_id]);

  function adicionarContato(contato: ContatoOpcao) {
    if (capacidadeRestanteParaAdicionar === 0) {
      setLimiteContatosToast("Limite atingido");
      return;
    }
    if (
      contatoTemOptOutParaCategoria(
        contato,
        categoriaTemplateSelecionado
      )
    ) {
      setErro(
        "Este contato solicitou opt-out para a categoria do template selecionado."
      );
      return;
    }

    if (contatoEstaEmCooldownAplicavel(contato, categoriaTemplateSelecionado)) {
      setErro(
        contatoTemCooldownRateLimit(contato)
          ? "Este contato esta em pausa de 12 horas apos um rate limit da Meta."
          : "Este contato esta em pausa temporaria para disparos de marketing porque a Meta recusou uma entrega recente."
      );
      return;
    }

    const telefone = limparNumero(contato.telefone);

    if (contato.telefone_revisar === true) {
      setErro(
        "Este número está marcado para revisão na página de Contatos e precisa ser corrigido antes do disparo. Confira o DDI (Brasil: 55), o DDD da região e a quantidade de dígitos."
      );
      return;
    }

    if (!telefone || telefone.length < 10) {
      setErro(
        "O telefone deste contato não possui formato válido para disparo. Acesse a página de Contatos e confira o DDI (Brasil: 55), o DDD da região e a quantidade de dígitos."
      );
      return;
    }

    setErro("");
    invalidarDecisoesConflitoParaContatos([contato.id]);
    setContatosSelecionados((prev) => {
      if (prev.some((item) => item.id === contato.id)) return prev;
      if (prev.length >= limiteContatosSelecao) return prev;
      return [...prev, contato];
    });
  }

  function normalizarQuantidadeAcaoMassa(valor: string, maximo = 0) {
    const numero = Number.parseInt(String(valor || "").replace(/\D/g, ""), 10);
    if (!Number.isFinite(numero) || numero <= 0) return 0;
    const inteiro = Math.floor(numero);
    return maximo > 0 ? Math.min(inteiro, maximo) : inteiro;
  }

  function contatoElegivelParaAcaoMassa(contato: ContatoOpcao) {
    return contatoTemTelefoneValido(contato) &&
      !contatoTemOptOutParaCategoria(contato, categoriaTemplateSelecionado) &&
      !contatoEstaEmCooldownAplicavel(contato, categoriaTemplateSelecionado);
  }

  function montarParametrosContatosAcaoMassa(paginaAtual: number, limite: number) {
    const params = new URLSearchParams();
    if (buscaContato.trim()) params.set("busca", buscaContato.trim());

    const listaIdDaOrigem = origemFiltro.startsWith("lista:")
      ? origemFiltro.replace("lista:", "").trim()
      : "";

    if (listaIdDaOrigem) {
      params.set("lista_id", listaIdDaOrigem);
    } else if (origemFiltro.trim()) {
      params.set("origem", origemFiltro.trim());
    }

    if (campanhaFiltro.trim()) params.set("campanha", campanhaFiltro.trim());
    if (interesseFiltro.trim()) params.set("interesse", interesseFiltro.trim());
    if (classificacaoFiltro.trim()) params.set("classificacoes", classificacaoFiltro.trim());
    if (disparoAnteriorFiltroContatos.trim()) params.set("disparo_anterior_id", disparoAnteriorFiltroContatos.trim());
    if (telefoneRevisarFiltro === "true" || telefoneRevisarFiltro === "false") params.set("telefone_revisar", telefoneRevisarFiltro);
    if (integracaoId) params.set("integracao_whatsapp_id", integracaoId);
    if (integracaoId && somenteIntegracaoFiltro) params.set("filtrar_por_integracao", "true");
    if (mensagemDataInicioFiltro) params.set("mensagem_data_inicio", mensagemDataInicioFiltro);
    if (mensagemDataFimFiltro) params.set("mensagem_data_fim", mensagemDataFimFiltro);
    if (ultimoAtendenteFiltro) params.set("ultimo_atendente_id", ultimoAtendenteFiltro);
    if (integracaoId && optInFiltro) params.set("opt_in", optInFiltro);
    if (integracaoId && optOutFiltro) params.set("opt_out", optOutFiltro);
    params.set("pagina", String(paginaAtual));
    params.set("limite", String(limite));
    params.set("contagem_otimizada", "true");
    params.set("incluir_historico_disparo", "true");
    return params;
  }

  async function buscarContatosParaAdicionarEmMassa(quantidade: number) {
    const idsProcessados = new Set(
      contatosSelecionados.map((contato) => contato.id)
    );
    const semDisparoAnterior: ContatoOpcao[] = [];
    const comDisparoAnterior: ContatoOpcao[] = [];

    const adicionar = (contato: ContatoOpcao) => {
      if (idsProcessados.has(contato.id)) return;
      idsProcessados.add(contato.id);

      if (!contatoElegivelParaAcaoMassa(contato)) return;

      if (contato.ja_recebeu_disparo === true) {
        comDisparoAnterior.push(contato);
        return;
      }

      semDisparoAnterior.push(contato);
    };

    const limitePagina = 500;
    let totalPaginas = Math.max(
      1,
      Math.ceil(totalContatosDisponiveis / limitePagina)
    );
    let paginaAtual = 1;

    // Mantém a ordenação atual da consulta dentro de cada grupo. Primeiro
    // percorremos contatos sem nenhum disparo enviado; somente se eles não
    // preencherem a quantidade solicitada usamos contatos já disparados.
    while (
      semDisparoAnterior.length < quantidade &&
      paginaAtual <= totalPaginas
    ) {
      const params = montarParametrosContatosAcaoMassa(
        paginaAtual,
        limitePagina
      );
      const resposta = await fetch("/api/contatos?" + params.toString(), {
        cache: "no-store",
      });
      const json = await resposta.json();

      if (!resposta.ok) {
        throw new Error(
          json.error || "Erro ao carregar contatos para a seleção em massa."
        );
      }

      const lista = Array.isArray(json.contatos)
        ? (json.contatos as ContatoOpcao[])
        : [];

      const totalPaginasResposta = Number(json.totalPaginas || 0);
      if (
        Number.isFinite(totalPaginasResposta) &&
        totalPaginasResposta > 0
      ) {
        totalPaginas = totalPaginasResposta;
      }

      lista.forEach(adicionar);

      if (lista.length < limitePagina || paginaAtual >= totalPaginas) break;
      paginaAtual += 1;
    }

    return [
      ...semDisparoAnterior,
      ...comDisparoAnterior,
    ].slice(0, quantidade);
  }

  async function adicionarTodosDisponiveis() {
    const quantidadeInformada = normalizarQuantidadeAcaoMassa(
      quantidadeAdicionarContatos,
      totalContatosDisponiveis
    );
    const quantidadeSolicitada = quantidadeInformada > 0
      ? quantidadeInformada
      : Math.min(
          limiteContatosSelecao - contatosSelecionados.length,
          Math.max(totalContatosDisponiveis, contatosDisponiveisValidos.length)
        );
    const capacidadeDisponivel = capacidadeRestanteParaAdicionar;
    const quantidadeAlvo =
      typeof capacidadeDisponivel === "number"
        ? Math.min(quantidadeSolicitada, capacidadeDisponivel)
        : quantidadeSolicitada;

    if (
      typeof capacidadeDisponivel === "number" &&
      capacidadeDisponivel <= 0
    ) {
      setLimiteContatosToast("Limite atingido");
      return;
    }

    if (quantidadeAlvo <= 0 || totalContatosDisponiveisRestantes <= 0) {
      setErro("Nenhum contato válido disponível para adicionar.");
      return;
    }

    try {
      setAdicionandoContatosEmMassa(true);
      setErro("");
      setMensagem("");

      const novos = await buscarContatosParaAdicionarEmMassa(quantidadeAlvo);

      if (novos.length === 0) {
        setErro("Nenhum contato válido disponível para adicionar com os filtros atuais.");
        return;
      }

      invalidarDecisoesConflitoParaContatos(novos.map((contato) => contato.id));
      setContatos((atuais) => {
        const mapa = new Map(atuais.map((contato) => [contato.id, contato]));
        novos.forEach((contato) => mapa.set(contato.id, contato));
        return Array.from(mapa.values());
      });
      setContatosSelecionados((atuais) => {
        const ids = new Set(atuais.map((contato) => contato.id));
        const vagas = Math.max(0, limiteContatosSelecao - atuais.length);
        return [...atuais, ...novos.filter((contato) => !ids.has(contato.id)).slice(0, vagas)];
      });
      setQuantidadeAdicionarContatos("");

      const limitadoPelaCapacidade =
        typeof capacidadeDisponivel === "number" &&
        quantidadeSolicitada > capacidadeDisponivel;

      setMensagem(
        limitadoPelaCapacidade
          ? String(novos.length) +
              (agendarDisparo
                ? " contato(s) adicionado(s). A seleção atingiu a quantidade planejada para o agendamento."
                : " contato(s) adicionado(s). A seleção atingiu a quantidade planejada para envio imediato.")
          : quantidadeInformada > 0
          ? String(novos.length) + " contato(s) adicionado(s)."
          : "Todos os " + String(novos.length) + " contato(s) disponíveis foram adicionados."
      );
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Erro ao adicionar contatos em massa."
      );
    } finally {
      setAdicionandoContatosEmMassa(false);
    }
  }

  function removerContato(contatoId: string) {
    setContatosSelecionados((prev) => prev.filter((item) => item.id !== contatoId));
  }

  function removerSelecionadosFiltrados() {
    const quantidadeInformada = normalizarQuantidadeAcaoMassa(
      quantidadeRemoverContatos,
      contatosSelecionadosFiltrados.length
    );
    const quantidade = quantidadeInformada > 0
      ? quantidadeInformada
      : contatosSelecionadosFiltrados.length;

    if (quantidade <= 0) {
      setErro("Nenhum contato selecionado para remover.");
      return;
    }

    const removidos = contatosSelecionadosFiltrados.slice(0, quantidade);
    const ids = new Set(removidos.map((contato) => contato.id));
    setContatosSelecionados((atuais) =>
      atuais.filter((contato) => !ids.has(contato.id))
    );
    invalidarDecisoesConflitoParaContatos(Array.from(ids));
    setQuantidadeRemoverContatos("");
    setErro("");
    setMensagem(String(removidos.length) + " contato(s) removido(s).");
  }

  function limparSelecao() {
    setContatosSelecionados([]);
    setMensagem("");
    setErro("");
    setErroConflitos("");
    setGruposConflitoDisparo([]);
    setConflitosPorContato({});
    setDecisoesConflitoDisparo({});
  }

  function invalidarDecisoesConflitoParaContatos(contatoIds: string[]) {
    const ids = new Set(contatoIds.filter(Boolean));

    if (ids.size === 0) return;

    setDecisoesConflitoDisparo((prev) => {
      const proximo: Record<string, DecisaoConflitoDisparo> = {};

      for (const [campanhaId, decisao] of Object.entries(prev)) {
        const contatoIdsRestantes = decisao.contatoIds.filter(
          (contatoId) => !ids.has(contatoId)
        );

        if (contatoIdsRestantes.length === 0) continue;

        proximo[campanhaId] = {
          ...decisao,
          contatoIds: contatoIdsRestantes,
        };
      }

      return proximo;
    });
  }

  function marcarGrupoConflitoComoIncluido(grupo: GrupoConflitoDisparo) {
    const contatoIds = grupo.contatos_ids.filter((contatoId) =>
      contatosSelecionados.some((contato) => contato.id === contatoId)
    );

    if (contatoIds.length === 0) return;

    setDecisoesConflitoDisparo((prev) => ({
      ...prev,
      [grupo.campanha_id]: {
        acao: "incluir",
        contatoIds,
      },
    }));
  }

  function removerGrupoConflitoDoEnvio(grupo: GrupoConflitoDisparo) {
    const scrollXAntes = window.scrollX;
    const scrollYAntes = window.scrollY;
    const contatoIdsGrupo = grupo.contatos_ids.filter((contatoId) =>
      contatosSelecionados.some((contato) => contato.id === contatoId)
    );
    const contatoIdsParaRemover = new Set<string>();

    for (const contatoId of contatoIdsGrupo) {
      const outrosGrupos = gruposConflitoAtivos.filter(
        (outroGrupo) =>
          outroGrupo.campanha_id !== grupo.campanha_id &&
          outroGrupo.contatos_ids.includes(contatoId)
      );
      const manterPorOutroGrupo = outrosGrupos.some((outroGrupo) => {
        const decisao = decisoesConflitoDisparo[outroGrupo.campanha_id];
        const contatoJaDecidido = decisao?.contatoIds?.includes(contatoId);

        return decisao?.acao === "incluir" || !contatoJaDecidido;
      });

      if (!manterPorOutroGrupo) {
        contatoIdsParaRemover.add(contatoId);
      }
    }

    setDecisoesConflitoDisparo((prev) => ({
      ...prev,
      [grupo.campanha_id]: {
        acao: "remover",
        contatoIds: contatoIdsGrupo,
      },
    }));

    if (contatoIdsParaRemover.size > 0) {
      setContatosSelecionados((prev) =>
        prev.filter((contato) => !contatoIdsParaRemover.has(contato.id))
      );
    }

    const restaurarScroll = () => {
      window.scrollTo({
        left: scrollXAntes,
        top: scrollYAntes,
        behavior: "auto",
      });
    };

    requestAnimationFrame(() => {
      restaurarScroll();
      requestAnimationFrame(restaurarScroll);
    });
  }

  function formatarMoedaBRL(valor?: number | null) {
    return Number(valor || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function formatarMoedaUSD(valor?: number | null) {
    return `US$ ${Number(valor || 0).toFixed(4)}`;
  }

  function formatarNumeroCotacao(valor?: number | null) {
    return Number(valor || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }

  async function carregarVariaveisPersonalizadas(
    options: { erroNoModal?: boolean } = {}
  ) {
    try {
      setLoadingVariaveis(true);

      const res = await fetch("/api/variaveis", {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar variáveis.");
      }

      setVariaveisPersonalizadas(
        Array.isArray(json.variaveis) ? json.variaveis : []
      );
    } catch (error: unknown) {
      const mensagem =
        error instanceof Error ? error.message : "Erro ao carregar variáveis.";

      if (options.erroNoModal) {
        setErroVariavelModal(mensagem);
      } else {
        setErro(mensagem);
      }
    } finally {
      setLoadingVariaveis(false);
    }
  }

  async function salvarVariavelPersonalizada() {
    try {
      setErro("");
      setErroVariavelModal("");
      setMensagem("");

      const chave = normalizarEntradaVariavelTemplate(novaVariavelChave);
      const valor = novaVariavelValor.trim();

      if (!chave) {
        setErroVariavelModal("Informe o nome da variável.");
        return;
      }

      if (!valor) {
        setErroVariavelModal("Informe o valor da variável.");
        return;
      }

      setSalvandoVariavel(true);

      const res = await fetch("/api/variaveis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chave,
          valor,
          descricao: novaVariavelDescricao.trim(),
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao salvar variável.");
      }

      setNovaVariavelChave("");
      setNovaVariavelValor("");
      setNovaVariavelDescricao("");

      setMensagem("Variável salva com sucesso.");
      await carregarVariaveisPersonalizadas({ erroNoModal: true });
    } catch (error: unknown) {
      setErroVariavelModal(
        error instanceof Error ? error.message : "Erro ao salvar variável."
      );
    } finally {
      setSalvandoVariavel(false);
    }
  }

  async function removerVariavelPersonalizada(id: string) {
    try {
      setErro("");
      setErroVariavelModal("");
      setMensagem("");

      const res = await fetch("/api/variaveis", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao remover variável.");
      }

      setMensagem("Variável removida com sucesso.");
      await carregarVariaveisPersonalizadas({ erroNoModal: true });
    } catch (error: unknown) {
      setErroVariavelModal(
        error instanceof Error ? error.message : "Erro ao remover variável."
      );
    }
  }

  function aplicarVariavelNoCampo(chave: string) {
    const valor = normalizarEntradaVariavelTemplate(chave);

    if (!valor) return;

    if (totalVariaveis <= 1) {
      setTemplateVariavel1(valor);
      return;
    }

    if (!templateVariavel1.trim()) {
      setTemplateVariavel1(valor);
      return;
    }

    if (totalVariaveis >= 2 && !templateVariavel2.trim()) {
      setTemplateVariavel2(valor);
      return;
    }

    if (totalVariaveis >= 3 && !templateVariavel3.trim()) {
      setTemplateVariavel3(valor);
      return;
    }

    if (totalVariaveis >= 4 && !templateVariavel4.trim()) {
      setTemplateVariavel4(valor);
      return;
    }

    if (totalVariaveis >= 5 && !templateVariavel5.trim()) {
      setTemplateVariavel5(valor);
      return;
    }

    if (totalVariaveis >= 6 && !templateVariavel6.trim()) {
      setTemplateVariavel6(valor);
      return;
    }

    setTemplateVariavel1(valor);
  }


  function variaveisUsamProtocolo(variaveis: string[]) {
    return variaveis.some((variavel) => {
      const chave = normalizarVariavelTemplate(variavel);

      return chave === "protocolo_atual" || chave === "ultimo_protocolo";
    });
  }

  async function carregarProtocolosDosContatos(
    contatosLista: ContatoOpcao[]
  ): Promise<ProtocolosContatoMap> {
    try {
      if (contatosLista.length === 0) return {};

      const res = await fetch("/api/variaveis/protocolos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contato_ids: contatosLista.map((contato) => contato.id),
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao buscar protocolos dos contatos.");
      }

      return json.protocolos || {};
    } catch (error: any) {
      throw new Error(error?.message || "Erro ao buscar protocolos dos contatos.");
    }
  }

  async function cancelarCampanhaEmAndamento() {
    if (!campanhaPagina?.id || !campanhaPaginaAtiva) return;
    if (!podeDisparar) {
      setErro("Você não tem permissão para cancelar disparos.");
      return;
    }

    try {
      setCancelandoCampanha(true);
      setErro("");
      setMensagem("");

      const res = await fetch(
        `/api/whatsapp/disparos/${encodeURIComponent(
          campanhaPagina.id
        )}/cancelar`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            motivo: "Cancelado manualmente na tela de disparos.",
          }),
        }
      );
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao cancelar disparo em massa.");
      }

      const resumo =
        json.resumo && typeof json.resumo === "object" ? json.resumo : {};
      const total = Number(
        resumo.total_itens ?? campanhaPagina.total ?? 0
      );
      const enviados = Number(
        resumo.total_enviados ?? campanhaPagina.enviados ?? 0
      );
      const falhas = Number(
        resumo.total_falhas ?? campanhaPagina.falhas ?? 0
      );
      const cancelados = Number(
        resumo.total_cancelados ??
          Math.max(total - enviados - falhas, 0)
      );

      setCampanhaPagina((atual) =>
        atual
          ? {
              ...atual,
              status: "cancelada",
              enviados,
              falhas,
              cancelados,
              pendentes: 0,
              processando: 0,
              processados: Math.min(
                total,
                enviados + falhas + cancelados
              ),
              motivo:
                json.motivo ||
                "Disparo em massa cancelado manualmente.",
              updated_at: new Date().toISOString(),
              finished_at: new Date().toISOString(),
            }
          : atual
      );
      setDisparoEmMassaProcessando(false);
      setIntegracaoDisparoProcessando(false);
      setModalCancelarCampanhaAberto(false);
      setMensagem(
        `Disparo cancelado. Enviados: ${enviados}. Cancelados: ${cancelados}.`
      );
      emitirRefreshDisparoEmMassa();

      await Promise.all([
        carregarHistorico(),
        carregarBloqueioDisparoEmMassa(integracaoId),
      ]);
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Erro ao cancelar disparo em massa."
      );
      setModalCancelarCampanhaAberto(false);
      await carregarCampanhaPagina(integracaoId);
    } finally {
      setCancelandoCampanha(false);
    }
  }


  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setMensagem("");
    setErro("");

    if (!podeDisparar) {
      setErro("Você não tem permissão para realizar disparos.");
      return;
    }

    if (disparoBloqueado && !agendarDisparo) {
      setErro(
        "Já existe um disparo em massa em processamento nesta integração WhatsApp. Selecione outra integração ou aguarde a finalização."
      );
      return;
    }

    if (!integracaoId) {
      setErro("Selecione a integração WhatsApp.");
      return;
    }

    if (!templateId) {
      setErro("Selecione o template.");
      return;
    }

    if (contatosSelecionados.length === 0) {
      setErro("Selecione pelo menos um contato.");
      return;
    }

    if (temContatosOptOut) {
      setErro(
        "A seleção possui contatos com opt-out para a categoria do template. Remova-os para continuar."
      );
      return;
    }

    if (temContatosCooldown) {
      setErro(
        "A seleção possui contatos em pausa temporária da Meta. Remova-os para continuar."
      );
      return;
    }

    if (listaFriaSemOptOut) {
      setErro(
        "Este template não possui o rodapé de opt-out necessário para envio à lista fria. Recrie o template com a instrução para responder SAIR."
      );
      return;
    }

    let executarEm: Date | null = null;

    if (agendarDisparo) {
      if (!agendamentoData || !agendamentoHora) {
        setErro("Selecione a data e a hora do disparo agendado.");
        return;
      }

      executarEm = new Date(`${agendamentoData}T${agendamentoHora}:00`);

      if (
        Number.isNaN(executarEm.getTime()) ||
        executarEm.getTime() <= Date.now()
      ) {
        setErro("A data e a hora do agendamento precisam ser futuras.");
        return;
      }

      if (agendamentoImpossivelPeloLimiteMeta) {
        setErro(
          "Esta seleção ultrapassa a capacidade da Meta para um único disparo. Divida os contatos em mais de um agendamento."
        );
        return;
      }

      if (
        typeof horarioLiberacaoMetaMs === "number" &&
        Number.isFinite(horarioLiberacaoMetaMs) &&
        executarEm.getTime() < horarioLiberacaoMetaMs
      ) {
        setErro(
          `O limite de 24 horas ainda estará ocupado nesse horário. Agende a partir de ${formatarDataHora(
            horarioLiberacaoMeta
          )}.`
        );
        return;
      }
    }

    if (temConflitosPendentes) {
      setErro(
        "Resolva os contatos repetidos dos ultimos 7 dias antes de enviar o disparo."
      );
      return;
    }

    if (totalVariaveis > 6) {
      setErro("Este template usa mais de 6 variáveis. Use um template com até 6 variáveis para esta tela.");
      return;
    }

    const variaveisObrigatorias = variaveisTemplate
      .slice(0, totalVariaveis)
      .map((item) => normalizarVariavelTemplate(item));

    if (variaveisObrigatorias.some((item) => !item)) {
      setErro("Preencha todos os campos de variável exigidos pelo template.");
      return;
    }

    let timerPreparacao: number | null = null;

    try {
      setDisparando(true);

      if (!agendarDisparo) {
        timerPreparacao = window.setTimeout(() => {
          setDisparando(false);
          setIntegracaoPreparandoEmSegundoPlanoId(integracaoId);
          setDisparoEmMassaProcessando(true);
          setIntegracaoDisparoProcessando(true);

          emitirPreparacaoDisparoEmMassa({
            ativo: true,
            integracaoWhatsappId: integracaoId,
            integracaoNome:
              integracaoSelecionada?.nome_conexao ||
              integracaoSelecionada?.numero ||
              "Integração WhatsApp",
            total: contatosSelecionados.length,
            nome: nomeCampanhaDisparo || "Disparo em massa",
          });

          emitirRefreshDisparoEmMassa();
          setMensagem(
            "A campanha continua sendo preparada em segundo plano. Você já pode continuar usando o sistema."
          );
        }, TEMPO_MAXIMO_LOADING_PREPARACAO_MS);
      }

      if (agendarDisparo && executarEm) {
        const protocolosReserva = contatosReserva.length && variaveisUsamProtocolo(variaveisObrigatorias)
        ? await carregarProtocolosDosContatos(contatosReserva) : {};
      const reservasAgendadas = contatosReserva.map((contato) => ({
        contato_id: contato.id,
        numero: limparNumero(contato.telefone),
        nome_contato: contato.nome,
        variaveis: variaveisObrigatorias.map((variavel) =>
          variavel === "nome_captura" || variavel === "primeiro_nome_captura"
            ? `{{${variavel}}}`
            : resolverVariavelContato(variavel, contato, variaveisPersonalizadas, protocolosReserva)),
      }));
      const res = await fetch("/api/disparos-agendados/criar", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            integracao_whatsapp_id: integracaoId,
            template_id: templateId,
            nome_campanha: nomeCampanhaDisparo,
            executar_em: executarEm.toISOString(),
            variaveis: variaveisObrigatorias,
            confirmacao_responsabilidade_lista_fria:
              templateComListaFria &&
              confirmacaoResponsabilidadeListaFria,
            contatos: contatosPrincipais.map((contato) => ({
              id: contato.id,
              nome: contato.nome,
              telefone: limparNumero(contato.telefone),
              email: contato.email || null,
              origem: obterOrigemContato(contato) || null,
              campanha: obterCampanhaContato(contato) || null,
              status_lead: contato.status_lead || null,
            })),
            reserva_ativa: contatosReservaAtivos && reservasAgendadas.length > 0,
            meta_quantidade_desejada: quantidadeDesejada,
            reserva_contatos: reservasAgendadas,
          }),
        });
        const json = await res.json();

        if (!res.ok || !json.ok) {
          if (json.disponivel_a_partir_de) {
            const campos = camposDataHoraLocal(json.disponivel_a_partir_de);

            if (campos) {
              setAgendamentoData(campos.data);
              setAgendamentoHora(campos.hora);
            }
          }

          throw new Error(json.error || "Erro ao agendar disparo.");
        }

        setMensagem(
          `Disparo agendado com sucesso para ${formatarDataHora(
            executarEm.toISOString()
          )}. Contatos: ${Number(
            json.quantidade || contatosSelecionados.length
          )}.`
        );
        solicitarAtualizacaoDisparosPendentesHeader();
        setAgendarDisparo(false);
        setAgendamentoData("");
        setAgendamentoHora("");
        setQuantidadePlanejada("");
        setContatosReservaAtivos(false);
        setPlanoCapacidadeConfirmado(null);
        setNomeCampanhaDisparo("");
        setContatosSelecionados([]);
        setModalCriacaoDisparoAberto(false);
        setConfirmacaoCobranca(false);
        setEtapaDisparo(1);
        return;
      }

      const protocolosPorContato = variaveisUsamProtocolo(variaveisObrigatorias)
        ? await carregarProtocolosDosContatos(contatosSelecionados)
        : {};

      const destinatarios = contatosSelecionados.map((contato) => ({
        contato_id: contato.id,
        numero: limparNumero(contato.telefone),
        variaveis:
          totalVariaveis > 0
            ? variaveisObrigatorias.map((variavel) =>
                variavel === "nome_captura" ||
                variavel === "primeiro_nome_captura"
                  ? `{{${variavel}}}`
                  : resolverVariavelContato(
                  variavel,
                  contato,
                  variaveisPersonalizadas,
                  protocolosPorContato
                )
              )
            : [],
      }));

      const res = await fetch("/api/whatsapp/disparos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          integracao_whatsapp_id: integracaoId,
          template_id: templateId,
          nome_campanha: nomeCampanhaDisparo,
          variaveis_config: variaveisObrigatorias,
          // CRM_LISTA_FRIA_CONFIRMACAO_DIRETA_V1
          confirmacao_responsabilidade_lista_fria:
            templateComListaFria &&
            confirmacaoResponsabilidadeListaFria,
          destinatarios: destinatarios.slice(0, contatosPrincipais.length),
          reserva_ativa: contatosReservaAtivos && contatosReserva.length > 0,
          meta_quantidade_desejada: quantidadeDesejada,
          reserva_destinatarios: contatosReservaAtivos
            ? destinatarios.slice(contatosPrincipais.length)
            : [],
        }),
      });

      const json = await res.json();

      if (timerPreparacao !== null) {
        window.clearTimeout(timerPreparacao);
        timerPreparacao = null;
      }

      if (!res.ok || !json.ok) {
        if (json.bloquear_disparos) {
          if (json.bloqueio_escopo === "integracao") {
            setIntegracaoDisparoProcessando(true);
          } else {
            setDisparoEmMassaProcessando(true);
          }

          if (json.campanha) {
            aplicarCampanhaPagina(json.campanha);
          } else {
            carregarCampanhaPagina(integracaoId);
          }

          emitirRefreshDisparoEmMassa();
        }

        const detalhe = json.detalhe ? `\n\n${json.detalhe}` : "";
        throw new Error(
          `${json.error || "Erro ao realizar disparo."}${detalhe}`
        );
      }

      if (json.queued) {
        setDisparando(false);
        setDisparoEmMassaProcessando(true);
        setIntegracaoDisparoProcessando(true);
        setAbaAtiva("resultados");

        // Após criar a campanha, devolvemos o controle da página ao usuário.
        // O acompanhamento continua no card flutuante e o modal só abre quando
        // o usuário clicar no card.
        setModalCampanhaAberto(false);

        void carregarCampanhaPagina(integracaoId);
        void carregarCampanhaPagina("", String(json.campanha_id || ""));
        emitirRefreshDisparoEmMassa();

        const totalCampanhaCriada = Number(
          json.total || contatosSelecionados.length
        );

        // Assim que a campanha foi aceita pela fila, o formulário deixa de
        // representar um rascunho válido. Limpamos os dados para impedir que
        // contatos enviados ou recém-bloqueados sejam reutilizados por engano.
        limparFormularioDisparo();
        setModalCriacaoDisparoAberto(false);

        if (usuarioLogado?.empresa_id) {
          invalidarHistoricoCacheEmpresa(usuarioLogado.empresa_id);
        }

        setMensagem(
          `Campanha criada e enfileirada. Os ${totalCampanhaCriada} disparos serão processados gradualmente em segundo plano.`
        );

        return;
      }

      const listaResultado = Array.isArray(json.resultados) ? json.resultados : [];

      const sucesso = listaResultado.filter((item: ResultadoDisparo) => item.ok).length;
      const falha = listaResultado.filter((item: ResultadoDisparo) => !item.ok).length;

      setMensagem(
        `Disparo enviado para a Meta. Aguardando confirmação de entrega pelo WhatsApp. Aceitos: ${sucesso}. Falhas imediatas: ${falha}.`
      );
      limparFormularioDisparo();
      setModalCriacaoDisparoAberto(false);

      await carregarHistorico({
        silencioso: abaAtiva !== "resultados",
      });

    } catch (error: any) {
      emitirPreparacaoDisparoEmMassa({
        ativo: false,
        integracaoWhatsappId: integracaoId,
      });
      setIntegracaoPreparandoEmSegundoPlanoId("");
      setErro(error?.message || "Erro ao realizar disparo.");
    } finally {
      if (timerPreparacao !== null) {
        window.clearTimeout(timerPreparacao);
      }
      if (integracaoId) {
        carregarSaudeMeta(integracaoId);
        carregarBloqueioDisparoEmMassa(integracaoId);
        carregarCampanhaPagina(integracaoId);
      }

      setDisparando(false);
    }
  }


  async function calcularPreviewCusto(
    categoria: string,
    contatosLista: ContatoOpcao[]
  ) {
    const requisicaoAtual = ++previewCustoRequisicaoRef.current;
    try {
      if (!categoria || contatosLista.length === 0) {
        setPreviewCusto(null);
        setLoadingPreviewCusto(false);
        return;
      }

      setLoadingPreviewCusto(true);

      const executarEmPreview =
        agendarDisparo && agendamentoData && agendamentoHora
          ? new Date(`${agendamentoData}T${agendamentoHora}:00`)
          : null;
      const executarEmPreviewIso =
        executarEmPreview && Number.isFinite(executarEmPreview.getTime())
          ? executarEmPreview.toISOString()
          : null;

      const res = await fetch("/api/whatsapp/disparos/custo-preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          categoria,
          integracao_whatsapp_id: integracaoId,
          executar_em: executarEmPreviewIso,
          contatos: contatosLista.map((contato) => ({
            id: contato.id,
            telefone: contato.telefone,
          })),
        }),
      });

      const json = await res.json();
      if (requisicaoAtual !== previewCustoRequisicaoRef.current) return;

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao calcular custo do disparo.");
      }

      const totalCobrados = Number(json.totalCobrados || 0);
      const valorTotalUsd = Number(json.valorTotalUsd || 0);

      const valorTotalBrlEstimado =
        totalCobrados <= 0 || valorTotalUsd <= 0
          ? 0
          : Number(json.valorTotalBrlEstimado || 0);

      const valorTotalBrlMin =
        totalCobrados <= 0 || valorTotalUsd <= 0
          ? 0
          : Math.max(0, Number(json.valorTotalBrlMin || 0));

      const valorTotalBrlMax =
        totalCobrados <= 0 || valorTotalUsd <= 0
          ? 0
          : Math.max(0, Number(json.valorTotalBrlMax || 0));

      setPreviewCusto({
        categoria: String(json.categoria || ""),
        totalSelecionados: Number(json.totalSelecionados || 0),
        totalIsentos: Number(json.totalIsentos || 0),
        totalCobrados,
        totalTelefonesIsentosUnicos: Number(
          json.totalTelefonesIsentosUnicos ?? 0
        ),
        totalTelefonesCobradosUnicos: Number(
          json.totalTelefonesCobradosUnicos ?? totalCobrados ?? 0
        ),
        totalTelefonesConsomemLimiteUnicos: Number(
          json.totalTelefonesConsomemLimiteUnicos ??
            json.totalTelefonesCobradosUnicos ??
            totalCobrados ??
            0
        ),
        totalTelefonesIsentosLimiteUnicos: Number(
          json.totalTelefonesIsentosLimiteUnicos ??
            json.totalTelefonesIsentosUnicos ??
            0
        ),
        valorUnitarioUsd: Number(json.valorUnitarioUsd || 0),
        valorTotalUsd,
        cotacaoUsdBrl: Number(json.cotacaoUsdBrl || 0),
        valorTotalBrlEstimado,
        valorTotalBrlMin,
        valorTotalBrlMax,
        margemMinPercent: Number(json.margemMinPercent || 0),
        margemMaxPercent: Number(json.margemMaxPercent || 0),
        fonteCotacao: json.fonteCotacao || "",
        cotacaoDataHora: json.cotacaoDataHora || null,
        cotacaoFallback: Boolean(json.cotacaoFallback),
        disponibilidadeAgendamentoMeta:
          json.disponibilidadeAgendamentoMeta || null,
      });
    } catch (error: any) {
      if (requisicaoAtual !== previewCustoRequisicaoRef.current) return;
      setPreviewCusto(null);
      setErro(error?.message || "Erro ao calcular custo do disparo.");
    } finally {
      if (requisicaoAtual === previewCustoRequisicaoRef.current) {
        setLoadingPreviewCusto(false);
      }
    }
  }

  function alternarMensagemExpandida(chave: string) {
    setMensagensExpandidas((prev) =>
      prev.includes(chave)
        ? prev.filter((item) => item !== chave)
        : [...prev, chave]
    );
  }

  function resumirMensagem(texto?: string | null) {
    const conteudo = String(texto || "").trim();

    if (!conteudo) return "Sem conteúdo";

    const partes = conteudo
      .split(/(?<=[.!?])\s+/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (partes.length === 0) return conteudo;

    return partes[0];
  }

  function formatarBRL(valor: number) {
  return valor < 1
    ? valor.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 3,
      })
    : valor.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
}


  function abrirModalCriacaoDisparo() {
    if (!podeDisparar || loadingUsuario || loadingIntegracoes) return;
    setErro("");
    setEtapaDisparo(1);
    setModalCriacaoDisparoAberto(true);
  }

  function fecharModalCriacaoDisparo() {
    if (disparando) return;
    setModalCriacaoDisparoAberto(false);
    setErro("");
  }

  function destacarCampoDisparo(campo: string) {
    setCampoPendente("");
    window.requestAnimationFrame(() => setCampoPendente(campo));
  }

  useEffect(() => {
    if (!campoPendente || !modalCriacaoDisparoAberto) return;
    const alvo = document.querySelector<HTMLElement>(`[data-disparo-campo="${campoPendente}"]`);
    if (!alvo) return;
    alvo.scrollIntoView({ behavior: "smooth", block: "center" });
    const controle = alvo.matches("input,select,button")
      ? alvo
      : alvo.querySelector<HTMLElement>("input:not(:disabled),select:not(:disabled),button:not(:disabled)");
    controle?.focus({ preventScroll: true });
    const timeout = window.setTimeout(() => setCampoPendente(""), 1800);
    return () => window.clearTimeout(timeout);
  }, [campoPendente, etapaDisparo, modalCriacaoDisparoAberto]);

  function avancarEtapaDisparo() {
    setErro("");
    if (etapaDisparo === 1) {
      if (!integracaoId) { setErro("Selecione um número WhatsApp."); destacarCampoDisparo("integracao"); return; }
      if (!templateId) { setErro("Selecione um template aprovado."); destacarCampoDisparo("template"); return; }
      if (totalVariaveis > 6) { setErro("Este template aceita no máximo seis variáveis."); return; }
      if (temVariaveisObrigatoriasPendentes) {
        setErro("Selecione todas as variáveis obrigatórias antes de continuar.");
        destacarCampoDisparo("variaveis");
        return;
      }
      setEtapaDisparo(2);
      void carregarSaudeMeta(integracaoId);
    } else if (etapaDisparo === 2) {
      if (loadingSaudeMeta || !limiteMeta) {
        setErro("Aguarde a consulta de capacidade da Meta antes de continuar.");
        destacarCampoDisparo("capacidade");
        return;
      }
      if (!Number.isInteger(quantidadeDesejada) || quantidadeDesejada <= 0) {
        setErro("Informe uma quantidade válida de destinatários.");
        destacarCampoDisparo("quantidade");
        return;
      }
      if (quantidadeExcedeLimiteTotal) {
        setErro("A quantidade ultrapassa o limite total do número. Divida em campanhas menores.");
        destacarCampoDisparo("quantidade");
        return;
      }
      if (!planoCapacidadeConfirmado) {
        setErro("Escolha enviar a quantidade disponível agora ou agendar a quantidade desejada.");
        destacarCampoDisparo("momento");
        return;
      }
      if (!agendarDisparo && (capacidadeInsuficienteAgora || disparoBloqueado)) {
        setErro("A capacidade disponível agora não comporta a quantidade desejada.");
        destacarCampoDisparo("momento");
        return;
      }
      if (agendarDisparo) {
        const horario = new Date(`${agendamentoData}T${agendamentoHora}:00`).getTime();
        const projetada = liberacoesPlanejamento.reduce(
          (vagas, item) => new Date(item.horario).getTime() <= horario
            ? Number(item.disponivelAcumulado || vagas) : vagas,
          capacidadeAgoraPlanejamento
        );
        if (!agendamentoData || !agendamentoHora || !Number.isFinite(horario) ||
            horario <= Date.now() || projetada < quantidadeDesejada) {
          setErro("Escolha uma data futura em que a previsão comporte toda a quantidade desejada.");
          destacarCampoDisparo("horario");
          return;
        }
      }
      if (contatosSelecionados.length > limiteContatosSelecao) {
        setContatosSelecionados((anteriores) => anteriores.slice(0, limiteContatosSelecao));
      }
      setEtapaDisparo(3);
    } else if (etapaDisparo === 3) {
      abrirConfirmacaoDisparo();
    }
  }

  function abrirConfirmacaoDisparo() {
    if (!podeDisparar) {
      setErro("Você não tem permissão para realizar disparos.");
      return;
    }

    if (!integracaoId || !templateId || temVariaveisObrigatoriasPendentes) {
      setErro("Complete a configuração da mensagem e das variáveis.");
      setEtapaDisparo(1);
      destacarCampoDisparo(!integracaoId ? "integracao" : !templateId ? "template" : "variaveis");
      return;
    }
    if (contatosSelecionados.length === 0) {
      setErro("Selecione pelo menos um contato para continuar.");
      destacarCampoDisparo("contatos");
      return;
    }
    if (contatosSelecionados.length > limiteContatosSelecao) {
      setErro("A seleção ultrapassa a quantidade planejada, incluindo a reserva.");
      destacarCampoDisparo("contatos");
      return;
    }
    if (loadingConflitos || temConflitosPendentes) {
      setErro("Resolva os contatos repetidos antes de continuar.");
      destacarCampoDisparo("conflitos");
      return;
    }
    if (!agendarDisparo && (disparoBloqueado || selecaoExcedeLimite)) {
      setErro("A integração está sem capacidade disponível para este disparo.");
      return;
    }
    if (agendamentoInvalidoPeloLimiteMeta) {
      setErro("Ajuste o agendamento de acordo com a capacidade da Meta.");
      destacarCampoDisparo("horario");
      return;
    }
    if (loadingPreviewCusto || !previewCusto) {
      setErro("Aguarde a estimativa de custo do disparo antes de continuar.");
      destacarCampoDisparo("custo");
      return;
    }

    if (agendarDisparo) {
      const executarEm = new Date(
        `${agendamentoData}T${agendamentoHora}:00`
      );

      if (
        !agendamentoData ||
        !agendamentoHora ||
        Number.isNaN(executarEm.getTime()) ||
        executarEm.getTime() <= Date.now()
      ) {
        setErro("Selecione uma data e hora futuras para o agendamento.");
        destacarCampoDisparo("horario");
        return;
      }
    }

    if (temContatosOptOut) {
      setErro(
        "A seleção possui contatos com opt-out para a categoria do template. Remova-os para continuar."
      );
      return;
    }

    if (temContatosCooldown) {
      setErro(
        "A seleção possui contatos em pausa temporária da Meta. Remova-os para continuar."
      );
      return;
    }

    if (listaFriaSemOptOut) {
      setErro(
        "Este template não possui o rodapé de opt-out necessário para envio à lista fria. Recrie o template com a instrução para responder SAIR."
      );
      return;
    }

    setErro("");
    setConfirmacaoCobranca(false);
    setConfirmacaoResponsabilidadeListaFria(false);
    setEtapaDisparo(4);
  }

  async function confirmarEDisparar() {
    if (!confirmacaoCobranca) return;

    if (templateComListaFria) {
      setConfirmacaoResponsabilidadeListaFria(false);
      setModalResponsabilidadeListaFriaAberto(true);
      return;
    }

    const fakeEvent = {
      preventDefault: () => {},
    } as React.FormEvent<HTMLFormElement>;

    await handleSubmit(fakeEvent);
  }

  async function confirmarResponsabilidadeEDisparar() {
    if (!confirmacaoResponsabilidadeListaFria || !templateComListaFria) return;

    setModalResponsabilidadeListaFriaAberto(false);

    const fakeEvent = {
      preventDefault: () => {},
    } as React.FormEvent<HTMLFormElement>;

    await handleSubmit(fakeEvent);
    setConfirmacaoResponsabilidadeListaFria(false);
  }

  function renderBadgeCooldownContato(contato: ContatoOpcao) {
    if (contatoTemCooldownRateLimit(contato)) {
      const expiraEm = contato.whatsapp_disparo_cooldown_expira_em;
      const tooltip = [
        "A Meta aplicou rate limit para este contato.",
        "Novos disparos ficam bloqueados por 12 horas para evitar a repeticao do erro.",
        expiraEm ? `Expira em ${formatarDataHora(expiraEm)}.` : "",
      ]
        .filter(Boolean)
        .join(" ");

      return (
        <span className={styles.contactBadgeRateLimit} title={tooltip}>
          Pausa 12hr
        </span>
      );
    }

    if (!contatoTemCooldownMarketing(contato)) return null;
    if (categoriaTemplateSelecionado === "utility") return null;

    const duracao = formatarDuracaoCooldownContato(contato);
    const expiraEm = contato.whatsapp_disparo_cooldown_expira_em;
    const tooltip = [
      "Pausa temporaria para disparos de marketing.",
      "A Meta recusou uma entrega recente para este contato por limite de qualidade ou frequencia.",
      expiraEm ? `Expira em ${formatarDataHora(expiraEm)}.` : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <span className={styles.contactBadgeCooldown} title={tooltip}>
        Pausa {duracao}
      </span>
    );
  }

  function renderBadgesDisparoAntigo(contato: ContatoOpcao) {
    const campanhas =
      historicoDisparosPorContato[contato.id] ||
      conflitosPorContato[contato.id] ||
      [];

    if (campanhas.length === 0) return null;

    const campanhasVisiveis = campanhas.slice(0, 3);
    const totalOculto = Math.max(0, campanhas.length - campanhasVisiveis.length);

    return (
      <div className={styles.massHistoryBadges}>
        {campanhasVisiveis.map((campanha) => (
          <span
            key={`${contato.id}-${campanha.campanha_id}`}
            className={styles.massHistoryBadge}
            title={`${campanha.campanha_nome}${
              campanha.enviado_em
                ? ` - ${formatarDataHora(campanha.enviado_em)}`
                : ""
            }`}
          >
            {truncarNomeBadge(campanha.campanha_nome, 70)}
          </span>
        ))}

        {totalOculto > 0 ? (
          <span className={styles.massHistoryBadgeMore}>+{totalOculto}</span>
        ) : null}
      </div>
    );
  }


  useEffect(() => {
    if (!falhaModal) return;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const fecharComEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFalhaModal(null);
    };
    document.addEventListener("keydown", fecharComEscape);
    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener("keydown", fecharComEscape);
    };
  }, [falhaModal]);

  useEffect(() => {
    if (!modalCriacaoDisparoAberto) return;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const fecharComEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !disparando && !modalVariaveisAberto &&
        !modalResponsabilidadeListaFriaAberto) {
        setModalCriacaoDisparoAberto(false);
        setErro("");
      }
    };
    document.addEventListener("keydown", fecharComEscape);
    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener("keydown", fecharComEscape);
    };
  }, [modalCriacaoDisparoAberto, disparando, modalVariaveisAberto, modalResponsabilidadeListaFriaAberto]);

  useEffect(() => {
    const categoria = String(templateSelecionado?.categoria || "").toLowerCase();

    if (!categoria || contatosSelecionados.length === 0) {
      previewCustoRequisicaoRef.current += 1;
      setPreviewCusto(null);
      setLoadingPreviewCusto(false);
      return;
    }

    void calcularPreviewCusto(categoria, contatosPrincipais);
  }, [
    templateSelecionado,
    contatosSelecionados,
    quantidadeDesejada,
    integracaoId,
    agendarDisparo,
    agendamentoData,
    agendamentoHora,
  ]);

  return (
    <>
      <Header title="Disparos em massa"
        subtitle="Acompanhe suas campanhas WhatsApp e consulte os resultados de cada envio." />
      <div className={abaAtiva === "resultados" && filtroHistoricoCampanha ? [styles.pageContent, styles.pageContentCampaignReport].join(" ") : styles.pageContent}>
        {mensagem ? <FeedbackToast success={mensagem} onSuccessDismiss={() => setMensagem("")} /> : null}
        {!modalCriacaoDisparoAberto && erro ? <div className={styles.errorAlert} role="alert">{erro}</div> : null}
        <div className={modalCriacaoDisparoAberto ? [styles.layout, styles.layoutWizardOpen].join(" ") : styles.layout}>
          {modalCriacaoDisparoAberto ? (
            <div className={styles.disparoWizardOverlay}
              onMouseDown={(event) => { if (event.target === event.currentTarget) fecharModalCriacaoDisparo(); }}>
              {limiteContatosToast ? (
                <FeedbackToast
                  error={limiteContatosToast}
                  onErrorDismiss={() => setLimiteContatosToast("")}
                  duration={3500}
                />
              ) : null}
              <section className={styles.disparoWizardModal} role="dialog" aria-modal="true"
                aria-labelledby="disparo-wizard-titulo">
                <header className={styles.disparoWizardHeader}>
                  <div className={styles.disparoWizardHeaderIntro}>
                    <p className={styles.eyebrow}>WHATSAPP BUSINESS • DISPARO EM MASSA</p>
                    <h2 id="disparo-wizard-titulo">Enviar disparos</h2>
                    <span>Configure a mensagem, selecione os destinatários e confirme o envio.</span>
                  </div>
                  <div className={`${styles.disparoWizardHeading} ${styles.disparoWizardHeaderStep}`}>
                    <span>ETAPA {etapaDisparo} DE 4</span>
                    <h3>{etapaDisparo === 1 ? "Mensagem e variáveis" : etapaDisparo === 2 ? "Capacidade e agendamento" : etapaDisparo === 3 ? "Contatos" : agendarDisparo ? "Confirmar agendamento" : "Confirmar disparo"}</h3>
                    <p>{etapaDisparo === 1 ? "Configure a mensagem e suas variáveis." : etapaDisparo === 2 ? "Defina a quantidade e o momento do envio." : etapaDisparo === 3 ? "Escolha os contatos até o limite planejado." : "Revise os contatos, o horário e a estimativa de cobrança."}</p>
                  </div>
                  <button type="button" className={styles.disparoWizardClose}
                    aria-label="Fechar envio de disparos" disabled={disparando}
                    onClick={fecharModalCriacaoDisparo}>✕</button>
                </header>
                {loadingUsuario || loadingIntegracoes ? (
                  <div className={styles.emptyState}>Carregando dados...</div>
                ) : !podeDisparar ? (
                  <div className={styles.emptyState}>Você não tem permissão para realizar disparos.</div>
                ) : (
                  <form onSubmit={(event) => event.preventDefault()} className={styles.disparoWizardForm}>
                    <nav className={styles.disparoWizardSteps} aria-label="Etapas do disparo">
                      {[
                        { numero: 1, titulo: "Mensagem e variáveis" },
                        { numero: 2, titulo: "Capacidade e agendamento" },
                        { numero: 3, titulo: "Contatos" },
                        { numero: 4, titulo: "Confirmar disparo" },
                      ].map((item) => (
                        <button key={item.numero} type="button"
                          disabled={disparando || item.numero >= etapaDisparo}
                          className={[
                            styles.disparoWizardStep,
                            etapaDisparo === item.numero ? styles.disparoWizardStepCurrent : "",
                            etapaDisparo > item.numero ? styles.disparoWizardStepCompleted : "",
                          ].filter(Boolean).join(" ")}
                          aria-current={etapaDisparo === item.numero ? "step" : undefined}
                          onClick={() => { setEtapaDisparo(item.numero as 1 | 2 | 3 | 4); setErro(""); }}>
                          <span>{item.numero}</span><strong>{item.titulo}</strong>
                        </button>
                      ))}
                    </nav>
                    <div className={[
                      styles.disparoWizardWorkspace,
                      etapaDisparo === 1 ? styles.disparoWizardWorkspaceWithPreview : "",
                    ].filter(Boolean).join(" ")}>
                    <div className={styles.disparoWizardMain}>
                    <div className={styles.disparoWizardScroll} key={etapaDisparo}>
                      {etapaDisparo === 1 ? (
                        <div className={styles.disparoWizardStage}>
                    <div className={styles.setupColumn}>
                      <div className={styles.field} data-disparo-campo="integracao" data-disparo-destaque={campoPendente === "integracao"}>
                        <label className={styles.label}>Número WhatsApp</label>
                        <select
                          value={integracaoId} 
                          onChange={(e) => {
                            const proximaIntegracaoId = e.target.value;
                            setIntegracaoId(proximaIntegracaoId);
                            setLimiteMeta(null);
                            setQuantidadePlanejada("");
                            setContatosReservaAtivos(false);
                            setPlanoCapacidadeConfirmado(null);
                            setAgendarDisparo(false);
                            setAgendamentoData("");
                            setAgendamentoHora("");
                            setContatosSelecionados([]);
                            setConfirmacaoResponsabilidadeListaFria(false);
                            setOptInFiltro("");
                            setOptOutFiltro("");
                            if (!proximaIntegracaoId) {
                              setSomenteIntegracaoFiltro(false);
                            }
                          }}
                          className={styles.input}
                          disabled={integracoes.length <= 1}
                          required
                        >
                          <option value="">Selecione uma conexão</option>
                          {integracoes.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.nome_conexao} {item.numero || ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className={styles.field} data-disparo-campo="template" data-disparo-destaque={campoPendente === "template"}>
                        <label className={styles.label}>Template aprovado</label>
                        <select
                          value={templateId}
                          onChange={(e) => setTemplateId(e.target.value)}
                          className={styles.input}
                          disabled={!integracaoId || loadingTemplates}
                        >
                          <option value="">
                            {!integracaoId
                              ? "Selecione uma conexão primeiro"
                              : loadingTemplates
                              ? "Carregando templates..."
                              : "Selecione um template"}
                          </option>

                          {templates.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.nome} - ({formatarCategoriaMeta(item.categoria)})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className={`${styles.field} ${styles.campaignNameField}`}>
                        <div className={styles.labelWithHelp}>
                          <label className={styles.label}>Nome do Disparo em massa</label>

                          <span className={styles.optional}>Opcional</span>

                          <span className={styles.infoTooltipWrapper}>
                            <button
                              type="button"
                              className={styles.infoTooltipButton}
                              aria-label="Ajuda sobre o nome do disparo em massa"
                            >
                              i
                            </button>

                            <span className={styles.infoTooltipText}>
                              Se deixar vazio, o CRM cria um nome padrão com data, hora e quantidade.
                              Mesmo com nome personalizado, esses dados serão adicionados no final.
                            </span>
                          </span>
                        </div>

                        <input
                          value={nomeCampanhaDisparo}
                          onChange={(e) => setNomeCampanhaDisparo(e.target.value)}
                          className={styles.input}
                          maxLength={90}
                          placeholder="Ex: ALERTA ATUALIZACAO"
                        />
                      </div>
                    </div>
                <div className={styles.disparoWizardVariables}>
                  <div className={styles.field}>

                    
                    
                      {totalVariaveis > 0 ? (
                        <>
                          <div className={styles.templateHintRow}>
                            <div className={styles.templateHint}>
                              Este template usa <strong>{totalVariaveis}</strong> variável(is).
                              Variável 1 substitui <strong>{" {{1}}"}</strong>, Variável 2 substitui
                              <strong>{" {{2}}"}</strong> e Variável 3 substitui <strong>{" {{3}}"}</strong>.
                            </div>

                            <button
                              type="button"
                              className={styles.variablesButton}
                              onClick={() => {
                                setErroVariavelModal("");
                                setModalVariaveisAberto(true);
                              }}
                            >
                              Gerenciar variáveis
                            </button>
                          </div>

                          <div className={styles.templateVariablesGrid} data-disparo-campo="variaveis" data-disparo-destaque={campoPendente === "variaveis"}>
                            <SeletorVariavelTemplate
                              label="Variável 1"
                              value={templateVariavel1}
                              onChange={setTemplateVariavel1}
                              opcoes={opcoesVariaveisTemplate}
                              carregando={loadingVariaveis}
                            />

                            {totalVariaveis >= 2 ? (
                              <SeletorVariavelTemplate
                                label="Variável 2"
                                value={templateVariavel2}
                                onChange={setTemplateVariavel2}
                                opcoes={opcoesVariaveisTemplate}
                                carregando={loadingVariaveis}
                              />
                            ) : null}

                            {totalVariaveis >= 3 ? (
                              <SeletorVariavelTemplate
                                label="Variável 3"
                                value={templateVariavel3}
                                onChange={setTemplateVariavel3}
                                opcoes={opcoesVariaveisTemplate}
                                carregando={loadingVariaveis}
                              />
                            ) : null}

                            {totalVariaveis >= 4 ? (
                              <SeletorVariavelTemplate
                                label="Variável 4"
                                value={templateVariavel4}
                                onChange={setTemplateVariavel4}
                                opcoes={opcoesVariaveisTemplate}
                                carregando={loadingVariaveis}
                              />
                            ) : null}

                            {totalVariaveis >= 5 ? (
                              <SeletorVariavelTemplate
                                label="Variável 5"
                                value={templateVariavel5}
                                onChange={setTemplateVariavel5}
                                opcoes={opcoesVariaveisTemplate}
                                carregando={loadingVariaveis}
                              />
                            ) : null}

                            {totalVariaveis >= 6 ? (
                              <SeletorVariavelTemplate
                                label="Variável 6"
                                value={templateVariavel6}
                                onChange={setTemplateVariavel6}
                                opcoes={opcoesVariaveisTemplate}
                                carregando={loadingVariaveis}
                              />
                            ) : null}
                          </div>
                        </>
                      ) : null}
                  </div>

                </div>


                        </div>
                      ) : null}

                      {etapaDisparo === 2 ? (
                        <div className={styles.disparoWizardStage}>
                          <section className={`${styles.metaHealthCard} ${limiteMeta?.alerta === "vermelho" ? styles.metaHealthDanger : limiteMeta?.alerta === "amarelo" ? styles.metaHealthWarning : ""}`}
                            aria-label="Controle preventivo da Meta" data-disparo-campo="capacidade" data-disparo-destaque={campoPendente === "capacidade"}>
                            <div className={styles.metaHealthHeader}>
                              <div>
                                <span>Controle preventivo da Meta</span>
                                <strong>Capacidade segura da integração</strong>
                                <p>Janela móvel de 24 horas: as vagas são liberadas gradualmente.</p>
                              </div>
                              <div className={styles.metaHealthHeaderActions}>
                                <a className={styles.metaCapacityButton} href="https://business.facebook.com/latest/whatsapp_manager/messaging_limits"
                                  target="_blank" rel="noopener noreferrer">Mais capacidade</a>
                                <strong className={styles.metaHealthUsageBadge}>
                                  {loadingSaudeMeta ? "Atualizando" : `${formatarPercentualMeta(limiteMeta?.percentual)} usado`}
                                </strong>
                              </div>
                            </div>
                            <div className={styles.metaHealthGrid}>
                              <div>
                                <span>Capacidade total</span>
                                <strong className={styles.metaHealthMainValue}>{formatarNumeroMeta(limiteMeta?.limite)}</strong>
                              </div>
                              <div>
                                <span>Disponíveis agora</span>
                                <strong className={styles.metaHealthMainValue}>{formatarNumeroMeta(limiteMeta?.restantes)}</strong>
                              </div>
                              <div>
                                <span>Próxima liberação</span>
                                <strong className={styles.metaHealthDateValue}>
                                  {liberacoesPlanejamento[0] ? formatarDataHora(liberacoesPlanejamento[0].horario) : "Sem previsão"}
                                </strong>
                                {liberacoesPlanejamento[0] ? <small>+{formatarNumeroMeta(liberacoesPlanejamento[0].quantidadeLiberada)} vagas</small> : null}
                              </div>
                              <div>
                                <span>Segunda liberação</span>
                                <strong className={styles.metaHealthDateValue}>
                                  {liberacoesPlanejamento[1] ? formatarDataHora(liberacoesPlanejamento[1].horario) : "—"}
                                </strong>
                                {liberacoesPlanejamento[1] ? <small>+{formatarNumeroMeta(liberacoesPlanejamento[1].quantidadeLiberada)} vagas</small> : null}
                              </div>
                              <div>
                                <span>Total a liberar</span>
                                <strong className={styles.metaHealthDateValue}>
                                  {capacidadeMaximaDisponivelAgora
                                    ? "Disponível agora"
                                    : horarioCapacidadeMaxima
                                      ? formatarDataHora(horarioCapacidadeMaxima)
                                      : "Sem previsão"}
                                </strong>
                                <small>+{formatarNumeroMeta(totalCapacidadeALiberar)} vagas</small>
                              </div>
                            </div>
                            <p className={styles.metaHealthNote}>A previsão não reserva vagas: a Meta revalida o limite quando o disparo for executado.</p>
                          </section>

                          <details className={styles.dispatchCapacityReleases}>
                            <summary>
                              <span><Info size={19} aria-hidden="true" /><strong>Detalhes das próximas liberações de capacidade</strong></span>
                              <span>{liberacoesPlanejamento.length} {liberacoesPlanejamento.length === 1 ? "horário" : "horários"} <ChevronDown size={16} aria-hidden="true" /></span>
                            </summary>
                            <div className={styles.dispatchCapacityReleaseBody}>
                              {liberacoesPlanejamento.length > 0 ? (
                                <>
                                  <div className={styles.dispatchCapacityReleaseColumns} aria-hidden="true">
                                    <span>Vagas a liberar</span>
                                    <span>Data e horário</span>
                                    <span>Capacidade acumulada</span>
                                  </div>
                                  {liberacoesPlanejamento.map((item) => (
                                    <div className={styles.dispatchCapacityReleaseItem} key={item.horario}>
                                      <strong>+{formatarNumeroMeta(item.quantidadeLiberada)} vagas</strong>
                                      <span>{formatarDataHora(item.horario)}</span>
                                      <small>{formatarNumeroMeta(item.disponivelAcumulado)} disponíveis acumulados</small>
                                    </div>
                                  ))}
                                </>
                              ) : <p>Nenhuma liberação pendente no período consultado.</p>}
                            </div>
                          </details>

                          <section className={styles.dispatchCapacityPlanner} aria-label="Quantidade e momento do disparo">
                            <div className={styles.dispatchCapacityPlannerMain}>
                              <div className={styles.dispatchCapacityPlannerIntro}>
                              <div>
                                <span className={styles.schedulePlanningEyebrow}>Planejamento do disparo</span>
                                <h3>Quantos contatos deseja alcançar?</h3>
                                <p>Digite a quantidade para escolher a melhor forma de envio.</p>
                              </div>
                              <span className={styles.schedulePlanningHint}>Etapa 2 de 4</span>
                            </div>
                            <label className={styles.label} htmlFor="disparo-quantidade-desejada">Quantidade desejada</label>
                            <div className={styles.dispatchCapacityQuantityRow} data-disparo-campo="quantidade" data-disparo-destaque={campoPendente === "quantidade"}>
                              <input id="disparo-quantidade-desejada" type="number" min={1} step={1}
                                className={`${styles.input} ${styles.dispatchCapacityQuantityInput}`} inputMode="numeric"
                                value={quantidadePlanejada} placeholder="Ex.: 250"
                                disabled={loadingSaudeMeta || !limiteMeta}
                                onChange={(event) => {
                                  setQuantidadePlanejada(event.target.value.replace(/\D/g, ""));
                                  setPlanoCapacidadeConfirmado(null);
                                  setErro("");
                                }} />
                              <span>{limiteMeta ? `${formatarNumeroMeta(capacidadeAgoraPlanejamento)} disponíveis agora` : "Consultando..."}</span>
                            </div>
                            <div className={styles.dispatchCapacitySuggestion} role="note">
                              <Info size={18} aria-hidden="true" />
                              <span>
                                {quantidadeDesejada > 0 && !quantidadeExcedeLimiteTotal && capacidadeInsuficienteAgora
                                  ? capacidadeAgoraPlanejamento > 0
                                    ? <>
                                        <strong>Sugestão:</strong> envie <strong>{formatarNumeroMeta(capacidadeAgoraPlanejamento)}</strong> agora e agende os <strong>{formatarNumeroMeta(quantidadeDesejada - capacidadeAgoraPlanejamento)}</strong> restantes em outra operação
                                        {horarioCapacidadeDesejada ? `, a partir de ${formatarDataHora(horarioSugeridoAgendamento)}` : " quando houver capacidade"}.
                                        Cada campanha é confirmada separadamente.
                                      </>
                                    : <>
                                        <strong>Sugestão:</strong> não há vagas para envio imediato. Você pode agendar a quantidade desejada para quando a capacidade for liberada.
                                      </>
                                  : quantidadeDesejada > 0 && quantidadeExcedeLimiteTotal
                                    ? <>
                                        <strong>Atenção:</strong> a quantidade supera o limite total deste número. Divida em campanhas menores.
                                      </>
                                    : <>
                                        <strong>Você também pode agendar.</strong> Escolha um horário futuro para realizar o disparo, mesmo quando houver capacidade disponível agora.
                                      </>}
                              </span>
                            </div>
                            </div>
                            <div className={styles.dispatchCapacityPlannerActions}>
                              {quantidadeDesejada <= 0 ? (
                                <div className={styles.dispatchCapacityEmptyState}>
                                  <Info size={19} aria-hidden="true" />
                                  <span>Informe a quantidade para visualizar a disponibilidade e escolher quando disparar.</span>
                                </div>
                              ) : null}
                            {quantidadeDesejada > 0 && limiteMeta ? (
                              <div
                                className={`${styles.dispatchCapacityResult} ${
                                  quantidadeExcedeLimiteTotal
                                    ? styles.dispatchCapacityResultDanger
                                    : capacidadeInsuficienteAgora
                                      ? styles.dispatchCapacityResultAlert
                                      : styles.dispatchCapacityResultOk
                                }`}
                                role={quantidadeExcedeLimiteTotal ? "alert" : "status"}
                              >
                                <div className={styles.dispatchCapacityResultHeading}>
                                  {quantidadeExcedeLimiteTotal ? <AlertTriangle size={19} aria-hidden="true" /> : null}
                                  <strong>{quantidadeExcedeLimiteTotal ? "Quantidade acima do limite total" :
                                    capacidadeInsuficienteAgora ? "Quantidade maior que a disponível agora" : "Quantidade disponível para envio imediato"}</strong>
                                </div>
                                <p>{quantidadeExcedeLimiteTotal
                                  ? `O número comporta no máximo ${formatarNumeroMeta(capacidadeTotalPlanejamento)} destinatários em uma campanha. Divida em campanhas menores.`
                                  : capacidadeInsuficienteAgora
                                  ? `Solicitados: ${formatarNumeroMeta(quantidadeDesejada)}. Disponíveis neste momento: ${formatarNumeroMeta(capacidadeAgoraPlanejamento)}.`
                                  : `Você pode enviar ${formatarNumeroMeta(quantidadeDesejada)} agora ou agendar para depois.`}</p>
                                {capacidadeInsuficienteAgora && !quantidadeExcedeLimiteTotal ? (
                                  <p>{horarioCapacidadeDesejada
                                    ? `A liberação necessária está prevista para ${formatarDataHora(horarioSugeridoAgendamento)}.`
                                    : "Ainda não há previsão suficiente para essa quantidade. Atualize os dados da Meta."}</p>
                                ) : null}
                              </div>
                            ) : null}

                            {quantidadeDesejada > 0 && !quantidadeExcedeLimiteTotal && limiteMeta ? (
                              <div className={styles.dispatchCapacityChoices} data-disparo-campo="momento" data-disparo-destaque={campoPendente === "momento"}>
                                <button type="button" className={`${styles.dispatchCapacityOption} ${styles.dispatchCapacityOptionImmediate} ${planoCapacidadeConfirmado === "imediato" ? styles.dispatchCapacityOptionSelected : ""}`}
                                  aria-pressed={planoCapacidadeConfirmado === "imediato"}
                                  disabled={capacidadeAgoraPlanejamento <= 0 || disparoBloqueado}
                                  onClick={() => {
                                    const aceite = Math.min(quantidadeDesejada, capacidadeAgoraPlanejamento);
                                    setQuantidadePlanejada(String(aceite));
                                    setContatosSelecionados((atuais) => atuais.slice(0, aceite));
                                    setPlanoCapacidadeConfirmado("imediato");
                                    setAgendarDisparo(false);
                                    setAgendamentoData(""); setAgendamentoHora(""); setErro("");
                                  }}>
                                  <strong>{capacidadeInsuficienteAgora ? "Realizar quantidade disponível" : "Realizar agora"}</strong>
                                  <span>{formatarNumeroMeta(Math.min(quantidadeDesejada, capacidadeAgoraPlanejamento))} contatos</span>
                                </button>
                                <button type="button" className={`${styles.dispatchCapacityOption} ${styles.dispatchCapacityOptionScheduled} ${planoCapacidadeConfirmado === "agendado" ? styles.dispatchCapacityOptionSelected : ""}`}
                                  aria-pressed={planoCapacidadeConfirmado === "agendado"}
                                  disabled={capacidadeInsuficienteAgora && !horarioCapacidadeDesejada}
                                  onClick={() => {
                                    setAgendarDisparo(true);
                                    setPlanoCapacidadeConfirmado("agendado");
                                    setAgendamentoData(camposHorarioSugerido?.data || "");
                                    setAgendamentoHora(camposHorarioSugerido?.hora || "");
                                    setErro("");
                                  }}>
                                  <strong>Agendar quantidade desejada</strong>
                                  <span>{horarioCapacidadeDesejada ? formatarDataHora(horarioSugeridoAgendamento) : "Escolher data e hora"}</span>
                                </button>
                              </div>
                            ) : null}


                            {planoCapacidadeConfirmado ? (
                              <div className={styles.dispatchCapacityAccepted} role="status">
                                <Check size={18} aria-hidden="true" />
                                <span><strong>{planoCapacidadeConfirmado === "agendado" ? "Agendamento aceito para planejamento." : "Capacidade aceita."}</strong>
                                  {" "}Quantidade definida: {formatarNumeroMeta(quantidadeDesejada)} contatos.</span>
                              </div>
                            ) : null}
                            {agendarDisparo && planoCapacidadeConfirmado === "agendado" ? (
                              <div className={styles.dispatchCapacityScheduleFields} data-disparo-campo="horario" data-disparo-destaque={campoPendente === "horario"}>
                                <label className={styles.field}><span className={styles.label}>Data</span>
                                  <input type="date" className={styles.input} min={dataHojeParaInput()}
                                    value={agendamentoData} onChange={(e) => setAgendamentoData(e.target.value)} />
                                </label>
                                <label className={styles.field}><span className={styles.label}>Hora</span>
                                  <input type="time" className={styles.input} value={agendamentoHora}
                                    onChange={(e) => setAgendamentoHora(e.target.value)} />
                                </label>
                                <p>Horário sugerido preenchido automaticamente. É possível ajustá-lo, desde que haja capacidade prevista.</p>
                              </div>
                            ) : null}
                            </div>
                          </section>


                        </div>
                      ) : null}
                      {etapaDisparo === 3 ? (
                        <div className={styles.disparoWizardStage}>
                          <section className={styles.reserveContactsCard}>
                            <label className={styles.reserveContactsHeading}>
                              <span className={styles.reserveContactsIcon} aria-hidden="true"><ShieldCheck size={19} /></span>
                              <span>
                                <strong>Contatos de reserva</strong>
                                <small>Compensar falhas de entrega automaticamente</small>
                              </span>
                              <input
                                type="checkbox"
                                className={styles.reserveContactsSwitch}
                                checked={contatosReservaAtivos}
                                onChange={(event) => {
                                  const ativo = event.target.checked;
                                  setContatosReservaAtivos(ativo);
                                  if (!ativo) {
                                    setContatosSelecionados((anteriores) => anteriores.slice(0, quantidadeDesejada));
                                  }
                                  setErro("");
                                }}
                                aria-label="Ativar contatos de reserva para compensar falhas"
                              />
                            </label>
                            {contatosReservaAtivos ? (
                              <div className={styles.reserveContactsDetails}>
                                <div className={styles.reserveContactsTotals}>
                                  <div className={styles.reserveContactsMetric}>
                                    <span>Quantidade desejada</span>
                                    <strong>{formatarNumeroMeta(quantidadeDesejada)}</strong>
                                  </div>
                                  <div className={styles.reserveContactsMetric}>
                                    <span>Quantidade contatos reserva (50%)</span>
                                    <strong>{formatarNumeroMeta(limiteContatosReserva)}</strong>
                                  </div>
                                </div>
                                <p className={styles.reserveContactsOrientation}>
                                  <Info size={18} aria-hidden="true" />
                                  <span>Adicione primeiro os contatos principais e, em seguida, os de reserva. Eles serão usados somente para compensar falhas definitivas, sem ultrapassar a quantidade desejada nem a capacidade disponível da Meta. Se faltar capacidade, a compensação aguardará liberação.</span>
                                </p>
                              </div>
                            ) : null}
                          </section>
                          <div className={styles.contactsFilterCard}>
                  <div className={styles.contactsFilterHeader}>
                    <div>
                      <div className={styles.contactsFilterTitle}>
                        <SlidersHorizontal size={18} strokeWidth={2} aria-hidden="true" />
                        <h3>Filtrar contatos</h3>
                      </div>
                      <p>Selecione quem receberá o disparo.</p>
                    </div>

                    <div className={styles.contactsFilterActions}>
                      <button
                        type="button"
                        className={styles.advancedFiltersToggle}
                        aria-expanded={filtrosAvancadosAbertos}
                        onClick={() =>
                          setFiltrosAvancadosAbertos((aberto) => !aberto)
                        }
                      >
                        {filtrosAvancadosAbertos ? "Menos filtros" : "Mais filtros"}
                        {quantidadeFiltrosAvancadosAtivos > 0
                          ? ` (${quantidadeFiltrosAvancadosAtivos})`
                          : ""}
                      </button>

                      <button
                        type="button"
                        className={styles.clearFiltersButton}
                        onClick={() => {
                          setBuscaContato("");
                          setOrigemFiltro("");
                          setCampanhaFiltro("");
                          setInteresseFiltro("");
                          setClassificacaoFiltro("");
                          setDisparoAnteriorFiltroContatos("");
                          setTelefoneRevisarFiltro("");
                          setMensagemDataInicioFiltro("");
                          setMensagemDataFimFiltro("");
                          setUltimoAtendenteFiltro("");
                          setOptInFiltro("");
                          setOptOutFiltro("");
                          setSomenteIntegracaoFiltro(false);
                        }}
                        disabled={!temFiltrosContatosAtivos}
                      >
                        Limpar filtros
                      </button>
                    </div>
                  </div>

                  <div className={styles.searchFilters}>
                    <div className={styles.field}>
                      <label className={styles.label}>Buscar contatos salvos</label>
                      <input
                        value={buscaContato}
                        onChange={(e) => setBuscaContato(e.target.value)}
                        className={styles.input}
                        placeholder="Busque por nome, WhatsApp, telefone, e-mail, campanha..."
                      />
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Filtrar por origem</label>
                      <select
                        value={origemFiltro}
                        onChange={(e) => {
                          const valor = e.target.value;

                          contatosConsultaAtivaRef.current += 1;
                          setOrigemFiltro(valor);
                          setContatos([]);
                          setTotalContatosDisponiveis(0);
                          setLoadingContatos(true);
                        }}
                        className={styles.input}
                      >
                        <option value="">Todas as origens</option>

                        {listasDisponiveis.length > 0 ? (
                          <optgroup label="Listas importadas">
                            {listasDisponiveis.map((lista) => {
                              const dataLista = formatarDataHoraListaFiltro(
                                lista.created_at
                              );

                              return (
                                <option
                                  key={lista.id}
                                  value={`lista:${lista.id}`}
                                >
                                  {lista.nome}
                                  {dataLista ? ` · ${dataLista}` : ""}
                                </option>
                              );
                            })}
                          </optgroup>
                        ) : null}

                        {origensDisponiveis.length > 0 ? (
                          <optgroup label="Outras origens">
                            {origensDisponiveis.map((origem) => (
                              <option key={origem} value={origem}>
                                {origem}
                              </option>
                            ))}
                          </optgroup>
                        ) : null}

                        {listasDisponiveis.length === 0 &&
                        origensDisponiveis.length === 0 ? (
                          <option value="" disabled>
                            Nenhuma origem encontrada
                          </option>
                        ) : null}
                      </select>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Filtrar por campanha</label>
                      <select
                        value={campanhaFiltro}
                        onChange={(e) => setCampanhaFiltro(e.target.value)}
                        className={styles.input}
                      >
                        {campanhasDisponiveis.length > 0 ? (
                          <>
                            <option value="">Todas as campanhas</option>

                            {campanhasDisponiveis.map((campanha) => (
                              <option key={campanha} value={campanha}>
                                {campanha}
                              </option>
                            ))}
                          </>
                        ) : (
                          <option value="">Nenhuma campanha encontrada</option>
                        )}
                      </select>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Interesse</label>
                      <select
                        value={interesseFiltro}
                        onChange={(e) => setInteresseFiltro(e.target.value)}
                        className={styles.input}
                      >
                        <option value="">Todos os interesses</option>
                        {interessesDisponiveis.map((interesse) => (
                          <option key={interesse} value={interesse}>
                            {interesse}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Classificação</label>
                      <select
                        value={classificacaoFiltro}
                        onChange={(e) => setClassificacaoFiltro(e.target.value)}
                        className={styles.input}
                      >
                        <option value="">Todas as classificações</option>
                        <option value="qualificado">Qualificado</option>
                        <option value="perdido">Perdido</option>
                        <option value="convertido">Convertido</option>
                      </select>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Disparo anterior</label>
                      <select
                        value={disparoAnteriorFiltroContatos}
                        onChange={(e) => {
                          contatosConsultaAtivaRef.current += 1;
                          setDisparoAnteriorFiltroContatos(e.target.value);
                          setContatos([]);
                          setTotalContatosDisponiveis(0);
                          setLoadingContatos(true);
                        }}
                        className={styles.input}
                        disabled={
                          loadingContatos ||
                          campanhasDisparoAnteriorFiltro.length === 0
                        }
                      >
                        <option value="">Todos</option>
                        {campanhasDisparoAnteriorFiltro.map((campanha) => (
                          <option key={campanha.id} value={campanha.id}>
                            {truncarNomeBadge(campanha.nome, 50)} ({campanha.total})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Revisão do número</label>
                      <select
                        value={telefoneRevisarFiltro}
                        onChange={(e) => setTelefoneRevisarFiltro(e.target.value)}
                        className={styles.input}
                      >
                        <option value="">Todos</option>
                        <option value="false">Sem revisão</option>
                        <option value="true">⚠ revisão</option>
                      </select>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Vínculo da integração</label>
                      <select
                        value={somenteIntegracaoFiltro ? "true" : "false"}
                        onChange={(e) =>
                          setSomenteIntegracaoFiltro(e.target.value === "true")
                        }
                        className={styles.input}
                        disabled={!integracaoId}
                      >
                        <option value="false">Todos os contatos</option>
                        <option value="true">Somente desta integração</option>
                      </select>
                    </div>
                  </div>

                  {filtrosAvancadosAbertos ? (
                    <div className={styles.advancedContactFilters}>
                      <div className={styles.field}>
                        <label className={styles.label}>Contato enviou de</label>
                        <input
                          type="date"
                          value={mensagemDataInicioFiltro}
                          max={mensagemDataFimFiltro || undefined}
                          onChange={(e) =>
                            setMensagemDataInicioFiltro(e.target.value)
                          }
                          className={styles.input}
                        />
                      </div>

                      <div className={styles.field}>
                        <label className={styles.label}>Contato enviou até</label>
                        <input
                          type="date"
                          value={mensagemDataFimFiltro}
                          min={mensagemDataInicioFiltro || undefined}
                          onChange={(e) => setMensagemDataFimFiltro(e.target.value)}
                          className={styles.input}
                        />
                      </div>

                      <div className={styles.field}>
                        <label className={styles.label}>Último atendente</label>
                        <select
                          value={ultimoAtendenteFiltro}
                          onChange={(e) => setUltimoAtendenteFiltro(e.target.value)}
                          className={styles.input}
                        >
                          <option value="">Todos os atendentes</option>
                          {atendentesDisponiveis.map((atendente) => (
                            <option key={atendente.id} value={atendente.id}>
                              {atendente.nome}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className={styles.field}>
                        <label className={styles.label}>Opt-in</label>
                        <select
                          value={optInFiltro}
                          onChange={(e) => setOptInFiltro(e.target.value)}
                          className={styles.input}
                          disabled={!integracaoId}
                        >
                          <option value="">
                            {integracaoId ? "Todos" : "Selecione uma integração"}
                          </option>
                          <option value="true">Com opt-in</option>
                          <option value="false">Sem opt-in (lista fria)</option>
                        </select>
                      </div>

                      <div className={styles.field}>
                        <label className={styles.label}>Opt-out</label>
                        <select
                          value={optOutFiltro}
                          onChange={(e) => setOptOutFiltro(e.target.value)}
                          className={styles.input}
                          disabled={!integracaoId}
                        >
                          <option value="">
                            {integracaoId ? "Todos" : "Selecione uma integração"}
                          </option>
                          <option value="true">Com opt-out</option>
                          <option value="false">Sem opt-out</option>
                        </select>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className={styles.contactsSection} data-disparo-campo="contatos" data-disparo-destaque={campoPendente === "contatos"}>
                  <div className={styles.contactsColumn}>
                    <div className={styles.contactsHeader}>
                      <h3 className={styles.contactsTitle}>Disponíveis</h3>

                      <div className={styles.contactsHeaderActions}>
                        <input
                          type="number"
                          min={0}
                          max={
                            typeof capacidadeRestanteParaAdicionar === "number"
                              ? capacidadeRestanteParaAdicionar
                              : undefined
                          }
                          step={1}
                          inputMode="numeric"
                          value={quantidadeAdicionarContatos}
                          onChange={(event) =>
                            setQuantidadeAdicionarContatos(
                              event.target.value.replace(/\D/g, "")
                            )
                          }
                          className={styles.bulkQuantityInput}
                          placeholder="Qtd."
                          title="Informe quantos contatos adicionar. Sem valor, preenche todas as vagas restantes do planejamento."
                          aria-label="Quantidade a adicionar; vazio preenche as vagas restantes"
                        />
                        <button
                          type="button"
                          className={styles.TextButtonAdd}
                          onClick={adicionarTodosDisponiveis}
                          disabled={
                            loadingContatos ||
                            adicionandoContatosEmMassa
                          }
                        >
                          {adicionandoContatosEmMassa ? "Adicionando..." : Number(quantidadeAdicionarContatos) > 0 ? "Adicionar quantidade" : "Preencher seleção"}
                        </button>
                        <span className={styles.contactsCount}>
                          {loadingContatos ? "..." : totalContatosDisponiveisRestantes}
                        </span>
                      </div>
                    </div>

                    <div className={styles.contactsList}>
                      {loadingContatos ? (
                        <div className={styles.emptyMiniState}>Carregando contatos...</div>
                      ) : contatosDisponiveisFiltrados.length === 0 ? (
                        <div className={styles.emptyMiniState}>
                          Nenhum contato salvo disponível.
                        </div>
                      ) : (
                        contatosDisponiveisFiltrados.map((contato) => {
                          const telefoneValido = contatoTemTelefoneValido(contato);
                          const cooldownDisparoAtivo =
                            contatoEstaEmCooldownAplicavel(
                              contato,
                              categoriaTemplateSelecionado
                            );

                          return (
                            <div key={contato.id} className={styles.contactCard}>
                              <div className={styles.contactMain}>
                                <strong className={styles.contactName}>
                                  {contato.nome || "Sem nome"}
                                </strong>

                                <p className={styles.contactMeta}>
                                  {formatarTelefone(contato.telefone)}
                                </p>

                                {contato.email ? (
                                  <p className={styles.contactMeta}>{contato.email}</p>
                                ) : null}

                                <div className={styles.contactBadges}>
                                  {obterOrigemContato(contato) ? (
                                    <span className={styles.contactBadge}>
                                      {obterOrigemContato(contato)}
                                    </span>
                                  ) : null}

                                  {contato.status_lead ? (
                                    <span className={styles.contactBadge}>
                                      {contato.status_lead}
                                    </span>
                                  ) : null}

                                  {obterCampanhaContato(contato) ? (
                                    <span className={styles.contactBadge}>
                                      {obterCampanhaContato(contato)}
                                    </span>
                                  ) : null}

                                  <span
                                    className={
                                      contatoTemAlgumOptOut(contato)
                                        ? styles.contactBadgeOptOut
                                        : contato.opt_in_whatsapp === true
                                        ? styles.contactBadgeOptIn
                                        : styles.contactBadgeCold
                                    }
                                  >
                                    {contatoTemAlgumOptOut(contato)
                                      ? rotuloOptOutContato(contato)
                                      : contato.opt_in_whatsapp === true
                                      ? "Opt-in WhatsApp"
                                      : "Lista fria"}
                                  </span>

                                  {contato.telefone_revisar ? (

                                    <span className={styles.contactBadgeReview}>⚠ revisão</span>

                                  ) : null}


                                  {renderBadgeCooldownContato(contato)}
                                </div>
                                {renderBadgesDisparoAntigo(contato)}
                              </div>

                              <button
                                type="button"
                                className={styles.ButtonAdd}
                                onClick={() => adicionarContato(contato)}
                                aria-disabled={
                                  !telefoneValido ||
                                  contatoTemOptOutParaCategoria(
                                    contato,
                                    categoriaTemplateSelecionado
                                  ) ||
                                  cooldownDisparoAtivo
                                }
                                title={
                                  capacidadeRestanteParaAdicionar === 0
                                    ? "Limite atingido — altere a quantidade na etapa anterior para adicionar mais contatos."
                                    : !telefoneValido
                                    ? contato.telefone_revisar === true
                                      ? "Telefone marcado para revisão. Corrija-o na página de Contatos antes do disparo."
                                      : "Este contato não possui telefone válido."
                                    : contatoTemOptOutParaCategoria(
                                        contato,
                                        categoriaTemplateSelecionado
                                      )
                                    ? "Este contato solicitou opt-out para esta categoria."
                                    : cooldownDisparoAtivo
                                    ? "Este contato está em pausa temporária para marketing."
                                    : "Adicionar contato ao disparo"
                                }
                              >
                                Adicionar
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className={styles.contactsColumn}>
                    <div className={styles.contactsHeader}>
                      <h3 className={styles.contactsTitle}>Selecionados</h3>

                      <div className={styles.contactsHeaderActions}>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          value={quantidadeRemoverContatos}
                          onChange={(event) =>
                            setQuantidadeRemoverContatos(
                              event.target.value.replace(/\D/g, "")
                            )
                          }
                          className={styles.bulkQuantityInput}
                          placeholder="Qtd."
                          title="Informe a quantidade. Com 0 ou vazio, remove todos os contatos selecionados exibidos."
                          aria-label="Quantidade de contatos para remover; zero ou vazio remove todos"
                        />
                        <button
                          type="button"
                          className={styles.TextButtonRemover}
                          onClick={removerSelecionadosFiltrados}
                          disabled={contatosSelecionadosFiltrados.length === 0}
                        >
                          Remover todos
                        </button>

                        <span className={styles.contactsCount}>
                          {contatosSelecionadosFiltrados.length ===
                          contatosSelecionados.length
                            ? contatosSelecionados.length
                            : `${contatosSelecionadosFiltrados.length}/${contatosSelecionados.length}`}
                        </span>
                      </div>
                    </div>

                    <div className={styles.contactsList}>
                      {contatosSelecionados.length === 0 ? (
                        <div className={styles.emptyMiniState}>
                          Nenhum contato selecionado.
                        </div>
                      ) : contatosSelecionadosFiltrados.length === 0 ? (
                        <div className={styles.emptyMiniState}>
                          Nenhum contato selecionado encontrado para estes filtros.
                        </div>
                      ) : (
                        contatosSelecionadosFiltrados.map((contato) => (
                          <div key={contato.id} className={styles.contactCardSelected}>
                            <div className={styles.contactMain}>
                              <strong className={styles.contactName}>
                                {contato.nome || "Sem nome"}
                              </strong>

                              <p className={styles.contactMeta}>
                                {formatarTelefone(contato.telefone)}
                              </p>

                              {contato.email ? (
                                <p className={styles.contactMeta}>{contato.email}</p>
                              ) : null}


                              <div className={styles.contactBadges}>
                                {obterOrigemContato(contato) ? (
                                  <span className={styles.contactBadge}>
                                    {obterOrigemContato(contato)}
                                  </span>
                                ) : null}

                                {contato.status_lead ? (
                                  <span className={styles.contactBadge}>
                                    {contato.status_lead}
                                  </span>
                                ) : null}

                                {obterCampanhaContato(contato) ? (
                                  <span className={styles.contactBadge}>
                                    {obterCampanhaContato(contato)}
                                  </span>
                                ) : null}

                                <span
                                  className={
                                    contatoTemAlgumOptOut(contato)
                                      ? styles.contactBadgeOptOut
                                      : contato.opt_in_whatsapp === true
                                      ? styles.contactBadgeOptIn
                                      : styles.contactBadgeCold
                                  }
                                >
                                  {contatoTemAlgumOptOut(contato)
                                    ? rotuloOptOutContato(contato)
                                    : contato.opt_in_whatsapp === true
                                    ? "Opt-in WhatsApp"
                                    : "Lista fria"}
                                </span>

                                {contato.telefone_revisar ? (

                                  <span className={styles.contactBadgeReview}>⚠ revisão</span>

                                ) : null}


                                {renderBadgeCooldownContato(contato)}
                              </div>
                              {renderBadgesDisparoAntigo(contato)}
                            </div>

                            <button
                              type="button"
                              className={styles.removeButton}
                              onClick={() => removerContato(contato.id)}
                            >
                              Remover
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {temContatosOptOut ? (
                  <div
                    className={`${styles.coldListNotice} ${styles.coldListNoticeBlocked}`}
                    role="alert"
                  >
                    <strong>Disparo bloqueado por opt-out</strong>
                    <p>
                      {totalContatosOptOut} contato(s) selecionado(s)
                      solicitaram o bloqueio da categoria do template
                      selecionado. Remova-os da seleção para continuar.
                    </p>
                  </div>
                ) : null}

                {temContatosCooldown ? (
                  <div
                    className={`${styles.coldListNotice} ${styles.coldListNoticeBlocked}`}
                    role="alert"
                  >
                    <strong>Disparo bloqueado por pausa da Meta</strong>
                    <p>
                      {totalContatosCooldown} contato(s) selecionado(s) estão
                      em pausa temporária porque a Meta recusou uma entrega
                      recente por rate limit, qualidade ou frequência.
                      Remova-os da seleção para continuar.
                    </p>
                  </div>
                ) : null}

                {temContatosListaFria ? (
                  <div
                    className={`${styles.coldListNotice} ${
                      listaFriaSemOptOut
                        ? styles.coldListNoticeBlocked
                        : styles.coldListNoticeWarning
                    }`}
                    role={
                      listaFriaSemOptOut
                        ? "alert"
                        : "status"
                    }
                  >
                    <strong>
                      {listaFriaSemOptOut
                        ? "Template sem opt-out"
                        : `${totalContatosListaFria} contato(s) de lista fria selecionado(s)`}
                    </strong>
                    <p>
                      {listaFriaSemOptOut
                        ? "Este template não possui o rodapé de opt-out necessário para envio à lista fria. Recrie-o com a instrução para responder SAIR."
                        : marketingComListaFria
                        ? "O disparo de marketing para lista fria será liberado após a confirmação dos valores e das orientações de autorização."
                        : "O disparo Utility para lista fria exigirá confirmação das orientações após a confirmação dos valores."}
                    </p>
                    <span>
                      Contatos sem opt-in permanecem identificados como lista
                      fria e exigem confirmação das orientações antes do envio.
                    </span>
                  </div>
                ) : null}

                {(loadingConflitos ||
                  erroConflitos ||
                  gruposConflitoAtivos.length > 0) && (
                  <div
                    data-disparo-campo="conflitos" data-disparo-destaque={campoPendente === "conflitos"} className={`${styles.conflictCard} ${
                      temConflitosPendentes
                        ? styles.conflictCardPending
                        : styles.conflictCardResolved
                    }`}
                  >
                    <div className={styles.conflictHeader}>
                      <div>
                        <span className={styles.conflictEyebrow}>
                          Contatos repetidos
                        </span>
                        <strong>
                          {loadingConflitos
                            ? "Verificando contatos dos ultimos 7 dias..."
                            : temConflitosPendentes
                            ? `${totalContatosComConflitoSelecionados} contato(s) precisam de decisão`
                            : "Contatos repetidos resolvidos"}
                        </strong>
                      </div>

                      <span
                        className={`${styles.conflictStatus} ${
                          temConflitosPendentes
                            ? styles.conflictStatusBlocked
                            : styles.conflictStatusUnlocked
                        }`}
                      >
                        {temConflitosPendentes ? "Envio bloqueado" : "Envio desbloqueado"}
                      </span>
                    </div>

                    {erroConflitos ? (
                      <p className={styles.conflictError}>{erroConflitos}</p>
                    ) : null}

                    {!loadingConflitos && gruposConflitoAtivos.length > 0 ? (
                      <div className={styles.conflictGroups}>
                        {gruposConflitoAtivos.map((grupo) => {
                          const decisao =
                            decisoesConflitoDisparo[grupo.campanha_id];
                            const decisaoTexto =
                              decisao?.acao === "incluir"
                                ? "Contato mantido"
                                : decisao?.acao === "remover"
                                ? "Removido do envio"
                                : "Pendente";

                            const decisaoClasse =
                              decisao?.acao === "incluir"
                                ? styles.conflictDecisionIncluded
                                : decisao?.acao === "remover"
                                ? styles.conflictDecisionRemoved
                                : styles.conflictDecisionPending;

                            return (
                            <div
                              key={grupo.campanha_id}
                              className={styles.conflictGroup}
                            >
                              <div className={styles.conflictGroupMain}>
                                <strong>{grupo.campanha_nome}</strong>
                                <span>
                                  {grupo.contatos_ids.length} contato(s) ja
                                  receberam este disparo
                                  {grupo.ultimo_envio_em
                                    ? ` em ${formatarDataHora(
                                        grupo.ultimo_envio_em
                                      )}`
                                    : ""}
                                </span>
                              </div>

                              <span className={`${styles.conflictDecision} ${decisaoClasse}`}>
                                {decisaoTexto}
                              </span>

                              <div className={styles.conflictActions}>
                                <button
                                  type="button"
                                  className={styles.removerButton}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() =>
                                    removerGrupoConflitoDoEnvio(grupo)
                                  }
                                >
                                  Remover do envio
                                </button>

                                <button
                                  type="button"
                                  className={styles.ButtonAdd}
                                  onClick={() =>
                                    marcarGrupoConflitoComoIncluido(grupo)
                                  }
                                >
                                  Manter
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                )}



                <section data-disparo-campo="custo" data-disparo-destaque={campoPendente === "custo"} className={`${styles.capacityResolution} ${contatosSelecionados.length > 0 ? styles.capacityResolutionGood : styles.capacityResolutionBlocked}`} role="status" aria-label="Resumo da seleção de contatos">
                  <div className={styles.capacityResolutionHeader}>
                    <span className={styles.capacityResolutionIcon}>
                      {contatosSelecionados.length > 0
                        ? <Check size={18} aria-hidden="true" />
                        : <Info size={18} aria-hidden="true" />}
                    </span>
                    <div>
                      <span className={styles.capacityResolutionEyebrow}>Resumo da seleção</span>
                      <strong className={styles.capacityResolutionTitle}>Contatos para esta campanha</strong>
                    </div>
                    <span className={styles.capacityResolutionBadge}>{contatosSelecionados.length > 0 ? "Seleção pronta" : "Aguardando contatos"}</span>
                  </div>
                  <div className={styles.capacityResolutionStats}>
                    <div className={styles.capacityResolutionStat}>
                      <strong>{formatarNumeroMeta(contatosPrincipais.length)}</strong>
                      <span>Principais selecionados</span>
                    </div>
                    <div className={styles.capacityResolutionStat}>
                      <strong>{formatarNumeroMeta(quantidadeDesejada)}</strong>
                      <span>Quantidade desejada</span>
                    </div>
                    <div className={styles.capacityResolutionStat}>
                      <strong>{formatarNumeroMeta(contatosReserva.length)}</strong>
                      <span>Contatos de reserva</span>
                    </div>
                  </div>
                  <p className={styles.capacityResolutionDescription}>
                    {contatosSelecionados.length > 0
                      ? "Você pode continuar com esta seleção. Contatos de reserva só serão utilizados para compensar falhas definitivas, respeitando a capacidade da Meta."
                      : "Selecione ao menos um contato para continuar. Você não precisa preencher toda a quantidade planejada."}
                  </p>
                </section>
                        </div>
                      ) : null}
                      {etapaDisparo === 4 ? (
                        <div className={styles.disparoWizardConfirmation}>
            <div className={styles.modalBody}>
              <div className={styles.modalSection}>
                <h4 className={styles.modalSectionTitle}>Resumo do disparo</h4>

                <div className={styles.modalGridResumo}>
                  {agendarDisparo && agendamentoData && agendamentoHora ? (
                    <div className={styles.modalInfoItem}>
                      <span className={styles.modalInfoLabel}>Data e hora</span>
                      <strong className={styles.modalInfoValue}>
                        {formatarDataHora(
                          new Date(
                            `${agendamentoData}T${agendamentoHora}:00`
                          ).toISOString()
                        )}
                      </strong>
                    </div>
                  ) : null}

                  <div className={styles.modalInfoItem}>
                    <span className={styles.modalInfoLabel}>Disparo em massa</span>
                    <strong className={styles.modalInfoValue}>
                      {nomeCampanhaDisparo.trim() || "Nome automatico"}
                    </strong>
                  </div>

                  <div className={styles.modalInfoItem}>
                    <span className={styles.modalInfoLabel}>Template</span>
                    <strong className={styles.modalInfoValue}>
                      {templateSelecionado?.nome || "-"}
                    </strong>
                  </div>

                  <div className={styles.modalInfoItem}>
                    <span className={styles.modalInfoLabel}>Categoria</span>
                    <strong className={styles.modalInfoValue}>
                      {formatarCategoriaMeta(previewCusto?.categoria || templateSelecionado?.categoria)}
                    </strong>
                  </div>

                  <div className={styles.modalInfoItem}>
                    <span className={styles.modalInfoLabel}>Selecionados</span>
                    <strong className={styles.modalInfoValue}>
                      {previewCusto?.totalSelecionados ?? contatosSelecionados.length}
                    </strong>
                  </div>

                  <div className={styles.modalInfoItem}>
                    <span className={styles.modalInfoLabel}>Isentos (FEP)</span>
                    <strong className={styles.modalInfoValue}>
                      {previewCusto?.totalIsentos ?? 0}
                    </strong>
                  </div>

                  <div className={styles.modalInfoItem}>
                    <span className={styles.modalInfoLabel}>Cobrados</span>
                    <strong className={styles.modalInfoValue}>
                      {previewCusto?.totalCobrados ?? 0}
                    </strong>
                  </div>
                </div>
              </div>

              {(previewCusto?.totalIsentos ?? 0) > 0 ? (
                <div className={styles.modalFepNotice}>
                  <Info size={17} aria-hidden="true" />
                  <span>
                    <strong>Isenção Free Entry Point identificada.</strong>{" "}
                    {previewCusto?.totalIsentos} destinatário(s) com janela gratuita
                    aberta após anúncio de clique para WhatsApp e resposta da
                    empresa. Essa exceção é diferente da janela comum de 24 horas:
                    templates Utility fora do Free Entry Point são cobrados.
                  </span>
                </div>
              ) : null}

              <div className={styles.modalDestaqueFinanceiro}>
                <span className={styles.modalFinanceiroLabel}>Total estimado</span>
                <strong className={styles.modalFinanceiroValor}>
                  R$ {(previewCusto?.valorTotalBrlMin ?? 0).toFixed(2)} ~ R$ {(previewCusto?.valorTotalBrlMax ?? 0).toFixed(2)}
                </strong>
                <p className={styles.modalFinanceiroObs}>
                  Valor de referência calculado a partir do total em USD e da cotação atual.
                  Utility dentro da janela de 24h é cobrado desde 01/10/2026; a
                  isenção exibida considera apenas Free Entry Point identificado.
                </p>
              </div>

              <div className={styles.modalAlert}>
                <strong>Atenção:</strong> a cobrança pode ser processada pela Meta usando o método de pagamento vinculado à conta comercial. O valor final faturado pode variar em relação à estimativa exibida nesta tela.
              </div>

              <div className={styles.modalSection}>
                <h4 className={styles.modalSectionTitle}>Informações importantes</h4>

                <ul className={styles.modalList}>
                  {agendarDisparo ? (
                    <li>
                      No horario escolhido, o disparo sera criado e processado
                      gradualmente pela fila.
                    </li>
                  ) : null}
                  <li>O valor em real exibido aqui é uma estimativa e serve apenas como referência.</li>
                  <li>O valor final pode variar conforme cotação do USD, IOF, impostos, tarifas bancárias e regras de cobrança aplicáveis.</li>
                  <li>Conversas isentas não entram no total cobrado.</li>
                  <li>Templates de marketing podem gerar cobrança mesmo quando existe uma conversa ativa.</li>
                  <li>Após a confirmação, o disparo será enfileirado e processado gradualmente.</li>
                </ul>
              </div>

              <label className={styles.modalCheckbox}>
                <input
                  type="checkbox"
                  checked={confirmacaoCobranca}
                  onChange={(e) => setConfirmacaoCobranca(e.target.checked)}
                />
                <span>
                  Li as informações acima e estou ciente de que este disparo pode gerar cobrança.
                </span>
              </label>
            </div>
                        </div>
                      ) : null}
                    </div>

                    </div>
                    {etapaDisparo === 1 ? (
                      <aside className={styles.disparoWizardPreviewColumn} aria-label="Prévia da mensagem WhatsApp">
                  <div className={styles.previewSideCard}>
                    <div className={styles.previewTopLine}>
                      {templateSelecionado ? (
                        <span
                          className={`${styles.previewCategoryBadge} ${
                            String(templateSelecionado.categoria || "").toUpperCase() ===
                            "MARKETING"
                              ? styles.previewCategoryBadgeMarketing
                              : ""
                          }`}
                        >
                          {formatarCategoriaMeta(
                            templateSelecionado.categoria
                          )}
                        </span>
                      ) : null}
                      <strong>Prévia</strong>
                    </div>

                    {templateSelecionado ? (
                      <>
                        <div className={styles.whatsappPreviewArea}>
                          <div className={styles.whatsappBubble}>
                            {previewTemplateSelecionado?.imagemUrl ? (
                              <img
                                src={previewTemplateSelecionado.imagemUrl}
                                alt="Imagem do template"
                                className={styles.whatsappPreviewImage}
                              />
                            ) : previewTemplateSelecionado?.possuiImagem ? (
                              <div className={styles.whatsappPreviewImageFallback}>
                                Imagem vinculada ao template
                              </div>
                            ) : null}

                            {previewTemplateSelecionado?.titulo ? (
                              <strong className={styles.whatsappPreviewTitle}>
                                {previewTemplateSelecionado.titulo}
                              </strong>
                            ) : null}

                            <p className={styles.whatsappPreviewText}>
                              {previewTemplateSelecionado?.corpo || extrairBody(templateSelecionado.payload)}
                            </p>

                            <div className={styles.whatsappPreviewMeta}>
                              <span className={styles.whatsappPreviewFooter}>
                                {previewTemplateSelecionado?.rodape || "Equipe de atendimento"}
                              </span>

                              <span className={styles.whatsappPreviewTime}>
                                {agendarDisparo && agendamentoHora
                                  ? agendamentoHora
                                  : new Date().toLocaleTimeString("pt-BR", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                              </span>
                            </div>

                            {previewTemplateSelecionado?.redirectButtons?.map((button, index) => (
                              <div
                                key={`${button.url}-redirect-${index}`}
                                className={styles.whatsappPreviewButton}
                              >
                                ↗ {button.text}
                              </div>
                            ))}

                            {extrairQuickReplies(templateSelecionado.payload).map((texto, index) => (
                              <div key={`${texto}-${index}`} className={styles.whatsappPreviewButton}>
                                ↩ {texto}
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className={styles.previewEmptyState}>
                        Selecione um template aprovado para visualizar a mensagem do WhatsApp.
                      </div>
                    )}
                  </div>
                      </aside>
                    ) : null}
                    </div>
                    <footer className={styles.disparoWizardFooter}>
                      {erro ? <div className={styles.errorAlert} role="alert">{erro}</div> : null}
                      <div className={styles.disparoWizardActions}>
                        <button type="button" className={styles.secondaryButton} disabled={disparando}
                          onClick={() => {
                            if (etapaDisparo === 1) fecharModalCriacaoDisparo();
                            else { setEtapaDisparo((atual) => (atual - 1) as 1 | 2 | 3 | 4); setErro(""); }
                          }}>
                          {etapaDisparo === 1 ? "Cancelar" : "Voltar"}
                        </button>
                        {etapaDisparo < 4 ? (
                          <button type="button" className={styles.primaryButton}
                            disabled={disparando || loadingIntegracoes || (etapaDisparo === 2 && loadingSaudeMeta) || (etapaDisparo === 3 && loadingConflitos)}
                            onClick={avancarEtapaDisparo}>Próxima etapa</button>
                        ) : (
                          <button type="button" className={styles.primaryButton}
                            onClick={confirmarEDisparar}
                            disabled={!confirmacaoCobranca || disparando || loadingConflitos ||
                              temConflitosPendentes || temVariaveisObrigatoriasPendentes ||
                              temContatosOptOut || temContatosCooldown || listaFriaSemOptOut ||
                              (!agendarDisparo && (disparoBloqueado || selecaoExcedeLimite)) ||
                              agendamentoInvalidoPeloLimiteMeta || loadingPreviewCusto}>
                            {disparando ? "Processando..." :
                              agendarDisparo ? "Confirmar agendamento" :
                              templateComListaFria ? "Enviar disparos" : "Confirmar e enviar"}
                          </button>
                        )}
                      </div>
                    </footer>
                  </form>
                )}
              </section>
            </div>
          ) : null}
          <section className={styles.resultsCard}>
        <div className={`${styles.cardHeader} ${styles.historyResultsHeader}`}>
          <div className={styles.historyResultsHeaderText}>
            <p className={styles.eyebrow}>Histórico</p>
            <h2 className={styles.cardTitle}>Resultados dos disparos</h2>
            <p className={styles.cardSubtitle}>
              Cada disparo em massa aparece em um único card com os totais da campanha.
            </p>
          </div>

          <div className={styles.historyHeaderActions}>
          <div className={styles.historyHeaderPrimaryActions}>
            <a
              className={styles.historyPaymentButton}
              href="https://business.facebook.com/latest/billing_hub/accounts/details/"
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir a Central de Cobrança da Meta para cadastrar uma forma de pagamento"
            >
              Cadastrar forma de pagamento
            </a>
            <button type="button" className={styles.historySendButton}
              onClick={abrirModalCriacaoDisparo}
              disabled={!podeDisparar || loadingUsuario || loadingIntegracoes}>
              Enviar disparos
            </button>
          </div>
          <button
            type="button"
            className={styles.historyAccumulatedReportButton}
            onClick={abrirModalRelatorioAcumulado}
            disabled={campanhasHistorico.length < 2}
            title={
              campanhasHistorico.length < 2
                ? "É necessário ter pelo menos 2 campanhas"
                : "Gerar relatório acumulado de 2 ou mais campanhas"
            }
          >
            <FileSpreadsheet size={17} />
            Relatório acumulado
          </button>
          </div>
        </div>

          <div className={styles.historySearchBar}>
            <div className={styles.historySearchField}>
              <label className={styles.label}>Busca</label>
              <input
                value={buscaHistorico}
                onChange={(e) => {
                  setBuscaHistorico(e.target.value);
                  if (filtroHistoricoCampanha) {
                    setPaginaRelatorioCampanha(1);
                  }
                }}
                className={styles.input}
                placeholder={filtroHistoricoCampanha ? "Busque por número, nome ou status..." : "Busque por campanha, template ou integração..."}
              />
            </div>

            <div className={styles.historyIntegrationFilter}>
              <label className={styles.label}>Integração</label>
              <select
                value={filtroHistoricoIntegracao}
                onChange={(e) => {
                  setFiltroHistoricoIntegracao(e.target.value);
                  selecionarRelatorioCampanha("");
                }}
                className={styles.input}
              >
                <option value="">Todas as integrações</option>
                {integracoes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome_conexao || "Integração"} {item.numero || ""}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.historyMassFilter}>
              <label className={styles.label}>Campanha do relatório</label>
              <select
                value={filtroHistoricoCampanha}
                onChange={(e) => {
                  selecionarRelatorioCampanha(e.target.value);
                }}
                className={styles.input}
              >
                <option value="">Histórico geral de disparos</option>
                {campanhasHistoricoFiltradas.map((campanha) => (
                  <option key={campanha.id} value={campanha.id}>
                    {nomeCampanhaHistorico(campanha)}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.historyExportAction}>
              <button
                type="button"
                className={styles.historyExportButton}
                onClick={gerarRelatorioExcelCampanha}
                disabled={
                  !filtroHistoricoCampanha || exportandoRelatorioCampanha
                }
                title={
                  filtroHistoricoCampanha
                    ? "Gerar relatório Excel desta campanha"
                    : "Selecione um disparo em massa"
                }
              >
                <FileSpreadsheet size={17} />
                {exportandoRelatorioCampanha
                  ? "Gerando..."
                  : "Gerar relatório Excel"}
              </button>
            </div>
          </div>

            {filtroHistoricoCampanha ? (
              <div className={styles.campaignReport}>
                {loadingRelatorioCampanhaDetalhado ? (
                  <div className={styles.emptyState}>
                    Carregando relatório detalhado da campanha...
                  </div>
                ) : !relatorioCampanhaDetalhado ? (
                  <div className={styles.emptyState}>
                    Não foi possível carregar os detalhes desta campanha.
                  </div>
                ) : (
                  <>
                    <div className={styles.campaignReportHeader}>
                      <button type="button" className={styles.campaignReportBack}
                        onClick={() => selecionarRelatorioCampanha("")}>
                        <ArrowLeft size={17} aria-hidden="true" />
                        Voltar ao histórico
                      </button>
                      <div className={styles.campaignReportHeading}>
                        <div>
                          <p className={styles.campaignReportEyebrow}>
                            Relatório por campanha
                          </p>
                          <h3 className={styles.campaignReportTitle}>
                            {nomeIntegracaoCampanhaRelatorioSelecionada} —{" "}
                            {nomeCampanhaRelatorioSelecionada}
                          </h3>
                          <p className={styles.campaignReportMeta}>
                            Template:{" "}
                            {relatorioCampanhaDetalhado.campanha.template_nome || "-"}
                            {" • "}
                            Categoria:{" "}
                            {formatarCategoriaMeta(
                              relatorioCampanhaDetalhado.campanha.template_categoria
                            )}
                            {" • "}
                            Criada em:{" "}
                            {formatarDataHora(
                              relatorioCampanhaDetalhado.campanha.created_at
                            ) || "-"}
                          </p>
                        </div>

                        <div className={styles.campaignReportCost}>
                          <span>Custo estimado</span>
                          <strong>
                            {relatorioCampanhaDetalhado.custo_estimado.disponivel
                              ? formatarMoedaBRL(
                                  relatorioCampanhaDetalhado.custo_estimado
                                    .valorTotalBrlEstimado
                                )
                              : "Não disponível"}
                          </strong>
                          <small>
                            {relatorioCampanhaDetalhado.custo_estimado
                              .quantidadeCobravelEstimada}{" "}
                            envios considerados
                          </small>
                        </div>
                      </div>

                      <div className={styles.campaignReportMetrics}>
                        <button
                          type="button"
                          className={styles.campaignReportMetric}
                          aria-pressed={filtroRelatorioCampanha === "todos"}
                          title="Exibir todos os registros da campanha"
                          onClick={() => {
                            setFiltroRelatorioCampanha("todos");
                            setPaginaRelatorioCampanha(1);
                          }}
                          style={{
                            appearance: "none",
                            width: "100%",
                            cursor: "pointer",
                            textAlign: "left",
                            font: "inherit",
                            boxShadow:
                              filtroRelatorioCampanha === "todos"
                                ? "inset 0 0 0 2px var(--crm-primary-strong)"
                                : undefined,
                          }}
                        >
                          <span>Total</span>
                          <strong>
                            {relatorioCampanhaDetalhado.campanha.total_enviados}/
                            {relatorioCampanhaDetalhado.campanha.total_itens}
                          </strong>
                        </button>
                        <button
                          type="button"
                          className={styles.campaignReportMetric}
                          aria-pressed={filtroRelatorioCampanha === "enviado"}
                          title="Filtrar somente registros com status Enviado"
                          onClick={() => {
                            setFiltroRelatorioCampanha("enviado");
                            setPaginaRelatorioCampanha(1);
                          }}
                          style={{
                            appearance: "none",
                            width: "100%",
                            cursor: "pointer",
                            textAlign: "left",
                            font: "inherit",
                            boxShadow:
                              filtroRelatorioCampanha === "enviado"
                                ? "inset 0 0 0 2px var(--crm-primary-strong)"
                                : undefined,
                          }}
                        >
                          <span>Enviados</span>
                          <strong>
                            {relatorioCampanhaDetalhado.totais.enviado}
                          </strong>
                        </button>
                        <button
                          type="button"
                          className={styles.campaignReportMetric}
                          aria-pressed={filtroRelatorioCampanha === "entregue"}
                          title="Filtrar somente registros com status Entregue"
                          onClick={() => {
                            setFiltroRelatorioCampanha("entregue");
                            setPaginaRelatorioCampanha(1);
                          }}
                          style={{
                            appearance: "none",
                            width: "100%",
                            cursor: "pointer",
                            textAlign: "left",
                            font: "inherit",
                            boxShadow:
                              filtroRelatorioCampanha === "entregue"
                                ? "inset 0 0 0 2px var(--crm-primary-strong)"
                                : undefined,
                          }}
                        >
                          <span>Entregues</span>
                          <strong>
                            {relatorioCampanhaDetalhado.totais.entregue}
                          </strong>
                        </button>
                        <button
                          type="button"
                          className={styles.campaignReportMetric}
                          aria-pressed={filtroRelatorioCampanha === "lido"}
                          title="Filtrar somente registros lidos"
                          onClick={() => {
                            setFiltroRelatorioCampanha("lido");
                            setPaginaRelatorioCampanha(1);
                          }}
                          style={{
                            appearance: "none",
                            width: "100%",
                            cursor: "pointer",
                            textAlign: "left",
                            font: "inherit",
                            boxShadow:
                              filtroRelatorioCampanha === "lido"
                                ? "inset 0 0 0 2px var(--crm-success-text)"
                                : undefined,
                          }}
                        >
                          <span>Lidos</span>
                          <strong>{relatorioCampanhaDetalhado.totais.lido}</strong>
                        </button>
                        <button
                          type="button"
                          className={styles.campaignReportMetric}
                          aria-pressed={filtroRelatorioCampanha === "respondido"}
                          title="Filtrar somente registros respondidos"
                          onClick={() => {
                            setFiltroRelatorioCampanha("respondido");
                            setPaginaRelatorioCampanha(1);
                          }}
                          style={{
                            appearance: "none",
                            width: "100%",
                            cursor: "pointer",
                            textAlign: "left",
                            font: "inherit",
                            boxShadow:
                              filtroRelatorioCampanha === "respondido"
                                ? "inset 0 0 0 2px var(--crm-primary-strong)"
                                : undefined,
                          }}
                        >
                          <span>Respondidos</span>
                          <strong>
                            {relatorioCampanhaDetalhado.totais.respondido}
                          </strong>
                        </button>
                        <button
                          type="button"
                          className={styles.campaignReportMetric}
                          aria-pressed={filtroRelatorioCampanha === "falha"}
                          title="Filtrar somente registros com falha"
                          onClick={() => {
                            setFiltroRelatorioCampanha("falha");
                            setPaginaRelatorioCampanha(1);
                          }}
                          style={{
                            appearance: "none",
                            width: "100%",
                            cursor: "pointer",
                            textAlign: "left",
                            font: "inherit",
                            boxShadow:
                              filtroRelatorioCampanha === "falha"
                                ? "inset 0 0 0 2px var(--crm-danger-text)"
                                : undefined,
                          }}
                        >
                          <span
                            style={
                              filtroRelatorioCampanha === "falha"
                                ? { color: "var(--crm-danger-text)" }
                                : undefined
                            }
                          >
                            Falhas
                          </span>
                          <strong
                            style={
                              relatorioCampanhaDetalhado.totais.falha > 0
                                ? { color: "var(--crm-danger-text)" }
                                : undefined
                            }
                          >
                            {relatorioCampanhaDetalhado.totais.falha}
                          </strong>
                        </button>
                        <button
                          type="button"
                          className={styles.campaignReportMetric}
                          aria-pressed={filtroRelatorioCampanha === "pendente"}
                          title="Filtrar somente registros pendentes"
                          onClick={() => {
                            setFiltroRelatorioCampanha("pendente");
                            setPaginaRelatorioCampanha(1);
                          }}
                          style={{
                            appearance: "none",
                            width: "100%",
                            cursor: "pointer",
                            textAlign: "left",
                            font: "inherit",
                            boxShadow:
                              filtroRelatorioCampanha === "pendente"
                                ? "inset 0 0 0 2px var(--crm-warning-text)"
                                : undefined,
                          }}
                        >
                          <span>Pendentes</span>
                          <strong>
                            {relatorioCampanhaDetalhado.totais.pendente}
                          </strong>
                        </button>
                        <button
                          type="button"
                          className={styles.campaignReportMetric}
                          aria-pressed={filtroRelatorioCampanha === "cancelado"}
                          title="Filtrar somente registros cancelados"
                          onClick={() => {
                            setFiltroRelatorioCampanha("cancelado");
                            setPaginaRelatorioCampanha(1);
                          }}
                          style={{
                            appearance: "none",
                            width: "100%",
                            cursor: "pointer",
                            textAlign: "left",
                            font: "inherit",
                            boxShadow:
                              filtroRelatorioCampanha === "cancelado"
                                ? "inset 0 0 0 2px var(--crm-danger-text)"
                                : undefined,
                          }}
                        >
                          <span>Cancelados</span>
                          <strong>
                            {relatorioCampanhaDetalhado.totais.cancelado}
                          </strong>
                        </button>
                      </div>


                      {falhasRelatorioAgrupadas.length > 0 ? (
                        <section className={styles.campaignReportFailures} aria-label="Falhas identificadas na campanha">
                          <div className={styles.campaignReportFailuresHeading}>
                            <div className={styles.campaignReportFailuresHeadingTitle}>
                              <Info size={18} aria-hidden="true" />
                              <strong>Falhas identificadas</strong>
                            </div>
                            <span>
                              {falhasRelatorioAgrupadas.length} {falhasRelatorioAgrupadas.length === 1 ? "tipo de falha" : "tipos de falha"} · Clique para ver o que aconteceu e o que fazer.
                            </span>
                          </div>
                          <div className={styles.campaignIssueList}>
                            {falhasRelatorioAgrupadas.map((tipo) => (
                              <details
                                key={tipo.chave}
                                className={`${styles.campaignIssueItem} ${styles.campaignIssueCollapsible} ${
                                  tipo.gravidade === 3 ? styles.campaignIssueLevel3 :
                                  tipo.gravidade === 2 ? styles.campaignIssueLevel2 :
                                  styles.campaignIssueLevel1
                                }`}
                              >
                                <summary className={styles.campaignIssueSummary}>
                                  <span className={styles.campaignIssueHeadingText}>
                                    <span className={styles.campaignIssueCode}>
                                      {tipo.codigo ? `Erro ${tipo.codigo}` : "Sem código"}
                                    </span>
                                    <strong>{tipo.nome}</strong>
                                  </span>
                                  <span className={styles.campaignIssueSummaryPreview} title={tipo.resumo}>
                                    {tipo.resumo}
                                  </span>
                                  <span className={styles.campaignIssueQuantity}>
                                    {tipo.quantidade} {tipo.quantidade === 1 ? "falha" : "falhas"}
                                  </span>
                                  <ChevronDown size={17} className={styles.campaignIssueChevron} aria-hidden="true" />
                                </summary>
                                <div className={styles.campaignIssueDetails}>
                                  <p className={styles.campaignIssueExplanation}>
                                    <strong>O que aconteceu:</strong> {tipo.significado}
                                  </p>
                                  <p className={styles.campaignIssueGuidance}>
                                    <strong>O que fazer:</strong> {tipo.acao}
                                  </p>
                                  {tipo.detalheTecnico ? (
                                    <p className={styles.campaignIssueTechnical}>
                                      Detalhe registrado: {tipo.detalheTecnico}
                                    </p>
                                  ) : null}
                                </div>
                              </details>
                            ))}
                          </div>
                        </section>
                      ) : null}
                      <p className={styles.campaignReportCostNote}>
                        {relatorioCampanhaDetalhado.custo_estimado.criterio}
                      </p>
                    </div>

                    {linhasRelatorioCampanhaFiltradas.length === 0 ? (
                      <div className={styles.emptyState}>
                        Nenhum contato encontrado para os filtros atuais desta campanha.
                      </div>
                    ) : (
                      <>
                        <div className={styles.campaignReportTableWrap}>
                          <table className={styles.campaignReportTable}>
                            <thead>
                              <tr>
                                <th>Número</th>
                                <th>Nome</th>
                                <th>Status</th>
                                <th>1ª mensagem respondida</th>
                                <th>Enviado em</th>
                                <th>Lido em</th>
                                <th>Respondido em</th>
                              </tr>
                            </thead>
                            <tbody>
                              {linhasRelatorioCampanhaPaginadas.map(
                                (item, index) => {
                                  const status = String(
                                    item.status_final || "pendente"
                                  ).toLowerCase();
                                  const codigoErro = identificarCodigoErroMetaWhatsApp(
                                    item.erro_codigo_meta,
                                    item.erro
                                  );
                                  const detalheErro = codigoErro
                                    ? descreverErroMetaWhatsApp(codigoErro, item.erro)
                                    : null;
                                  const erroCompleto = Boolean(item.erro || codigoErro);
                                  const chaveLinha = `${item.numero || "sem-numero"}-${item.enviado_em || index}`;

                                  return (
                                    <Fragment key={chaveLinha}>
                                    <tr
                                      className={
                                        erroCompleto
                                          ? styles.campaignReportMainRowWithError
                                          : undefined
                                      }
                                    >
                                      <td className={styles.campaignReportPhone}>
                                        {item.numero || "-"}
                                      </td>
                                      <td className={styles.campaignReportName}>
                                        {item.nome_contato || "Sem nome"}
                                      </td>
                                      <td>
                                        <span
                                          className={`${styles.campaignReportStatus} ${
                                            status === "lido"
                                              ? styles.campaignReportStatusRead
                                              : status === "entregue"
                                              ? styles.campaignReportStatusDelivered
                                              : status === "falha"
                                              ? styles.campaignReportStatusFailed
                                              : status === "cancelado"
                                              ? styles.campaignReportStatusCancelled
                                              : status === "enviado"
                                              ? styles.campaignReportStatusSent
                                              : styles.campaignReportStatusPending
                                          }`}
                                        >
                                          {item.status_label || "Pendente"}
                                        </span>
                                      </td>
                                      <td className={styles.campaignReportReply}>
                                        {item.primeira_resposta || "—"}
                                      </td>
                                      <td>
                                        {formatarDataHora(item.enviado_em) || "—"}
                                      </td>
                                      <td>
                                        {formatarDataHora(item.lido_em) || "—"}
                                      </td>
                                      <td>
                                        {formatarDataHora(item.resposta_em) || "—"}
                                      </td>
                                    </tr>
                                    {erroCompleto ? (
                                      <tr className={`${styles.campaignReportErrorRow} ${
                                          codigoErro === 131048 ? styles.campaignReportErrorRow131048 : ""
                                        }`}>
                                        <td colSpan={7}>
                                          <div
                                            className={`${styles.campaignReportErrorLine} ${
                                              codigoErro === 131048 ? styles.campaignReportErrorLine131048 : ""
                                            }`}
                                            title={detalheErro?.significado || item.erro || undefined}
                                          >
                                            <strong>
                                              {codigoErro ? `Falha ${codigoErro}` : "Falha"}
                                              {detalheErro ? ` · ${detalheErro.nome}` : ""}
                                            </strong>

                                            <span className={styles.campaignReportErrorDescription}>
                                              {detalheErro?.resumo || detalheErro?.significado || item.erro || "Não foi possível entregar a mensagem."}
                                            </span>
                                          </div>
                                        </td>
                                      </tr>
                                    ) : null}
                                    </Fragment>
                                  );
                                }
                              )}
                            </tbody>
                          </table>
                        </div>

                        <div className={styles.paginationBar}>
                          <span className={styles.paginationInfo}>
                            Mostrando {primeiroItemRelatorioCampanha} a{" "}
                            {ultimoItemRelatorioCampanha} de{" "}
                            {linhasRelatorioCampanhaFiltradas.length} contatos
                          </span>

                          <div className={styles.paginationActions}>
                            <button
                              type="button"
                              className={styles.paginationButton}
                              onClick={() =>
                                setPaginaRelatorioCampanha((pagina) =>
                                  Math.max(1, pagina - 1)
                                )
                              }
                              disabled={paginaRelatorioCampanhaSegura <= 1}
                            >
                              Anterior
                            </button>

                            <span className={styles.paginationCurrent}>
                              Página {paginaRelatorioCampanhaSegura} de{" "}
                              {totalPaginasRelatorioCampanha}
                            </span>

                            <button
                              type="button"
                              className={styles.paginationButton}
                              onClick={() =>
                                setPaginaRelatorioCampanha((pagina) =>
                                  Math.min(
                                    totalPaginasRelatorioCampanha,
                                    pagina + 1
                                  )
                                )
                              }
                              disabled={
                                paginaRelatorioCampanhaSegura >=
                                totalPaginasRelatorioCampanha
                              }
                            >
                              Próxima
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            ) : (
              <>
                {loadingHistorico ? (
                  <div className={styles.emptyState}>Carregando campanhas...</div>
                ) : campanhasHistoricoCards.length === 0 ? (
                  <div className={styles.emptyState}>
                    Nenhuma campanha encontrada para este filtro.
                  </div>
                ) : (
                  <div className={styles.resultsList}>
                    {campanhasHistoricoCards.map((campanha) => {
                      const total = Math.max(0, Number(campanha.total_itens || 0));
                      const enviados = Math.max(0, Number(campanha.total_enviados || 0));
                      const falhas = Math.max(0, Number(campanha.total_falhas || 0));
                      const emAndamento = ["pendente", "enviando"].includes(
                        String(campanha.status || "").toLowerCase()
                      );
                      const canceladosRegistrados = Math.max(
                        0,
                        Number(campanha.total_cancelados || 0)
                      );
                      const cancelados = emAndamento
                        ? canceladosRegistrados
                        : Math.max(
                            canceladosRegistrados,
                            total - enviados - falhas
                          );
                      const integracao = integracoes.find(
                        (item) => item.id === campanha.integracao_whatsapp_id
                      );
                      const nomeIntegracao =
                        integracao?.nome_conexao ||
                        integracao?.numero ||
                        "WhatsApp";
                      const statusCampanha = String(
                        campanha.status || ""
                      ).toLowerCase();
                      const campanhaCancelada = statusCampanha === "cancelada";
                      const campanhaFalhouIntegralmente =
                        statusCampanha === "concluida" &&
                        total > 0 &&
                        enviados === 0 &&
                        falhas >= total;
                      const campanhaInterrompida =
                        statusCampanha === "erro" ||
                        statusCampanha.startsWith("pausada_");
                      const comProblema = campanhaHistoricoTemProblema(campanha);
                      const campanhaAgendada =
                        campanhaHistoricoFoiAgendada(campanha);
                      const tituloProblema = comProblema
                        ? tituloProblemaCampanhaHistorico(campanha)
                        : null;
                      const falhasPorTipo = falhas > 0
                        ? agruparFalhasCampanhaHistorico(campanha)
                        : [];

                      return (
                        <article
                          key={campanha.id}
                          className={`${styles.resultItem} ${styles.campaignHistoryCard} ${
                            emAndamento
                              ? styles.resultProcessing
                              : campanhaCancelada || campanhaFalhouIntegralmente
                              ? `${styles.resultError} ${styles.resultMassCancelled}`
                              : comProblema
                              ? styles.resultProcessing
                              : styles.resultSuccess
                          }`}
                          style={{
                            boxShadow:
                              campanhaCancelada || campanhaFalhouIntegralmente
                                ? "inset 4px 0 0 var(--crm-danger-text)"
                                : comProblema || emAndamento
                                ? "inset 4px 0 0 var(--crm-warning-text)"
                                : "inset 4px 0 0 var(--crm-success-text)",
                          }}
                        >
                          <div className={styles.resultCompactHeader}>
                            <div className={styles.resultCompactMain}>
                              <button type="button"
                                className={styles.resultCompactNameButton}
                                onClick={() => selecionarRelatorioCampanha(campanha.id)}
                                title="Abrir relatório da campanha">
                                {nomeIntegracao} — {nomeCampanhaHistorico(campanha)}
                              </button>
                              <p className={styles.resultCompactMeta}>
                                Template: {campanha.template_nome || "-"}
                                {" • "}
                                Categoria: {formatarCategoriaMeta(campanha.template_categoria)}
                                {" • "}
                                {formatarDataHora(campanha.created_at)}
                              </p>
                            </div>

                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "flex-end",
                                gap: 8,
                                flexWrap: "wrap",
                              }}
                            >
                              {campanhaAgendada ? (
                                <span
                                  className={styles.resultStatus}
                                  title={
                                    campanha.metadata_json?.executar_em
                                      ? `Disparo originalmente agendado para ${formatarDataHora(
                                          String(
                                            campanha.metadata_json.executar_em
                                          )
                                        )}`
                                      : "Disparo criado a partir de um agendamento"
                                  }
                                  style={{
                                    border: "1px solid var(--crm-primary-border)",
                                    color: "var(--crm-primary-text)",
                                    background: "var(--crm-primary-soft)",
                                  }}
                                >
                                  Agendado
                                </span>
                              ) : null}

                              <span
                                className={styles.resultStatus}
                                style={
                                  campanhaCancelada ||
                                  campanhaFalhouIntegralmente ||
                                  campanhaInterrompida
                                    ? {
                                        border: "1px solid var(--crm-danger-border)",
                                        color: "var(--crm-danger-text)",
                                        background: "var(--crm-danger-bg)",
                                      }
                                    : undefined
                                }
                              >
                                {statusCampanhaHistorico(campanha)}
                              </span>
                            </div>
                          </div>

                          <div className={styles.massCancelledMetrics}>
                            <button type="button" className={styles.massCancelledMetric}
                              onClick={() => selecionarRelatorioCampanha(campanha.id)} title="Ver relatório da campanha">
                              <strong>{total}</strong>
                              <span>Total</span>
                            </button>
                            <button type="button" className={styles.massCancelledMetric}
                              onClick={() => selecionarRelatorioCampanha(campanha.id)} title="Ver relatório da campanha">
                              <strong>{enviados}</strong>
                              <span>Enviados</span>
                            </button>
                            <button type="button" className={styles.massCancelledMetric}
                              onClick={() => selecionarRelatorioCampanha(campanha.id)} title="Ver relatório da campanha">
                              <strong>{cancelados}</strong>
                              <span>Cancelados</span>
                            </button>
                            <button type="button" className={styles.massCancelledMetric}
                              onClick={() => selecionarRelatorioCampanha(campanha.id)} title="Ver relatório da campanha">
                              <strong style={falhas > 0 ? { color: "var(--crm-danger-text)" } : undefined}>{falhas}</strong>
                              <span style={falhas > 0 ? { color: "var(--crm-danger-text)" } : undefined}>Falhas</span>
                            </button>
                          </div>

                          {tituloProblema ? (
                            <div className={styles.campaignIssuesPanel}>
                              <div className={styles.campaignIssuesHeader}>
                                <div>
                                  <div className={styles.campaignIssuesTitle}>
                                    <Info size={17} aria-hidden="true" />
                                    <strong>{tituloProblema}</strong>
                                  </div>
                                  <p>
                                    {falhas > 0
                                      ? `${falhas} ${falhas === 1 ? "falha identificada" : "falhas identificadas"} em ${falhasPorTipo.length} ${falhasPorTipo.length === 1 ? "tipo" : "tipos"}.`
                                      : "Consulte a situação da campanha abaixo."}
                                  </p>
                                </div>

                              </div>


                              {falhasPorTipo.length > 0 ? (
                                <div className={styles.campaignIssueList}>
                                  {falhasPorTipo.map((tipo) => (
                                    <div
                                      key={tipo.chave}
                                      className={`${styles.campaignIssueItem} ${styles.campaignIssueCompactItem} ${
                                        tipo.gravidade === 3 ? styles.campaignIssueLevel3 :
                                        tipo.gravidade === 2 ? styles.campaignIssueLevel2 :
                                        styles.campaignIssueLevel1
                                      }`}
                                    >
                                      <div className={styles.campaignIssueCompactLine}>
                                        <div className={styles.campaignIssueCompactCopy}>
                                          <div className={styles.campaignIssueCompactLabel}>
                                            <span className={styles.campaignIssueQuantity}>
                                              {tipo.quantidade} {tipo.quantidade === 1 ? "falha" : "falhas"}
                                            </span>
                                            <strong>{tipo.codigo ? `${tipo.codigo} · ${tipo.nome}` : tipo.nome}</strong>
                                          </div>
                                          <span className={styles.campaignIssueCompactDescription} title={tipo.resumo}>{tipo.resumo}</span>
                                        </div>
                                        <button
                                          type="button"
                                          className={styles.campaignIssueLearnMore}
                                          onClick={() => setFalhaModal({ ...tipo, campanhaNome: nomeCampanhaHistorico(campanha) })}
                                          aria-label={`Saber mais sobre ${tipo.nome}`}
                                        >
                                          Saber mais
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className={styles.campaignIssuesContext}>
                                  {campanha.pausa_motivo || campanha.erro ||
                                    (cancelados > 0
                                      ? "A campanha foi cancelada antes da conclusão dos envios."
                                      : "O processamento foi interrompido antes da conclusão.")}
                                </p>
                              )}

                              {cancelados > 0 && falhas > 0 ? (
                                <p className={styles.campaignIssuesContext}>
                                  Além das falhas, {cancelados} {cancelados === 1 ? "envio foi cancelado" : "envios foram cancelados"}.
                                </p>
                              ) : null}
                            </div>
                          ) : null}

                          <button
                            type="button"
                            className={styles.campaignHistoryCardAction}
                            onClick={() => selecionarRelatorioCampanha(campanha.id)}
                          >
                            Ver relatório da campanha
                          </button>
                        </article>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>

      {falhaModal ? (
        <div className={styles.modalOverlay} onClick={() => setFalhaModal(null)}>
          <section
            className={`${styles.modalConfirmacao} ${styles.campaignFailureModal} ${
              falhaModal.gravidade === 3 ? styles.campaignFailureSeverity3 :
              falhaModal.gravidade === 2 ? styles.campaignFailureSeverity2 :
              styles.campaignFailureSeverity1
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="campanha-falha-titulo"
            onClick={(event) => event.stopPropagation()}
          >
            <header className={`${styles.modalHeader} ${styles.campaignFailureModalHeader}`}>
              <div className={styles.campaignFailureModalIntro}>
                <div className={styles.campaignFailureModalIcon} aria-hidden="true">
                  {falhaModal.gravidade === 3 ? <ShieldAlert size={25} /> :
                   falhaModal.gravidade === 2 ? <AlertTriangle size={25} /> :
                   <Info size={25} />}
                </div>
                <div className={styles.campaignFailureModalHeading}>
                  <p className={styles.modalEyebrow}>Detalhes da falha · {falhaModal.campanhaNome}</p>
                  <h3 className={styles.modalTitle} id="campanha-falha-titulo">
                    {falhaModal.codigo ? `${falhaModal.codigo} · ${falhaModal.nome}` : falhaModal.nome}
                  </h3>
                  <p className={styles.modalSubtitle}>
                    {falhaModal.quantidade} {falhaModal.quantidade === 1 ? "envio afetado" : "envios afetados"} nesta campanha.
                  </p>
                </div>
              </div>
              <div className={styles.campaignFailureModalActions}>
                <span className={styles.campaignFailureSeverityBadge}>
                  Nível {falhaModal.gravidade} · {falhaModal.gravidade === 3 ? "Crítica" : falhaModal.gravidade === 2 ? "Atenção" : "Informativa"}
                </span>
                <button type="button" className={styles.modalClose}
                  onClick={() => setFalhaModal(null)}
                  aria-label="Fechar detalhes da falha" autoFocus>
                  ×
                </button>
              </div>
            </header>
            <div className={styles.modalBody}>
              <section className={styles.campaignFailureModalSection}>
                <h4>O que aconteceu</h4>
                <p>{falhaModal.significado}</p>
              </section>
              <section className={styles.campaignFailureModalSection}>
                <h4>O que fazer</h4>
                <p>{falhaModal.acao}</p>
              </section>
              {falhaModal.detalheTecnico ? (
                <p className={styles.campaignIssueTechnical}>
                  Detalhe registrado: {falhaModal.detalheTecnico}
                </p>
              ) : null}
            </div>
            <footer className={styles.modalFooter}>
              <button type="button" className={styles.primaryButton} onClick={() => setFalhaModal(null)}>
                Entendi
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {disparando && !agendarDisparo ? (
        <div
          className={styles.campaignPreparingOverlay}
          role="status"
          aria-live="assertive"
          aria-label="Preparando campanha de disparo"
        >
          <div className={styles.campaignPreparingBox}>
            <span className={styles.campaignPreparingSpinner} aria-hidden="true" />
            <div>
              <strong>Preparando campanha de disparo</strong>
              <p>
                Validando os contatos, a capacidade da Meta e preparando a fila
                de envio. Esse processo pode levar alguns instantes.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {carregandoConclusaoDisparo && !modalResultadoConclusaoAberto ? (
        <div className={styles.campaignProgressOverlay} role="presentation">
          <div className={styles.conclusionPendingPanel} role="status" aria-live="polite">
            <span className={styles.conclusionPendingSpinner} aria-hidden="true" />
            <strong>Consolidando resultado do disparo</strong>
            <p>Consultando os totais finais da campanha antes de apresentar o relatório.</p>
          </div>
        </div>
      ) : null}

      {modalResultadoConclusaoAberto && campanhaResultadoConclusao ? (
        <div className={styles.campaignProgressOverlay} role="presentation">
          <div className={styles.campaignProgressShell}>
            {campanhasResultadoConclusao.length > 1 ? (
              <div
                className={styles.campaignProgressCampaignTabs}
                role="tablist"
                aria-label="Resultados de campanhas finalizadas"
              >
                {campanhasResultadoConclusao.map((campanha) => {
                  const selecionada =
                    campanha.id === campanhaResultadoConclusao.id;
                  const label =
                    campanha.integracao_nome ||
                    campanha.integracao_numero ||
                    "Integração";

                  return (
                    <button
                      key={campanha.id}
                      type="button"
                      role="tab"
                      aria-selected={selecionada}
                      className={`${styles.campaignProgressCampaignTab} ${
                        selecionada
                          ? styles.campaignProgressCampaignTabActive
                          : ""
                      }`}
                      onClick={() =>
                        setCampanhaResultadoConclusaoId(campanha.id)
                      }
                    >
                      <span
                        className={`${styles.campaignProgressCampaignTabDot} ${
                          campanhaFoiConcluidaComSucesso(campanha)
                            ? styles.campaignProgressCampaignTabDotSuccess
                            : styles.campaignProgressCampaignTabDotWarning
                        }`}
                        aria-hidden="true"
                      />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <section
              className={`${styles.campaignProgressModal} ${
                resultadoConclusaoSucesso
                  ? styles.campaignProgressModalSuccess
                  : styles.campaignProgressModalWarning
              }`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="campanha-resultado-titulo"
            >
              <header className={styles.campaignProgressHeader}>
                <div className={styles.campaignProgressHeading}>
                  <p className={styles.campaignProgressEyebrow}>
                    Resultado do disparo
                  </p>
                  <h2
                    id="campanha-resultado-titulo"
                    className={styles.campaignProgressTitle}
                  >
                    {campanhaResultadoConclusao.nome ||
                      rotuloResultadoCampanha(campanhaResultadoConclusao)}
                  </h2>

                  <div className={styles.campaignProgressMeta}>
                    <span
                      className={`${styles.campaignProgressState} ${
                        resultadoConclusaoSucesso
                          ? styles.campaignProgressStateSuccess
                          : styles.campaignProgressStateWarning
                      }`}
                    >
                      <span className={styles.campaignProgressStateDot} />
                      {rotuloResultadoCampanha(campanhaResultadoConclusao)}
                    </span>

                    <span className={styles.campaignProgressMetaItem}>
                      <FileText size={14} aria-hidden="true" />
                      Template: {campanhaResultadoConclusao.template_nome || "-"}
                    </span>

                    <span className={styles.campaignProgressMetaItem}>
                      <Link2 size={14} aria-hidden="true" />
                      Integração:{" "}
                      {campanhaResultadoConclusao.integracao_nome ||
                        campanhaResultadoConclusao.integracao_numero ||
                        "WhatsApp"}
                    </span>
                  </div>
                </div>

                <div className={styles.campaignProgressHeaderActions}>
                  <span className={styles.campaignProgressCounter}>
                    {rotuloResultadoCampanha(campanhaResultadoConclusao)}
                  </span>
                </div>
              </header>

              <div className={styles.campaignProgressMetrics}>
                <article className={styles.campaignProgressMetric}>
                  <span>Total</span>
                  <strong>{totalResultadoConclusao}</strong>
                </article>

                <article
                  className={`${styles.campaignProgressMetric} ${styles.campaignProgressMetricSuccess}`}
                >
                  <span>Enviados</span>
                  <strong>{enviadosResultadoConclusao}</strong>
                </article>

                <article
                  className={`${styles.campaignProgressMetric} ${styles.campaignProgressMetricDanger}`}
                >
                  <span>Falhas</span>
                  <strong>{falhasResultadoConclusao}</strong>
                </article>

                <article
                  className={`${styles.campaignProgressMetric} ${
                    canceladosResultadoConclusao > 0
                      ? styles.campaignProgressMetricDanger
                      : ""
                  }`}
                >
                  <span>Cancelados</span>
                  <strong>{canceladosResultadoConclusao}</strong>
                </article>
              </div>

              <div className={styles.campaignProgressBarRow}>
                <div
                  className={styles.campaignProgressBar}
                  role="progressbar"
                  aria-label="Resultado do disparo em massa"
                  aria-valuemin={0}
                  aria-valuemax={totalResultadoConclusao || 100}
                  aria-valuenow={Math.min(
                    totalResultadoConclusao,
                    enviadosResultadoConclusao +
                      falhasResultadoConclusao +
                      canceladosResultadoConclusao
                  )}
                >
                  <span style={{ width: "100%" }} />
                </div>

                <div className={styles.campaignProgressPercent}>
                  <strong>100%</strong>
                </div>
              </div>

              <div
                className={`${styles.campaignProgressInfo} ${
                  resultadoConclusaoSucesso
                    ? styles.campaignProgressInfoSuccess
                    : styles.campaignProgressInfoWarning
                }`}
              >
                <Info size={17} aria-hidden="true" />
                <p>
                  {aguardandoResultadoConclusao > 0
                    ? `${descricaoCampanhaTerminal(
                        campanhaResultadoConclusao
                      )} ${aguardandoResultadoConclusao} mensagem(ns) ainda aguardavam confirmação final da Meta no momento da consolidação.`
                    : descricaoCampanhaTerminal(campanhaResultadoConclusao)}
                </p>
              </div>

              <footer className={styles.campaignProgressFooter}>
                <div className={styles.campaignProgressFooterLeft}>
                  <span className={styles.campaignResultOnceNote}>
                    Este resultado é exibido uma única vez.
                  </span>
                </div>

                <button
                  type="button"
                  className={styles.campaignProgressMinimize}
                  onClick={fecharModalResultadoConclusao}
                >
                  <Check size={16} aria-hidden="true" />
                  Fechar
                </button>
              </footer>
            </section>
          </div>
        </div>
      ) : null}

      {campanhaPaginaAtiva &&
      campanhaPagina &&
      modalCampanhaAberto &&
      !modalResultadoConclusaoAberto ? (
        <div className={styles.campaignProgressOverlay} role="presentation">
          <div className={styles.campaignProgressShell}>
            {campanhasPagina.length > 1 ? (
              <div
                className={styles.campaignProgressCampaignTabs}
                role="tablist"
                aria-label="Campanhas em andamento"
              >
                {campanhasPagina.map((campanha) => {
                  const integracaoCampanha = integracoes.find(
                    (item) => item.id === campanha.integracao_whatsapp_id
                  );
                  const ativa = campanha.id === campanhaPagina.id;
                  const label =
                    integracaoCampanha?.nome_conexao ||
                    campanha.integracao_nome ||
                    campanha.integracao_numero ||
                    "Integração";

                  return (
                    <button
                      key={campanha.id}
                      type="button"
                      role="tab"
                      aria-selected={ativa}
                      className={`${styles.campaignProgressCampaignTab} ${
                        ativa
                          ? styles.campaignProgressCampaignTabActive
                          : ""
                      }`}
                      onClick={() => setCampanhaPagina(campanha)}
                    >
                      <span
                        className={`${styles.campaignProgressCampaignTabDot} ${
                          campanhaEstaAtiva(campanha)
                            ? styles.campaignProgressCampaignTabDotActive
                            : campanhaFoiConcluidaComSucesso(campanha)
                            ? styles.campaignProgressCampaignTabDotSuccess
                            : styles.campaignProgressCampaignTabDotWarning
                        }`}
                        aria-hidden="true"
                      />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <section
              className={`${styles.campaignProgressModal} ${
              campanhaPaginaAtiva
                ? styles.campaignProgressModalActive
                : campanhaPaginaSucesso
                ? styles.campaignProgressModalSuccess
                : styles.campaignProgressModalWarning
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="campanha-progresso-titulo"
          >
            <header className={styles.campaignProgressHeader}>
              <div className={styles.campaignProgressHeading}>
                <p className={styles.campaignProgressEyebrow}>Disparo em massa</p>
                <h2
                  id="campanha-progresso-titulo"
                  className={styles.campaignProgressTitle}
                >
                  {campanhaPagina.nome || rotuloStatusCampanha(campanhaPagina)}
                </h2>

                <div className={styles.campaignProgressMeta}>
                  <span
                    className={`${styles.campaignProgressState} ${
                      campanhaPaginaAtiva
                        ? styles.campaignProgressStateActive
                        : campanhaPaginaSucesso
                        ? styles.campaignProgressStateSuccess
                        : styles.campaignProgressStateWarning
                    }`}
                  >
                    <span className={styles.campaignProgressStateDot} />
                    {rotuloStatusCampanha(campanhaPagina)}
                  </span>

                  <span className={styles.campaignProgressMetaItem}>
                    <FileText size={14} aria-hidden="true" />
                    Template: {campanhaPagina.template_nome || "-"}
                  </span>

                  <span className={styles.campaignProgressMetaItem}>
                    <Link2 size={14} aria-hidden="true" />
                    Integração:{" "}
                    {integracaoCampanhaPagina?.nome_conexao ||
                      integracaoCampanhaPagina?.numero ||
                      "WhatsApp"}
                  </span>
                </div>
              </div>

              <div className={styles.campaignProgressHeaderActions}>
                <span className={styles.campaignProgressCounter}>
                  {campanhaPaginaAtiva
                    ? `${inteiroCampanha(campanhaPagina.enviados)}/${totalCampanhaPagina}`
                    : rotuloStatusCampanha(campanhaPagina)}
                </span>
              </div>
            </header>

            <div className={styles.campaignProgressMetrics}>
              <article className={styles.campaignProgressMetric}>
                <span>Total</span>
                <strong>{totalCampanhaPagina}</strong>
              </article>

              <article
                className={`${styles.campaignProgressMetric} ${styles.campaignProgressMetricSuccess}`}
              >
                <span>Enviados</span>
                <strong>{inteiroCampanha(campanhaPagina.enviados)}</strong>
              </article>

              <article
                className={`${styles.campaignProgressMetric} ${styles.campaignProgressMetricDanger}`}
              >
                <span>Falhas</span>
                <strong>{inteiroCampanha(campanhaPagina.falhas)}</strong>
              </article>

              {campanhaPaginaAtiva ? (
                <article className={styles.campaignProgressMetric}>
                  <span>Restantes</span>
                  <strong>{restantesCampanhaPagina}</strong>
                </article>
              ) : (
                <article
                  className={`${styles.campaignProgressMetric} ${
                    inteiroCampanha(campanhaPagina.cancelados) > 0
                      ? styles.campaignProgressMetricDanger
                      : ""
                  }`}
                >
                  <span>Cancelados</span>
                  <strong>{inteiroCampanha(campanhaPagina.cancelados)}</strong>
                </article>
              )}
            </div>

            <div className={styles.campaignProgressBarRow}>
              <div
                className={styles.campaignProgressBar}
                role="progressbar"
                aria-label="Progresso do disparo em massa"
                aria-valuemin={0}
                aria-valuemax={totalCampanhaPagina || 100}
                aria-valuenow={processadosCampanhaPagina}
              >
                <span style={{ width: `${progressoCampanhaPagina}%` }} />
              </div>

              <div className={styles.campaignProgressPercent}>
                <strong>{progressoCampanhaPagina}%</strong>
                {campanhaPaginaAtiva ? (
                  <span
                    className={styles.campaignProgressLoading}
                    aria-label="Atualizando progresso"
                  />
                ) : null}
              </div>
            </div>

            <div
              className={`${styles.campaignProgressInfo} ${
                !campanhaPaginaAtiva
                  ? campanhaPaginaSucesso
                    ? styles.campaignProgressInfoSuccess
                    : styles.campaignProgressInfoWarning
                  : ""
              }`}
            >
              <Info size={17} aria-hidden="true" />
              <p>
                {campanhaAguardandoMeta(campanhaPagina)
                  ? "Pausa automática temporária após 5 erros consecutivos 131048. Os contatos restantes continuam pendentes e o disparo será retomado automaticamente em até 2 minutos."
                  : campanhaPaginaAtiva
                  ? inteiroCampanha(campanhaPagina.aguardando_confirmacao) > 0
                    ? `${inteiroCampanha(
                        campanhaPagina.aguardando_confirmacao
                      )} mensagem(ns) aceita(s) pela API aguardando confirmação da Meta. O contador Enviados mostra apenas confirmações sent/delivered/read.`
                    : "Enviados mostra somente mensagens confirmadas pela Meta (sent/delivered/read). Falhas e restantes são atualizados conforme a campanha avança."
                  : descricaoCampanhaTerminal(campanhaPagina)}
              </p>
            </div>

            <footer className={styles.campaignProgressFooter}>
              <div className={styles.campaignProgressFooterLeft}>
                {campanhaPaginaAtiva && podeDisparar ? (
                  <button
                    type="button"
                    className={styles.campaignProgressCancel}
                    onClick={() => setModalCancelarCampanhaAberto(true)}
                    disabled={cancelandoCampanha}
                  >
                    <CircleStop size={16} aria-hidden="true" />
                    {cancelandoCampanha ? "Cancelando..." : "Cancelar disparo"}
                  </button>
                ) : null}
              </div>

              <button
                type="button"
                className={styles.campaignProgressMinimize}
                onClick={() => setModalCampanhaAberto(false)}
              >
                <Minus size={16} aria-hidden="true" />
                Minimizar
              </button>
            </footer>
            </section>
          </div>
        </div>
      ) : null}

      {modalVariaveisAberto && (
        <div
          className={styles.modalOverlay}
          onClick={() => {
            setErroVariavelModal("");
            setModalVariaveisAberto(false);
          }}
        >
          <div
            className={styles.modalConfirmacao}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.modalEyebrow}>Variáveis</p>
                <h3 className={styles.modalTitle}>Gerenciar variáveis</h3>
                <p className={styles.modalSubtitle}>
                  Cadastre variáveis personalizadas e consulte as variáveis fixas disponíveis para disparos e fluxos.
                </p>
              </div>

              <button
                type="button"
                className={styles.modalClose}
                onClick={() => {
                  setErroVariavelModal("");
                  setModalVariaveisAberto(false);
                }}
              >
                ×
              </button>
            </div>

            <div className={styles.modalBody}>

              <div className={styles.modalSection}>
                <h4 className={styles.modalSectionTitle}>Cadastrar variável personalizada</h4>

                <div className={styles.variableFormGrid}>
                  <div className={styles.field}>
                    <label className={styles.label}>Nome da variável</label>
                    <input
                      value={novaVariavelChave}
                      onChange={(e) =>
                        setNovaVariavelChave(
                          normalizarEntradaVariavelTemplate(e.target.value)
                        )
                      }
                      className={styles.input}
                      placeholder="ex: desconto"
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Mensagem da variável</label>

                  <textarea
                    value={novaVariavelValor}
                    onChange={(e) => setNovaVariavelValor(e.target.value)}
                    className={styles.textarea}
                    placeholder="Digite a mensagem da variável..."
                    rows={4}
                  />
                </div>


                <div className={styles.field}>
                  <label className={styles.label}>Descrição Interna</label>
                  <textarea
                    value={novaVariavelDescricao}
                    onChange={(e) => setNovaVariavelDescricao(e.target.value)}
                    className={styles.textareadesc}
                    placeholder="ex: essa váriavel é sobre desconto."
                  />
                </div>

                <div className={styles.variablePreviewBox}>
                  A variável será usada assim:{" "}
                  <strong>
                    {"{{"}
                    {normalizarEntradaVariavelTemplate(novaVariavelChave) || "nome_variavel"}
                    {"}}"}
                  </strong>
                </div>

                {erroVariavelModal && (
                  <div className={styles.errorAlert}>{erroVariavelModal}</div>
                )}

                <div className={styles.variableFormActions}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={salvarVariavelPersonalizada}
                    disabled={salvandoVariavel}
                  >
                    {salvandoVariavel ? "Salvando..." : "Salvar variável"}
                  </button>
                </div>
              </div>

              <div className={styles.modalSection}>
                <h4 className={styles.modalSectionTitle}>Variáveis cadastradas</h4>

                {loadingVariaveis ? (
                  <div className={styles.emptyMiniState}>Carregando variáveis...</div>
                ) : variaveisPersonalizadas.length === 0 ? (
                  <div className={styles.emptyMiniState}>
                    Nenhuma variável personalizada cadastrada.
                  </div>
                ) : (
                  <div className={styles.variablesList}>
                    {variaveisPersonalizadas.map((item) => (
                      <div key={item.id} className={styles.variableItem}>
                        <div className={styles.variableMain}>
                          <strong className={styles.variableCode}>
                            {"{{"}
                            {item.chave}
                            {"}}"}
                          </strong>

                          <p className={styles.variablePerson}>
                            <strong>Mensagem da variável: </strong>{item.valor}
                          </p>

                          {item.descricao ? (
                            <p className={styles.variablePerson}>
                              <strong>Descrição Interna: </strong>{item.descricao}
                            </p>
                          ) : null}
                        </div>

                        <div className={styles.variableActions}>
                          <button
                            type="button"
                            className={styles.variableUseButton}
                            onClick={() => aplicarVariavelNoCampo(item.chave)}
                          >
                            Usar
                          </button>

                          <button
                            type="button"
                            className={styles.variableDeleteButton}
                            onClick={() => removerVariavelPersonalizada(item.id)}
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className={styles.modalSection}>
                <h4 className={styles.modalSectionTitle}>Variáveis fixas do sistema</h4>

                <div className={styles.variablesList}>
                  {VARIAVEIS_FIXAS_SISTEMA.map((item) => (
                    <div key={item.chave} className={styles.variableItem}>
                      <div className={styles.variableMain}>
                        <strong className={styles.variableCode}>{item.exemplo}</strong>
                        <p className={styles.variableDescription}>{item.descricao}</p>
                      </div>

                      <button
                        type="button"
                        className={styles.variableUseButton}
                        onClick={() => aplicarVariavelNoCampo(item.chave)}
                      >
                        Usar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setErroVariavelModal("");
                  setModalVariaveisAberto(false);
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalCancelarCampanhaAberto &&
      campanhaPaginaAtiva &&
      campanhaPagina &&
      podeDisparar ? (
        <div
          className={styles.modalOverlay}
          onClick={() => {
            if (!cancelandoCampanha) {
              setModalCancelarCampanhaAberto(false);
            }
          }}
        >
          <div
            className={styles.modalConfirmacao}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.modalEyebrow}>Interromper campanha</p>
                <h3 className={styles.modalTitle}>
                  Cancelar disparos pendentes?
                </h3>
                <p className={styles.modalSubtitle}>
                  Os envios que ainda não foram processados serão cancelados.
                </p>
              </div>

              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setModalCancelarCampanhaAberto(false)}
                disabled={cancelandoCampanha}
                aria-label="Fechar confirmacao"
              >
                ×
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.cancelCampaignSummary}>
                <strong>{campanhaPagina.nome || "Disparo em massa"}</strong>
                <div>
                  <span>
                    Enviados: <strong>{campanhaPagina.enviados || 0}</strong>
                  </span>
                  <span>
                    Restantes:{" "}
                    <strong>
                      {Math.max(
                        Number(campanhaPagina.total || 0) -
                          Number(campanhaPagina.enviados || 0) -
                          Number(campanhaPagina.falhas || 0) -
                          Number(campanhaPagina.cancelados || 0),
                        0
                      )}
                    </strong>
                  </span>
                </div>
              </div>

              <div className={styles.modalAlert}>
                Mensagens ja aceitas pela Meta não podem ser desfeitas e
                continuarao aparecendo como enviadas.
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setModalCancelarCampanhaAberto(false)}
                disabled={cancelandoCampanha}
              >
                Continuar disparo
              </button>

              <button
                type="button"
                className={styles.cancelCampaignConfirmButton}
                onClick={cancelarCampanhaEmAndamento}
                disabled={cancelandoCampanha}
              >
                <CircleStop size={16} aria-hidden="true" />
                {cancelandoCampanha
                  ? "Cancelando..."
                  : "Cancelar disparos pendentes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}


      {modalRelatorioAcumuladoAberto ? (
        <div
          className={styles.modalOverlay}
          onClick={() => {
            if (!exportandoRelatorioAcumulado) {
              setModalRelatorioAcumuladoAberto(false);
            }
          }}
        >
          <div
            className={`${styles.modalConfirmacao} ${styles.accumulatedReportModal}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.modalEyebrow}>Relatório acumulado</p>
                <h3 className={styles.modalTitle}>Selecionar campanhas</h3>
                <p className={styles.modalSubtitle}>
                  Selecione 2 ou mais campanhas para consolidar os resultados em um único Excel.
                </p>
              </div>

              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setModalRelatorioAcumuladoAberto(false)}
                disabled={exportandoRelatorioAcumulado}
                aria-label="Fechar relatório acumulado"
              >
                ×
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.accumulatedReportToolbar}>
                <div>
                  <span className={styles.accumulatedReportCountLabel}>
                    Selecionadas
                  </span>
                  <strong className={styles.accumulatedReportCount}>
                    {campanhasRelatorioAcumuladoIds.length}
                  </strong>
                </div>

                <input
                  type="search"
                  className={styles.input}
                  value={buscaRelatorioAcumulado}
                  onChange={(event) =>
                    setBuscaRelatorioAcumulado(event.target.value)
                  }
                  placeholder="Buscar campanha, template ou integração..."
                  aria-label="Buscar campanha para relatório acumulado"
                />
              </div>

              <div className={styles.accumulatedReportFilters}>
                <label className={styles.accumulatedReportFilterField}>
                  <span>Dia</span>
                  <input
                    type="date"
                    className={styles.input}
                    value={diaRelatorioAcumulado}
                    onChange={(event) =>
                      setDiaRelatorioAcumulado(event.target.value)
                    }
                  />
                </label>

                <label className={styles.accumulatedReportFilterField}>
                  <span>Integração</span>
                  <select
                    className={styles.input}
                    value={integracaoRelatorioAcumulado}
                    onChange={(event) =>
                      setIntegracaoRelatorioAcumulado(event.target.value)
                    }
                  >
                    <option value="">Todas as integrações</option>
                    {integracoesRelatorioAcumuladoDisponiveis.map(
                      (integracao) => (
                        <option key={integracao.id} value={integracao.id}>
                          {integracao.nome_conexao ||
                            integracao.numero ||
                            "Integração"}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label className={styles.accumulatedReportFilterField}>
                  <span>Template</span>
                  <select
                    className={styles.input}
                    value={templateRelatorioAcumulado}
                    onChange={(event) =>
                      setTemplateRelatorioAcumulado(event.target.value)
                    }
                  >
                    <option value="">Todos os templates</option>
                    {templatesRelatorioAcumuladoDisponiveis.map((template) => (
                      <option key={template} value={template}>
                        {template}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className={styles.accumulatedReportList}>
                {campanhasRelatorioAcumuladoDisponiveis.length === 0 ? (
                  <div className={styles.accumulatedReportEmpty}>
                    Nenhuma campanha encontrada.
                  </div>
                ) : (
                  campanhasRelatorioAcumuladoDisponiveis.map((campanha) => {
                    const selecionada =
                      campanhasRelatorioAcumuladoIds.includes(campanha.id);
                    const integracao = integracoes.find(
                      (item) =>
                        item.id === campanha.integracao_whatsapp_id
                    );

                    return (
                      <label
                        key={campanha.id}
                        className={`${styles.accumulatedReportItem} ${
                          selecionada
                            ? styles.accumulatedReportItemSelected
                            : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selecionada}
                          onChange={() =>
                            alternarCampanhaRelatorioAcumulado(campanha.id)
                          }
                          disabled={exportandoRelatorioAcumulado}
                        />

                        <span className={styles.accumulatedReportItemContent}>
                          <strong>{nomeCampanhaHistorico(campanha)}</strong>
                          <small>
                            {integracao?.nome_conexao ||
                              integracao?.numero ||
                              "Integração"}{" "}
                            · Template: {campanha.template_nome || "-"}
                          </small>
                          <small>
                            {formatarDataHora(campanha.created_at) || "-"} ·{" "}
                            {Number(campanha.total_itens || 0)} contatos ·{" "}
                            {statusCampanhaHistorico(campanha)}
                          </small>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>

              {campanhasRelatorioAcumuladoIds.length === 1 ? (
                <div className={styles.modalAlert}>
                  Selecione mais 1 campanha para liberar o relatório acumulado.
                </div>
              ) : null}
            </div>

            <div
              className={`${styles.modalFooter} ${styles.accumulatedReportFooter}`}
            >
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() =>
                  alternarTodasCampanhasRelatorioAcumulado(
                    campanhasRelatorioAcumuladoDisponiveis
                  )
                }
                disabled={
                  exportandoRelatorioAcumulado ||
                  campanhasRelatorioAcumuladoDisponiveis.length === 0
                }
              >
                {todasCampanhasRelatorioAcumuladoVisiveisSelecionadas
                  ? "Remover todos"
                  : "Selecionar todos"}
                {campanhasRelatorioAcumuladoDisponiveis.length
                  ? ` (${campanhasRelatorioAcumuladoDisponiveis.length})`
                  : ""}
              </button>

              <div className={styles.accumulatedReportFooterActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setModalRelatorioAcumuladoAberto(false)}
                  disabled={exportandoRelatorioAcumulado}
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={gerarRelatorioExcelAcumulado}
                  disabled={
                    campanhasRelatorioAcumuladoIds.length < 2 ||
                    exportandoRelatorioAcumulado
                  }
                >
                  <FileSpreadsheet size={17} />
                  {exportandoRelatorioAcumulado
                    ? "Gerando Excel..."
                    : "Baixar Excel acumulado"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}


      {modalResponsabilidadeListaFriaAberto &&
        podeDisparar &&
        templateComListaFria && (
          <div
            className={styles.modalOverlay}
            onClick={() => {
              setModalResponsabilidadeListaFriaAberto(false);
              setConfirmacaoResponsabilidadeListaFria(false);

            }}
          >
            <div
              className={styles.modalConfirmacao}
              role="dialog"
              aria-modal="true"
              aria-labelledby="responsabilidade-lista-fria-titulo"
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <div>
                  <p className={styles.modalEyebrow}>Lista fria</p>
                  <h3
                    id="responsabilidade-lista-fria-titulo"
                    className={styles.modalTitle}
                  >
                    {marketingComListaFria
                      ? totalContatosListaFria === 1
                        ? "Confirmar envio para contato sem opt-in registrado"
                        : "Confirmar envio para contatos sem opt-in registrado"
                      : "Confirmar orientações do envio"}
                  </h3>
                  <p className={styles.modalSubtitle}>
                    O template{" "}
                    {marketingComListaFria ? "Marketing" : "Utility"} será
                    enviado para {totalContatosListaFria}{" "}
                    {totalContatosListaFria === 1 ? "contato" : "contatos"} sem
                    opt-in registrado no CRM.
                  </p>
                </div>

                <button
                  type="button"
                  className={styles.modalClose}
                  aria-label="Fechar"
                  onClick={() => {
                    setModalResponsabilidadeListaFriaAberto(false);
                    setConfirmacaoResponsabilidadeListaFria(false);

                  }}
                >
                  ×
                </button>
              </div>

              <div className={styles.modalBody}>
                <div className={styles.modalAlert}>
                  <strong>
                    {marketingComListaFria
                      ? totalContatosListaFria === 1
                        ? "Atenção: confirme a autorização do contato"
                        : "Atenção: confirme a autorização dos contatos"
                      : "Atenção ao uso de templates Utility"}
                  </strong>
                  {marketingComListaFria ? (
                    <p>
                      O CRM não encontrou opt-in registrado para{" "}
                      {totalContatosListaFria === 1
                        ? "este contato"
                        : "estes contatos"}. Templates de Marketing devem ser
                      enviados para pessoas que autorizaram receber esse tipo de
                      comunicação. Se essa autorização foi obtida por outro meio
                      e não está registrada no CRM, você pode continuar. Enviar
                      mensagens de marketing sem autorização adequada pode
                      aumentar bloqueios e denúncias e afetar a qualidade ou os
                      limites da conta WhatsApp.
                    </p>
                  ) : (
                    <p>
                      Usar templates Utility para conteúdo promocional, vendas
                      ou marketing — inclusive tentando inserir esse conteúdo
                      por variáveis, links ou outros meios para contornar as
                      diretrizes da Meta — pode gerar denúncias, redução da
                      qualidade, limitações ou bloqueio da conta WhatsApp.
                      Utilize esse tipo de template somente para comunicações
                      transacionais ou de serviço compatíveis com a categoria
                      aprovada pela Meta.
                    </p>
                  )}
                </div>

                <div className={styles.modalSection}>
                  <h4 className={styles.modalSectionTitle}>
                    Ao continuar, você declara que:
                  </h4>
                  {marketingComListaFria ? (
                    <ul className={styles.modalList}>
                      <li>
                        revisou o conteúdo, a origem da lista e a finalidade do
                        envio;
                      </li>
                      <li>
                        possui autorização adequada para enviar comunicações de
                        marketing aos destinatários;
                      </li>
                      <li>
                        disponibiliza uma forma clara de opt-out e respeitará os
                        pedidos para não receber novas mensagens.
                      </li>
                    </ul>
                  ) : (
                    <ul className={styles.modalList}>
                      <li>
                        revisou o conteúdo e confirma que ele é compatível com a
                        categoria Utility, sem oferta ou promoção;
                      </li>
                      <li>
                        possui base adequada para contatar os destinatários;
                      </li>
                      <li>
                        não está utilizando variáveis, links ou outros meios
                        para contornar as diretrizes da Meta;
                      </li>
                      <li>
                        disponibiliza opt-out e respeitará os pedidos para não
                        receber novas mensagens.
                      </li>
                    </ul>
                  )}
                </div>

                <label className={styles.modalCheckbox}>
                  <input
                    type="checkbox"
                    checked={confirmacaoResponsabilidadeListaFria}
                    onChange={(e) =>
                      setConfirmacaoResponsabilidadeListaFria(e.target.checked)
                    }
                  />
                  <span>
                    {marketingComListaFria
                      ? "Li e compreendi as orientações. Confirmo que possuo autorização adequada para enviar esta mensagem de Marketing e assumo a responsabilidade pelo envio."
                      : "Li e compreendi as orientações. Confirmo que possuo base adequada para contatar os destinatários, que o conteúdo respeita a categoria Utility e que não estou utilizando variáveis, links ou outros meios para contornar as diretrizes da Meta."}
                  </span>
                </label>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    setModalResponsabilidadeListaFriaAberto(false);
                    setConfirmacaoResponsabilidadeListaFria(false);

                  }}
                >
                  Voltar
                </button>

                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={confirmarResponsabilidadeEDisparar}
                  disabled={
                    !confirmacaoResponsabilidadeListaFria || disparando
                  }
                >
                  {disparando
                    ? "Processando..."
                    : agendarDisparo
                    ? "Confirmar e agendar"
                    : "Confirmar e enviar"}
                </button>
              </div>
            </div>
          </div>
        )}
    </>
  );
}
