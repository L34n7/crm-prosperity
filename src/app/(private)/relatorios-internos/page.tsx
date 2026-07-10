import type { ComponentType, CSSProperties } from "react";
import {
  BarChart3,
  Building2,
  ChevronLeft,
  ChevronRight,
  ContactRound,
  Eye,
  MessageSquare,
  MoreVertical,
  Send,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import Header from "@/components/Header";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import FilterSubmitButton from "./FilterSubmitButton";
import styles from "./relatorios-internos.module.css";

const TIME_ZONE = "America/Sao_Paulo";
const MAX_CONVERSAS = 20000;
const MAX_MENSAGENS = 40000;
const MAX_DISPAROS = 30000;
const MAX_CONTATOS = 20000;
const MAX_TOKEN_USOS = 40000;
const MAX_USUARIOS = 1500;
const MAX_SESSOES = 5000;
const MAX_INTEGRACOES = 5000;
const ONLINE_TIMEOUT_MS = 5 * 60 * 1000;
const MODAL_PAGE_SIZE = 10;
const DASHBOARD_LIMIT = 5;
const CAMPANHA_LABEL_MAX_LENGTH = 10;
const CAMPANHA_NA_LABEL = "N/A";
const ORIGEM_MANUAL_LABEL = "Manual";
const ORIGEM_NA_LABEL = "N/A";
const JANELA_ORIGEM_DISPARO_MS = 10 * 60 * 1000;
const CAMPAIGN_SEGMENT_COLORS = [
  "#16a34a",
  "#2563eb",
  "#f59e0b",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#ea580c",
  "#64748b",
];

type SearchParams = Record<string, string | string[] | undefined>;
type PeriodoAtalho = "1h" | "24h" | "3d" | "7d" | "30d";
type ConversaOrigemFiltro = "contato" | "disparo" | "todas";
type SortTabela =
  | "conversas"
  | "mensagens"
  | "disparos"
  | "contatos"
  | "origens"
  | "tokens"
  | "usuarios"
  | "planos"
  | "integracoes";
type RelatorioDetalhe = SortTabela;

type FiltrosRelatorio = {
  inicioIso: string;
  fimIso: string;
  inicioInput: string;
  fimInput: string;
  atalho: PeriodoAtalho | "";
  periodoLabel: string;
};

type FiltrosPorRelatorio = {
  conversasEmpresaId: string;
  conversasUsuarioId: string;
  conversasOrigem: ConversaOrigemFiltro;
  mensagensEmpresaId: string;
  mensagensUsuarioId: string;
  disparosEmpresaId: string;
  disparosUsuarioId: string;
  contatosEmpresaId: string;
  origensEmpresaId: string;
  tokensEmpresaId: string;
  usuariosEmpresaId: string;
  usuariosUsuarioId: string;
  planosEmpresaId: string;
  planosStatus: "" | "regular" | "inadimplente";
  integracoesEmpresaId: string;
  integracoesStatus: "" | "pendente" | "ativa" | "erro" | "desconectada";
};

type OrdenacaoRelatorios = {
  conversas: "empresa" | "total" | "percentual" | "primeira" | "ultima";
  mensagens: "empresa" | "contato" | "total" | "recebidas" | "enviadas" | "ultima";
  disparos: "empresa" | "total" | "sucesso" | "falha" | "processando";
  contatos: "empresa" | "total" | "campanha" | "na" | "percentual";
  origens: "empresa" | "total" | "origem" | "manual" | "na" | "percentual";
  tokens: "empresa" | "registros" | "input" | "output" | "total" | "ultima";
  usuarios: "presenca" | "nome" | "empresa" | "login" | "ultimo" | "logout";
  planos: "empresa" | "plano" | "status" | "inicio" | "renovacao" | "expira";
  integracoes: "status" | "empresa" | "etapa" | "online" | "created" | "updated";
};

type DirecaoOrdenacao = "asc" | "desc";

type DirecoesOrdenacaoRelatorios = Record<SortTabela, DirecaoOrdenacao>;

type EmpresaRow = {
  id: string;
  nome_fantasia: string | null;
  razao_social: string | null;
  status: string | null;
  created_at: string;
  plano_id: string | null;
  assinatura_status: string | null;
  assinatura_inicio_em: string | null;
  assinatura_vencimento_em: string | null;
  assinatura_renovada_em: string | null;
  assinatura_gateway: string | null;
  assinatura_referencia: string | null;
  assinatura_metadata_json: unknown | null;
  administrador_plano?: UsuarioAdministradorRow | null;
  oferta_plano?: OfertaPlanoRow | null;
  planos:
    | {
        id?: string | null;
        nome?: string | null;
        slug?: string | null;
      }
    | Array<{
        id?: string | null;
        nome?: string | null;
        slug?: string | null;
      }>
    | null;
};

type OfertaPlanoRow = {
  id: string;
  gateway: string | null;
  referencia: string | null;
  tipo: string | null;
  nome: string | null;
  plano_id: string | null;
  empresa_id: string | null;
  quantidade_tokens: number | null;
  metadata_json: unknown | null;
};

type UsuarioAdministradorRow = {
  id: string;
  empresa_id: string | null;
  nome: string | null;
  email: string | null;
  status: string | null;
  created_at: string;
};

type PerfilEmpresaRelatorioRow = {
  nome?: string | null;
  ativo?: boolean | null;
  empresa_id?: string | null;
};

type UsuarioPerfilAdministradorRow = {
  usuario_id: string | null;
  perfis_empresa:
    | PerfilEmpresaRelatorioRow
    | PerfilEmpresaRelatorioRow[]
    | null;
};

type ContatoRelacao = {
  id?: string | null;
  empresa_id?: string | null;
  nome?: string | null;
  telefone?: string | null;
  empresa?: string | null;
  origem?: string | null;
  rastreamento_origem_id?: string | null;
  rastreamento_campanha_id?: string | null;
  created_at?: string | null;
};

type ConversaRow = {
  id: string;
  empresa_id: string | null;
  contato_id: string | null;
  responsavel_id: string | null;
  created_at: string;
  status: string | null;
  origem_atendimento?: string | null;
  contatos?: ContatoRelacao | ContatoRelacao[] | null;
};

type MensagemRow = {
  id: string;
  empresa_id: string | null;
  conversa_id: string | null;
  remetente_id: string | null;
  remetente_tipo: string | null;
  origem: string | null;
  created_at: string;
};

type MensagemOrigemConversaRow = {
  conversa_id: string | null;
  created_at: string;
  metadata_json: Record<string, unknown> | null;
};

type DisparoRow = {
  id: string;
  empresa_id: string | null;
  status: string | null;
  template_nome: string | null;
  usuario_id: string | null;
  created_at: string;
};

type DisparoOrigemConversaRow = {
  conversa_id: string | null;
  created_at: string;
  metadata_json: Record<string, unknown> | null;
};

type ContatoRow = {
  id: string;
  empresa_id: string | null;
  campanha: string | null;
  created_at: string;
};

type ContatoOrigemRow = {
  id: string;
  empresa_id: string | null;
  origem: string | null;
  created_at: string;
};

type TokenUsoRow = {
  id: string;
  empresa_id: string | null;
  origem: string | null;
  modelo: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  tokens_total: number | null;
  created_at: string;
};

type UsuarioRow = {
  id: string;
  auth_user_id: string | null;
  empresa_id: string | null;
  nome: string | null;
  email: string | null;
  status: string | null;
  ultimo_acesso: string | null;
  created_at: string;
};

type UsuarioOpcao = {
  id: string;
  empresa_id: string | null;
  nome: string | null;
  email: string | null;
};

type UsuarioSessaoRow = {
  id: string;
  usuario_id: string;
  empresa_id: string | null;
  client_session_id: string;
  login_at: string;
  last_seen_at: string;
  logout_at: string | null;
  status: string | null;
};

type IntegracaoWhatsappRow = {
  id: string;
  empresa_id: string | null;
  nome_conexao: string | null;
  numero: string | null;
  status: string | null;
  provider: string | null;
  phone_number_id: string | null;
  waba_id: string | null;
  webhook_verificado: boolean | null;
  phone_registered: boolean | null;
  app_assigned: boolean | null;
  payment_method_added: boolean | null;
  onboarding_etapa: string | null;
  onboarding_status: string | null;
  onboarding_erro: string | null;
  setup_completed_at: string | null;
  created_at: string;
  updated_at: string | null;
};

type ConversasEmpresaResumo = {
  empresaId: string;
  nome: string;
  total: number;
  percentual: number;
  primeiraConversaEm: string | null;
  ultimaConversaEm: string | null;
};

type MensagensConversaResumo = {
  conversaId: string;
  empresaId: string;
  empresaNome: string;
  contato: string;
  total: number;
  recebidas: number;
  enviadas: number;
  primeiraMensagemEm: string | null;
  ultimaMensagemEm: string | null;
};

type DisparosEmpresaResumo = {
  empresaId: string;
  nome: string;
  total: number;
  sucesso: number;
  falha: number;
  processando: number;
  percentual: number;
};

type SegmentoContatoResumo = {
  nome: string;
  total: number;
  percentual: number;
};

type CampanhaContatoResumo = SegmentoContatoResumo;

type OrigemContatoResumo = SegmentoContatoResumo;

type ContatosEmpresaResumo = {
  empresaId: string;
  nome: string;
  total: number;
  campanhas: CampanhaContatoResumo[];
  campanhaPrincipal: string;
  campanhaPrincipalTotal: number;
  campanhaNaoInformada: number;
  percentualNaoInformada: number;
  diretoNaoIdentificado: number;
  outrasOrigens: number;
  percentualDireto: number;
};

type ContatosOrigemEmpresaResumo = {
  empresaId: string;
  nome: string;
  total: number;
  origens: OrigemContatoResumo[];
  origemPrincipal: string;
  origemPrincipalTotal: number;
  origemManual: number;
  percentualManual: number;
  origemNa: number;
  percentualNa: number;
};

type TokensEmpresaResumo = {
  empresaId: string;
  nome: string;
  registros: number;
  tokensInput: number;
  tokensOutput: number;
  tokensTotal: number;
  ultimoUsoEm: string | null;
};

type UsuarioSessaoResumo = {
  id: string;
  nome: string;
  email: string;
  empresa: string;
  status: string;
  loginEm: string | null;
  ultimoAcesso: string | null;
  logoutEm: string | null;
  online: boolean;
  tempoOnlineMs: number;
};

type IntegracaoMetaResumo = {
  id: string;
  empresaId: string;
  empresaNome: string;
  nomeConexao: string;
  numero: string;
  status: string;
  statusLabel: string;
  ativo: boolean;
  etapa: string;
  etapaLabel: string;
  onboardingStatus: string;
  onboardingStatusLabel: string;
  onboardingErro: string;
  tempoOnlineMs: number;
  criadoEm: string;
  atualizadoEm: string | null;
};

type RelatoriosDados = {
  empresasOpcoes: EmpresaRow[];
  usuariosOpcoes: UsuarioOpcao[];
  empresas: EmpresaRow[];
  conversasPorEmpresa: ConversasEmpresaResumo[];
  mensagensPorConversa: MensagensConversaResumo[];
  disparosPorEmpresa: DisparosEmpresaResumo[];
  contatosPorEmpresa: ContatosEmpresaResumo[];
  contatosOrigemPorEmpresa: ContatosOrigemEmpresaResumo[];
  tokensPorEmpresa: TokensEmpresaResumo[];
  usuariosSessao: UsuarioSessaoResumo[];
  integracoesMeta: IntegracaoMetaResumo[];
  totais: {
    conversas: number;
    mensagens: number;
    disparos: number;
    contatosNovos: number;
    contatosCampanhaNaoInformada: number;
    contatosDiretoNaoIdentificado: number;
    contatosOutrasCampanhas: number;
    contatosOrigemTotal: number;
    contatosOrigemManual: number;
    contatosOrigemNa: number;
    tokensRegistros: number;
    tokensInput: number;
    tokensOutput: number;
    tokensTotal: number;
    usuarios: number;
    usuariosOnline: number;
    usuariosOffline: number;
    usuariosTempoOnlineMs: number;
    empresas: number;
    integracoesMeta: number;
    integracoesMetaAtivas: number;
    integracoesMetaPendentes: number;
  };
};

type RelatoriosPageProps = {
  searchParams?: Promise<SearchParams>;
};

const numeroFormatter = new Intl.NumberFormat("pt-BR");

const atalhos: Array<{ chave: PeriodoAtalho; label: string }> = [
  { chave: "1h", label: "1 hora" },
  { chave: "24h", label: "24 horas" },
  { chave: "3d", label: "3 dias" },
  { chave: "7d", label: "7 dias" },
  { chave: "30d", label: "30 dias" },
];

const ordenacaoPadrao: OrdenacaoRelatorios = {
  conversas: "total",
  mensagens: "total",
  disparos: "total",
  contatos: "total",
  origens: "total",
  tokens: "total",
  usuarios: "presenca",
  planos: "empresa",
  integracoes: "status",
};

function getDirecaoOrdenacaoPadrao(
  tabela: SortTabela,
  campo: OrdenacaoRelatorios[SortTabela]
): DirecaoOrdenacao {
  if (tabela === "conversas") {
    if (campo === "empresa" || campo === "primeira") return "asc";
    return "desc";
  }

  if (tabela === "mensagens") {
    if (campo === "empresa" || campo === "contato") return "asc";
    return "desc";
  }

  if (tabela === "disparos") {
    return campo === "empresa" ? "asc" : "desc";
  }

  if (tabela === "contatos") {
    if (campo === "empresa" || campo === "campanha") return "asc";
    return "desc";
  }

  if (tabela === "origens") {
    if (campo === "empresa" || campo === "origem") return "asc";
    return "desc";
  }

  if (tabela === "tokens") {
    return campo === "empresa" ? "asc" : "desc";
  }

  if (tabela === "usuarios") {
    if (campo === "nome" || campo === "empresa") return "asc";
    return "desc";
  }

  if (tabela === "planos") {
    if (campo === "inicio" || campo === "renovacao") return "desc";
    return "asc";
  }

  if (tabela === "integracoes") {
    if (campo === "empresa" || campo === "etapa" || campo === "status") {
      return "asc";
    }

    return "desc";
  }

  return "asc";
}

const relatoriosDetalhe: RelatorioDetalhe[] = [
  "conversas",
  "mensagens",
  "disparos",
  "contatos",
  "origens",
  "tokens",
  "usuarios",
  "planos",
  "integracoes",
];

const filtrosPorRelatorioPadrao: FiltrosPorRelatorio = {
  conversasEmpresaId: "",
  conversasUsuarioId: "",
  conversasOrigem: "contato",
  mensagensEmpresaId: "",
  mensagensUsuarioId: "",
  disparosEmpresaId: "",
  disparosUsuarioId: "",
  contatosEmpresaId: "",
  origensEmpresaId: "",
  tokensEmpresaId: "",
  usuariosEmpresaId: "",
  usuariosUsuarioId: "",
  planosEmpresaId: "",
  planosStatus: "",
  integracoesEmpresaId: "",
  integracoesStatus: "",
};

function getParametro(params: SearchParams, chave: string) {
  const valor = params[chave];

  if (Array.isArray(valor)) return valor[0] ?? "";
  return valor ?? "";
}

function getPartesData(date: Date) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const mapa = new Map(partes.map((parte) => [parte.type, parte.value]));

  return {
    year: mapa.get("year") || "0000",
    month: mapa.get("month") || "01",
    day: mapa.get("day") || "01",
    hour: mapa.get("hour") || "00",
    minute: mapa.get("minute") || "00",
  };
}

function formatarDateTimeInput(date: Date) {
  const partes = getPartesData(date);
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`;
}

function parseDateTimeLocal(valor: string, fallback: Date) {
  const texto = String(valor || "").trim();

  if (!texto) return fallback;

  const comHora = texto.length === 10 ? `${texto}T00:00` : texto;
  const comSegundos = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(comHora)
    ? `${comHora}:00`
    : comHora;
  const data = new Date(`${comSegundos}-03:00`);

  if (Number.isNaN(data.getTime())) return fallback;
  return data;
}

function getInicioPorAtalho(atalho: PeriodoAtalho, fim: Date) {
  const duracoes: Record<PeriodoAtalho, number> = {
    "1h": 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "3d": 3 * 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };

  return new Date(fim.getTime() - duracoes[atalho]);
}

function getPeriodoLabel(atalho: PeriodoAtalho | "", inicio: Date, fim: Date) {
  if (atalho === "1h") return "ultima 1 hora";
  if (atalho === "24h") return "ultimas 24 horas";
  if (atalho === "3d") return "ultimos 3 dias";
  if (atalho === "7d") return "ultimos 7 dias";
  if (atalho === "30d") return "ultimos 30 dias";

  const horas = Math.max(1, Math.round((fim.getTime() - inicio.getTime()) / 36e5));
  if (horas <= 48) return `${horas} horas`;
  return `${Math.ceil(horas / 24)} dias`;
}

function resolverFiltros(params: SearchParams): FiltrosRelatorio {
  const agora = new Date();
  const atalhoParam = getParametro(params, "atalho") as PeriodoAtalho;
  const atalho = atalhos.some((item) => item.chave === atalhoParam)
    ? atalhoParam
    : "";

  const fim = parseDateTimeLocal(getParametro(params, "fim"), agora);
  const inicioFallback = getInicioPorAtalho("7d", fim);
  const inicio = atalho
    ? getInicioPorAtalho(atalho, fim)
    : parseDateTimeLocal(getParametro(params, "inicio"), inicioFallback);

  const inicioFinal =
    inicio.getTime() <= fim.getTime()
      ? inicio
      : new Date(fim.getTime() - 24 * 60 * 60 * 1000);

  return {
    inicioIso: inicioFinal.toISOString(),
    fimIso: fim.toISOString(),
    inicioInput: formatarDateTimeInput(inicioFinal),
    fimInput: formatarDateTimeInput(fim),
    atalho,
    periodoLabel: getPeriodoLabel(atalho, inicioFinal, fim),
  };
}

function resolverFiltrosPorRelatorio(params: SearchParams): FiltrosPorRelatorio {
  const planosStatus = getParametro(params, "planos_status");
  const integracoesStatus = getParametro(params, "int_status");
  const conversasOrigem = getParametro(params, "conv_origem");

  return {
    conversasEmpresaId: getParametro(params, "conv_empresa"),
    conversasUsuarioId: getParametro(params, "conv_usuario"),
    conversasOrigem:
      conversasOrigem === "todas" || conversasOrigem === "disparo"
        ? conversasOrigem
        : "contato",
    mensagensEmpresaId: getParametro(params, "msg_empresa"),
    mensagensUsuarioId: getParametro(params, "msg_usuario"),
    disparosEmpresaId: getParametro(params, "disp_empresa"),
    disparosUsuarioId: getParametro(params, "disp_usuario"),
    contatosEmpresaId: getParametro(params, "cont_empresa"),
    origensEmpresaId: getParametro(params, "origens_empresa"),
    tokensEmpresaId: getParametro(params, "tokens_empresa"),
    usuariosEmpresaId: getParametro(params, "usuarios_empresa"),
    usuariosUsuarioId: getParametro(params, "usuarios_usuario"),
    planosEmpresaId: getParametro(params, "planos_empresa"),
    planosStatus:
      planosStatus === "regular" || planosStatus === "inadimplente"
        ? planosStatus
        : "",
    integracoesEmpresaId: getParametro(params, "int_empresa"),
    integracoesStatus:
      integracoesStatus === "pendente" ||
      integracoesStatus === "ativa" ||
      integracoesStatus === "erro" ||
      integracoesStatus === "desconectada"
        ? integracoesStatus
        : "",
  };
}

function resolverOrdenacao(params: SearchParams): OrdenacaoRelatorios {
  return {
    conversas:
      (getParametro(params, "sort_conversas") as OrdenacaoRelatorios["conversas"]) ||
      ordenacaoPadrao.conversas,
    mensagens:
      (getParametro(params, "sort_mensagens") as OrdenacaoRelatorios["mensagens"]) ||
      ordenacaoPadrao.mensagens,
    disparos:
      (getParametro(params, "sort_disparos") as OrdenacaoRelatorios["disparos"]) ||
      ordenacaoPadrao.disparos,
    contatos:
      (getParametro(params, "sort_contatos") as OrdenacaoRelatorios["contatos"]) ||
      ordenacaoPadrao.contatos,
    origens:
      (getParametro(params, "sort_origens") as OrdenacaoRelatorios["origens"]) ||
      ordenacaoPadrao.origens,
    tokens:
      (getParametro(params, "sort_tokens") as OrdenacaoRelatorios["tokens"]) ||
      ordenacaoPadrao.tokens,
    usuarios:
      (getParametro(params, "sort_usuarios") as OrdenacaoRelatorios["usuarios"]) ||
      ordenacaoPadrao.usuarios,
    planos:
      (getParametro(params, "sort_planos") as OrdenacaoRelatorios["planos"]) ||
      ordenacaoPadrao.planos,
    integracoes:
      (getParametro(params, "sort_integracoes") as OrdenacaoRelatorios["integracoes"]) ||
      ordenacaoPadrao.integracoes,
  };
}

function normalizarDirecaoOrdenacao(valor: string): DirecaoOrdenacao | "" {
  return valor === "asc" || valor === "desc" ? valor : "";
}

function getDirecaoOrdenacaoParametro(
  params: SearchParams,
  tabela: SortTabela,
  campo: OrdenacaoRelatorios[SortTabela]
) {
  return (
    normalizarDirecaoOrdenacao(getParametro(params, `sort_dir_${tabela}`)) ||
    getDirecaoOrdenacaoPadrao(tabela, campo)
  );
}

function getProximaDirecaoOrdenacao(
  params: SearchParams,
  tabela: SortTabela,
  campo: OrdenacaoRelatorios[SortTabela],
  atual: OrdenacaoRelatorios[SortTabela]
): DirecaoOrdenacao {
  if (atual !== campo) {
    return getDirecaoOrdenacaoPadrao(tabela, campo);
  }

  return getDirecaoOrdenacaoParametro(params, tabela, atual) === "asc"
    ? "desc"
    : "asc";
}

function resolverDirecoesOrdenacao(
  params: SearchParams,
  ordenacao: OrdenacaoRelatorios
): DirecoesOrdenacaoRelatorios {
  return {
    conversas: getDirecaoOrdenacaoParametro(params, "conversas", ordenacao.conversas),
    mensagens: getDirecaoOrdenacaoParametro(params, "mensagens", ordenacao.mensagens),
    disparos: getDirecaoOrdenacaoParametro(params, "disparos", ordenacao.disparos),
    contatos: getDirecaoOrdenacaoParametro(params, "contatos", ordenacao.contatos),
    origens: getDirecaoOrdenacaoParametro(params, "origens", ordenacao.origens),
    tokens: getDirecaoOrdenacaoParametro(params, "tokens", ordenacao.tokens),
    usuarios: getDirecaoOrdenacaoParametro(params, "usuarios", ordenacao.usuarios),
    planos: getDirecaoOrdenacaoParametro(params, "planos", ordenacao.planos),
    integracoes: getDirecaoOrdenacaoParametro(
      params,
      "integracoes",
      ordenacao.integracoes
    ),
  };
}

function resolverDetalhe(params: SearchParams): RelatorioDetalhe | "" {
  const detalhe = getParametro(params, "detalhe") as RelatorioDetalhe;
  return relatoriosDetalhe.includes(detalhe) ? detalhe : "";
}

function HiddenCurrentParams({
  params,
  exclude = [],
}: {
  params: SearchParams;
  exclude?: string[];
}) {
  const excluded = new Set(["empresa_id", ...exclude]);

  return (
    <>
      {Object.entries(params).map(([chave, valorRaw]) => {
        if (excluded.has(chave)) return null;

        const valor = Array.isArray(valorRaw) ? valorRaw[0] : valorRaw;
        if (!valor) return null;

        return (
          <input key={chave} type="hidden" name={chave} value={valor} />
        );
      })}
    </>
  );
}

function hrefComParams(params: SearchParams, updates: Record<string, string>) {
  const query = new URLSearchParams();

  for (const [chave, valorRaw] of Object.entries(params)) {
    if (chave === "empresa_id") continue;

    const valor = Array.isArray(valorRaw) ? valorRaw[0] : valorRaw;
    if (valor) query.set(chave, valor);
  }

  for (const [chave, valor] of Object.entries(updates)) {
    if (valor) {
      query.set(chave, valor);
    } else {
      query.delete(chave);
    }
  }

  const texto = query.toString();
  return texto ? `/relatorios-internos?${texto}` : "/relatorios-internos";
}

function hrefAtalho(params: SearchParams, atalho: PeriodoAtalho) {
  return hrefComParams(params, {
    atalho,
    inicio: "",
    fim: "",
  });
}

function hrefSort(
  params: SearchParams,
  tabela: SortTabela,
  campo: OrdenacaoRelatorios[SortTabela],
  direcao: DirecaoOrdenacao
) {
  return hrefComParams(params, {
    [`sort_${tabela}`]: campo,
    [`sort_dir_${tabela}`]: direcao,
    [`pag_${tabela}`]: "1",
  });
}

function hrefDetalhe(params: SearchParams, detalhe: RelatorioDetalhe) {
  return hrefComParams(params, {
    detalhe,
    [`pag_${detalhe}`]: "1",
  });
}

function hrefFecharDetalhe(params: SearchParams) {
  return hrefComParams(params, {
    detalhe: "",
    pag_conversas: "",
    pag_mensagens: "",
    pag_disparos: "",
    pag_contatos: "",
    pag_origens: "",
    pag_tokens: "",
    pag_usuarios: "",
    pag_planos: "",
    pag_integracoes: "",
  });
}

function resolverPagina(params: SearchParams, tabela: SortTabela) {
  const pagina = Number.parseInt(getParametro(params, `pag_${tabela}`), 10);
  return Number.isFinite(pagina) && pagina > 0 ? pagina : 1;
}

function hrefPagina(params: SearchParams, tabela: SortTabela, pagina: number) {
  return hrefComParams(params, {
    detalhe: tabela,
    [`pag_${tabela}`]: String(Math.max(1, pagina)),
  });
}

function paginar<T>(itens: T[], pagina: number) {
  const totalItens = itens.length;
  const totalPaginas = Math.max(1, Math.ceil(totalItens / MODAL_PAGE_SIZE));
  const paginaAtual = Math.min(Math.max(1, pagina), totalPaginas);
  const inicio = (paginaAtual - 1) * MODAL_PAGE_SIZE;
  const itensPagina = itens.slice(inicio, inicio + MODAL_PAGE_SIZE);

  return {
    itens: itensPagina,
    paginaAtual,
    totalPaginas,
    totalItens,
    primeiro: totalItens === 0 ? 0 : inicio + 1,
    ultimo: inicio + itensPagina.length,
  };
}

function SortHeader({
  params,
  tabela,
  campo,
  atual,
  children,
}: {
  params: SearchParams;
  tabela: SortTabela;
  campo: OrdenacaoRelatorios[SortTabela];
  atual: OrdenacaoRelatorios[SortTabela];
  children: React.ReactNode;
}) {
  const ativo = atual === campo;
  const direcaoAtual = getDirecaoOrdenacaoParametro(params, tabela, atual);
  const proximaDirecao = getProximaDirecaoOrdenacao(
    params,
    tabela,
    campo,
    atual
  );

  return (
    <a
      className={`${styles.sortLink} ${ativo ? styles.sortLinkActive : ""}`}
      href={hrefSort(params, tabela, campo, proximaDirecao)}
    >
      {children}
      <span>{ativo ? (direcaoAtual === "asc" ? "↑" : "↓") : "↕"}</span>
    </a>
  );
}

function ReportFilters({
  params,
  exclude,
  clearUpdates,
  children,
}: {
  params: SearchParams;
  exclude: string[];
  clearUpdates: Record<string, string>;
  children: React.ReactNode;
}) {
  return (
    <form className={styles.reportFilters} action="/relatorios-internos">
      <HiddenCurrentParams params={params} exclude={exclude} />
      {children}

      <div className={styles.reportFilterActions}>
        <FilterSubmitButton />
        <a href={hrefComParams(params, clearUpdates)} className={styles.secondaryButton}>
          Limpar
        </a>
      </div>
    </form>
  );
}

function EmpresaSelect({
  name,
  value,
  empresas,
}: {
  name: string;
  value: string;
  empresas: EmpresaRow[];
}) {
  return (
    <label className={styles.field}>
      <span>Empresa</span>
      <select name={name} defaultValue={value}>
        <option value="">Todas as empresas</option>
        {empresas.map((empresa) => (
          <option key={empresa.id} value={empresa.id}>
            {getNomeEmpresa(empresa)}
          </option>
        ))}
      </select>
    </label>
  );
}

function UsuarioSelect({
  name,
  value,
  usuarios,
  empresasPorId,
}: {
  name: string;
  value: string;
  usuarios: UsuarioOpcao[];
  empresasPorId: Map<string, EmpresaRow>;
}) {
  return (
    <label className={styles.field}>
      <span>Usuario</span>
      <select name={name} defaultValue={value}>
        <option value="">Todos os usuarios</option>
        {usuarios.map((usuario) => (
          <option key={usuario.id} value={usuario.id}>
            {getUsuarioLabel(usuario, empresasPorId)}
          </option>
        ))}
      </select>
    </label>
  );
}

function ConversaOrigemSelect({ value }: { value: ConversaOrigemFiltro }) {
  return (
    <label className={styles.field}>
      <span>Origem</span>
      <select name="conv_origem" defaultValue={value}>
        <option value="contato">Contato</option>
        <option value="disparo">Disparo</option>
        <option value="todas">Todas</option>
      </select>
    </label>
  );
}

function PlanoStatusSelect({ value }: { value: FiltrosPorRelatorio["planosStatus"] }) {
  return (
    <label className={styles.field}>
      <span>Status financeiro</span>
      <select name="planos_status" defaultValue={value}>
        <option value="">Todos</option>
        <option value="regular">Renovado / regular</option>
        <option value="inadimplente">Inadimplente</option>
      </select>
    </label>
  );
}

function IntegracaoStatusSelect({
  value,
}: {
  value: FiltrosPorRelatorio["integracoesStatus"];
}) {
  return (
    <label className={styles.field}>
      <span>Status</span>
      <select name="int_status" defaultValue={value}>
        <option value="">Todos</option>
        <option value="pendente">Pendente</option>
        <option value="ativa">Ativa</option>
        <option value="erro">Erro</option>
        <option value="desconectada">Desconectada</option>
      </select>
    </label>
  );
}

function ShortcutMenu({
  params,
  filtros,
}: {
  params: SearchParams;
  filtros: FiltrosRelatorio;
}) {
  return (
    <details className={styles.shortcutMenu}>
      <summary aria-label="Atalhos de periodo">
        <MoreVertical size={18} strokeWidth={2.4} />
      </summary>
      <div className={styles.shortcutMenuList}>
        {atalhos.map((atalho) => (
          <a
            key={atalho.chave}
            href={hrefAtalho(params, atalho.chave)}
            className={
              filtros.atalho === atalho.chave ? styles.shortcutMenuActive : ""
            }
          >
            {atalho.label}
          </a>
        ))}
      </div>
    </details>
  );
}

function PeriodoFilterFields({
  params,
  filtros,
}: {
  params: SearchParams;
  filtros: FiltrosRelatorio;
}) {
  return (
    <>
      <label className={styles.field}>
        <span>Inicio</span>
        <input
          type="datetime-local"
          name="inicio"
          defaultValue={filtros.inicioInput}
        />
      </label>

      <label className={styles.field}>
        <span>Fim</span>
        <input type="datetime-local" name="fim" defaultValue={filtros.fimInput} />
      </label>

      <ShortcutMenu params={params} filtros={filtros} />
    </>
  );
}

function Pagination({
  params,
  tabela,
  paginacao,
}: {
  params: SearchParams;
  tabela: SortTabela;
  paginacao: ReturnType<typeof paginar<unknown>>;
}) {
  if (paginacao.totalItens === 0) return null;

  const anterior = Math.max(1, paginacao.paginaAtual - 1);
  const proxima = Math.min(paginacao.totalPaginas, paginacao.paginaAtual + 1);
  const podeVoltar = paginacao.paginaAtual > 1;
  const podeAvancar = paginacao.paginaAtual < paginacao.totalPaginas;

  return (
    <div className={styles.pagination}>
      <span>
        {formatarNumero(paginacao.primeiro)}-{formatarNumero(paginacao.ultimo)} de{" "}
        {formatarNumero(paginacao.totalItens)}
      </span>

      <div className={styles.paginationControls}>
        <a
          className={`${styles.paginationButton} ${
            podeVoltar ? "" : styles.paginationButtonDisabled
          }`}
          href={podeVoltar ? hrefPagina(params, tabela, anterior) : undefined}
          aria-disabled={!podeVoltar}
        >
          <ChevronLeft size={16} strokeWidth={2.2} />
          Anterior
        </a>
        <span className={styles.paginationPage}>
          {formatarNumero(paginacao.paginaAtual)} /{" "}
          {formatarNumero(paginacao.totalPaginas)}
        </span>
        <a
          className={`${styles.paginationButton} ${
            podeAvancar ? "" : styles.paginationButtonDisabled
          }`}
          href={podeAvancar ? hrefPagina(params, tabela, proxima) : undefined}
          aria-disabled={!podeAvancar}
        >
          Proxima
          <ChevronRight size={16} strokeWidth={2.2} />
        </a>
      </div>
    </div>
  );
}

function CampaignSegmentTrack({
  campanhas,
  total,
}: {
  campanhas: CampanhaContatoResumo[];
  total: number;
}) {
  const segmentos = campanhas.filter((campanha) => campanha.total > 0);

  if (segmentos.length === 0) {
    return (
      <div className={`${styles.miniBarTrack} ${styles.segmentedTrack}`}>
        <span style={{ "--bar-width": "0%" } as CSSProperties} />
      </div>
    );
  }

  return (
    <div className={`${styles.miniBarTrack} ${styles.segmentedTrack}`}>
      {segmentos.map((campanha, index) => (
        <span
          key={campanha.nome}
          title={`${campanha.nome}: ${formatarNumero(campanha.total)}`}
          style={
            {
              "--bar-width": larguraPercentual(campanha.total, total, 0),
              "--segment-color": getCampaignSegmentColor(index),
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

function CampaignBreakdown({
  campanhas,
  total,
  limite = 4,
}: {
  campanhas: CampanhaContatoResumo[];
  total: number;
  limite?: number;
}) {
  const visiveis = campanhas.slice(0, limite);
  const restantes = Math.max(0, campanhas.length - visiveis.length);

  return (
    <div className={styles.campaignBreakdown}>
      <CampaignSegmentTrack campanhas={campanhas} total={total} />
      <div className={styles.campaignLegend}>
        {visiveis.map((campanha, index) => (
          <span
            key={campanha.nome}
            title={`${campanha.nome}: ${formatarNumero(campanha.total)}`}
          >
            <i
              style={
                {
                  "--segment-color": getCampaignSegmentColor(index),
                } as CSSProperties
              }
            />
            <CampanhaNome nome={campanha.nome} />: {formatarNumero(campanha.total)}
          </span>
        ))}
        {restantes > 0 ? <span>+{restantes} campanhas</span> : null}
      </div>
    </div>
  );
}

function OrigemBreakdown({
  origens,
  total,
  limite = 4,
}: {
  origens: OrigemContatoResumo[];
  total: number;
  limite?: number;
}) {
  const visiveis = origens.slice(0, limite);
  const restantes = Math.max(0, origens.length - visiveis.length);

  return (
    <div className={styles.campaignBreakdown}>
      <CampaignSegmentTrack campanhas={origens} total={total} />
      <div className={styles.campaignLegend}>
        {visiveis.map((origem, index) => (
          <span key={origem.nome} title={`${origem.nome}: ${formatarNumero(origem.total)}`}>
            <i
              style={
                {
                  "--segment-color": getCampaignSegmentColor(index),
                } as CSSProperties
              }
            />
            <OrigemNome nome={origem.nome} />: {formatarNumero(origem.total)}
          </span>
        ))}
        {restantes > 0 ? <span>+{restantes} origens</span> : null}
      </div>
    </div>
  );
}

function MiniBarChart({
  items,
  emptyText,
  tone = "blue",
}: {
  items: Array<{
    id: string;
    label: string;
    value: number;
    valueLabel?: string;
    labelSuffix?: string;
    detail?: string;
    detailTitle?: string;
    segments?: CampanhaContatoResumo[];
  }>;
  emptyText: string;
  tone?: "blue" | "green" | "amber" | "rose";
}) {
  const maximo = Math.max(1, ...items.map((item) => item.value));

  if (items.length === 0) {
    return <EmptyState>{emptyText}</EmptyState>;
  }

  return (
    <div className={styles.miniChart}>
      {items.slice(0, DASHBOARD_LIMIT).map((item) => (
        <div key={item.id} className={styles.miniBarRow}>
          <div className={styles.miniBarTop}>
            <strong>
              {item.label}
              {item.labelSuffix ? (
                <span
                  className={
                    item.labelSuffix === "- ONLINE"
                      ? styles.onlineSuffix
                      : styles.offlineSuffix
                  }
                >
                  {" "}
                  {item.labelSuffix}
                </span>
              ) : null}
            </strong>
            <span>{item.valueLabel ?? formatarNumero(item.value)}</span>
          </div>
          {item.segments ? (
            <CampaignSegmentTrack campanhas={item.segments} total={item.value} />
          ) : (
            <div className={`${styles.miniBarTrack} ${styles[`miniBar${tone}`]}`}>
              <span
                style={
                  {
                    "--bar-width": larguraPercentual(item.value, maximo),
                  } as CSSProperties
                }
              />
            </div>
          )}
          {item.detail ? <small title={item.detailTitle}>{item.detail}</small> : null}
        </div>
      ))}
    </div>
  );
}

function SplitMeter({
  esquerda,
  direita,
}: {
  esquerda: { label: string; value: number; tone: "green" | "rose" | "amber" | "gray" };
  direita: { label: string; value: number; tone: "green" | "rose" | "amber" | "gray" };
}) {
  const total = Math.max(1, esquerda.value + direita.value);

  return (
    <div className={styles.splitMeterWrap}>
      <div className={styles.splitMeter}>
        <span
          className={styles[`split${esquerda.tone}`]}
          style={
            {
              "--bar-width": `${Math.round((esquerda.value / total) * 100)}%`,
            } as CSSProperties
          }
        />
        <span
          className={styles[`split${direita.tone}`]}
          style={
            {
              "--bar-width": `${Math.round((direita.value / total) * 100)}%`,
            } as CSSProperties
          }
        />
      </div>
      <div className={styles.splitLegend}>
        {[esquerda, direita].map((item) => (
          <span key={item.label}>
            <strong>{formatarNumero(item.value)}</strong> {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function DashboardReportCard({
  icon: Icon,
  eyebrow,
  title,
  value,
  detail,
  href,
  tone,
  children,
}: {
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  eyebrow: string;
  title: string;
  value: string;
  detail: string;
  href: string;
  tone: "blue" | "green" | "amber" | "rose";
  children: React.ReactNode;
}) {
  return (
    <article className={`${styles.reportCard} ${styles[`report${tone}`]}`}>
      <div className={styles.reportCardHeader}>
        <span className={styles.reportIcon}>
          <Icon size={21} strokeWidth={2.2} />
        </span>
        <a className={styles.detailButton} href={href}>
          <Eye size={16} strokeWidth={2.2} />
          Ver detalhes
        </a>
      </div>

      <div className={styles.reportCardTitle}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h2>{title}</h2>
      </div>

      <div className={styles.reportKpi}>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>

      {children}
    </article>
  );
}

function ModalShell({
  params,
  title,
  subtitle,
  children,
}: {
  params: SearchParams;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <section className={styles.modalPanel}>
        <div className={styles.modalHeader}>
          <div>
            <span className={styles.eyebrow}>Relatorio detalhado</span>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <a
            href={hrefFecharDetalhe(params)}
            className={styles.modalClose}
            aria-label="Fechar relatorio"
          >
            <X size={20} strokeWidth={2.2} />
          </a>
        </div>

        <div className={styles.modalBody}>{children}</div>
      </section>
    </div>
  );
}

function formatarNumero(valor: number) {
  return numeroFormatter.format(valor);
}

function formatarData(valor: string | null | undefined) {
  if (!valor) return "-";

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(data);
}

function formatarDataHora(valor: string | null | undefined) {
  if (!valor) return "-";

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}

function formatarDuracao(ms: number) {
  const minutos = Math.max(0, Math.floor(ms / 60000));

  if (minutos < 60) return `${minutos}m`;

  const horas = Math.floor(minutos / 60);
  const minutosRestantes = minutos % 60;

  if (horas < 24) {
    return minutosRestantes > 0
      ? `${horas}hr ${minutosRestantes}m`
      : `${horas}hr`;
  }

  const dias = Math.floor(horas / 24);
  const horasRestantes = horas % 24;
  const diaLabel = dias === 1 ? "dia" : "dias";

  return horasRestantes > 0
    ? `${dias}${diaLabel} ${horasRestantes}hr`
    : `${dias}${diaLabel}`;
}

function normalizarRelacao<T>(valor: T | T[] | null | undefined): T | null {
  if (Array.isArray(valor)) return valor[0] ?? null;
  return valor ?? null;
}

function normalizarObjetoJson(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    return {};
  }

  return valor as Record<string, unknown>;
}

function getTextoJson(
  json: Record<string, unknown>,
  chave: string
): string {
  const valor = json[chave];

  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "number" || typeof valor === "boolean") {
    return String(valor);
  }

  return "";
}

function jsonTemValor(json: Record<string, unknown>, chave: string) {
  const valor = json[chave];

  if (valor === null || valor === undefined) return false;
  if (typeof valor === "string") return valor.trim().length > 0;

  return true;
}

function getPlano(empresa: EmpresaRow) {
  return normalizarRelacao(empresa.planos);
}

function getNomeEmpresa(empresa: EmpresaRow | null | undefined) {
  return (
    empresa?.nome_fantasia?.trim() ||
    empresa?.razao_social?.trim() ||
    "Empresa sem nome"
  );
}

function getNomeEmpresaPorId(
  empresasPorId: Map<string, EmpresaRow>,
  empresaId: string | null | undefined
) {
  if (!empresaId) return "Sem empresa";
  return getNomeEmpresa(empresasPorId.get(empresaId));
}

function getUsuarioLabel(
  usuario: UsuarioOpcao,
  empresasPorId?: Map<string, EmpresaRow>
) {
  const base =
    usuario.nome?.trim() || usuario.email?.trim() || "Usuario sem nome";

  if (!empresasPorId || !usuario.empresa_id) return base;

  const empresa = getNomeEmpresaPorId(empresasPorId, usuario.empresa_id);
  return empresa === "Sem empresa" ? base : `${base} - ${empresa}`;
}

function getContatoLabel(conversa: ConversaRow | null | undefined) {
  const contato = normalizarRelacao(conversa?.contatos);

  return (
    contato?.nome?.trim() ||
    contato?.telefone?.trim() ||
    contato?.empresa?.trim() ||
    "Conversa sem contato"
  );
}

function getConversaOrigemLabel(origem: ConversaOrigemFiltro) {
  if (origem === "disparo") return "iniciadas por disparo";
  if (origem === "todas") return "todas as origens";
  return "iniciadas pelo contato";
}

function getCampanhaLabel(valor: string | null | undefined) {
  return valor?.trim() || CAMPANHA_NA_LABEL;
}

function normalizarTextoComparacao(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getChaveOferta(valor: unknown) {
  return String(valor ?? "").trim().toLowerCase();
}

function getOfertaPlanoEmpresa(
  empresa: EmpresaRow,
  ofertasPorId: Map<string, OfertaPlanoRow>,
  ofertasPorReferencia: Map<string, OfertaPlanoRow>
) {
  const metadata = normalizarObjetoJson(empresa.assinatura_metadata_json);
  const ofertaId = getChaveOferta(getTextoJson(metadata, "oferta_id"));

  if (ofertaId && ofertasPorId.has(ofertaId)) {
    return ofertasPorId.get(ofertaId) ?? null;
  }

  const referencias = [
    getTextoJson(metadata, "oferta_referencia"),
    getTextoJson(metadata, "offer_hash"),
    getTextoJson(metadata, "product_hash"),
    empresa.assinatura_referencia,
  ]
    .map(getChaveOferta)
    .filter(Boolean);

  for (const referencia of referencias) {
    const oferta = ofertasPorReferencia.get(referencia);

    if (oferta) return oferta;
  }

  return null;
}

function getAdministradorPlanoLabel(empresa: EmpresaRow) {
  const administrador = empresa.administrador_plano;

  return (
    administrador?.nome?.trim() ||
    administrador?.email?.trim() ||
    "Sem administrador"
  );
}

function getPlanoBaseResumo(empresa: EmpresaRow) {
  const plano = getPlano(empresa);
  const ofertaMetadata = normalizarObjetoJson(empresa.oferta_plano?.metadata_json);
  const assinaturaMetadata = normalizarObjetoJson(
    empresa.assinatura_metadata_json
  );
  const slug = normalizarTextoComparacao(
    getTextoJson(ofertaMetadata, "plano_slug") ||
      getTextoJson(assinaturaMetadata, "plano_slug") ||
      plano?.slug ||
      ""
  );
  const nomeNormalizado = normalizarTextoComparacao(
    [
      empresa.oferta_plano?.nome,
      getTextoJson(assinaturaMetadata, "oferta_nome"),
      getTextoJson(assinaturaMetadata, "offer_title"),
      plano?.nome,
    ]
      .filter(Boolean)
      .join(" ")
  );

  if (slug === "essencial" || nomeNormalizado.includes("essencial")) {
    return "Essencial";
  }

  if (
    slug === "basico" ||
    slug === "basic" ||
    nomeNormalizado.includes("basico") ||
    nomeNormalizado.includes("basic")
  ) {
    return "Básico";
  }

  return plano?.nome?.replace(/^Plano\s+/i, "").trim() || "Sem plano";
}

function getOfertaPlanoSufixo(empresa: EmpresaRow) {
  const ofertaMetadata = normalizarObjetoJson(empresa.oferta_plano?.metadata_json);
  const assinaturaMetadata = normalizarObjetoJson(
    empresa.assinatura_metadata_json
  );
  const tipoOferta = normalizarTextoComparacao(
    getTextoJson(ofertaMetadata, "tipo_oferta") ||
      getTextoJson(assinaturaMetadata, "tipo_oferta")
  );
  const origem = normalizarTextoComparacao(
    getTextoJson(ofertaMetadata, "origem") ||
      getTextoJson(assinaturaMetadata, "origem")
  );
  const nome = normalizarTextoComparacao(
    [
      empresa.oferta_plano?.nome,
      getTextoJson(assinaturaMetadata, "oferta_nome"),
      getTextoJson(assinaturaMetadata, "offer_title"),
    ]
      .filter(Boolean)
      .join(" ")
  );
  const referencia = normalizarTextoComparacao(
    [
      empresa.oferta_plano?.referencia,
      getTextoJson(assinaturaMetadata, "oferta_referencia"),
      getTextoJson(assinaturaMetadata, "offer_hash"),
    ]
      .filter(Boolean)
      .join(" ")
  );

  if (
    tipoOferta === "free" ||
    origem.includes("free") ||
    referencia.includes("offer_free") ||
    nome.includes("free")
  ) {
    return "Free";
  }

  if (
    origem.includes("beta") ||
    nome.includes("beta") ||
    jsonTemValor(ofertaMetadata, "valor_beta_centavos")
  ) {
    return "Beta";
  }

  if (
    tipoOferta === "af" ||
    tipoOferta === "afiliado" ||
    origem.includes("afiliado") ||
    origem.includes("_af") ||
    nome.includes("afiliado")
  ) {
    return "Af";
  }

  if (
    origem.includes("teste") ||
    nome.includes("teste") ||
    jsonTemValor(ofertaMetadata, "valor_teste_centavos")
  ) {
    return "Teste";
  }

  if (tipoOferta === "vip") return "Vip";
  if (tipoOferta === "jv") return "JV";

  return "";
}

function getPlanoOfertaResumo(empresa: EmpresaRow) {
  const base = getPlanoBaseResumo(empresa);
  const sufixo = getOfertaPlanoSufixo(empresa);

  return sufixo ? `${base} (${sufixo})` : base;
}

function getOfertaPlanoNomeCompleto(empresa: EmpresaRow) {
  const metadata = normalizarObjetoJson(empresa.assinatura_metadata_json);

  return (
    empresa.oferta_plano?.nome?.trim() ||
    getTextoJson(metadata, "oferta_nome") ||
    getTextoJson(metadata, "offer_title") ||
    getPlano(empresa)?.nome?.trim() ||
    "Sem plano"
  );
}

async function carregarAdministradoresPlano(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  usuarios: UsuarioAdministradorRow[]
) {
  const usuariosPorId = new Map(
    usuarios
      .filter((usuario) => usuario.id && usuario.empresa_id)
      .map((usuario) => [usuario.id, usuario])
  );
  const usuarioIds = Array.from(usuariosPorId.keys());
  const vinculosPerfis: UsuarioPerfilAdministradorRow[] = [];

  for (let index = 0; index < usuarioIds.length; index += 400) {
    const lote = usuarioIds.slice(index, index + 400);
    const { data, error } = await supabaseAdmin
      .from("usuarios_perfis")
      .select(
        `
          usuario_id,
          perfis_empresa (
            nome,
            ativo,
            empresa_id
          )
        `
      )
      .in("usuario_id", lote);

    if (error) {
      throw new Error(`Erro ao buscar administradores: ${error.message}`);
    }

    vinculosPerfis.push(...((data ?? []) as UsuarioPerfilAdministradorRow[]));
  }

  const administradoresPorEmpresa = new Map<string, UsuarioAdministradorRow>();

  for (const vinculo of vinculosPerfis) {
    if (!vinculo.usuario_id) continue;

    const usuario = usuariosPorId.get(vinculo.usuario_id);
    const perfil = normalizarRelacao(vinculo.perfis_empresa);

    if (!usuario?.empresa_id || !perfil) continue;
    if (perfil.ativo === false) continue;
    if (normalizarTextoComparacao(perfil.nome || "") !== "administrador") continue;
    if (perfil.empresa_id && perfil.empresa_id !== usuario.empresa_id) continue;
    if (administradoresPorEmpresa.has(usuario.empresa_id)) continue;

    administradoresPorEmpresa.set(usuario.empresa_id, usuario);
  }

  return administradoresPorEmpresa;
}

function getOrigemContatoLabel(valor: string | null | undefined) {
  const texto = valor?.trim();

  if (!texto) return ORIGEM_MANUAL_LABEL;

  const normalizado = normalizarTextoComparacao(texto);
  const ehDiretoNaoIdentificado =
    normalizado === "direto / nao identificado" ||
    (normalizado.includes("direto") && normalizado.includes("nao identificado"));

  return ehDiretoNaoIdentificado ? ORIGEM_NA_LABEL : texto;
}

function getTextoCurto(valor: string, limite = CAMPANHA_LABEL_MAX_LENGTH) {
  const caracteres = Array.from(valor);

  if (caracteres.length <= limite) return valor;
  return `${caracteres.slice(0, limite).join("")}...`;
}

function CampanhaNome({ nome }: { nome: string }) {
  return <span title={nome}>{getTextoCurto(nome)}</span>;
}

function OrigemNome({ nome }: { nome: string }) {
  return <span title={nome}>{getTextoCurto(nome)}</span>;
}

function getCampaignSegmentColor(index: number) {
  return CAMPAIGN_SEGMENT_COLORS[index % CAMPAIGN_SEGMENT_COLORS.length];
}

function formatarCampanhasResumo(
  campanhas: CampanhaContatoResumo[],
  limite = 3,
  truncado = true
) {
  if (campanhas.length === 0) return "Sem campanhas";

  const visiveis = campanhas
    .slice(0, limite)
    .map((campanha) => {
      const nome = truncado ? getTextoCurto(campanha.nome) : campanha.nome;
      return `${nome}: ${formatarNumero(campanha.total)}`;
    });
  const restantes = campanhas.length - visiveis.length;

  return restantes > 0
    ? `${visiveis.join(" - ")} - +${restantes}`
    : visiveis.join(" - ");
}

function formatarOrigensResumo(
  origens: OrigemContatoResumo[],
  limite = 3,
  truncado = true
) {
  if (origens.length === 0) return "Sem origens";

  const visiveis = origens.slice(0, limite).map((origem) => {
    const nome = truncado ? getTextoCurto(origem.nome) : origem.nome;
    return `${nome}: ${formatarNumero(origem.total)}`;
  });
  const restantes = origens.length - visiveis.length;

  return restantes > 0
    ? `${visiveis.join(" - ")} - +${restantes}`
    : visiveis.join(" - ");
}

function getStatusPlanoLabel(status: string | null | undefined) {
  if (status === "bloqueada") return "Bloqueado";
  if (status === "vencida") return "Vencido";
  if (status === "ativa") return "Ativo";
  return status || "Nao definido";
}

function formatarStatusMeta(valor: string | null | undefined) {
  if (!valor) return "Nao informado";

  const mapa: Record<string, string> = {
    pendente: "Pendente",
    ativa: "Ativa",
    erro: "Erro",
    desconectada: "Desconectada",
    inicio: "Inicio",
    em_andamento: "Em andamento",
    meta_conectado: "Meta conectada",
    waba_criada: "WABA criada",
    numero_registrado: "Numero registrado",
    pagamento_configurado: "Pagamento configurado",
    webhook_configurado: "Webhook configurado",
    concluido: "Concluido",
  };

  return (
    mapa[valor] ||
    valor
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letra) => letra.toUpperCase())
  );
}

function integracaoMetaEstaAtiva(integracao: IntegracaoWhatsappRow) {
  return (
    integracao.status === "ativa" ||
    (integracao.onboarding_etapa === "concluido" &&
      integracao.onboarding_status === "concluido")
  );
}

function getIntegracaoStatusRank(integracao: IntegracaoMetaResumo) {
  if (!integracao.ativo) return 0;
  return 1;
}

function empresaEstaInadimplente(empresa: EmpresaRow) {
  if (
    empresa.assinatura_status === "bloqueada" ||
    empresa.assinatura_status === "vencida"
  ) {
    return true;
  }

  const vencimento = getTimestamp(empresa.assinatura_vencimento_em);
  return vencimento > 0 && vencimento < Date.now();
}

function getSituacaoPlanoLabel(empresa: EmpresaRow) {
  return empresaEstaInadimplente(empresa) ? "Inadimplente" : "Renovado";
}

function getSituacaoPlanoDotClass(empresa: EmpresaRow) {
  return empresaEstaInadimplente(empresa)
    ? styles.statusDotDanger
    : styles.statusDotSuccess;
}

function getStatusUsuarioClass(usuario: UsuarioSessaoResumo) {
  if (usuario.online) return styles.statusOnline;
  if (usuario.status === "ativo") return styles.statusNeutral;
  if (usuario.status === "bloqueado") return styles.statusDanger;
  if (usuario.status === "inativo") return styles.statusWarning;
  return styles.statusNeutral;
}

function larguraPercentual(valor: number, maximo: number, minimo = 4) {
  if (maximo <= 0 || valor <= 0) return "0%";
  return `${Math.max(minimo, Math.round((valor / maximo) * 100))}%`;
}

function isRecebida(mensagem: MensagemRow) {
  return mensagem.origem === "recebida" || mensagem.remetente_tipo === "contato";
}

function classificarDisparo(status: string | null | undefined) {
  if (status === "sucesso") return "sucesso";
  if (status === "falha") return "falha";
  return "processando";
}

function compararTexto(a: string, b: string) {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base" });
}

function aplicarDirecaoOrdenacao(
  resultado: number,
  direcao: DirecaoOrdenacao
) {
  if (resultado === 0) return 0;
  return direcao === "asc" ? resultado : -resultado;
}

function getTimestamp(valor: string | null | undefined) {
  if (!valor) return 0;
  const data = new Date(valor).getTime();
  return Number.isNaN(data) ? 0 : data;
}

function metadataEhDisparo(metadata: Record<string, unknown> | null | undefined) {
  const tipo = String(metadata?.tipo || "");
  return (
    tipo === "disparo_template" ||
    tipo === "disparo_template_individual" ||
    tipo === "disparo_template_agendado"
  );
}

function eventoPertoDaCriacaoDaConversa(
  conversa: ConversaRow | undefined,
  eventoCriadoEm: string | null | undefined
) {
  if (!conversa) return false;

  const conversaCriadaEm = getTimestamp(conversa.created_at);
  const eventoEm = getTimestamp(eventoCriadoEm);

  if (!conversaCriadaEm || !eventoEm) return false;

  return (
    eventoEm >= conversaCriadaEm - 60 * 1000 &&
    eventoEm <= conversaCriadaEm + JANELA_ORIGEM_DISPARO_MS
  );
}

function montarConversasIniciadasPorDisparo({
  conversas,
  disparosOrigem,
  mensagensOrigem,
}: {
  conversas: ConversaRow[];
  disparosOrigem: DisparoOrigemConversaRow[];
  mensagensOrigem: MensagemOrigemConversaRow[];
}) {
  const conversasPorId = new Map(conversas.map((conversa) => [conversa.id, conversa]));
  const ids = new Set<string>();

  for (const disparo of disparosOrigem) {
    if (!disparo.conversa_id) continue;
    if (
      eventoPertoDaCriacaoDaConversa(
        conversasPorId.get(disparo.conversa_id),
        disparo.created_at
      )
    ) {
      ids.add(disparo.conversa_id);
    }
  }

  for (const mensagem of mensagensOrigem) {
    if (!mensagem.conversa_id || !metadataEhDisparo(mensagem.metadata_json)) {
      continue;
    }

    if (
      eventoPertoDaCriacaoDaConversa(
        conversasPorId.get(mensagem.conversa_id),
        mensagem.created_at
      )
    ) {
      ids.add(mensagem.conversa_id);
    }
  }

  return ids;
}

function filtrarConversasPorOrigem({
  conversas,
  conversasIniciadasPorDisparo,
  origem,
}: {
  conversas: ConversaRow[];
  conversasIniciadasPorDisparo: Set<string>;
  origem: ConversaOrigemFiltro;
}) {
  if (origem === "todas") return conversas;

  return conversas.filter((conversa) => {
    const porDisparo = conversasIniciadasPorDisparo.has(conversa.id);
    return origem === "disparo" ? porDisparo : !porDisparo;
  });
}

function limitarIsoAoAgora(valor: string | null | undefined, agora: number) {
  const timestamp = getTimestamp(valor);

  if (!timestamp) return valor ?? null;
  if (timestamp <= agora) return valor ?? null;

  return new Date(agora).toISOString();
}

async function carregarSessoesRecentes(usuarioIds: string[]) {
  if (usuarioIds.length === 0) return new Map<string, UsuarioSessaoRow>();

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { data, error } = await supabaseAdmin
      .from("usuario_sessoes")
      .select(
        "id, usuario_id, empresa_id, client_session_id, login_at, last_seen_at, logout_at, status"
      )
      .in("usuario_id", usuarioIds)
      .order("last_seen_at", { ascending: false })
      .limit(MAX_SESSOES);

    if (error) {
      throw error;
    }

    const mapa = new Map<string, UsuarioSessaoRow>();

    for (const sessao of (data ?? []) as UsuarioSessaoRow[]) {
      const atual = mapa.get(sessao.usuario_id);

      if (!atual) {
        mapa.set(sessao.usuario_id, sessao);
        continue;
      }

      const sessaoAberta = !sessao.logout_at;
      const atualAberta = !atual.logout_at;

      if (
        (sessaoAberta && !atualAberta) ||
        (sessaoAberta === atualAberta &&
          getTimestamp(sessao.last_seen_at) > getTimestamp(atual.last_seen_at))
      ) {
        mapa.set(sessao.usuario_id, sessao);
      }
    }

    return mapa;
  } catch (error) {
    console.error("[RELATORIOS_INTERNOS] Falha ao buscar sessoes:", error);
    return new Map<string, UsuarioSessaoRow>();
  }
}

async function carregarSessoesPeriodo(
  usuarioIds: string[],
  filtros: FiltrosRelatorio
) {
  if (usuarioIds.length === 0) return [] as UsuarioSessaoRow[];

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { data, error } = await supabaseAdmin
      .from("usuario_sessoes")
      .select(
        "id, usuario_id, empresa_id, client_session_id, login_at, last_seen_at, logout_at, status"
      )
      .in("usuario_id", usuarioIds)
      .lte("login_at", filtros.fimIso)
      .or(
        `logout_at.gte.${filtros.inicioIso},last_seen_at.gte.${filtros.inicioIso},logout_at.is.null`
      )
      .order("login_at", { ascending: true })
      .limit(MAX_SESSOES);

    if (error) {
      throw error;
    }

    return (data ?? []) as UsuarioSessaoRow[];
  } catch (error) {
    console.error(
      "[RELATORIOS_INTERNOS] Falha ao buscar sessoes do periodo:",
      error
    );
    return [] as UsuarioSessaoRow[];
  }
}

function montarTempoOnlinePorEmpresa({
  usuarios,
  sessoesPeriodo,
  filtros,
  referenciaAgora,
}: {
  usuarios: UsuarioRow[];
  sessoesPeriodo: UsuarioSessaoRow[];
  filtros: FiltrosRelatorio;
  referenciaAgora: number;
}) {
  const inicioPeriodo = getTimestamp(filtros.inicioIso);
  const fimPeriodo = Math.min(getTimestamp(filtros.fimIso) || referenciaAgora, referenciaAgora);
  const empresaPorUsuario = new Map(
    usuarios.map((usuario) => [usuario.id, usuario.empresa_id])
  );
  const mapa = new Map<string, number>();

  for (const sessao of sessoesPeriodo) {
    const inicioSessao = getTimestamp(sessao.login_at);
    const ultimoSinal = Math.min(
      getTimestamp(sessao.last_seen_at) || inicioSessao,
      referenciaAgora
    );
    const logout = Math.min(getTimestamp(sessao.logout_at) || 0, referenciaAgora);
    const abertaOnline =
      !logout && ultimoSinal > 0 && referenciaAgora - ultimoSinal <= ONLINE_TIMEOUT_MS;
    const fimSessao = logout || (abertaOnline ? referenciaAgora : ultimoSinal);
    const inicio = Math.max(inicioSessao, inicioPeriodo);
    const fim = Math.min(fimSessao, fimPeriodo);
    const duracao = Math.max(0, fim - inicio);

    if (duracao <= 0) continue;

    const empresaId =
      sessao.empresa_id || empresaPorUsuario.get(sessao.usuario_id) || "sem_empresa";
    mapa.set(empresaId, (mapa.get(empresaId) ?? 0) + duracao);
  }

  return mapa;
}

async function carregarRelatorios(
  filtros: FiltrosRelatorio,
  filtrosRelatorio: FiltrosPorRelatorio,
  ordenacao: OrdenacaoRelatorios,
  direcoes: DirecoesOrdenacaoRelatorios
): Promise<RelatoriosDados> {
  const supabaseAdmin = getSupabaseAdmin();

  const empresasSelect = `
    id,
    nome_fantasia,
    razao_social,
    status,
    created_at,
    plano_id,
    assinatura_status,
    assinatura_inicio_em,
    assinatura_vencimento_em,
    assinatura_renovada_em,
    assinatura_gateway,
    assinatura_referencia,
    assinatura_metadata_json,
    planos (
      id,
      nome,
      slug
    )
  `;

  const empresasOpcoesQuery = supabaseAdmin
    .from("empresas")
    .select(empresasSelect)
    .order("nome_fantasia", { ascending: true });

  const usuariosOpcoesQuery = supabaseAdmin
    .from("usuarios")
    .select("id, empresa_id, nome, email")
    .order("nome", { ascending: true })
    .limit(MAX_USUARIOS);

  const ofertasPlanoQuery = supabaseAdmin
    .from("ia_token_ofertas")
    .select(
      "id, gateway, referencia, tipo, nome, plano_id, empresa_id, quantidade_tokens, metadata_json"
    )
    .eq("tipo", "mensalidade")
    .eq("ativa", true);

  let administradoresUsuariosQuery = supabaseAdmin
    .from("usuarios")
    .select("id, empresa_id, nome, email, status, created_at")
    .eq("status", "ativo")
    .order("created_at", { ascending: true })
    .limit(MAX_USUARIOS);

  let empresasQuery = supabaseAdmin
    .from("empresas")
    .select(empresasSelect, { count: "exact" })
    .order("nome_fantasia", { ascending: true });

  let conversasQuery = supabaseAdmin
    .from("conversas")
    .select(
      `
        id,
        empresa_id,
        contato_id,
        responsavel_id,
        created_at,
        status,
        origem_atendimento,
        contatos (
          id,
          empresa_id,
          nome,
          telefone,
          empresa,
          origem,
          rastreamento_origem_id,
          rastreamento_campanha_id,
          created_at
        )
      `,
      { count: "exact" }
    )
    .gte("created_at", filtros.inicioIso)
    .lte("created_at", filtros.fimIso)
    .order("created_at", { ascending: true })
    .limit(MAX_CONVERSAS);

  const disparosOrigemConversasQuery = supabaseAdmin
    .from("whatsapp_disparos_logs")
    .select("conversa_id, created_at, metadata_json")
    .not("conversa_id", "is", null)
    .gte("created_at", filtros.inicioIso)
    .lte("created_at", filtros.fimIso)
    .order("created_at", { ascending: true })
    .limit(MAX_DISPAROS);

  let mensagensQuery = supabaseAdmin
    .from("mensagens")
    .select(
      "id, empresa_id, conversa_id, remetente_id, remetente_tipo, origem, created_at",
      {
        count: "exact",
      }
    )
    .gte("created_at", filtros.inicioIso)
    .lte("created_at", filtros.fimIso)
    .order("created_at", { ascending: true })
    .limit(MAX_MENSAGENS);

  const mensagensOrigemConversasQuery = supabaseAdmin
    .from("mensagens")
    .select("conversa_id, created_at, metadata_json")
    .not("conversa_id", "is", null)
    .gte("created_at", filtros.inicioIso)
    .lte("created_at", filtros.fimIso)
    .order("created_at", { ascending: true })
    .limit(MAX_MENSAGENS);

  let disparosQuery = supabaseAdmin
    .from("whatsapp_disparos_logs")
    .select("id, empresa_id, status, template_nome, usuario_id, created_at", {
      count: "exact",
    })
    .gte("created_at", filtros.inicioIso)
    .lte("created_at", filtros.fimIso)
    .order("created_at", { ascending: false })
    .limit(MAX_DISPAROS);

  let contatosQuery = supabaseAdmin
    .from("contatos")
    .select("id, empresa_id, campanha, created_at", {
      count: "exact",
    })
    .gte("created_at", filtros.inicioIso)
    .lte("created_at", filtros.fimIso)
    .order("created_at", { ascending: false })
    .limit(MAX_CONTATOS);

  let contatosOrigemQuery = supabaseAdmin
    .from("contatos")
    .select("id, empresa_id, origem, created_at", {
      count: "exact",
    })
    .gte("created_at", filtros.inicioIso)
    .lte("created_at", filtros.fimIso)
    .order("created_at", { ascending: false })
    .limit(MAX_CONTATOS);

  let tokensQuery = supabaseAdmin
    .from("ia_token_usos")
    .select(
      "id, empresa_id, origem, modelo, tokens_input, tokens_output, tokens_total, created_at",
      {
        count: "exact",
      }
    )
    .gte("created_at", filtros.inicioIso)
    .lte("created_at", filtros.fimIso)
    .order("created_at", { ascending: false })
    .limit(MAX_TOKEN_USOS);

  let integracoesQuery = supabaseAdmin
    .from("integracoes_whatsapp")
    .select(
      `
        id,
        empresa_id,
        nome_conexao,
        numero,
        status,
        provider,
        phone_number_id,
        waba_id,
        webhook_verificado,
        phone_registered,
        app_assigned,
        payment_method_added,
        onboarding_etapa,
        onboarding_status,
        onboarding_erro,
        setup_completed_at,
        created_at,
        updated_at
      `,
      { count: "exact" }
    )
    .eq("provider", "meta_official")
    .order("created_at", { ascending: false })
    .limit(MAX_INTEGRACOES);

  let usuariosQuery = supabaseAdmin
    .from("usuarios")
    .select(
      "id, auth_user_id, empresa_id, nome, email, status, ultimo_acesso, created_at",
      { count: "exact" }
    )
    .order("ultimo_acesso", { ascending: false, nullsFirst: false })
    .limit(MAX_USUARIOS);

  if (filtrosRelatorio.planosEmpresaId) {
    empresasQuery = empresasQuery.eq("id", filtrosRelatorio.planosEmpresaId);
    administradoresUsuariosQuery = administradoresUsuariosQuery.eq(
      "empresa_id",
      filtrosRelatorio.planosEmpresaId
    );
  }

  if (filtrosRelatorio.conversasEmpresaId) {
    conversasQuery = conversasQuery.eq(
      "empresa_id",
      filtrosRelatorio.conversasEmpresaId
    );
  }

  if (filtrosRelatorio.conversasUsuarioId) {
    conversasQuery = conversasQuery.eq(
      "responsavel_id",
      filtrosRelatorio.conversasUsuarioId
    );
  }

  if (filtrosRelatorio.mensagensEmpresaId) {
    mensagensQuery = mensagensQuery.eq(
      "empresa_id",
      filtrosRelatorio.mensagensEmpresaId
    );
  }

  if (filtrosRelatorio.mensagensUsuarioId) {
    mensagensQuery = mensagensQuery.eq(
      "remetente_id",
      filtrosRelatorio.mensagensUsuarioId
    );
  }

  if (filtrosRelatorio.disparosEmpresaId) {
    disparosQuery = disparosQuery.eq(
      "empresa_id",
      filtrosRelatorio.disparosEmpresaId
    );
  }

  if (filtrosRelatorio.disparosUsuarioId) {
    disparosQuery = disparosQuery.eq(
      "usuario_id",
      filtrosRelatorio.disparosUsuarioId
    );
  }

  if (filtrosRelatorio.contatosEmpresaId) {
    contatosQuery = contatosQuery.eq(
      "empresa_id",
      filtrosRelatorio.contatosEmpresaId
    );
  }

  if (filtrosRelatorio.origensEmpresaId) {
    contatosOrigemQuery = contatosOrigemQuery.eq(
      "empresa_id",
      filtrosRelatorio.origensEmpresaId
    );
  }

  if (filtrosRelatorio.tokensEmpresaId) {
    tokensQuery = tokensQuery.eq("empresa_id", filtrosRelatorio.tokensEmpresaId);
  }

  if (filtrosRelatorio.integracoesEmpresaId) {
    integracoesQuery = integracoesQuery.eq(
      "empresa_id",
      filtrosRelatorio.integracoesEmpresaId
    );
  }

  if (filtrosRelatorio.integracoesStatus) {
    integracoesQuery = integracoesQuery.eq(
      "status",
      filtrosRelatorio.integracoesStatus
    );
  }

  if (filtrosRelatorio.usuariosEmpresaId) {
    usuariosQuery = usuariosQuery.eq(
      "empresa_id",
      filtrosRelatorio.usuariosEmpresaId
    );
  }

  if (filtrosRelatorio.usuariosUsuarioId) {
    usuariosQuery = usuariosQuery.eq("id", filtrosRelatorio.usuariosUsuarioId);
  }

  const [
    empresasOpcoesResult,
    usuariosOpcoesResult,
    ofertasPlanoResult,
    administradoresUsuariosResult,
    empresasResult,
    conversasResult,
    disparosOrigemConversasResult,
    mensagensResult,
    mensagensOrigemConversasResult,
    disparosResult,
    contatosResult,
    contatosOrigemResult,
    tokensResult,
    integracoesResult,
    usuariosResult,
  ] = await Promise.all([
    empresasOpcoesQuery,
    usuariosOpcoesQuery,
    ofertasPlanoQuery,
    administradoresUsuariosQuery,
    empresasQuery,
    conversasQuery,
    disparosOrigemConversasQuery,
    mensagensQuery,
    mensagensOrigemConversasQuery,
    disparosQuery,
    contatosQuery,
    contatosOrigemQuery,
    tokensQuery,
    integracoesQuery,
    usuariosQuery,
  ]);

  if (empresasOpcoesResult.error) throw new Error(empresasOpcoesResult.error.message);
  if (usuariosOpcoesResult.error) throw new Error(usuariosOpcoesResult.error.message);
  if (ofertasPlanoResult.error) throw new Error(ofertasPlanoResult.error.message);
  if (administradoresUsuariosResult.error) {
    throw new Error(administradoresUsuariosResult.error.message);
  }
  if (empresasResult.error) throw new Error(empresasResult.error.message);
  if (conversasResult.error) throw new Error(conversasResult.error.message);
  if (disparosOrigemConversasResult.error) {
    throw new Error(disparosOrigemConversasResult.error.message);
  }
  if (mensagensResult.error) throw new Error(mensagensResult.error.message);
  if (mensagensOrigemConversasResult.error) {
    throw new Error(mensagensOrigemConversasResult.error.message);
  }
  if (disparosResult.error) throw new Error(disparosResult.error.message);
  if (contatosResult.error) throw new Error(contatosResult.error.message);
  if (contatosOrigemResult.error) {
    throw new Error(contatosOrigemResult.error.message);
  }
  if (tokensResult.error) throw new Error(tokensResult.error.message);
  if (integracoesResult.error) throw new Error(integracoesResult.error.message);
  if (usuariosResult.error) throw new Error(usuariosResult.error.message);

  const empresasOpcoes = (empresasOpcoesResult.data ?? []) as EmpresaRow[];
  const usuariosOpcoes = (usuariosOpcoesResult.data ?? []) as UsuarioOpcao[];
  const ofertasPlano = (ofertasPlanoResult.data ?? []) as OfertaPlanoRow[];
  const usuariosAdministradores = (administradoresUsuariosResult.data ??
    []) as UsuarioAdministradorRow[];
  const ofertasPorId = new Map(
    ofertasPlano
      .map((oferta) => [getChaveOferta(oferta.id), oferta] as const)
      .filter(([id]) => Boolean(id))
  );
  const ofertasPorReferencia = new Map(
    ofertasPlano
      .map((oferta) => [getChaveOferta(oferta.referencia), oferta] as const)
      .filter(([referencia]) => Boolean(referencia))
  );
  const administradoresPorEmpresa = await carregarAdministradoresPlano(
    supabaseAdmin,
    usuariosAdministradores
  );
  const empresas = ((empresasResult.data ?? []) as EmpresaRow[]).filter((empresa) => {
    if (filtrosRelatorio.planosStatus === "regular") {
      return !empresaEstaInadimplente(empresa);
    }

    if (filtrosRelatorio.planosStatus === "inadimplente") {
      return empresaEstaInadimplente(empresa);
    }

    return true;
  });
  const empresasComDetalhesPlano = empresas.map((empresa) => ({
    ...empresa,
    administrador_plano: administradoresPorEmpresa.get(empresa.id) ?? null,
    oferta_plano: getOfertaPlanoEmpresa(
      empresa,
      ofertasPorId,
      ofertasPorReferencia
    ),
  }));
  const empresasPorId = new Map(
    empresasOpcoes.map((empresa) => [empresa.id, empresa])
  );

  const conversas = (conversasResult.data ?? []) as ConversaRow[];
  const disparosOrigemConversas = (disparosOrigemConversasResult.data ??
    []) as DisparoOrigemConversaRow[];
  const mensagens = (mensagensResult.data ?? []) as MensagemRow[];
  const mensagensOrigemConversas = (mensagensOrigemConversasResult.data ??
    []) as MensagemOrigemConversaRow[];
  const disparos = (disparosResult.data ?? []) as DisparoRow[];
  const contatos = (contatosResult.data ?? []) as ContatoRow[];
  const contatosOrigem = (contatosOrigemResult.data ?? []) as ContatoOrigemRow[];
  const usosTokens = (tokensResult.data ?? []) as TokenUsoRow[];
  const integracoes = (integracoesResult.data ?? []) as IntegracaoWhatsappRow[];
  const usuarios = (usuariosResult.data ?? []) as UsuarioRow[];
  const conversasIniciadasPorDisparo = montarConversasIniciadasPorDisparo({
    conversas,
    disparosOrigem: disparosOrigemConversas,
    mensagensOrigem: mensagensOrigemConversas,
  });
  const conversasRelatorio = filtrarConversasPorOrigem({
    conversas,
    conversasIniciadasPorDisparo,
    origem: filtrosRelatorio.conversasOrigem,
  });
  const conversasPorId = new Map(conversas.map((conversa) => [conversa.id, conversa]));

  const mensagensTop = montarMensagensPorConversa({
    mensagens,
    conversasPorId,
    empresasPorId,
    ordenacao: ordenacao.mensagens,
    direcao: direcoes.mensagens,
  });

  const conversaIdsFaltantes = Array.from(
    new Set(
      mensagensTop
        .map((item) => item.conversaId)
        .filter((conversaId) => conversaId && !conversasPorId.has(conversaId))
    )
  );

  if (conversaIdsFaltantes.length > 0) {
    const { data: conversasFaltantes, error } = await supabaseAdmin
      .from("conversas")
      .select(
        `
          id,
          empresa_id,
          contato_id,
          responsavel_id,
          created_at,
          status,
          origem_atendimento,
          contatos (
            id,
            empresa_id,
            nome,
            telefone,
            empresa,
            origem,
            rastreamento_origem_id,
            rastreamento_campanha_id,
            created_at
          )
        `
      )
      .in("id", conversaIdsFaltantes.slice(0, 300));

    if (!error) {
      for (const conversa of (conversasFaltantes ?? []) as ConversaRow[]) {
        conversasPorId.set(conversa.id, conversa);
      }
    }
  }

  const usuarioIds = usuarios.map((usuario) => usuario.id);
  const referenciaAgora = Math.min(
    Date.now(),
    getTimestamp(filtros.fimIso) || Date.now()
  );
  const [sessoesRecentes, sessoesPeriodo] = await Promise.all([
    carregarSessoesRecentes(usuarioIds),
    carregarSessoesPeriodo(usuarioIds, filtros),
  ]);
  const tempoOnlinePorEmpresa = montarTempoOnlinePorEmpresa({
    usuarios,
    sessoesPeriodo,
    filtros,
    referenciaAgora,
  });

  const usuariosSessao = montarUsuariosSessao({
    usuarios,
    empresasPorId,
    sessoesRecentes,
    ordenacao: ordenacao.usuarios,
    direcao: direcoes.usuarios,
    referenciaAgora,
  });

  const conversasPorEmpresa = montarConversasPorEmpresa({
    conversas: conversasRelatorio,
    empresasPorId,
    ordenacao: ordenacao.conversas,
    direcao: direcoes.conversas,
  });
  const mensagensPorConversa = mensagensTop.map((item) => {
    const conversa = conversasPorId.get(item.conversaId);
    const empresaId = conversa?.empresa_id || item.empresaId;

    return {
      ...item,
      empresaId,
      empresaNome: getNomeEmpresaPorId(empresasPorId, empresaId),
      contato: getContatoLabel(conversa),
    };
  });
  const disparosPorEmpresa = montarDisparosPorEmpresa({
    disparos,
    empresasPorId,
    ordenacao: ordenacao.disparos,
    direcao: direcoes.disparos,
  });
  const contatosPorEmpresa = montarContatosPorEmpresa({
    contatos,
    empresasPorId,
    ordenacao: ordenacao.contatos,
    direcao: direcoes.contatos,
  });
  const contatosOrigemPorEmpresa = montarContatosOrigemPorEmpresa({
    contatos: contatosOrigem,
    empresasPorId,
    ordenacao: ordenacao.origens,
    direcao: direcoes.origens,
  });
  const tokensPorEmpresa = montarTokensPorEmpresa({
    usos: usosTokens,
    empresasPorId,
    ordenacao: ordenacao.tokens,
    direcao: direcoes.tokens,
  });
  const integracoesMeta = montarIntegracoesMeta({
    integracoes,
    empresasPorId,
    tempoOnlinePorEmpresa,
    ordenacao: ordenacao.integracoes,
    direcao: direcoes.integracoes,
  });
  const empresasOrdenadas = ordenarEmpresasPlano({
    empresas: empresasComDetalhesPlano,
    ordenacao: ordenacao.planos,
    direcao: direcoes.planos,
  });
  const contatosNovos = contatosPorEmpresa.reduce(
    (total, empresa) => total + empresa.total,
    0
  );
  const contatosCampanhaNaoInformada = contatosPorEmpresa.reduce(
    (total, empresa) => total + empresa.campanhaNaoInformada,
    0
  );
  const contatosOutrasCampanhas = Math.max(
    0,
    contatosNovos - contatosCampanhaNaoInformada
  );
  const contatosOrigemTotal = contatosOrigemPorEmpresa.reduce(
    (total, empresa) => total + empresa.total,
    0
  );
  const contatosOrigemManual = contatosOrigemPorEmpresa.reduce(
    (total, empresa) => total + empresa.origemManual,
    0
  );
  const contatosOrigemNa = contatosOrigemPorEmpresa.reduce(
    (total, empresa) => total + empresa.origemNa,
    0
  );
  const tokensInput = tokensPorEmpresa.reduce(
    (total, empresa) => total + empresa.tokensInput,
    0
  );
  const tokensOutput = tokensPorEmpresa.reduce(
    (total, empresa) => total + empresa.tokensOutput,
    0
  );
  const tokensTotal = tokensPorEmpresa.reduce(
    (total, empresa) => total + empresa.tokensTotal,
    0
  );
  const usuariosOnline = usuariosSessao.filter((usuario) => usuario.online).length;
  const usuariosTempoOnlineMs = usuariosSessao.reduce(
    (total, usuario) => total + usuario.tempoOnlineMs,
    0
  );
  const integracoesMetaAtivas = integracoesMeta.filter(
    (integracao) => integracao.ativo
  ).length;

  return {
    empresasOpcoes,
    usuariosOpcoes,
    empresas: empresasOrdenadas,
    conversasPorEmpresa,
    mensagensPorConversa,
    disparosPorEmpresa,
    contatosPorEmpresa,
    contatosOrigemPorEmpresa,
    tokensPorEmpresa,
    usuariosSessao,
    integracoesMeta,
    totais: {
      conversas: conversasRelatorio.length,
      mensagens: mensagensResult.count ?? mensagens.length,
      disparos: disparosResult.count ?? disparos.length,
      contatosNovos,
      contatosCampanhaNaoInformada,
      contatosDiretoNaoIdentificado: contatosCampanhaNaoInformada,
      contatosOutrasCampanhas,
      contatosOrigemTotal,
      contatosOrigemManual,
      contatosOrigemNa,
      tokensRegistros: tokensResult.count ?? usosTokens.length,
      tokensInput,
      tokensOutput,
      tokensTotal,
      usuarios: usuariosResult.count ?? usuarios.length,
      usuariosOnline,
      usuariosOffline: Math.max(0, usuarios.length - usuariosOnline),
      usuariosTempoOnlineMs,
      empresas: empresasOrdenadas.length,
      integracoesMeta: integracoesResult.count ?? integracoes.length,
      integracoesMetaAtivas,
      integracoesMetaPendentes: Math.max(
        0,
        (integracoesResult.count ?? integracoes.length) - integracoesMetaAtivas
      ),
    },
  };
}

function montarConversasPorEmpresa({
  conversas,
  empresasPorId,
  ordenacao,
  direcao,
}: {
  conversas: ConversaRow[];
  empresasPorId: Map<string, EmpresaRow>;
  ordenacao: OrdenacaoRelatorios["conversas"];
  direcao: DirecaoOrdenacao;
}) {
  const mapa = new Map<
    string,
    {
      empresaId: string;
      total: number;
      primeiraConversaEm: string | null;
      ultimaConversaEm: string | null;
    }
  >();

  for (const conversa of conversas) {
    const empresaId = conversa.empresa_id || "sem_empresa";
    const atual =
      mapa.get(empresaId) ??
      {
        empresaId,
        total: 0,
        primeiraConversaEm: null,
        ultimaConversaEm: null,
      };

    atual.total += 1;

    if (
      !atual.primeiraConversaEm ||
      getTimestamp(conversa.created_at) < getTimestamp(atual.primeiraConversaEm)
    ) {
      atual.primeiraConversaEm = conversa.created_at;
    }

    if (
      !atual.ultimaConversaEm ||
      getTimestamp(conversa.created_at) > getTimestamp(atual.ultimaConversaEm)
    ) {
      atual.ultimaConversaEm = conversa.created_at;
    }

    mapa.set(empresaId, atual);
  }

  const maximo = Math.max(1, ...Array.from(mapa.values()).map((item) => item.total));
  const totalGeral = Math.max(1, conversas.length);
  const itens = Array.from(mapa.values()).map((item) => ({
    ...item,
    nome: getNomeEmpresaPorId(empresasPorId, item.empresaId),
    percentual: Math.round((item.total / totalGeral) * 100),
  }));

  return itens
    .sort((a, b) => {
      if (ordenacao === "empresa") {
        return aplicarDirecaoOrdenacao(compararTexto(a.nome, b.nome), direcao);
      }
      if (ordenacao === "percentual") {
        return aplicarDirecaoOrdenacao(a.percentual - b.percentual, direcao);
      }
      if (ordenacao === "primeira") {
        return aplicarDirecaoOrdenacao(
          getTimestamp(a.primeiraConversaEm) - getTimestamp(b.primeiraConversaEm),
          direcao
        );
      }
      if (ordenacao === "ultima") {
        return aplicarDirecaoOrdenacao(
          getTimestamp(a.ultimaConversaEm) - getTimestamp(b.ultimaConversaEm),
          direcao
        );
      }
      return aplicarDirecaoOrdenacao(a.total - b.total, direcao);
    })
    .map((item) => ({
      ...item,
      percentual: Math.max(item.percentual, Math.round((item.total / maximo) * 100)),
    }));
}

function montarMensagensPorConversa({
  mensagens,
  conversasPorId,
  empresasPorId,
  ordenacao,
  direcao,
}: {
  mensagens: MensagemRow[];
  conversasPorId: Map<string, ConversaRow>;
  empresasPorId: Map<string, EmpresaRow>;
  ordenacao: OrdenacaoRelatorios["mensagens"];
  direcao: DirecaoOrdenacao;
}) {
  const mapa = new Map<
    string,
    {
      conversaId: string;
      empresaId: string;
      total: number;
      recebidas: number;
      enviadas: number;
      primeiraMensagemEm: string | null;
      ultimaMensagemEm: string | null;
    }
  >();

  for (const mensagem of mensagens) {
    if (!mensagem.conversa_id) continue;

    const conversa = conversasPorId.get(mensagem.conversa_id);
    const empresaId = conversa?.empresa_id || mensagem.empresa_id || "sem_empresa";
    const atual =
      mapa.get(mensagem.conversa_id) ??
      {
        conversaId: mensagem.conversa_id,
        empresaId,
        total: 0,
        recebidas: 0,
        enviadas: 0,
        primeiraMensagemEm: null,
        ultimaMensagemEm: null,
      };

    atual.total += 1;

    if (isRecebida(mensagem)) {
      atual.recebidas += 1;
    } else {
      atual.enviadas += 1;
    }

    if (
      !atual.primeiraMensagemEm ||
      getTimestamp(mensagem.created_at) < getTimestamp(atual.primeiraMensagemEm)
    ) {
      atual.primeiraMensagemEm = mensagem.created_at;
    }

    if (
      !atual.ultimaMensagemEm ||
      getTimestamp(mensagem.created_at) > getTimestamp(atual.ultimaMensagemEm)
    ) {
      atual.ultimaMensagemEm = mensagem.created_at;
    }

    mapa.set(mensagem.conversa_id, atual);
  }

  return Array.from(mapa.values())
    .map((item) => {
      const conversa = conversasPorId.get(item.conversaId);
      const empresaId = conversa?.empresa_id || item.empresaId;

      return {
        ...item,
        empresaId,
        empresaNome: getNomeEmpresaPorId(empresasPorId, empresaId),
        contato: getContatoLabel(conversa),
      };
    })
    .sort((a, b) => {
      if (ordenacao === "empresa") {
        return aplicarDirecaoOrdenacao(
          compararTexto(a.empresaNome, b.empresaNome),
          direcao
        );
      }
      if (ordenacao === "contato") {
        return aplicarDirecaoOrdenacao(compararTexto(a.contato, b.contato), direcao);
      }
      if (ordenacao === "recebidas") {
        return aplicarDirecaoOrdenacao(a.recebidas - b.recebidas, direcao);
      }
      if (ordenacao === "enviadas") {
        return aplicarDirecaoOrdenacao(a.enviadas - b.enviadas, direcao);
      }
      if (ordenacao === "ultima") {
        return aplicarDirecaoOrdenacao(
          getTimestamp(a.ultimaMensagemEm) - getTimestamp(b.ultimaMensagemEm),
          direcao
        );
      }
      return aplicarDirecaoOrdenacao(a.total - b.total, direcao);
    })
    .slice(0, 40);
}

function montarDisparosPorEmpresa({
  disparos,
  empresasPorId,
  ordenacao,
  direcao,
}: {
  disparos: DisparoRow[];
  empresasPorId: Map<string, EmpresaRow>;
  ordenacao: OrdenacaoRelatorios["disparos"];
  direcao: DirecaoOrdenacao;
}) {
  const mapa = new Map<
    string,
    {
      empresaId: string;
      total: number;
      sucesso: number;
      falha: number;
      processando: number;
    }
  >();

  for (const disparo of disparos) {
    const empresaId = disparo.empresa_id || "sem_empresa";
    const atual =
      mapa.get(empresaId) ??
      {
        empresaId,
        total: 0,
        sucesso: 0,
        falha: 0,
        processando: 0,
      };
    const status = classificarDisparo(disparo.status);

    atual.total += 1;
    atual[status] += 1;
    mapa.set(empresaId, atual);
  }

  const maximo = Math.max(1, ...Array.from(mapa.values()).map((item) => item.total));

  return Array.from(mapa.values())
    .map((item) => ({
      ...item,
      nome: getNomeEmpresaPorId(empresasPorId, item.empresaId),
      percentual: Math.round((item.total / maximo) * 100),
    }))
    .sort((a, b) => {
      if (ordenacao === "empresa") {
        return aplicarDirecaoOrdenacao(compararTexto(a.nome, b.nome), direcao);
      }
      if (ordenacao === "sucesso") {
        return aplicarDirecaoOrdenacao(a.sucesso - b.sucesso, direcao);
      }
      if (ordenacao === "falha") {
        return aplicarDirecaoOrdenacao(a.falha - b.falha, direcao);
      }
      if (ordenacao === "processando") {
        return aplicarDirecaoOrdenacao(a.processando - b.processando, direcao);
      }
      return aplicarDirecaoOrdenacao(a.total - b.total, direcao);
    })
    .slice(0, 15);
}

function montarContatosPorEmpresa({
  contatos,
  empresasPorId,
  ordenacao,
  direcao,
}: {
  contatos: ContatoRow[];
  empresasPorId: Map<string, EmpresaRow>;
  ordenacao: OrdenacaoRelatorios["contatos"];
  direcao: DirecaoOrdenacao;
}) {
  const mapa = new Map<
    string,
    {
      empresaId: string;
      total: number;
      campanhas: Map<string, number>;
    }
  >();

  for (const contato of contatos) {
    const empresaId = contato.empresa_id || "sem_empresa";
    const campanha = getCampanhaLabel(contato.campanha);
    const atual =
      mapa.get(empresaId) ??
      {
        empresaId,
        total: 0,
        campanhas: new Map<string, number>(),
      };

    atual.total += 1;
    atual.campanhas.set(campanha, (atual.campanhas.get(campanha) ?? 0) + 1);
    mapa.set(empresaId, atual);
  }

  return Array.from(mapa.values())
    .map((item) => {
      const campanhas = Array.from(item.campanhas.entries())
        .map(([nome, total]) => ({
          nome,
          total,
          percentual: item.total > 0 ? Math.round((total / item.total) * 100) : 0,
        }))
        .sort((a, b) => b.total - a.total || compararTexto(a.nome, b.nome));
      const campanhaPrincipal = campanhas[0]?.nome ?? CAMPANHA_NA_LABEL;
      const campanhaPrincipalTotal = campanhas[0]?.total ?? 0;
      const campanhaNaoInformada =
        campanhas.find((campanha) => campanha.nome === CAMPANHA_NA_LABEL)?.total ?? 0;
      const percentualNaoInformada =
        item.total > 0 ? Math.round((campanhaNaoInformada / item.total) * 100) : 0;

      return {
        empresaId: item.empresaId,
        nome: getNomeEmpresaPorId(empresasPorId, item.empresaId),
        total: item.total,
        campanhas,
        campanhaPrincipal,
        campanhaPrincipalTotal,
        campanhaNaoInformada,
        percentualNaoInformada,
        diretoNaoIdentificado: campanhaNaoInformada,
        outrasOrigens: Math.max(0, item.total - campanhaNaoInformada),
        percentualDireto: percentualNaoInformada,
      };
    })
    .sort((a, b) => {
      if (ordenacao === "empresa") {
        return aplicarDirecaoOrdenacao(compararTexto(a.nome, b.nome), direcao);
      }
      if (ordenacao === "campanha") {
        const resultado =
          compararTexto(a.campanhaPrincipal, b.campanhaPrincipal) ||
          a.campanhaPrincipalTotal - b.campanhaPrincipalTotal;

        return aplicarDirecaoOrdenacao(resultado, direcao);
      }
      if (ordenacao === "na") {
        return aplicarDirecaoOrdenacao(
          a.campanhaNaoInformada - b.campanhaNaoInformada,
          direcao
        );
      }
      if (ordenacao === "percentual") {
        return aplicarDirecaoOrdenacao(
          a.percentualNaoInformada - b.percentualNaoInformada,
          direcao
        );
      }
      return aplicarDirecaoOrdenacao(a.total - b.total, direcao);
    });
}

function montarContatosOrigemPorEmpresa({
  contatos,
  empresasPorId,
  ordenacao,
  direcao,
}: {
  contatos: ContatoOrigemRow[];
  empresasPorId: Map<string, EmpresaRow>;
  ordenacao: OrdenacaoRelatorios["origens"];
  direcao: DirecaoOrdenacao;
}) {
  const mapa = new Map<
    string,
    {
      empresaId: string;
      total: number;
      origens: Map<string, number>;
    }
  >();

  for (const contato of contatos) {
    const empresaId = contato.empresa_id || "sem_empresa";
    const origem = getOrigemContatoLabel(contato.origem);
    const atual =
      mapa.get(empresaId) ??
      {
        empresaId,
        total: 0,
        origens: new Map<string, number>(),
      };

    atual.total += 1;
    atual.origens.set(origem, (atual.origens.get(origem) ?? 0) + 1);
    mapa.set(empresaId, atual);
  }

  return Array.from(mapa.values())
    .map((item) => {
      const origens = Array.from(item.origens.entries())
        .map(([nome, total]) => ({
          nome,
          total,
          percentual: item.total > 0 ? Math.round((total / item.total) * 100) : 0,
        }))
        .sort((a, b) => b.total - a.total || compararTexto(a.nome, b.nome));
      const origemPrincipal = origens[0]?.nome ?? ORIGEM_MANUAL_LABEL;
      const origemPrincipalTotal = origens[0]?.total ?? 0;
      const origemManual =
        origens.find((origem) => origem.nome === ORIGEM_MANUAL_LABEL)?.total ?? 0;
      const origemNa =
        origens.find((origem) => origem.nome === ORIGEM_NA_LABEL)?.total ?? 0;

      return {
        empresaId: item.empresaId,
        nome: getNomeEmpresaPorId(empresasPorId, item.empresaId),
        total: item.total,
        origens,
        origemPrincipal,
        origemPrincipalTotal,
        origemManual,
        percentualManual:
          item.total > 0 ? Math.round((origemManual / item.total) * 100) : 0,
        origemNa,
        percentualNa: item.total > 0 ? Math.round((origemNa / item.total) * 100) : 0,
      };
    })
    .sort((a, b) => {
      if (ordenacao === "empresa") {
        return aplicarDirecaoOrdenacao(compararTexto(a.nome, b.nome), direcao);
      }
      if (ordenacao === "origem") {
        const resultado =
          compararTexto(a.origemPrincipal, b.origemPrincipal) ||
          a.origemPrincipalTotal - b.origemPrincipalTotal;

        return aplicarDirecaoOrdenacao(resultado, direcao);
      }
      if (ordenacao === "manual") {
        return aplicarDirecaoOrdenacao(a.origemManual - b.origemManual, direcao);
      }
      if (ordenacao === "na") {
        return aplicarDirecaoOrdenacao(a.origemNa - b.origemNa, direcao);
      }
      if (ordenacao === "percentual") {
        return aplicarDirecaoOrdenacao(a.percentualNa - b.percentualNa, direcao);
      }
      return aplicarDirecaoOrdenacao(a.total - b.total, direcao);
    });
}

function montarTokensPorEmpresa({
  usos,
  empresasPorId,
  ordenacao,
  direcao,
}: {
  usos: TokenUsoRow[];
  empresasPorId: Map<string, EmpresaRow>;
  ordenacao: OrdenacaoRelatorios["tokens"];
  direcao: DirecaoOrdenacao;
}) {
  const mapa = new Map<
    string,
    {
      empresaId: string;
      registros: number;
      tokensInput: number;
      tokensOutput: number;
      tokensTotal: number;
      ultimoUsoEm: string | null;
    }
  >();

  for (const uso of usos) {
    const empresaId = uso.empresa_id || "sem_empresa";
    const atual =
      mapa.get(empresaId) ??
      {
        empresaId,
        registros: 0,
        tokensInput: 0,
        tokensOutput: 0,
        tokensTotal: 0,
        ultimoUsoEm: null,
      };

    atual.registros += 1;
    atual.tokensInput += Number(uso.tokens_input || 0);
    atual.tokensOutput += Number(uso.tokens_output || 0);
    atual.tokensTotal += Number(uso.tokens_total || 0);

    if (
      !atual.ultimoUsoEm ||
      getTimestamp(uso.created_at) > getTimestamp(atual.ultimoUsoEm)
    ) {
      atual.ultimoUsoEm = uso.created_at;
    }

    mapa.set(empresaId, atual);
  }

  return Array.from(mapa.values())
    .map((item) => ({
      ...item,
      nome: getNomeEmpresaPorId(empresasPorId, item.empresaId),
    }))
    .sort((a, b) => {
      if (ordenacao === "empresa") {
        return aplicarDirecaoOrdenacao(compararTexto(a.nome, b.nome), direcao);
      }
      if (ordenacao === "registros") {
        return aplicarDirecaoOrdenacao(a.registros - b.registros, direcao);
      }
      if (ordenacao === "input") {
        return aplicarDirecaoOrdenacao(a.tokensInput - b.tokensInput, direcao);
      }
      if (ordenacao === "output") {
        return aplicarDirecaoOrdenacao(a.tokensOutput - b.tokensOutput, direcao);
      }
      if (ordenacao === "ultima") {
        return aplicarDirecaoOrdenacao(
          getTimestamp(a.ultimoUsoEm) - getTimestamp(b.ultimoUsoEm),
          direcao
        );
      }
      return aplicarDirecaoOrdenacao(a.tokensTotal - b.tokensTotal, direcao);
    });
}

function montarIntegracoesMeta({
  integracoes,
  empresasPorId,
  tempoOnlinePorEmpresa,
  ordenacao,
  direcao,
}: {
  integracoes: IntegracaoWhatsappRow[];
  empresasPorId: Map<string, EmpresaRow>;
  tempoOnlinePorEmpresa: Map<string, number>;
  ordenacao: OrdenacaoRelatorios["integracoes"];
  direcao: DirecaoOrdenacao;
}) {
  return integracoes
    .map((integracao) => {
      const empresaId = integracao.empresa_id || "sem_empresa";
      const status = integracao.status || "pendente";
      const etapa = integracao.onboarding_etapa || "inicio";
      const onboardingStatus = integracao.onboarding_status || status;
      const ativo = integracaoMetaEstaAtiva(integracao);

      return {
        id: integracao.id,
        empresaId,
        empresaNome: getNomeEmpresaPorId(empresasPorId, empresaId),
        nomeConexao: integracao.nome_conexao?.trim() || "Sem nome",
        numero: integracao.numero?.trim() || "-",
        status,
        statusLabel: formatarStatusMeta(status),
        ativo,
        etapa,
        etapaLabel: formatarStatusMeta(etapa),
        onboardingStatus,
        onboardingStatusLabel: formatarStatusMeta(onboardingStatus),
        onboardingErro: integracao.onboarding_erro?.trim() || "",
        tempoOnlineMs: tempoOnlinePorEmpresa.get(empresaId) ?? 0,
        criadoEm: integracao.created_at,
        atualizadoEm: integracao.updated_at,
      };
    })
    .sort((a, b) => {
      if (ordenacao === "empresa") {
        return aplicarDirecaoOrdenacao(
          compararTexto(a.empresaNome, b.empresaNome),
          direcao
        );
      }
      if (ordenacao === "etapa") {
        return aplicarDirecaoOrdenacao(
          compararTexto(a.etapaLabel, b.etapaLabel),
          direcao
        );
      }
      if (ordenacao === "online") {
        return aplicarDirecaoOrdenacao(a.tempoOnlineMs - b.tempoOnlineMs, direcao);
      }
      if (ordenacao === "created") {
        return aplicarDirecaoOrdenacao(
          getTimestamp(a.criadoEm) - getTimestamp(b.criadoEm),
          direcao
        );
      }
      if (ordenacao === "updated") {
        return aplicarDirecaoOrdenacao(
          getTimestamp(a.atualizadoEm) - getTimestamp(b.atualizadoEm),
          direcao
        );
      }

      return aplicarDirecaoOrdenacao(
        getIntegracaoStatusRank(a) - getIntegracaoStatusRank(b) ||
          compararTexto(a.statusLabel, b.statusLabel) ||
          compararTexto(a.empresaNome, b.empresaNome),
        direcao
      );
    });
}

function montarUsuariosSessao({
  usuarios,
  empresasPorId,
  sessoesRecentes,
  ordenacao,
  direcao,
  referenciaAgora,
}: {
  usuarios: UsuarioRow[];
  empresasPorId: Map<string, EmpresaRow>;
  sessoesRecentes: Map<string, UsuarioSessaoRow>;
  ordenacao: OrdenacaoRelatorios["usuarios"];
  direcao: DirecaoOrdenacao;
  referenciaAgora: number;
}) {
  const agora = referenciaAgora;

  return usuarios
    .map((usuario) => {
      const sessao = sessoesRecentes.get(usuario.id);
      const ultimoAcesso = limitarIsoAoAgora(
        sessao?.last_seen_at || usuario.ultimo_acesso,
        agora
      );
      const logoutEm = limitarIsoAoAgora(sessao?.logout_at || null, agora);
      const loginEm = limitarIsoAoAgora(
        sessao?.login_at || usuario.ultimo_acesso,
        agora
      );
      const online =
        !logoutEm &&
        getTimestamp(ultimoAcesso) > 0 &&
        agora - getTimestamp(ultimoAcesso) <= ONLINE_TIMEOUT_MS;
      const inicioSessao = getTimestamp(loginEm);
      const fimSessao = online
        ? agora
        : getTimestamp(logoutEm) || getTimestamp(ultimoAcesso);
      const tempoOnlineMs =
        inicioSessao > 0 && fimSessao > inicioSessao
          ? fimSessao - inicioSessao
          : 0;

      return {
        id: usuario.id,
        nome: usuario.nome || "Usuario sem nome",
        email: usuario.email || "-",
        empresa: getNomeEmpresaPorId(empresasPorId, usuario.empresa_id),
        status: usuario.status || "sem_status",
        loginEm,
        ultimoAcesso,
        logoutEm,
        online,
        tempoOnlineMs,
      };
    })
    .sort((a, b) => {
      if (ordenacao === "nome") {
        return aplicarDirecaoOrdenacao(compararTexto(a.nome, b.nome), direcao);
      }
      if (ordenacao === "empresa") {
        return aplicarDirecaoOrdenacao(compararTexto(a.empresa, b.empresa), direcao);
      }
      if (ordenacao === "login") {
        return aplicarDirecaoOrdenacao(
          getTimestamp(a.loginEm) - getTimestamp(b.loginEm),
          direcao
        );
      }
      if (ordenacao === "logout") {
        return aplicarDirecaoOrdenacao(
          getTimestamp(a.logoutEm) - getTimestamp(b.logoutEm),
          direcao
        );
      }
      if (ordenacao === "ultimo") {
        return aplicarDirecaoOrdenacao(
          getTimestamp(a.ultimoAcesso) - getTimestamp(b.ultimoAcesso),
          direcao
        );
      }

      return aplicarDirecaoOrdenacao(
        Number(a.online) - Number(b.online) ||
          getTimestamp(a.ultimoAcesso) - getTimestamp(b.ultimoAcesso),
        direcao
      );
    })
    .slice(0, 60);
}

function ordenarEmpresasPlano({
  empresas,
  ordenacao,
  direcao,
}: {
  empresas: EmpresaRow[];
  ordenacao: OrdenacaoRelatorios["planos"];
  direcao: DirecaoOrdenacao;
}) {
  return [...empresas].sort((a, b) => {
    if (ordenacao === "plano") {
      return aplicarDirecaoOrdenacao(
        compararTexto(getPlanoOfertaResumo(a), getPlanoOfertaResumo(b)),
        direcao
      );
    }
    if (ordenacao === "status") {
      return aplicarDirecaoOrdenacao(
        compararTexto(getSituacaoPlanoLabel(a), getSituacaoPlanoLabel(b)) ||
          compararTexto(
            getStatusPlanoLabel(a.assinatura_status),
            getStatusPlanoLabel(b.assinatura_status)
          ),
        direcao
      );
    }
    if (ordenacao === "inicio") {
      return aplicarDirecaoOrdenacao(
        getTimestamp(a.assinatura_inicio_em || a.created_at) -
          getTimestamp(b.assinatura_inicio_em || b.created_at),
        direcao
      );
    }
    if (ordenacao === "renovacao") {
      return aplicarDirecaoOrdenacao(
        getTimestamp(a.assinatura_renovada_em) -
          getTimestamp(b.assinatura_renovada_em),
        direcao
      );
    }
    if (ordenacao === "expira") {
      return aplicarDirecaoOrdenacao(
        getTimestamp(a.assinatura_vencimento_em) -
          getTimestamp(b.assinatura_vencimento_em),
        direcao
      );
    }

    return aplicarDirecaoOrdenacao(
      compararTexto(getNomeEmpresa(a), getNomeEmpresa(b)),
      direcao
    );
  });
}

function KpiCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  value: string;
  detail: string;
  tone: "blue" | "green" | "amber" | "rose";
}) {
  return (
    <article className={`${styles.kpiCard} ${styles[`kpi${tone}`]}`}>
      <span className={styles.kpiIcon}>
        <Icon size={22} strokeWidth={2.2} />
      </span>
      <div>
        <span className={styles.kpiLabel}>{label}</span>
        <strong className={styles.kpiValue}>{value}</strong>
        <small className={styles.kpiDetail}>{detail}</small>
      </div>
    </article>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className={styles.emptyState}>{children}</div>;
}

function DashboardCards({
  dados,
  params,
  filtros,
}: {
  dados: RelatoriosDados;
  params: SearchParams;
  filtros: FiltrosRelatorio;
}) {
  const empresasRegulares = dados.empresas.filter(
    (empresa) => !empresaEstaInadimplente(empresa)
  ).length;
  const empresasInadimplentes = Math.max(0, dados.empresas.length - empresasRegulares);

  return (
    <section className={styles.reportDashboardGrid}>
      <DashboardReportCard
        icon={MessageSquare}
        eyebrow="Conversas"
        title="Total por periodo e empresa"
        value={formatarNumero(dados.totais.conversas)}
        detail={`${getConversaOrigemLabel(
          filtrosPorRelatorioPadrao.conversasOrigem
        )} - ${filtros.periodoLabel}`}
        href={hrefDetalhe(params, "conversas")}
        tone="blue"
      >
        <MiniBarChart
          emptyText="Nenhuma conversa encontrada."
          items={dados.conversasPorEmpresa.map((empresa) => ({
            id: empresa.empresaId,
            label: empresa.nome,
            value: empresa.total,
            detail: `${empresa.percentual}% de participacao`,
          }))}
        />
      </DashboardReportCard>

      <DashboardReportCard
        icon={BarChart3}
        eyebrow="Mensagens"
        title="Total mensagens por conversa"
        value={formatarNumero(dados.totais.mensagens)}
        detail="mensagens trocadas"
        href={hrefDetalhe(params, "mensagens")}
        tone="green"
      >
        <MiniBarChart
          emptyText="Nenhuma mensagem encontrada."
          tone="green"
          items={dados.mensagensPorConversa.map((item) => ({
            id: item.conversaId,
            label: item.empresaNome,
            value: item.total,
            detail: item.contato,
          }))}
        />
      </DashboardReportCard>

      <DashboardReportCard
        icon={ContactRound}
        eyebrow="Novos contatos"
        title="Por campanha"
        value={formatarNumero(dados.totais.contatosNovos)}
        detail={`${formatarNumero(
          dados.totais.contatosCampanhaNaoInformada
        )} ${CAMPANHA_NA_LABEL}`}
        href={hrefDetalhe(params, "contatos")}
        tone="rose"
      >
        <MiniBarChart
          emptyText="Nenhum contato novo encontrado."
          tone="rose"
          items={dados.contatosPorEmpresa.map((empresa) => ({
            id: empresa.empresaId,
            label: empresa.nome,
            value: empresa.total,
            segments: empresa.campanhas,
            detail: formatarCampanhasResumo(empresa.campanhas),
            detailTitle: formatarCampanhasResumo(empresa.campanhas, 20, false),
          }))}
        />
      </DashboardReportCard>

      <DashboardReportCard
        icon={ContactRound}
        eyebrow="Novos contatos"
        title="Por origem"
        value={formatarNumero(dados.totais.contatosOrigemTotal)}
        detail={`${formatarNumero(
          dados.totais.contatosOrigemManual
        )} Manual / ${formatarNumero(dados.totais.contatosOrigemNa)} ${ORIGEM_NA_LABEL}`}
        href={hrefDetalhe(params, "origens")}
        tone="green"
      >
        <MiniBarChart
          emptyText="Nenhum contato novo encontrado."
          tone="green"
          items={dados.contatosOrigemPorEmpresa.map((empresa) => ({
            id: empresa.empresaId,
            label: empresa.nome,
            value: empresa.total,
            segments: empresa.origens,
            detail: formatarOrigensResumo(empresa.origens),
            detailTitle: formatarOrigensResumo(empresa.origens, 20, false),
          }))}
        />
      </DashboardReportCard>

      <DashboardReportCard
        icon={BarChart3}
        eyebrow="Tokens IA"
        title="Consumo por empresa"
        value={formatarNumero(dados.totais.tokensTotal)}
        detail={`${formatarNumero(dados.totais.tokensInput)} entrada / ${formatarNumero(
          dados.totais.tokensOutput
        )} saida`}
        href={hrefDetalhe(params, "tokens")}
        tone="blue"
      >
        <MiniBarChart
          emptyText="Nenhum consumo de tokens encontrado."
          tone="blue"
          items={dados.tokensPorEmpresa.map((empresa) => ({
            id: empresa.empresaId,
            label: empresa.nome,
            value: empresa.tokensTotal,
            detail: `${formatarNumero(empresa.registros)} registros`,
          }))}
        />
      </DashboardReportCard>

      <DashboardReportCard
        icon={Send}
        eyebrow="Disparos"
        title="Total por empresa"
        value={formatarNumero(dados.totais.disparos)}
        detail="disparos registrados"
        href={hrefDetalhe(params, "disparos")}
        tone="amber"
      >
        <MiniBarChart
          emptyText="Nenhum disparo encontrado."
          tone="amber"
          items={dados.disparosPorEmpresa.map((empresa) => ({
            id: empresa.empresaId,
            label: empresa.nome,
            value: empresa.total,
            detail: `${formatarNumero(empresa.sucesso)} sucesso - ${formatarNumero(
              empresa.falha
            )} falha`,
          }))}
        />
      </DashboardReportCard>

      <DashboardReportCard
        icon={Users}
        eyebrow="Usuarios"
        title="On-line e off-line"
        value={formatarNumero(dados.totais.usuariosOnline)}
        detail={`Tempo online ${formatarDuracao(
          dados.totais.usuariosTempoOnlineMs
        )}`}
        href={hrefDetalhe(params, "usuarios")}
        tone="blue"
      >
        <SplitMeter
          esquerda={{
            label: "on-line",
            value: dados.totais.usuariosOnline,
            tone: "green",
          }}
          direita={{
            label: "off-line",
            value: dados.totais.usuariosOffline,
            tone: "gray",
          }}
        />
        <MiniBarChart
          emptyText="Nenhum usuario encontrado."
          items={dados.usuariosSessao.slice(0, DASHBOARD_LIMIT).map((usuario) => ({
            id: usuario.id,
            label: usuario.nome,
            labelSuffix: usuario.online ? "- ONLINE" : "- OFF LINE",
            value:
              usuario.tempoOnlineMs > 0
                ? Math.max(1, Math.round(usuario.tempoOnlineMs / 60000))
                : 0,
            valueLabel: formatarDuracao(usuario.tempoOnlineMs),
            detail: usuario.empresa,
          }))}
        />
      </DashboardReportCard>

      <DashboardReportCard
        icon={Building2}
        eyebrow="Planos"
        title="Renovacao e inadimplencia"
        value={formatarNumero(empresasRegulares)}
        detail={`${formatarNumero(empresasInadimplentes)} inadimplentes`}
        href={hrefDetalhe(params, "planos")}
        tone="green"
      >
        <SplitMeter
          esquerda={{
            label: "renovadas",
            value: empresasRegulares,
            tone: "green",
          }}
          direita={{
            label: "inadimplentes",
            value: empresasInadimplentes,
            tone: "rose",
          }}
        />
        <MiniBarChart
          emptyText="Nenhuma empresa encontrada."
          tone="green"
          items={dados.empresas.slice(0, DASHBOARD_LIMIT).map((empresa) => ({
            id: empresa.id,
            label: getNomeEmpresa(empresa),
            value: empresaEstaInadimplente(empresa) ? 0 : 1,
            detail: `${getSituacaoPlanoLabel(empresa)} - vence ${formatarData(
              empresa.assinatura_vencimento_em
            )}`,
          }))}
        />
      </DashboardReportCard>

      <DashboardReportCard
        icon={MessageSquare}
        eyebrow="Integrações Meta"
        title="Onboarding WhatsApp"
        value={formatarNumero(dados.totais.integracoesMetaAtivas)}
        detail={`${formatarNumero(dados.totais.integracoesMetaPendentes)} pendentes`}
        href={hrefDetalhe(params, "integracoes")}
        tone="green"
      >
        <SplitMeter
          esquerda={{
            label: "pendentes",
            value: dados.totais.integracoesMetaPendentes,
            tone: "amber",
          }}
          direita={{
            label: "ativas",
            value: dados.totais.integracoesMetaAtivas,
            tone: "green",
          }}
        />
        <MiniBarChart
          emptyText="Nenhuma integracao Meta encontrada."
          tone="green"
          items={dados.integracoesMeta.slice(0, DASHBOARD_LIMIT).map((integracao) => ({
            id: integracao.id,
            label: integracao.empresaNome,
            value:
              integracao.tempoOnlineMs > 0
                ? Math.max(1, Math.round(integracao.tempoOnlineMs / 60000))
                : 0,
            valueLabel: integracao.statusLabel,
            detail: `${integracao.etapaLabel} - ${formatarDuracao(
              integracao.tempoOnlineMs
            )} online`,
          }))}
        />
      </DashboardReportCard>
    </section>
  );
}

function RelatorioDetalheModal({
  detalhe,
  dados,
  params,
  filtros,
  filtrosRelatorio,
  ordenacao,
  empresasOpcoesPorId,
}: {
  detalhe: RelatorioDetalhe | "";
  dados: RelatoriosDados;
  params: SearchParams;
  filtros: FiltrosRelatorio;
  filtrosRelatorio: FiltrosPorRelatorio;
  ordenacao: OrdenacaoRelatorios;
  empresasOpcoesPorId: Map<string, EmpresaRow>;
}) {
  if (!detalhe) return null;

  if (detalhe === "conversas") {
    const paginacao = paginar(
      dados.conversasPorEmpresa,
      resolverPagina(params, "conversas")
    );

    return (
      <ModalShell
        params={params}
        title="Conversas por empresa"
        subtitle={`Total consolidado no periodo ${filtros.periodoLabel}, ${getConversaOrigemLabel(
          filtrosRelatorio.conversasOrigem
        )}.`}
      >
        <ReportFilters
          params={params}
          exclude={[
            "inicio",
            "fim",
            "atalho",
            "conv_empresa",
            "conv_usuario",
            "conv_origem",
            "pag_conversas",
          ]}
          clearUpdates={{
            conv_empresa: "",
            conv_usuario: "",
            conv_origem: "contato",
            pag_conversas: "1",
          }}
        >
          <div className={styles.reportFilterDates}>
            <PeriodoFilterFields params={params} filtros={filtros} />
          </div>

          <div className={styles.reportFilterSelectors}>
            <EmpresaSelect
              name="conv_empresa"
              value={filtrosRelatorio.conversasEmpresaId}
              empresas={dados.empresasOpcoes}
            />

            <UsuarioSelect
              name="conv_usuario"
              value={filtrosRelatorio.conversasUsuarioId}
              usuarios={dados.usuariosOpcoes}
              empresasPorId={empresasOpcoesPorId}
            />

            <ConversaOrigemSelect value={filtrosRelatorio.conversasOrigem} />
          </div>
        </ReportFilters>

        {paginacao.totalItens === 0 ? (
          <EmptyState>Nenhuma conversa encontrada para o periodo.</EmptyState>
        ) : (
          <>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="conversas"
                        campo="empresa"
                        atual={ordenacao.conversas}
                      >
                        Empresa
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="conversas"
                        campo="total"
                        atual={ordenacao.conversas}
                      >
                        Conversas
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="conversas"
                        campo="percentual"
                        atual={ordenacao.conversas}
                      >
                        Participacao
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="conversas"
                        campo="primeira"
                        atual={ordenacao.conversas}
                      >
                        Primeira
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="conversas"
                        campo="ultima"
                        atual={ordenacao.conversas}
                      >
                        Ultima
                      </SortHeader>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginacao.itens.map((empresa) => (
                    <tr key={empresa.empresaId}>
                      <td>
                        <strong>{empresa.nome}</strong>
                      </td>
                      <td>{formatarNumero(empresa.total)}</td>
                      <td>{empresa.percentual}%</td>
                      <td>{formatarDataHora(empresa.primeiraConversaEm)}</td>
                      <td>{formatarDataHora(empresa.ultimaConversaEm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination params={params} tabela="conversas" paginacao={paginacao} />
          </>
        )}
      </ModalShell>
    );
  }

  if (detalhe === "mensagens") {
    const paginacao = paginar(
      dados.mensagensPorConversa,
      resolverPagina(params, "mensagens")
    );

    return (
      <ModalShell
        params={params}
        title="Mensagens por conversa"
        subtitle={`Mensagens agrupadas no periodo ${filtros.periodoLabel}.`}
      >
        <ReportFilters
          params={params}
          exclude={[
            "inicio",
            "fim",
            "atalho",
            "msg_empresa",
            "msg_usuario",
            "pag_mensagens",
          ]}
          clearUpdates={{ msg_empresa: "", msg_usuario: "", pag_mensagens: "1" }}
        >
          <div className={styles.reportFilterDates}>
            <PeriodoFilterFields params={params} filtros={filtros} />
          </div>

          <div className={styles.reportFilterSelectors}>
            <EmpresaSelect
              name="msg_empresa"
              value={filtrosRelatorio.mensagensEmpresaId}
              empresas={dados.empresasOpcoes}
            />

            <UsuarioSelect
              name="msg_usuario"
              value={filtrosRelatorio.mensagensUsuarioId}
              usuarios={dados.usuariosOpcoes}
              empresasPorId={empresasOpcoesPorId}
            />
          </div>
        </ReportFilters>

        {paginacao.totalItens === 0 ? (
          <EmptyState>Nenhuma mensagem encontrada para o periodo.</EmptyState>
        ) : (
          <>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="mensagens"
                        campo="empresa"
                        atual={ordenacao.mensagens}
                      >
                        Empresa
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="mensagens"
                        campo="contato"
                        atual={ordenacao.mensagens}
                      >
                        Conversa
                      </SortHeader>
                    </th>
                    <th>Periodo</th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="mensagens"
                        campo="total"
                        atual={ordenacao.mensagens}
                      >
                        Total
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="mensagens"
                        campo="recebidas"
                        atual={ordenacao.mensagens}
                      >
                        Recebidas
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="mensagens"
                        campo="enviadas"
                        atual={ordenacao.mensagens}
                      >
                        Enviadas
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="mensagens"
                        campo="ultima"
                        atual={ordenacao.mensagens}
                      >
                        Ultima
                      </SortHeader>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginacao.itens.map((item) => (
                    <tr key={item.conversaId}>
                      <td>
                        <strong>{item.empresaNome}</strong>
                      </td>
                      <td>
                        <span className={styles.primaryText}>{item.contato}</span>
                        <span className={styles.secondaryText}>{item.conversaId}</span>
                      </td>
                      <td>{filtros.periodoLabel}</td>
                      <td>{formatarNumero(item.total)}</td>
                      <td>{formatarNumero(item.recebidas)}</td>
                      <td>{formatarNumero(item.enviadas)}</td>
                      <td>{formatarDataHora(item.ultimaMensagemEm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination params={params} tabela="mensagens" paginacao={paginacao} />
          </>
        )}
      </ModalShell>
    );
  }

  if (detalhe === "disparos") {
    const paginacao = paginar(
      dados.disparosPorEmpresa,
      resolverPagina(params, "disparos")
    );

    return (
      <ModalShell
        params={params}
        title="Disparos por empresa"
        subtitle={`Disparos feitos no periodo ${filtros.periodoLabel}.`}
      >
        <ReportFilters
          params={params}
          exclude={[
            "inicio",
            "fim",
            "atalho",
            "disp_empresa",
            "disp_usuario",
            "pag_disparos",
          ]}
          clearUpdates={{ disp_empresa: "", disp_usuario: "", pag_disparos: "1" }}
        >
          <div className={styles.reportFilterDates}>
            <PeriodoFilterFields params={params} filtros={filtros} />
          </div>

          <div className={styles.reportFilterSelectors}>
            <EmpresaSelect
              name="disp_empresa"
              value={filtrosRelatorio.disparosEmpresaId}
              empresas={dados.empresasOpcoes}
            />

            <UsuarioSelect
              name="disp_usuario"
              value={filtrosRelatorio.disparosUsuarioId}
              usuarios={dados.usuariosOpcoes}
              empresasPorId={empresasOpcoesPorId}
            />
          </div>
        </ReportFilters>

        {paginacao.totalItens === 0 ? (
          <EmptyState>Nenhum disparo encontrado para os filtros.</EmptyState>
        ) : (
          <>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="disparos"
                        campo="empresa"
                        atual={ordenacao.disparos}
                      >
                        Empresa
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="disparos"
                        campo="total"
                        atual={ordenacao.disparos}
                      >
                        Total
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="disparos"
                        campo="sucesso"
                        atual={ordenacao.disparos}
                      >
                        Sucesso
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="disparos"
                        campo="falha"
                        atual={ordenacao.disparos}
                      >
                        Falha
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="disparos"
                        campo="processando"
                        atual={ordenacao.disparos}
                      >
                        Processando
                      </SortHeader>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginacao.itens.map((empresa) => (
                    <tr key={empresa.empresaId}>
                      <td>
                        <strong>{empresa.nome}</strong>
                      </td>
                      <td>{formatarNumero(empresa.total)}</td>
                      <td>{formatarNumero(empresa.sucesso)}</td>
                      <td>{formatarNumero(empresa.falha)}</td>
                      <td>{formatarNumero(empresa.processando)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination params={params} tabela="disparos" paginacao={paginacao} />
          </>
        )}
      </ModalShell>
    );
  }

  if (detalhe === "contatos") {
    const paginacao = paginar(
      dados.contatosPorEmpresa,
      resolverPagina(params, "contatos")
    );

    return (
      <ModalShell
        params={params}
        title="Novos contatos por campanha"
        subtitle={`Total de novos contatos por campanha no periodo ${filtros.periodoLabel}. Campanha N/A representa Direto / Nao identificado.`}
      >
        <ReportFilters
          params={params}
          exclude={["inicio", "fim", "atalho", "cont_empresa", "pag_contatos"]}
          clearUpdates={{ cont_empresa: "", pag_contatos: "1" }}
        >
          <div className={styles.reportFilterDates}>
            <PeriodoFilterFields params={params} filtros={filtros} />
          </div>

          <div className={styles.reportFilterSelectors}>
            <EmpresaSelect
              name="cont_empresa"
              value={filtrosRelatorio.contatosEmpresaId}
              empresas={dados.empresasOpcoes}
            />
          </div>
        </ReportFilters>

        {paginacao.totalItens === 0 ? (
          <EmptyState>Nenhum contato novo encontrado.</EmptyState>
        ) : (
          <>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="contatos"
                        campo="empresa"
                        atual={ordenacao.contatos}
                      >
                        Empresa
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="contatos"
                        campo="total"
                        atual={ordenacao.contatos}
                      >
                        Total
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="contatos"
                        campo="campanha"
                        atual={ordenacao.contatos}
                      >
                        Campanha principal
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="contatos"
                        campo="na"
                        atual={ordenacao.contatos}
                      >
                        Campanha N/A
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="contatos"
                        campo="percentual"
                        atual={ordenacao.contatos}
                      >
                        % N/A
                      </SortHeader>
                    </th>
                    <th>Campanhas</th>
                  </tr>
                </thead>
                <tbody>
                  {paginacao.itens.map((empresa) => (
                    <tr key={empresa.empresaId}>
                      <td>
                        <strong>{empresa.nome}</strong>
                      </td>
                      <td>{formatarNumero(empresa.total)}</td>
                      <td>
                        <span className={styles.primaryText}>
                          <CampanhaNome nome={empresa.campanhaPrincipal} />
                        </span>
                        <span className={styles.secondaryText}>
                          {formatarNumero(empresa.campanhaPrincipalTotal)}
                        </span>
                      </td>
                      <td>{formatarNumero(empresa.campanhaNaoInformada)}</td>
                      <td>{empresa.percentualNaoInformada}%</td>
                      <td>
                        <CampaignBreakdown
                          campanhas={empresa.campanhas}
                          total={empresa.total}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination params={params} tabela="contatos" paginacao={paginacao} />
          </>
        )}
      </ModalShell>
    );
  }

  if (detalhe === "origens") {
    const paginacao = paginar(
      dados.contatosOrigemPorEmpresa,
      resolverPagina(params, "origens")
    );

    return (
      <ModalShell
        params={params}
        title="Novos contatos por origem"
        subtitle={`Quantidade de contatos por origem no periodo ${filtros.periodoLabel}. Origem vazia vira Manual e Direto / Nao identificado vira N/A.`}
      >
        <ReportFilters
          params={params}
          exclude={["inicio", "fim", "atalho", "origens_empresa", "pag_origens"]}
          clearUpdates={{ origens_empresa: "", pag_origens: "1" }}
        >
          <div className={styles.reportFilterDates}>
            <PeriodoFilterFields params={params} filtros={filtros} />
          </div>

          <div className={styles.reportFilterSelectors}>
            <EmpresaSelect
              name="origens_empresa"
              value={filtrosRelatorio.origensEmpresaId}
              empresas={dados.empresasOpcoes}
            />
          </div>
        </ReportFilters>

        {paginacao.totalItens === 0 ? (
          <EmptyState>Nenhum contato novo encontrado.</EmptyState>
        ) : (
          <>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="origens"
                        campo="empresa"
                        atual={ordenacao.origens}
                      >
                        Empresa
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="origens"
                        campo="total"
                        atual={ordenacao.origens}
                      >
                        Total
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="origens"
                        campo="origem"
                        atual={ordenacao.origens}
                      >
                        Origem principal
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="origens"
                        campo="manual"
                        atual={ordenacao.origens}
                      >
                        Manual
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="origens"
                        campo="na"
                        atual={ordenacao.origens}
                      >
                        N/A
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="origens"
                        campo="percentual"
                        atual={ordenacao.origens}
                      >
                        % N/A
                      </SortHeader>
                    </th>
                    <th>Origens</th>
                  </tr>
                </thead>
                <tbody>
                  {paginacao.itens.map((empresa) => (
                    <tr key={empresa.empresaId}>
                      <td>
                        <strong>{empresa.nome}</strong>
                      </td>
                      <td>{formatarNumero(empresa.total)}</td>
                      <td>
                        <span className={styles.primaryText}>
                          <OrigemNome nome={empresa.origemPrincipal} />
                        </span>
                        <span className={styles.secondaryText}>
                          {formatarNumero(empresa.origemPrincipalTotal)}
                        </span>
                      </td>
                      <td>
                        {formatarNumero(empresa.origemManual)}
                        <span className={styles.secondaryText}>
                          {empresa.percentualManual}%
                        </span>
                      </td>
                      <td>
                        {formatarNumero(empresa.origemNa)}
                        <span className={styles.secondaryText}>
                          {empresa.percentualNa}%
                        </span>
                      </td>
                      <td>{empresa.percentualNa}%</td>
                      <td>
                        <OrigemBreakdown
                          origens={empresa.origens}
                          total={empresa.total}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination params={params} tabela="origens" paginacao={paginacao} />
          </>
        )}
      </ModalShell>
    );
  }

  if (detalhe === "tokens") {
    const paginacao = paginar(
      dados.tokensPorEmpresa,
      resolverPagina(params, "tokens")
    );

    return (
      <ModalShell
        params={params}
        title="Consumo de tokens por empresa"
        subtitle={`Tokens de IA consumidos no periodo ${filtros.periodoLabel}.`}
      >
        <ReportFilters
          params={params}
          exclude={["inicio", "fim", "atalho", "tokens_empresa", "pag_tokens"]}
          clearUpdates={{ tokens_empresa: "", pag_tokens: "1" }}
        >
          <div className={styles.reportFilterDates}>
            <PeriodoFilterFields params={params} filtros={filtros} />
          </div>

          <div className={styles.reportFilterSelectors}>
            <EmpresaSelect
              name="tokens_empresa"
              value={filtrosRelatorio.tokensEmpresaId}
              empresas={dados.empresasOpcoes}
            />
          </div>
        </ReportFilters>

        {paginacao.totalItens === 0 ? (
          <EmptyState>Nenhum consumo de tokens encontrado.</EmptyState>
        ) : (
          <>
            <div className={styles.modalSummaryStrip}>
              <span>Total de tokens</span>
              <strong>{formatarNumero(dados.totais.tokensTotal)}</strong>
              <span>
                Entrada {formatarNumero(dados.totais.tokensInput)} / Saida{" "}
                {formatarNumero(dados.totais.tokensOutput)}
              </span>
            </div>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="tokens"
                        campo="empresa"
                        atual={ordenacao.tokens}
                      >
                        Empresa
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="tokens"
                        campo="registros"
                        atual={ordenacao.tokens}
                      >
                        Registros
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="tokens"
                        campo="input"
                        atual={ordenacao.tokens}
                      >
                        Entrada
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="tokens"
                        campo="output"
                        atual={ordenacao.tokens}
                      >
                        Saida
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="tokens"
                        campo="total"
                        atual={ordenacao.tokens}
                      >
                        Total
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="tokens"
                        campo="ultima"
                        atual={ordenacao.tokens}
                      >
                        Ultimo uso
                      </SortHeader>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginacao.itens.map((empresa) => (
                    <tr key={empresa.empresaId}>
                      <td>
                        <strong>{empresa.nome}</strong>
                        <span className={styles.secondaryText}>
                          {empresa.empresaId}
                        </span>
                      </td>
                      <td>{formatarNumero(empresa.registros)}</td>
                      <td>{formatarNumero(empresa.tokensInput)}</td>
                      <td>{formatarNumero(empresa.tokensOutput)}</td>
                      <td>
                        <strong>{formatarNumero(empresa.tokensTotal)}</strong>
                      </td>
                      <td>{formatarDataHora(empresa.ultimoUsoEm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination params={params} tabela="tokens" paginacao={paginacao} />
          </>
        )}
      </ModalShell>
    );
  }

  if (detalhe === "usuarios") {
    const paginacao = paginar(
      dados.usuariosSessao,
      resolverPagina(params, "usuarios")
    );

    return (
      <ModalShell
        params={params}
        title="Usuarios on-line e off-line"
        subtitle="Lista de presenca com login, ultimo sinal e logout."
      >
        <ReportFilters
          params={params}
          exclude={[
            "inicio",
            "fim",
            "atalho",
            "usuarios_empresa",
            "usuarios_usuario",
            "pag_usuarios",
          ]}
          clearUpdates={{
            usuarios_empresa: "",
            usuarios_usuario: "",
            pag_usuarios: "1",
          }}
        >
          <div className={styles.reportFilterDates}>
            <PeriodoFilterFields params={params} filtros={filtros} />
          </div>

          <div className={styles.reportFilterSelectors}>
            <EmpresaSelect
              name="usuarios_empresa"
              value={filtrosRelatorio.usuariosEmpresaId}
              empresas={dados.empresasOpcoes}
            />

            <UsuarioSelect
              name="usuarios_usuario"
              value={filtrosRelatorio.usuariosUsuarioId}
              usuarios={dados.usuariosOpcoes}
              empresasPorId={empresasOpcoesPorId}
            />
          </div>
        </ReportFilters>

        {paginacao.totalItens === 0 ? (
          <EmptyState>Nenhum usuario encontrado.</EmptyState>
        ) : (
          <>
            <div className={styles.modalSummaryStrip}>
              <span>Total de tempo online</span>
              <strong>{formatarDuracao(dados.totais.usuariosTempoOnlineMs)}</strong>
            </div>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="usuarios"
                        campo="presenca"
                        atual={ordenacao.usuarios}
                      >
                        Status
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="usuarios"
                        campo="nome"
                        atual={ordenacao.usuarios}
                      >
                        Usuario
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="usuarios"
                        campo="empresa"
                        atual={ordenacao.usuarios}
                      >
                        Empresa
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="usuarios"
                        campo="login"
                        atual={ordenacao.usuarios}
                      >
                        Login
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="usuarios"
                        campo="ultimo"
                        atual={ordenacao.usuarios}
                      >
                        Ultimo sinal
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="usuarios"
                        campo="logout"
                        atual={ordenacao.usuarios}
                      >
                        Logout
                      </SortHeader>
                    </th>
                    <th>Tempo online</th>
                  </tr>
                </thead>
                <tbody>
                  {paginacao.itens.map((usuario) => (
                    <tr key={usuario.id}>
                      <td>
                        <span
                          className={`${styles.statusBadge} ${getStatusUsuarioClass(
                            usuario
                          )}`}
                        >
                          {usuario.online ? "On-line" : "Off-line"}
                        </span>
                      </td>
                      <td>
                        <strong>
                          {usuario.nome}
                          {usuario.online ? (
                            <span className={styles.onlineSuffix}> - ONLINE</span>
                          ) : (
                            <span className={styles.offlineSuffix}> - OFF LINE</span>
                          )}
                        </strong>
                        <span className={styles.secondaryText}>{usuario.email}</span>
                      </td>
                      <td>{usuario.empresa}</td>
                      <td>{formatarDataHora(usuario.loginEm)}</td>
                      <td>{formatarDataHora(usuario.ultimoAcesso)}</td>
                      <td>{formatarDataHora(usuario.logoutEm)}</td>
                      <td>{formatarDuracao(usuario.tempoOnlineMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination params={params} tabela="usuarios" paginacao={paginacao} />
          </>
        )}
      </ModalShell>
    );
  }

  if (detalhe === "planos") {
    const paginacao = paginar(dados.empresas, resolverPagina(params, "planos"));

    return (
      <ModalShell
        params={params}
        title="Planos das empresas"
        subtitle="Empresas, plano, renovacao, inicio, expiracao e situacao financeira."
      >
        <ReportFilters
          params={params}
          exclude={[
            "inicio",
            "fim",
            "atalho",
            "planos_empresa",
            "planos_status",
            "pag_planos",
          ]}
          clearUpdates={{ planos_empresa: "", planos_status: "", pag_planos: "1" }}
        >
          <div className={styles.reportFilterDates}>
            <PeriodoFilterFields params={params} filtros={filtros} />
          </div>

          <div className={styles.reportFilterSelectors}>
            <EmpresaSelect
              name="planos_empresa"
              value={filtrosRelatorio.planosEmpresaId}
              empresas={dados.empresasOpcoes}
            />

            <PlanoStatusSelect value={filtrosRelatorio.planosStatus} />
          </div>
        </ReportFilters>

        {paginacao.totalItens === 0 ? (
          <EmptyState>Nenhuma empresa encontrada.</EmptyState>
        ) : (
          <>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="planos"
                        campo="empresa"
                        atual={ordenacao.planos}
                      >
                        Empresa
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="planos"
                        campo="plano"
                        atual={ordenacao.planos}
                      >
                        Plano
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="planos"
                        campo="status"
                        atual={ordenacao.planos}
                      >
                        Status
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="planos"
                        campo="renovacao"
                        atual={ordenacao.planos}
                      >
                        Renovacao
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="planos"
                        campo="inicio"
                        atual={ordenacao.planos}
                      >
                        Inicio
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="planos"
                        campo="expira"
                        atual={ordenacao.planos}
                      >
                        Expira em
                      </SortHeader>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginacao.itens.map((empresa) => (
                      <tr key={empresa.id}>
                        <td title={empresa.id}>
                          <strong>{getNomeEmpresa(empresa)}</strong>
                          <span className={styles.secondaryText}>
                            {getAdministradorPlanoLabel(empresa)}
                          </span>
                        </td>
                        <td>
                          <span
                            className={styles.primaryText}
                            title={getOfertaPlanoNomeCompleto(empresa)}
                          >
                            {getPlanoOfertaResumo(empresa)}
                          </span>
                        </td>
                        <td>
                          <span className={styles.statusWithDot}>
                            <span
                              className={`${styles.statusDot} ${getSituacaoPlanoDotClass(
                                empresa
                              )}`}
                            />
                            {getSituacaoPlanoLabel(empresa)}
                          </span>
                          <span className={styles.secondaryText}>
                            {getStatusPlanoLabel(empresa.assinatura_status)}
                          </span>
                        </td>
                        <td>{formatarData(empresa.assinatura_renovada_em)}</td>
                        <td>
                          {formatarData(
                            empresa.assinatura_inicio_em || empresa.created_at
                          )}
                        </td>
                        <td>{formatarData(empresa.assinatura_vencimento_em)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <Pagination params={params} tabela="planos" paginacao={paginacao} />
          </>
        )}
      </ModalShell>
    );
  }

  if (detalhe === "integracoes") {
    const paginacao = paginar(
      dados.integracoesMeta,
      resolverPagina(params, "integracoes")
    );

    return (
      <ModalShell
        params={params}
        title="Integrações Meta por empresa"
        subtitle={`Onboarding do WhatsApp Meta e tempo online por empresa no periodo ${filtros.periodoLabel}.`}
      >
        <ReportFilters
          params={params}
          exclude={[
            "inicio",
            "fim",
            "atalho",
            "int_empresa",
            "int_status",
            "pag_integracoes",
          ]}
          clearUpdates={{ int_empresa: "", int_status: "", pag_integracoes: "1" }}
        >
          <div className={styles.reportFilterDates}>
            <PeriodoFilterFields params={params} filtros={filtros} />
          </div>

          <div className={styles.reportFilterSelectors}>
            <EmpresaSelect
              name="int_empresa"
              value={filtrosRelatorio.integracoesEmpresaId}
              empresas={dados.empresasOpcoes}
            />

            <IntegracaoStatusSelect value={filtrosRelatorio.integracoesStatus} />
          </div>
        </ReportFilters>

        {paginacao.totalItens === 0 ? (
          <EmptyState>Nenhuma integracao Meta encontrada.</EmptyState>
        ) : (
          <>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="integracoes"
                        campo="status"
                        atual={ordenacao.integracoes}
                      >
                        Status
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="integracoes"
                        campo="empresa"
                        atual={ordenacao.integracoes}
                      >
                        Empresa
                      </SortHeader>
                    </th>
                    <th>Integração</th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="integracoes"
                        campo="etapa"
                        atual={ordenacao.integracoes}
                      >
                        Etapa onboarding
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="integracoes"
                        campo="created"
                        atual={ordenacao.integracoes}
                      >
                        Criada em
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="integracoes"
                        campo="updated"
                        atual={ordenacao.integracoes}
                      >
                        Atualizada em
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="integracoes"
                        campo="online"
                        atual={ordenacao.integracoes}
                      >
                        Tempo online
                      </SortHeader>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginacao.itens.map((integracao) => (
                    <tr key={integracao.id}>
                      <td>
                        <span
                          className={`${styles.statusBadge} ${
                            integracao.ativo
                              ? styles.statusOnline
                              : styles.statusWarning
                          }`}
                        >
                          {integracao.statusLabel}
                        </span>
                        <span className={styles.secondaryText}>
                          {integracao.onboardingStatusLabel}
                        </span>
                      </td>
                      <td>
                        <strong>{integracao.empresaNome}</strong>
                        <span className={styles.secondaryText}>
                          {integracao.empresaId}
                        </span>
                      </td>
                      <td>
                        <span className={styles.primaryText}>
                          {integracao.nomeConexao}
                        </span>
                        <span className={styles.secondaryText}>
                          {integracao.numero}
                        </span>
                      </td>
                      <td>
                        <span className={styles.primaryText}>
                          {integracao.etapaLabel}
                        </span>
                        {integracao.onboardingErro ? (
                          <span className={styles.secondaryText}>
                            {integracao.onboardingErro}
                          </span>
                        ) : null}
                      </td>
                      <td>{formatarDataHora(integracao.criadoEm)}</td>
                      <td>{formatarDataHora(integracao.atualizadoEm)}</td>
                      <td>{formatarDuracao(integracao.tempoOnlineMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              params={params}
              tabela="integracoes"
              paginacao={paginacao}
            />
          </>
        )}
      </ModalShell>
    );
  }

  return null;
}

export default async function RelatoriosInternosPage({
  searchParams,
}: RelatoriosPageProps) {
  const params = (await searchParams) ?? {};
  const filtros = resolverFiltros(params);
  const filtrosRelatorio = resolverFiltrosPorRelatorio(params);
  const ordenacao = resolverOrdenacao(params);
  const direcoes = resolverDirecoesOrdenacao(params, ordenacao);
  const detalheAberto = resolverDetalhe(params);
  const dados = await carregarRelatorios(
    filtros,
    filtrosPorRelatorioPadrao,
    ordenacao,
    direcoes
  );
  const dadosDetalhe = detalheAberto
    ? await carregarRelatorios(filtros, filtrosRelatorio, ordenacao, direcoes)
    : dados;
  const empresasOpcoesPorId = new Map(
    dados.empresasOpcoes.map((empresa) => [empresa.id, empresa])
  );
  const maxConversas = Math.max(
    1,
    ...dados.conversasPorEmpresa.map((item) => item.total)
  );
  const maxDisparos = Math.max(
    1,
    ...dados.disparosPorEmpresa.map((item) => item.total)
  );
  const maxContatosDiretos = Math.max(
    1,
    ...dados.contatosPorEmpresa.map((item) => item.total)
  );

  return (
    <>
      <Header
        title="Relatórios Internos"
        subtitle="Visão interna por empresa, período, conversas, mensagens, disparos, contatos, usuários e planos."
      />

      <main className={styles.pageContent}>
        <section className={styles.filterPanel}>
          <div className={styles.filterIntro}>
            <span className={styles.eyebrow}>Relatórios internos</span>
            <h2>Dashboard operacional</h2>
            <p>
              {formatarDataHora(filtros.inicioIso)} até{" "}
              {formatarDataHora(filtros.fimIso)} · período: {filtros.periodoLabel}
            </p>
          </div>

          <div className={styles.filterArea}>
            <form className={styles.filtersGrid} action="/relatorios-internos">
              <HiddenCurrentParams
                params={params}
                exclude={["inicio", "fim", "atalho"]}
              />

              <PeriodoFilterFields params={params} filtros={filtros} />

              <div className={styles.filterActions}>
                <FilterSubmitButton />

                <a href="/relatorios-internos" className={styles.secondaryButton}>
                  Limpar
                </a>
              </div>
            </form>
          </div>
        </section>

        <section className={styles.kpiGrid}>
          <KpiCard
            icon={MessageSquare}
            label="Conversas"
            value={formatarNumero(dados.totais.conversas)}
            detail={`${getConversaOrigemLabel(
              filtrosPorRelatorioPadrao.conversasOrigem
            )} no periodo`}
            tone="blue"
          />
          <KpiCard
            icon={BarChart3}
            label="Mensagens"
            value={formatarNumero(dados.totais.mensagens)}
            detail="trocadas no período selecionado"
            tone="green"
          />
          <KpiCard
            icon={Send}
            label="Disparos"
            value={formatarNumero(dados.totais.disparos)}
            detail="registrados por empresa"
            tone="amber"
          />
          <KpiCard
            icon={ContactRound}
            label="Novos contatos"
            value={formatarNumero(dados.totais.contatosNovos)}
            detail={`${formatarNumero(
              dados.totais.contatosCampanhaNaoInformada
            )} ${CAMPANHA_NA_LABEL}`}
            tone="rose"
          />
          <KpiCard
            icon={ContactRound}
            label="Origens"
            value={formatarNumero(dados.totais.contatosOrigemTotal)}
            detail={`${formatarNumero(
              dados.totais.contatosOrigemManual
            )} Manual / ${formatarNumero(dados.totais.contatosOrigemNa)} N/A`}
            tone="green"
          />
          <KpiCard
            icon={BarChart3}
            label="Tokens IA"
            value={formatarNumero(dados.totais.tokensTotal)}
            detail={`${formatarNumero(dados.totais.tokensRegistros)} registros`}
            tone="blue"
          />
          <KpiCard
            icon={UserCheck}
            label="On-line"
            value={formatarNumero(dados.totais.usuariosOnline)}
            detail={`Tempo online ${formatarDuracao(
              dados.totais.usuariosTempoOnlineMs
            )}`}
            tone="blue"
          />
          <KpiCard
            icon={Building2}
            label="Empresas"
            value={formatarNumero(dados.totais.empresas)}
            detail="com plano monitorado"
            tone="green"
          />
          <KpiCard
            icon={MessageSquare}
            label="Integrações Meta"
            value={formatarNumero(dados.totais.integracoesMetaAtivas)}
            detail={`${formatarNumero(
              dados.totais.integracoesMetaPendentes
            )} pendentes`}
            tone="green"
          />
        </section>

        <DashboardCards dados={dados} params={params} filtros={filtros} />

        {false ? (
          <>
        <section className={styles.dashboardGrid}>
          <article className={styles.panelLarge}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.eyebrow}>Conversas</span>
                <h2>Total por período e empresa</h2>
              </div>
              <MessageSquare size={21} strokeWidth={2.1} />
            </div>

            <ReportFilters
              params={params}
              exclude={["conv_empresa", "conv_usuario"]}
              clearUpdates={{ conv_empresa: "", conv_usuario: "" }}
            >
              <EmpresaSelect
                name="conv_empresa"
                value={filtrosRelatorio.conversasEmpresaId}
                empresas={dados.empresasOpcoes}
              />
              <UsuarioSelect
                name="conv_usuario"
                value={filtrosRelatorio.conversasUsuarioId}
                usuarios={dados.usuariosOpcoes}
                empresasPorId={empresasOpcoesPorId}
              />
            </ReportFilters>

            {dados.conversasPorEmpresa.length === 0 ? (
              <EmptyState>Nenhuma conversa encontrada para o período.</EmptyState>
            ) : (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>
                        <SortHeader
                          params={params}
                          tabela="conversas"
                          campo="empresa"
                          atual={ordenacao.conversas}
                        >
                          Empresa
                        </SortHeader>
                      </th>
                      <th>
                        <SortHeader
                          params={params}
                          tabela="conversas"
                          campo="total"
                          atual={ordenacao.conversas}
                        >
                          Conversas
                        </SortHeader>
                      </th>
                      <th>
                        <SortHeader
                          params={params}
                          tabela="conversas"
                          campo="percentual"
                          atual={ordenacao.conversas}
                        >
                          Participação
                        </SortHeader>
                      </th>
                      <th>
                        <SortHeader
                          params={params}
                          tabela="conversas"
                          campo="primeira"
                          atual={ordenacao.conversas}
                        >
                          Primeira
                        </SortHeader>
                      </th>
                      <th>
                        <SortHeader
                          params={params}
                          tabela="conversas"
                          campo="ultima"
                          atual={ordenacao.conversas}
                        >
                          Última
                        </SortHeader>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.conversasPorEmpresa.map((empresa) => (
                      <tr key={empresa.empresaId}>
                        <td>
                          <strong>{empresa.nome}</strong>
                        </td>
                        <td>
                          <span className={styles.metricCell}>
                            {formatarNumero(empresa.total)}
                          </span>
                          <div className={styles.tableTrack}>
                            <span
                              style={
                                {
                                  "--bar-width": larguraPercentual(
                                    empresa.total,
                                    maxConversas
                                  ),
                                } as CSSProperties
                              }
                            />
                          </div>
                        </td>
                        <td>{empresa.percentual}%</td>
                        <td>{formatarDataHora(empresa.primeiraConversaEm)}</td>
                        <td>{formatarDataHora(empresa.ultimaConversaEm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.eyebrow}>Disparos</span>
                <h2>Total por empresa</h2>
              </div>
              <Send size={21} strokeWidth={2.1} />
            </div>

            <ReportFilters
              params={params}
              exclude={["disp_empresa", "disp_usuario"]}
              clearUpdates={{ disp_empresa: "", disp_usuario: "" }}
            >
              <EmpresaSelect
                name="disp_empresa"
                value={filtrosRelatorio.disparosEmpresaId}
                empresas={dados.empresasOpcoes}
              />
              <UsuarioSelect
                name="disp_usuario"
                value={filtrosRelatorio.disparosUsuarioId}
                usuarios={dados.usuariosOpcoes}
                empresasPorId={empresasOpcoesPorId}
              />
            </ReportFilters>

            {dados.disparosPorEmpresa.length === 0 ? (
              <EmptyState>Nenhum disparo encontrado para os filtros.</EmptyState>
            ) : (
              <div className={styles.rankList}>
                {dados.disparosPorEmpresa.map((empresa) => (
                  <div key={empresa.empresaId} className={styles.rankItem}>
                    <div className={styles.rankTop}>
                      <strong>{empresa.nome}</strong>
                      <span>{formatarNumero(empresa.total)}</span>
                    </div>
                    <div className={styles.rankTrack}>
                      <span
                        style={
                          {
                            "--bar-width": larguraPercentual(
                              empresa.total,
                              maxDisparos
                            ),
                          } as CSSProperties
                        }
                      />
                    </div>
                    <div className={styles.rankMeta}>
                      <a
                        href={hrefSort(
                          params,
                          "disparos",
                          "sucesso",
                          getProximaDirecaoOrdenacao(
                            params,
                            "disparos",
                            "sucesso",
                            ordenacao.disparos
                          )
                        )}
                      >
                        {formatarNumero(empresa.sucesso)} sucesso
                      </a>
                      <a
                        href={hrefSort(
                          params,
                          "disparos",
                          "falha",
                          getProximaDirecaoOrdenacao(
                            params,
                            "disparos",
                            "falha",
                            ordenacao.disparos
                          )
                        )}
                      >
                        {formatarNumero(empresa.falha)} falha
                      </a>
                      <a
                        href={hrefSort(
                          params,
                          "disparos",
                          "processando",
                          getProximaDirecaoOrdenacao(
                            params,
                            "disparos",
                            "processando",
                            ordenacao.disparos
                          )
                        )}
                      >
                        {formatarNumero(empresa.processando)} processando
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>

        <section className={styles.panelWide}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Mensagens</span>
              <h2>Total por conversa, empresa e período</h2>
            </div>
            <BarChart3 size={21} strokeWidth={2.1} />
          </div>

          <ReportFilters
            params={params}
            exclude={["msg_empresa", "msg_usuario"]}
            clearUpdates={{ msg_empresa: "", msg_usuario: "" }}
          >
            <EmpresaSelect
              name="msg_empresa"
              value={filtrosRelatorio.mensagensEmpresaId}
              empresas={dados.empresasOpcoes}
            />
            <UsuarioSelect
              name="msg_usuario"
              value={filtrosRelatorio.mensagensUsuarioId}
              usuarios={dados.usuariosOpcoes}
              empresasPorId={empresasOpcoesPorId}
            />
          </ReportFilters>

          {dados.mensagensPorConversa.length === 0 ? (
            <EmptyState>Nenhuma mensagem encontrada para o período.</EmptyState>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="mensagens"
                        campo="empresa"
                        atual={ordenacao.mensagens}
                      >
                        Empresa
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="mensagens"
                        campo="contato"
                        atual={ordenacao.mensagens}
                      >
                        Conversa
                      </SortHeader>
                    </th>
                    <th>Período</th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="mensagens"
                        campo="total"
                        atual={ordenacao.mensagens}
                      >
                        Total
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="mensagens"
                        campo="recebidas"
                        atual={ordenacao.mensagens}
                      >
                        Recebidas
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="mensagens"
                        campo="enviadas"
                        atual={ordenacao.mensagens}
                      >
                        Enviadas
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="mensagens"
                        campo="ultima"
                        atual={ordenacao.mensagens}
                      >
                        Última
                      </SortHeader>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dados.mensagensPorConversa.map((item) => (
                    <tr key={item.conversaId}>
                      <td>
                        <strong>{item.empresaNome}</strong>
                      </td>
                      <td>
                        <span className={styles.primaryText}>{item.contato}</span>
                        <span className={styles.secondaryText}>{item.conversaId}</span>
                      </td>
                      <td>{filtros.periodoLabel}</td>
                      <td>{formatarNumero(item.total)}</td>
                      <td>{formatarNumero(item.recebidas)}</td>
                      <td>{formatarNumero(item.enviadas)}</td>
                      <td>{formatarDataHora(item.ultimaMensagemEm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={styles.dashboardGrid}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.eyebrow}>Novos contatos</span>
                <h2>Origem direto / não identificado</h2>
              </div>
              <ContactRound size={21} strokeWidth={2.1} />
            </div>

            <ReportFilters
              params={params}
              exclude={["cont_empresa"]}
              clearUpdates={{ cont_empresa: "" }}
            >
              <EmpresaSelect
                name="cont_empresa"
                value={filtrosRelatorio.contatosEmpresaId}
                empresas={dados.empresasOpcoes}
              />
            </ReportFilters>

            {dados.contatosPorEmpresa.length === 0 ? (
              <EmptyState>Nenhum contato novo encontrado.</EmptyState>
            ) : (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>
                        <SortHeader
                          params={params}
                          tabela="contatos"
                          campo="empresa"
                          atual={ordenacao.contatos}
                        >
                          Empresa
                        </SortHeader>
                      </th>
                      <th>
                        <SortHeader
                          params={params}
                          tabela="contatos"
                          campo="na"
                          atual={ordenacao.contatos}
                        >
                          Campanha N/A
                        </SortHeader>
                      </th>
                      <th>
                        <SortHeader
                          params={params}
                          tabela="contatos"
                          campo="total"
                          atual={ordenacao.contatos}
                        >
                          Total
                        </SortHeader>
                      </th>
                      <th>
                        <SortHeader
                          params={params}
                          tabela="contatos"
                          campo="percentual"
                          atual={ordenacao.contatos}
                        >
                          %
                        </SortHeader>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.contatosPorEmpresa.map((empresa) => (
                      <tr key={empresa.empresaId}>
                        <td>
                          <strong>{empresa.nome}</strong>
                        </td>
                        <td>
                          <span className={styles.metricCell}>
                            {formatarNumero(empresa.diretoNaoIdentificado)}
                          </span>
                          <div className={`${styles.tableTrack} ${styles.contactTrack}`}>
                            <span
                              style={
                                {
                                  "--bar-width": larguraPercentual(
                                    empresa.diretoNaoIdentificado,
                                    maxContatosDiretos
                                  ),
                                } as CSSProperties
                              }
                            />
                          </div>
                        </td>
                        <td>{formatarNumero(empresa.total)}</td>
                        <td>{empresa.percentualDireto}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.eyebrow}>Usuários</span>
                <h2>On-line e off-line</h2>
              </div>
              <Users size={21} strokeWidth={2.1} />
            </div>

            <ReportFilters
              params={params}
              exclude={["usuarios_empresa", "usuarios_usuario"]}
              clearUpdates={{ usuarios_empresa: "", usuarios_usuario: "" }}
            >
              <EmpresaSelect
                name="usuarios_empresa"
                value={filtrosRelatorio.usuariosEmpresaId}
                empresas={dados.empresasOpcoes}
              />
              <UsuarioSelect
                name="usuarios_usuario"
                value={filtrosRelatorio.usuariosUsuarioId}
                usuarios={dados.usuariosOpcoes}
                empresasPorId={empresasOpcoesPorId}
              />
            </ReportFilters>

            {dados.usuariosSessao.length === 0 ? (
              <EmptyState>Nenhum usuário encontrado.</EmptyState>
            ) : (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>
                        <SortHeader
                          params={params}
                          tabela="usuarios"
                          campo="presenca"
                          atual={ordenacao.usuarios}
                        >
                          Status
                        </SortHeader>
                      </th>
                      <th>
                        <SortHeader
                          params={params}
                          tabela="usuarios"
                          campo="nome"
                          atual={ordenacao.usuarios}
                        >
                          Usuário
                        </SortHeader>
                      </th>
                      <th>
                        <SortHeader
                          params={params}
                          tabela="usuarios"
                          campo="empresa"
                          atual={ordenacao.usuarios}
                        >
                          Empresa
                        </SortHeader>
                      </th>
                      <th>
                        <SortHeader
                          params={params}
                          tabela="usuarios"
                          campo="login"
                          atual={ordenacao.usuarios}
                        >
                          Login
                        </SortHeader>
                      </th>
                      <th>
                        <SortHeader
                          params={params}
                          tabela="usuarios"
                          campo="ultimo"
                          atual={ordenacao.usuarios}
                        >
                          Último sinal
                        </SortHeader>
                      </th>
                      <th>
                        <SortHeader
                          params={params}
                          tabela="usuarios"
                          campo="logout"
                          atual={ordenacao.usuarios}
                        >
                          Logout
                        </SortHeader>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.usuariosSessao.map((usuario) => (
                      <tr key={usuario.id}>
                        <td>
                          <span
                            className={`${styles.statusBadge} ${getStatusUsuarioClass(
                              usuario
                            )}`}
                          >
                            {usuario.online ? "On-line" : "Off-line"}
                          </span>
                        </td>
                        <td>
                          <strong>{usuario.nome}</strong>
                          <span className={styles.secondaryText}>{usuario.email}</span>
                        </td>
                        <td>{usuario.empresa}</td>
                        <td>{formatarDataHora(usuario.loginEm)}</td>
                        <td>{formatarDataHora(usuario.ultimoAcesso)}</td>
                        <td>{formatarDataHora(usuario.logoutEm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </section>

        <section className={styles.panelWide}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Planos</span>
              <h2>Empresas, plano, início e expiração</h2>
            </div>
            <Building2 size={21} strokeWidth={2.1} />
          </div>

          <ReportFilters
            params={params}
            exclude={["planos_empresa", "planos_status"]}
            clearUpdates={{ planos_empresa: "", planos_status: "" }}
          >
            <EmpresaSelect
              name="planos_empresa"
              value={filtrosRelatorio.planosEmpresaId}
              empresas={dados.empresasOpcoes}
            />
            <PlanoStatusSelect value={filtrosRelatorio.planosStatus} />
          </ReportFilters>

          {dados.empresas.length === 0 ? (
            <EmptyState>Nenhuma empresa encontrada.</EmptyState>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="planos"
                        campo="empresa"
                        atual={ordenacao.planos}
                      >
                        Empresa
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="planos"
                        campo="plano"
                        atual={ordenacao.planos}
                      >
                        Plano
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="planos"
                        campo="status"
                        atual={ordenacao.planos}
                      >
                        Status
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="planos"
                        campo="renovacao"
                        atual={ordenacao.planos}
                      >
                        Renovacao
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="planos"
                        campo="inicio"
                        atual={ordenacao.planos}
                      >
                        Início
                      </SortHeader>
                    </th>
                    <th>
                      <SortHeader
                        params={params}
                        tabela="planos"
                        campo="expira"
                        atual={ordenacao.planos}
                      >
                        Expira em
                      </SortHeader>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dados.empresas.map((empresa) => (
                      <tr key={empresa.id}>
                        <td title={empresa.id}>
                          <strong>{getNomeEmpresa(empresa)}</strong>
                          <span className={styles.secondaryText}>
                            Administrador: {getAdministradorPlanoLabel(empresa)}
                          </span>
                        </td>
                        <td>
                          <span
                            className={styles.primaryText}
                            title={getOfertaPlanoNomeCompleto(empresa)}
                          >
                            {getPlanoOfertaResumo(empresa)}
                          </span>
                        </td>
                        <td>
                          <span className={styles.statusWithDot}>
                            <span
                              className={`${styles.statusDot} ${getSituacaoPlanoDotClass(
                                empresa
                              )}`}
                            />
                            {getSituacaoPlanoLabel(empresa)}
                          </span>
                          <span className={styles.secondaryText}>
                            {getStatusPlanoLabel(empresa.assinatura_status)}
                          </span>
                        </td>
                        <td>
                          {formatarData(empresa.assinatura_renovada_em)}
                        </td>
                        <td>
                          {formatarData(
                            empresa.assinatura_inicio_em || empresa.created_at
                          )}
                        </td>
                        <td>{formatarData(empresa.assinatura_vencimento_em)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
          </>
        ) : null}

        <RelatorioDetalheModal
          detalhe={detalheAberto}
          dados={dadosDetalhe}
          params={params}
          filtros={filtros}
          filtrosRelatorio={filtrosRelatorio}
          ordenacao={ordenacao}
          empresasOpcoesPorId={empresasOpcoesPorId}
        />
      </main>
    </>
  );
}
