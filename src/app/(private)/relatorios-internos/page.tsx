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
const MAX_USUARIOS = 1500;
const MAX_SESSOES = 5000;
const ONLINE_TIMEOUT_MS = 5 * 60 * 1000;
const MODAL_PAGE_SIZE = 10;
const DASHBOARD_LIMIT = 5;

type SearchParams = Record<string, string | string[] | undefined>;
type PeriodoAtalho = "1h" | "24h" | "3d" | "7d" | "30d";
type SortTabela = "conversas" | "mensagens" | "disparos" | "contatos" | "usuarios" | "planos";
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
  mensagensEmpresaId: string;
  mensagensUsuarioId: string;
  disparosEmpresaId: string;
  disparosUsuarioId: string;
  contatosEmpresaId: string;
  usuariosEmpresaId: string;
  usuariosUsuarioId: string;
  planosEmpresaId: string;
  planosStatus: "" | "regular" | "inadimplente";
};

type OrdenacaoRelatorios = {
  conversas: "empresa" | "total" | "percentual" | "primeira" | "ultima";
  mensagens: "empresa" | "contato" | "total" | "recebidas" | "enviadas" | "ultima";
  disparos: "empresa" | "total" | "sucesso" | "falha" | "processando";
  contatos: "empresa" | "direto" | "total" | "percentual" | "outras";
  usuarios: "presenca" | "nome" | "empresa" | "login" | "ultimo" | "logout";
  planos: "empresa" | "plano" | "status" | "inicio" | "renovacao" | "expira";
};

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

type ContatoRelacao = {
  id?: string | null;
  nome?: string | null;
  telefone?: string | null;
  empresa?: string | null;
};

type ConversaRow = {
  id: string;
  empresa_id: string | null;
  contato_id: string | null;
  responsavel_id: string | null;
  created_at: string;
  status: string | null;
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

type DisparoRow = {
  id: string;
  empresa_id: string | null;
  status: string | null;
  template_nome: string | null;
  usuario_id: string | null;
  created_at: string;
};

type ContatoRow = {
  id: string;
  empresa_id: string | null;
  origem: string | null;
  rastreamento_origem_id: string | null;
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

type ContatosEmpresaResumo = {
  empresaId: string;
  nome: string;
  total: number;
  diretoNaoIdentificado: number;
  outrasOrigens: number;
  percentualDireto: number;
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

type RelatoriosDados = {
  empresasOpcoes: EmpresaRow[];
  usuariosOpcoes: UsuarioOpcao[];
  empresas: EmpresaRow[];
  conversasPorEmpresa: ConversasEmpresaResumo[];
  mensagensPorConversa: MensagensConversaResumo[];
  disparosPorEmpresa: DisparosEmpresaResumo[];
  contatosPorEmpresa: ContatosEmpresaResumo[];
  usuariosSessao: UsuarioSessaoResumo[];
  totais: {
    conversas: number;
    mensagens: number;
    disparos: number;
    contatosDiretoNaoIdentificado: number;
    usuarios: number;
    usuariosOnline: number;
    usuariosOffline: number;
    usuariosTempoOnlineMs: number;
    empresas: number;
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
  contatos: "direto",
  usuarios: "presenca",
  planos: "empresa",
};

const relatoriosDetalhe: RelatorioDetalhe[] = [
  "conversas",
  "mensagens",
  "disparos",
  "contatos",
  "usuarios",
  "planos",
];

const filtrosPorRelatorioPadrao: FiltrosPorRelatorio = {
  conversasEmpresaId: "",
  conversasUsuarioId: "",
  mensagensEmpresaId: "",
  mensagensUsuarioId: "",
  disparosEmpresaId: "",
  disparosUsuarioId: "",
  contatosEmpresaId: "",
  usuariosEmpresaId: "",
  usuariosUsuarioId: "",
  planosEmpresaId: "",
  planosStatus: "",
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

  return {
    conversasEmpresaId: getParametro(params, "conv_empresa"),
    conversasUsuarioId: getParametro(params, "conv_usuario"),
    mensagensEmpresaId: getParametro(params, "msg_empresa"),
    mensagensUsuarioId: getParametro(params, "msg_usuario"),
    disparosEmpresaId: getParametro(params, "disp_empresa"),
    disparosUsuarioId: getParametro(params, "disp_usuario"),
    contatosEmpresaId: getParametro(params, "cont_empresa"),
    usuariosEmpresaId: getParametro(params, "usuarios_empresa"),
    usuariosUsuarioId: getParametro(params, "usuarios_usuario"),
    planosEmpresaId: getParametro(params, "planos_empresa"),
    planosStatus:
      planosStatus === "regular" || planosStatus === "inadimplente"
        ? planosStatus
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
    usuarios:
      (getParametro(params, "sort_usuarios") as OrdenacaoRelatorios["usuarios"]) ||
      ordenacaoPadrao.usuarios,
    planos:
      (getParametro(params, "sort_planos") as OrdenacaoRelatorios["planos"]) ||
      ordenacaoPadrao.planos,
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
  campo: OrdenacaoRelatorios[SortTabela]
) {
  return hrefComParams(params, {
    [`sort_${tabela}`]: campo,
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
    pag_usuarios: "",
    pag_planos: "",
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
  atual: string;
  children: React.ReactNode;
}) {
  const ativo = atual === campo;

  return (
    <a
      className={`${styles.sortLink} ${ativo ? styles.sortLinkActive : ""}`}
      href={hrefSort(params, tabela, campo)}
    >
      {children}
      <span>{ativo ? "↓" : "↕"}</span>
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
          <div className={`${styles.miniBarTrack} ${styles[`miniBar${tone}`]}`}>
            <span
              style={
                {
                  "--bar-width": larguraPercentual(item.value, maximo),
                } as CSSProperties
              }
            />
          </div>
          {item.detail ? <small>{item.detail}</small> : null}
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

function normalizarTexto(valor: string | null | undefined) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function contatoEhDiretoNaoIdentificado(contato: ContatoRow) {
  const origem = normalizarTexto(contato.origem);

  if (!origem) return false;

  return (
    origem === "direto" ||
    origem === "nao identificado" ||
    origem === "direto / nao identificado" ||
    origem.startsWith("direto /")
  );
}

function getStatusPlanoLabel(status: string | null | undefined) {
  if (status === "bloqueada") return "Bloqueado";
  if (status === "vencida") return "Vencido";
  if (status === "ativa") return "Ativo";
  return status || "Nao definido";
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

function getTimestamp(valor: string | null | undefined) {
  if (!valor) return 0;
  const data = new Date(valor).getTime();
  return Number.isNaN(data) ? 0 : data;
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

async function carregarRelatorios(
  filtros: FiltrosRelatorio,
  filtrosRelatorio: FiltrosPorRelatorio,
  ordenacao: OrdenacaoRelatorios
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
        contatos (
          id,
          nome,
          telefone,
          empresa
        )
      `,
      { count: "exact" }
    )
    .gte("created_at", filtros.inicioIso)
    .lte("created_at", filtros.fimIso)
    .order("created_at", { ascending: true })
    .limit(MAX_CONVERSAS);

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
    .select("id, empresa_id, origem, rastreamento_origem_id, created_at", {
      count: "exact",
    })
    .gte("created_at", filtros.inicioIso)
    .lte("created_at", filtros.fimIso)
    .order("created_at", { ascending: false })
    .limit(MAX_CONTATOS);

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
    empresasResult,
    conversasResult,
    mensagensResult,
    disparosResult,
    contatosResult,
    usuariosResult,
  ] = await Promise.all([
    empresasOpcoesQuery,
    usuariosOpcoesQuery,
    empresasQuery,
    conversasQuery,
    mensagensQuery,
    disparosQuery,
    contatosQuery,
    usuariosQuery,
  ]);

  if (empresasOpcoesResult.error) throw new Error(empresasOpcoesResult.error.message);
  if (usuariosOpcoesResult.error) throw new Error(usuariosOpcoesResult.error.message);
  if (empresasResult.error) throw new Error(empresasResult.error.message);
  if (conversasResult.error) throw new Error(conversasResult.error.message);
  if (mensagensResult.error) throw new Error(mensagensResult.error.message);
  if (disparosResult.error) throw new Error(disparosResult.error.message);
  if (contatosResult.error) throw new Error(contatosResult.error.message);
  if (usuariosResult.error) throw new Error(usuariosResult.error.message);

  const empresasOpcoes = (empresasOpcoesResult.data ?? []) as EmpresaRow[];
  const usuariosOpcoes = (usuariosOpcoesResult.data ?? []) as UsuarioOpcao[];
  const empresas = ((empresasResult.data ?? []) as EmpresaRow[]).filter((empresa) => {
    if (filtrosRelatorio.planosStatus === "regular") {
      return !empresaEstaInadimplente(empresa);
    }

    if (filtrosRelatorio.planosStatus === "inadimplente") {
      return empresaEstaInadimplente(empresa);
    }

    return true;
  });
  const empresasPorId = new Map(
    empresasOpcoes.map((empresa) => [empresa.id, empresa])
  );

  const conversas = (conversasResult.data ?? []) as ConversaRow[];
  const mensagens = (mensagensResult.data ?? []) as MensagemRow[];
  const disparos = (disparosResult.data ?? []) as DisparoRow[];
  const contatos = (contatosResult.data ?? []) as ContatoRow[];
  const usuarios = (usuariosResult.data ?? []) as UsuarioRow[];
  const conversasPorId = new Map(conversas.map((conversa) => [conversa.id, conversa]));

  const mensagensTop = montarMensagensPorConversa({
    mensagens,
    conversasPorId,
    empresasPorId,
    ordenacao: ordenacao.mensagens,
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
          contatos (
            id,
            nome,
            telefone,
            empresa
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

  const sessoesRecentes = await carregarSessoesRecentes(
    usuarios.map((usuario) => usuario.id)
  );

  const usuariosSessao = montarUsuariosSessao({
    usuarios,
    empresasPorId,
    sessoesRecentes,
    ordenacao: ordenacao.usuarios,
    referenciaAgora: Math.min(
      Date.now(),
      getTimestamp(filtros.fimIso) || Date.now()
    ),
  });

  const conversasPorEmpresa = montarConversasPorEmpresa({
    conversas,
    empresasPorId,
    ordenacao: ordenacao.conversas,
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
  });
  const contatosPorEmpresa = montarContatosPorEmpresa({
    contatos,
    empresasPorId,
    ordenacao: ordenacao.contatos,
  });
  const empresasOrdenadas = ordenarEmpresasPlano({
    empresas,
    ordenacao: ordenacao.planos,
  });
  const contatosDiretoNaoIdentificado = contatos.filter(
    contatoEhDiretoNaoIdentificado
  ).length;
  const usuariosOnline = usuariosSessao.filter((usuario) => usuario.online).length;
  const usuariosTempoOnlineMs = usuariosSessao.reduce(
    (total, usuario) => total + usuario.tempoOnlineMs,
    0
  );

  return {
    empresasOpcoes,
    usuariosOpcoes,
    empresas: empresasOrdenadas,
    conversasPorEmpresa,
    mensagensPorConversa,
    disparosPorEmpresa,
    contatosPorEmpresa,
    usuariosSessao,
    totais: {
      conversas: conversasResult.count ?? conversas.length,
      mensagens: mensagensResult.count ?? mensagens.length,
      disparos: disparosResult.count ?? disparos.length,
      contatosDiretoNaoIdentificado,
      usuarios: usuariosResult.count ?? usuarios.length,
      usuariosOnline,
      usuariosOffline: Math.max(0, usuarios.length - usuariosOnline),
      usuariosTempoOnlineMs,
      empresas: empresasOrdenadas.length,
    },
  };
}

function montarConversasPorEmpresa({
  conversas,
  empresasPorId,
  ordenacao,
}: {
  conversas: ConversaRow[];
  empresasPorId: Map<string, EmpresaRow>;
  ordenacao: OrdenacaoRelatorios["conversas"];
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
      if (ordenacao === "empresa") return compararTexto(a.nome, b.nome);
      if (ordenacao === "percentual") return b.percentual - a.percentual;
      if (ordenacao === "primeira") {
        return getTimestamp(a.primeiraConversaEm) - getTimestamp(b.primeiraConversaEm);
      }
      if (ordenacao === "ultima") {
        return getTimestamp(b.ultimaConversaEm) - getTimestamp(a.ultimaConversaEm);
      }
      return b.total - a.total;
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
}: {
  mensagens: MensagemRow[];
  conversasPorId: Map<string, ConversaRow>;
  empresasPorId: Map<string, EmpresaRow>;
  ordenacao: OrdenacaoRelatorios["mensagens"];
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
      if (ordenacao === "empresa") return compararTexto(a.empresaNome, b.empresaNome);
      if (ordenacao === "contato") return compararTexto(a.contato, b.contato);
      if (ordenacao === "recebidas") return b.recebidas - a.recebidas;
      if (ordenacao === "enviadas") return b.enviadas - a.enviadas;
      if (ordenacao === "ultima") {
        return getTimestamp(b.ultimaMensagemEm) - getTimestamp(a.ultimaMensagemEm);
      }
      return b.total - a.total;
    })
    .slice(0, 40);
}

function montarDisparosPorEmpresa({
  disparos,
  empresasPorId,
  ordenacao,
}: {
  disparos: DisparoRow[];
  empresasPorId: Map<string, EmpresaRow>;
  ordenacao: OrdenacaoRelatorios["disparos"];
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
      if (ordenacao === "empresa") return compararTexto(a.nome, b.nome);
      if (ordenacao === "sucesso") return b.sucesso - a.sucesso;
      if (ordenacao === "falha") return b.falha - a.falha;
      if (ordenacao === "processando") return b.processando - a.processando;
      return b.total - a.total;
    })
    .slice(0, 15);
}

function montarContatosPorEmpresa({
  contatos,
  empresasPorId,
  ordenacao,
}: {
  contatos: ContatoRow[];
  empresasPorId: Map<string, EmpresaRow>;
  ordenacao: OrdenacaoRelatorios["contatos"];
}) {
  const mapa = new Map<
    string,
    {
      empresaId: string;
      total: number;
      diretoNaoIdentificado: number;
      outrasOrigens: number;
    }
  >();

  for (const contato of contatos) {
    const empresaId = contato.empresa_id || "sem_empresa";
    const atual =
      mapa.get(empresaId) ??
      {
        empresaId,
        total: 0,
        diretoNaoIdentificado: 0,
        outrasOrigens: 0,
      };

    atual.total += 1;

    if (contatoEhDiretoNaoIdentificado(contato)) {
      atual.diretoNaoIdentificado += 1;
    } else {
      atual.outrasOrigens += 1;
    }

    mapa.set(empresaId, atual);
  }

  return Array.from(mapa.values())
    .map((item) => ({
      ...item,
      nome: getNomeEmpresaPorId(empresasPorId, item.empresaId),
      percentualDireto:
        item.total > 0 ? Math.round((item.diretoNaoIdentificado / item.total) * 100) : 0,
    }))
    .sort((a, b) => {
      if (ordenacao === "empresa") return compararTexto(a.nome, b.nome);
      if (ordenacao === "total") return b.total - a.total;
      if (ordenacao === "percentual") return b.percentualDireto - a.percentualDireto;
      if (ordenacao === "outras") return b.outrasOrigens - a.outrasOrigens;
      return b.diretoNaoIdentificado - a.diretoNaoIdentificado;
    })
    .slice(0, 15);
}

function montarUsuariosSessao({
  usuarios,
  empresasPorId,
  sessoesRecentes,
  ordenacao,
  referenciaAgora,
}: {
  usuarios: UsuarioRow[];
  empresasPorId: Map<string, EmpresaRow>;
  sessoesRecentes: Map<string, UsuarioSessaoRow>;
  ordenacao: OrdenacaoRelatorios["usuarios"];
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
      if (ordenacao === "nome") return compararTexto(a.nome, b.nome);
      if (ordenacao === "empresa") return compararTexto(a.empresa, b.empresa);
      if (ordenacao === "login") return getTimestamp(b.loginEm) - getTimestamp(a.loginEm);
      if (ordenacao === "logout") {
        return getTimestamp(b.logoutEm) - getTimestamp(a.logoutEm);
      }
      if (ordenacao === "ultimo") {
        return getTimestamp(b.ultimoAcesso) - getTimestamp(a.ultimoAcesso);
      }

      if (a.online !== b.online) return a.online ? -1 : 1;
      return getTimestamp(b.ultimoAcesso) - getTimestamp(a.ultimoAcesso);
    })
    .slice(0, 60);
}

function ordenarEmpresasPlano({
  empresas,
  ordenacao,
}: {
  empresas: EmpresaRow[];
  ordenacao: OrdenacaoRelatorios["planos"];
}) {
  return [...empresas].sort((a, b) => {
    if (ordenacao === "plano") {
      return compararTexto(getPlano(a)?.nome || "", getPlano(b)?.nome || "");
    }
    if (ordenacao === "status") {
      return compararTexto(a.assinatura_status || "", b.assinatura_status || "");
    }
    if (ordenacao === "inicio") {
      return (
        getTimestamp(b.assinatura_inicio_em || b.created_at) -
        getTimestamp(a.assinatura_inicio_em || a.created_at)
      );
    }
    if (ordenacao === "renovacao") {
      return (
        getTimestamp(b.assinatura_renovada_em) -
        getTimestamp(a.assinatura_renovada_em)
      );
    }
    if (ordenacao === "expira") {
      return getTimestamp(a.assinatura_vencimento_em) - getTimestamp(b.assinatura_vencimento_em);
    }

    return compararTexto(getNomeEmpresa(a), getNomeEmpresa(b));
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
        detail={`no periodo ${filtros.periodoLabel}`}
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
        icon={ContactRound}
        eyebrow="Novos contatos"
        title="Origem direto / nao identificado"
        value={formatarNumero(dados.totais.contatosDiretoNaoIdentificado)}
        detail="contatos novos"
        href={hrefDetalhe(params, "contatos")}
        tone="rose"
      >
        <MiniBarChart
          emptyText="Nenhum contato novo encontrado."
          tone="rose"
          items={dados.contatosPorEmpresa.map((empresa) => ({
            id: empresa.empresaId,
            label: empresa.nome,
            value: empresa.diretoNaoIdentificado,
            detail: `${empresa.percentualDireto}% direto`,
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
        subtitle={`Total consolidado no periodo ${filtros.periodoLabel}.`}
      >
        <ReportFilters
          params={params}
          exclude={[
            "inicio",
            "fim",
            "atalho",
            "conv_empresa",
            "conv_usuario",
            "pag_conversas",
          ]}
          clearUpdates={{ conv_empresa: "", conv_usuario: "", pag_conversas: "1" }}
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
        title="Novos contatos por origem"
        subtitle={`Origem direto / nao identificado no periodo ${filtros.periodoLabel}.`}
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
                        campo="direto"
                        atual={ordenacao.contatos}
                      >
                        Direto
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
                    <th>
                      <SortHeader
                        params={params}
                        tabela="contatos"
                        campo="outras"
                        atual={ordenacao.contatos}
                      >
                        Outras
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
                      <td>{formatarNumero(empresa.diretoNaoIdentificado)}</td>
                      <td>{formatarNumero(empresa.total)}</td>
                      <td>{empresa.percentualDireto}%</td>
                      <td>{formatarNumero(empresa.outrasOrigens)}</td>
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
                {paginacao.itens.map((empresa) => {
                  const plano = getPlano(empresa);

                  return (
                    <tr key={empresa.id}>
                      <td>
                        <strong>{getNomeEmpresa(empresa)}</strong>
                        <span className={styles.secondaryText}>{empresa.id}</span>
                      </td>
                      <td>{plano?.nome || "Sem plano"}</td>
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
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination params={params} tabela="planos" paginacao={paginacao} />
        </>
      )}
    </ModalShell>
  );
}

export default async function RelatoriosInternosPage({
  searchParams,
}: RelatoriosPageProps) {
  const params = (await searchParams) ?? {};
  const filtros = resolverFiltros(params);
  const filtrosRelatorio = resolverFiltrosPorRelatorio(params);
  const ordenacao = resolverOrdenacao(params);
  const detalheAberto = resolverDetalhe(params);
  const dados = await carregarRelatorios(
    filtros,
    filtrosPorRelatorioPadrao,
    ordenacao
  );
  const dadosDetalhe = detalheAberto
    ? await carregarRelatorios(filtros, filtrosRelatorio, ordenacao)
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
    ...dados.contatosPorEmpresa.map((item) => item.diretoNaoIdentificado)
  );

  return (
    <>
      <Header
        title="Relatórios Interno"
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
            detail={`total no período ${filtros.periodoLabel}`}
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
            value={formatarNumero(dados.totais.contatosDiretoNaoIdentificado)}
            detail="direto ou não identificado"
            tone="rose"
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
                      <a href={hrefSort(params, "disparos", "sucesso")}>
                        {formatarNumero(empresa.sucesso)} sucesso
                      </a>
                      <a href={hrefSort(params, "disparos", "falha")}>
                        {formatarNumero(empresa.falha)} falha
                      </a>
                      <a href={hrefSort(params, "disparos", "processando")}>
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
                          campo="direto"
                          atual={ordenacao.contatos}
                        >
                          Direto
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
                  {dados.empresas.map((empresa) => {
                    const plano = getPlano(empresa);

                    return (
                      <tr key={empresa.id}>
                        <td>
                          <strong>{getNomeEmpresa(empresa)}</strong>
                          <span className={styles.secondaryText}>{empresa.id}</span>
                        </td>
                        <td>{plano?.nome || "Sem plano"}</td>
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
                    );
                  })}
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
