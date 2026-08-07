"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Bell,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  History,
  Link2,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  Unlink,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import Header from "@/components/Header";
import FeedbackToast from "@/components/FeedbackToast";
import { createClient } from "@/lib/supabase/client";
import { solicitarAtualizacaoFeedbackAgendasHeader } from "@/lib/header-summary/events";
import AgendaAutomationSettings, {
  automationCardsFromRules,
  serializeAutomationCards,
  type AgendaAutomationCardState,
  type AgendaAutomationOptions,
  type AgendaAutomationRule,
} from "./AgendaAutomationSettings";
import AgendaAvailabilityEditor, {
  type AgendaAvailabilityDay,
} from "./AgendaAvailabilityEditor";
import AgendaCalendarIntegrationScope from "./AgendaCalendarIntegrationScope";
import AgendaTemplateConfiguration, {
  defaultTemplateConfiguration,
  type AgendaTemplateConfigurationValue,
} from "./AgendaTemplateConfiguration";

import styles from "./page.module.css";

type Agenda = {
  id: string;
  nome: string;
  descricao: string | null;
  duracao_minutos: number;
  intervalo_minutos: number;
  antecedencia_minutos: number;
  janela_dias: number;
  status: "ativo" | "inativo" | "arquivado";
};
type Tipo = { id: string; nome: string; cor: string };
type Resp = { id: string; nome: string; email: string | null };
type Contato = {
  id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  empresa?: string | null;
};
type Vinculo = {
  entidade_tipo: string;
  entidade_id: string;
  papel: string;
  titulo: string;
  subtitulo: string;
  imagem_url: string;
  principal: boolean;
  dados_json: Record<string, string>;
};
type Participante = {
  nome: string;
  email: string;
  telefone: string;
  papel: string;
  tipo: string;
  status: string;
};
type Lembrete = {
  id?: string;
  canal: string;
  antecedencia_minutos: number;
  destinatario_tipo: string;
  ativo: boolean;
  status?: string;
  agendado_para?: string;
  erro?: string | null;
  metadata_json?: {
    integracao_whatsapp_id?: string | null;
    whatsapp_template_id?: string | null;
    marketing_aceito?: boolean;
    template_variaveis?: AgendaTemplateConfigurationValue["template_variaveis"];
    template_botoes?: AgendaTemplateConfigurationValue["template_botoes"];
  };
};
type ReminderOptions = AgendaAutomationOptions;
type Hist = {
  id: string;
  acao: string;
  descricao?: string;
  usuario_nome?: string;
  created_at: string;
};
type Ag = {
  id: string;
  agenda_id: string;
  contato_id: string | null;
  titulo: string;
  nome_cliente: string | null;
  telefone_cliente: string | null;
  email_cliente: string | null;
  inicio_at: string;
  fim_at: string;
  status: string;
  origem: string;
  observacoes: string | null;
  tipo_id: string | null;
  responsavel_id: string | null;
  local: string | null;
  link_reuniao: string | null;
  prioridade: string;
  confirmacao_status: string;
  resultado: string | null;
  observacoes_internas: string | null;
  contato: Contato | null;
  responsavel: Resp | null;
  tipo: Tipo | null;
  vinculos: Vinculo[];
  participantes: Participante[];
  lembretes: Lembrete[];
  historico: Hist[];
};
type GEvent = {
  id: string;
  titulo: string;
  inicio_at: string;
  fim_at: string;
  dia_inteiro: boolean;
};
type AgendaNiche = {
  codigo: string;
  nome: string;
  grupo?: string;
};
type RelatedPresentation = {
  tipos: string[];
  titulo: string;
  dica: string;
  botao: string;
};
type Form = {
  id: string | null;
  titulo: string;
  tipo_id: string;
  status: string;
  inicio_at: string;
  fim_at: string;
  responsavel_id: string;
  prioridade: string;
  local: string;
  link_reuniao: string;
  observacoes: string;
  contato_id: string;
  nome_cliente: string;
  telefone_cliente: string;
  email_cliente: string;
  participantes: Participante[];
  vinculos: Vinculo[];
  lembretes: Lembrete[];
  confirmacao_status: string;
  resultado: string;
  observacoes_internas: string;
};
type Disp = AgendaAvailabilityDay;
const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
  diasFull = [
    "Domingo",
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
  ],
  labels: Record<string, string> = {
    agendado: "Agendado",
    confirmado: "Confirmado",
    cancelado: "Cancelado",
    realizado: "Realizado",
    faltou: "Não compareceu",
  };
const allRelatedTypes = [
  "imovel",
  "veiculo",
  "procedimento",
  "oportunidade",
  "ordem_servico",
  "processo",
  "outro",
];
const relatedByNiche: Record<string, RelatedPresentation> = {
  imobiliaria: {
    tipos: ["imovel"],
    titulo: "Imóvel relacionado",
    dica: "Vincule o imóvel que será apresentado, visitado ou negociado neste agendamento.",
    botao: "Adicionar imóvel",
  },
  medicina: {
    tipos: ["procedimento"],
    titulo: "Procedimento relacionado",
    dica: "Vincule o procedimento ou atendimento clínico relacionado ao compromisso.",
    botao: "Adicionar procedimento",
  },
  odontologia: {
    tipos: ["procedimento"],
    titulo: "Procedimento relacionado",
    dica: "Vincule o procedimento odontológico relacionado ao compromisso.",
    botao: "Adicionar procedimento",
  },
  comercio: {
    tipos: ["oportunidade", "ordem_servico", "outro"],
    titulo: "Registro relacionado",
    dica: "Vincule a oportunidade, ordem de serviço ou outro registro associado.",
    botao: "Adicionar registro",
  },
  outro: {
    tipos: allRelatedTypes,
    titulo: "Registros relacionados",
    dica: "Vincule qualquer registro relacionado a este compromisso.",
    botao: "Adicionar",
  },
};
const relatedTypeLabels: Record<string, string> = {
  imovel: "Imóvel",
  veiculo: "Veículo",
  procedimento: "Procedimento",
  oportunidade: "Oportunidade",
  ordem_servico: "Ordem de serviço",
  processo: "Processo",
  outro: "Outro",
};
const calendarLabel = (value: string) =>
  value
    .replace(/\bAgendas\b/g, "Calendários")
    .replace(/\bagendas\b/g, "calendários")
    .replace(/\bAgenda\b/g, "Calendário")
    .replace(/\bagenda\b/g, "calendário");
const p = (n: number) => String(n).padStart(2, "0"),
  key = (d: Date) =>
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
  local = (s: string) => {
    const d = new Date(s);
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  },
  iso = (s: string) => new Date(s).toISOString(),
  time = (s: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(s)),
  dt = (s?: string) =>
    s
      ? new Intl.DateTimeFormat("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date(s))
      : "-";
// CRM_AGENDA_FEEDBACK_DETAILS_V1
const relationOne = (value: any) =>
  Array.isArray(value) ? value[0] || null : value || null;
const feedbackOriginLabel = (value?: string | null) => {
  const origem = String(value || "").toLowerCase();
  if (origem === "automacao") return "Automação";
  if (origem === "api") return "API";
  if (origem === "google") return "Google";
  return "Manual";
};
const range = (m: Date) => ({
  start: new Date(m.getFullYear(), m.getMonth(), 1).toISOString(),
  end: new Date(m.getFullYear(), m.getMonth() + 1, 1).toISOString(),
});
const cal = (m: Date) => {
  const f = new Date(m.getFullYear(), m.getMonth(), 1),
    s = new Date(m.getFullYear(), m.getMonth(), 1 - f.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(s);
    d.setDate(s.getDate() + i);
    return { d, k: key(d), ok: d.getMonth() === m.getMonth() };
  });
};
// CRM_AGENDA_REMINDERS_PREMIUM_RULES_V3
const blank = (day: string, dur = 60, user = ""): Form => {
  const i = `${day}T09:00`,
    d = new Date(i);
  d.setMinutes(d.getMinutes() + dur);
  return {
    id: null,
    titulo: "Agendamento",
    tipo_id: "",
    status: "agendado",
    inicio_at: i,
    fim_at: local(d.toISOString()),
    responsavel_id: user,
    prioridade: "normal",
    local: "",
    link_reuniao: "",
    observacoes: "",
    contato_id: "",
    nome_cliente: "",
    telefone_cliente: "",
    email_cliente: "",
    participantes: [],
    vinculos: [],
    lembretes: [],
    confirmacao_status: "pendente",
    resultado: "",
    observacoes_internas: "",
  };
};
const toForm = (a: Ag): Form => ({
  id: a.id,
  titulo: a.titulo,
  tipo_id: a.tipo_id || "",
  status: a.status,
  inicio_at: local(a.inicio_at),
  fim_at: local(a.fim_at),
  responsavel_id: a.responsavel_id || "",
  prioridade: a.prioridade || "normal",
  local: a.local || "",
  link_reuniao: a.link_reuniao || "",
  observacoes: a.observacoes || "",
  contato_id: a.contato_id || "",
  nome_cliente: a.nome_cliente || a.contato?.nome || "",
  telefone_cliente: a.telefone_cliente || a.contato?.telefone || "",
  email_cliente: a.email_cliente || a.contato?.email || "",
  participantes: a.participantes || [],
  vinculos: a.vinculos || [],
  lembretes: (a.lembretes || []).filter((x) => x.status !== "enviado"),
  confirmacao_status: a.confirmacao_status || "pendente",
  resultado: a.resultado || "",
  observacoes_internas: a.observacoes_internas || "",
});

function Page() {
  const [reminderOptions, setReminderOptions] = useState<ReminderOptions>({
    integracoes: [],
    templates: [],
    fluxos: [],
    variaveis: [],
  });
  useEffect(() => {
    let active = true;
    fetch("/api/agendas/automacoes/opcoes", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (active && j?.ok)
          setReminderOptions({
            integracoes: j.integracoes || [],
            templates: j.templates || [],
            fluxos: j.fluxos || [],
            variaveis: j.variaveis || [],
          });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  const sp = useSearchParams(),
    sb = useMemo(() => createClient(), []);
  const [agendas, setAgendas] = useState<Agenda[]>([]),
    [agendaId, setAgendaId] = useState(""),
    [ags, setAgs] = useState<Ag[]>([]),
    [tipos, setTipos] = useState<Tipo[]>([]),
    [resps, setResps] = useState<Resp[]>([]),
    [userId, setUserId] = useState("");
  const [google, setGoogle] = useState<{
      conectado: boolean;
      email?: string;
      bidirecional_ativa?: boolean;
      sync_status?: string | null;
      ultimo_erro?: string | null;
      ultima_sincronizacao_em?: string;
    }>({ conectado: false }),
    [gevents, setGevents] = useState<GEvent[]>([]),
    [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [niche, setNiche] = useState<AgendaNiche | null>(null);
  const [month, setMonth] = useState(new Date()),
    [day, setDay] = useState(key(new Date())),
    [load, setLoad] = useState(true),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState(""),
    [ok, setOk] = useState("");
  const [filter, setFilter] = useState({
      q: "",
      status: "todos",
      tipo: "todos",
      resp: "todos",
      origem: "todos",
    }),
    [open, setOpen] = useState(false),
    [form, setForm] = useState<Form>(() => blank(key(new Date()))),
    [contact, setContact] = useState<Contato | null>(null),
    [cq, setCq] = useState(""),
    [contacts, setContacts] = useState<Contato[]>([]);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [typeModal, setTypeModal] = useState(false),
    [typeDraft, setTypeDraft] = useState({ nome: "", cor: "#22c55e" }),
    [typeBusy, setTypeBusy] = useState(false),
    [typeError, setTypeError] = useState("");
  const [config, setConfig] = useState(false),
    [configNew, setConfigNew] = useState(false),
    [af, setAf] = useState({
      nome: "",
      descricao: "",
      duracao_minutos: "60",
      intervalo_minutos: "30",
      antecedencia_minutos: "120",
      janela_dias: "14",
      status: "ativo",
    }),
    [disp, setDisp] = useState<Disp[]>(
      dias.map((_, i) => ({
        dia_semana: i,
        hora_inicio: "09:00",
        hora_fim: "18:00",
        ativo: i > 0 && i < 6,
        intervalos: [],
      })),
    );
  const [configOptions, setConfigOptions] = useState<AgendaAutomationOptions>({
      integracoes: [],
      templates: [],
      fluxos: [],
      variaveis: [],
    }),
    [agendaIntegrationIds, setAgendaIntegrationIds] = useState<string[]>([]),
    [automationCards, setAutomationCards] = useState<
      AgendaAutomationCardState[]
    >(() => automationCardsFromRules([])),
    [configDetailsLoading, setConfigDetailsLoading] = useState(false),
    [configDetailsError, setConfigDetailsError] = useState("");
  const [unidadeDuracaoAgenda, setUnidadeDuracaoAgenda] = useState<
      "minutos" | "horas"
    >("minutos"),
    [unidadeIntervaloAgenda, setUnidadeIntervaloAgenda] = useState<
      "minutos" | "horas"
    >("minutos"),
    [unidadeAntecedenciaAgenda, setUnidadeAntecedenciaAgenda] = useState<
      "minutos" | "horas"
    >("minutos");
  const agenda = agendas.find((a) => a.id === agendaId),
    days = useMemo(() => cal(month), [month]),
    relatedPresentation =
      relatedByNiche[niche?.codigo || "outro"] || relatedByNiche.outro;
  const visible = useMemo(
    () =>
      ags.filter((a) => {
        if (filter.status !== "todos" && a.status !== filter.status)
          return false;
        if (filter.tipo !== "todos" && a.tipo_id !== filter.tipo) return false;
        if (filter.resp !== "todos" && a.responsavel_id !== filter.resp)
          return false;
        if (filter.origem === "google") return false;
        if (filter.origem !== "todos" && a.origem !== filter.origem)
          return false;
        const q = filter.q.toLowerCase().trim();
        return (
          !q ||
          [
            a.titulo,
            a.nome_cliente,
            a.telefone_cliente,
            a.local,
            a.responsavel?.nome,
            a.tipo?.nome,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q)
        );
      }),
    [ags, filter],
  );
  const byDay = useMemo(() => {
    const m = new Map<string, Ag[]>();
    visible.forEach((a) =>
      m.set(key(new Date(a.inicio_at)), [
        ...(m.get(key(new Date(a.inicio_at))) || []),
        a,
      ]),
    );
    return m;
  }, [visible]);
  const gby = useMemo(() => {
    const m = new Map<string, GEvent[]>();
    gevents.forEach((a) =>
      m.set(
        a.dia_inteiro ? a.inicio_at.slice(0, 10) : key(new Date(a.inicio_at)),
        [
          ...(m.get(
            a.dia_inteiro
              ? a.inicio_at.slice(0, 10)
              : key(new Date(a.inicio_at)),
          ) || []),
          a,
        ],
      ),
    );
    return m;
  }, [gevents]);
  const stats = useMemo(
    () => ({
      ativos: ags.filter((a) => ["agendado", "confirmado"].includes(a.status))
        .length,
      conf: ags.filter((a) => a.status === "confirmado").length,
      done: ags.filter((a) => a.status === "realizado").length,
      miss: ags.filter((a) => a.status === "faltou").length,
      pend: ags.filter(
        (a) =>
          a.confirmacao_status === "pendente" &&
          ["agendado", "confirmado"].includes(a.status),
      ).length,
    }),
    [ags],
  );

  const loadAgendas = useCallback(
    async (prefer?: string) => {
      const r = await fetch("/api/agendas?status=todos", { cache: "no-store" }),
        j = await r.json();
      if (!r.ok || !j.ok) throw Error(j.error || "Erro ao carregar agendas.");
      setAgendas(j.agendas || []);
      setAgendaId((v) => {
        const x = prefer || v || sp.get("agenda") || "";
        return j.agendas.some((a: Agenda) => a.id === x)
          ? x
          : j.agendas.find((a: Agenda) => a.status === "ativo")?.id ||
              j.agendas[0]?.id ||
              "";
      });
    },
    [sp],
  );
  const loadGoogle = useCallback(
    async (id: string) => {
      try {
        const r = await fetch(`/api/agendas/${id}/google-calendar`, {
            cache: "no-store",
          }),
          j = await r.json();
        setGoogle(r.ok && j.ok ? j.integracao : { conectado: false });
        const rg = range(month),
          q = new URLSearchParams({ inicio_at: rg.start, fim_at: rg.end }),
          er = await fetch(
            `/api/agendas/${id}/google-calendar/ocupacoes?${q}`,
            { cache: "no-store" },
          ),
          ej = await er.json();
        setGevents(er.ok && ej.ok ? ej.eventos || [] : []);
      } catch {
        setGevents([]);
      }
    },
    [month],
  );
  const loadData = useCallback(
    async (id: string) => {
      const rg = range(month),
        { data, error } = await sb.rpc("agenda_etapa1_listar", {
          p_agenda_id: id,
          p_inicio: rg.start,
          p_fim: rg.end,
        });
      if (error) throw Error(error.message);
      setAgs(data?.agendamentos || []);
      setTipos(data?.tipos || []);
      setResps(data?.responsaveis || []);
      setUserId(data?.usuario_atual_id || "");
      await loadGoogle(id);
    },
    [loadGoogle, month, sb],
  );
  const loadFeedback = useCallback(async () => {
    try {
      const r = await fetch("/api/agendas/feedback", { cache: "no-store" }),
        j = await r.json();
      if (r.ok && j.ok) setFeedbacks(j.pendencias || []);
    } catch {
      /* feedback não bloqueia a agenda */
    }
  }, []);
  useEffect(() => {
    Promise.all([loadAgendas(), loadFeedback()])
      .catch((e) => setErr(e.message))
      .finally(() => setLoad(false));
  }, [loadAgendas, loadFeedback]);
  useEffect(() => {
    let active = true;
    fetch("/api/agendas/contexto", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (active && response.ok && data?.ok && data?.nicho?.codigo) {
          setNiche(data.nicho as AgendaNiche);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!agendaId) return;
    setLoad(true);
    loadData(agendaId)
      .catch((e) => setErr(e.message))
      .finally(() => setLoad(false));
    const q = new URLSearchParams(location.search);
    q.set("agenda", agendaId);
    history.replaceState({}, "", `${location.pathname}?${q}`);
  }, [agendaId, loadData]);
  useEffect(() => {
    if (!open || cq.trim().length < 2) {
      setContacts([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data, error } = await sb.rpc("agenda_etapa1_buscar_contatos", {
        p_busca: cq,
        p_limite: 20,
      });
      if (error) setErr(error.message);
      else setContacts(data || []);
    }, 300);
    return () => clearTimeout(t);
  }, [cq, open, sb]);
  useEffect(() => {
    const s = sp.get("google_calendar");
    if (s) setOk(s.startsWith("conectado") ? "Google Calendar conectado." : "");
  }, [sp]);

  const ajustarInicioComDuracaoAgenda = (inicioAt: string) => {
    setForm((atual) => {
      const duracaoMinutos = Math.max(1, Number(agenda?.duracao_minutos || 60));
      const inicio = new Date(inicioAt);
      if (Number.isNaN(inicio.getTime()))
        return { ...atual, inicio_at: inicioAt };
      const fim = new Date(inicio.getTime() + duracaoMinutos * 60 * 1000);
      return {
        ...atual,
        inicio_at: inicioAt,
        fim_at: local(fim.toISOString()),
      };
    });
  };
  const valorTempoAgenda = (
    valorMinutos: string,
    unidade: "minutos" | "horas",
  ) => {
    if (valorMinutos === "") return "";
    const minutos = Number(valorMinutos);
    if (!Number.isFinite(minutos)) return valorMinutos;
    if (unidade === "minutos") return String(minutos);
    const horas = minutos / 60;
    return String(Number(horas.toFixed(2)));
  };
  const atualizarTempoAgenda = (
    campo: "duracao_minutos" | "intervalo_minutos" | "antecedencia_minutos",
    valor: string,
    unidade: "minutos" | "horas",
  ) => {
    setAf((atual) => ({
      ...atual,
      [campo]:
        valor === ""
          ? ""
          : String(
              Math.max(0, Number(valor) || 0) * (unidade === "horas" ? 60 : 1),
            ),
    }));
  };
  const newAg = (d = day) => {
    if (!agenda) return;
    setForm(blank(d, agenda.duracao_minutos, userId));
    setContact(null);
    setOpen(true);
  };
  const edit = (a: Ag) => {
    setForm(toForm(a));
    setContact(a.contato);
    setOpen(true);
  };
  const choose = (c: Contato) => {
    setContact(c);
    setForm((f) => ({
      ...f,
      contato_id: c.id,
      nome_cliente: c.nome || "",
      telefone_cliente: c.telefone || "",
      email_cliente: c.email || "",
    }));
    setCq("");
    setContacts([]);
  };
  const addPart = () =>
    setForm((f) => ({
      ...f,
      participantes: [
        ...f.participantes,
        {
          nome: "",
          email: "",
          telefone: "",
          papel: "",
          tipo: "convidado",
          status: "pendente",
        },
      ],
    }));
  const addLink = () =>
    setForm((f) => ({
      ...f,
      vinculos: [
        ...f.vinculos,
        {
          entidade_tipo: relatedPresentation.tipos[0] || "outro",
          entidade_id: "",
          papel: "",
          titulo: "",
          subtitulo: "",
          imagem_url: "",
          principal: f.vinculos.length === 0,
          dados_json: {},
        },
      ],
    }));
  const addRem = () =>
    setForm((f) => ({
      ...f,
      lembretes: [
        ...f.lembretes,
        {
          canal: "sistema",
          antecedencia_minutos: 60,
          destinatario_tipo: "responsavel",
          ativo: true,
          metadata_json: {},
        },
      ],
    }));
  const customType = () => {
    setTypeDraft({ nome: "", cor: "#22c55e" });
    setTypeError("");
    setTypeModal(true);
  };
  const saveCustomType = async () => {
    const nome = typeDraft.nome.trim();
    const cor = /^#[0-9a-fA-F]{6}$/.test(typeDraft.cor)
      ? typeDraft.cor
      : "#22c55e";
    if (!nome) {
      setTypeError("Informe o nome do novo tipo de agendamento.");
      return;
    }
    try {
      setTypeBusy(true);
      setTypeError("");
      const { data, error } = await sb.rpc("agenda_etapa1_salvar_tipo", {
        p_tipo_id: null,
        p_nome: nome,
        p_cor: cor,
        p_icone: "calendar",
      });
      if (error) throw Error(error.message);
      setTipos((x) => [...x.filter((t) => t.id !== data.id), data]);
      setForm((f) => ({ ...f, tipo_id: data.id }));
      setTypeModal(false);
      setOk("Tipo criado.");
    } catch (e: any) {
      setTypeError(
        e.message || "Não foi possível criar o tipo de agendamento.",
      );
    } finally {
      setTypeBusy(false);
    }
  };
  const save = async (status?: string) => {
    if (!agendaId) return;
    try {
      setBusy(true);
      setErr("");
      for (const reminder of form.lembretes.filter(
        (item) => item.ativo && item.canal === "whatsapp",
      )) {
        if (
          !reminder.metadata_json?.integracao_whatsapp_id ||
          !reminder.metadata_json?.whatsapp_template_id
        )
          throw Error(
            "Lembrete adicional pelo WhatsApp: selecione a integração e o template aprovado.",
          );
        const selectedTemplate = reminderOptions.templates.find(
          (item) => item.id === reminder.metadata_json?.whatsapp_template_id,
        );
        if (
          selectedTemplate?.categoria?.toUpperCase() === "MARKETING" &&
          reminder.metadata_json?.marketing_aceito !== true
        )
          throw Error(
            "Lembrete adicional pelo WhatsApp: confirme o uso do template de Marketing antes de salvar.",
          );
      }
      const payload = {
        ...form,
        status: status || form.status,
        inicio_at: iso(form.inicio_at),
        fim_at: iso(form.fim_at),
        participantes: form.participantes.filter((p) => p.nome.trim()),
        vinculos: form.vinculos.filter((v) => v.titulo.trim()),
        lembretes: form.lembretes.filter((r) => r.ativo),
        metadata_json: { agenda_enriquecida: true },
      };
      const { error } = await sb.rpc("agenda_etapa1_salvar_agendamento", {
        p_agenda_id: agendaId,
        p_agendamento_id: form.id,
        p_payload: payload,
      });
      if (error) throw Error(error.message);
      if (google.conectado)
        await fetch(`/api/agendas/${agendaId}/google-calendar`, {
          method: "POST",
        }).catch(() => undefined);
      setOpen(false);
      await loadData(agendaId);
      setOk(
        status === "cancelado"
          ? "Agendamento cancelado."
          : form.id
            ? "Agendamento atualizado."
            : "Agendamento criado.",
      );
      solicitarAtualizacaoFeedbackAgendasHeader();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const answer = async (id: string, resposta: string) => {
    try {
      const r = await fetch("/api/agendas/feedback", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agendamento_id: id, resposta }),
        }),
        j = await r.json();
      if (!r.ok || !j.ok) throw Error(j.error);
      await Promise.all([
        loadFeedback(),
        agendaId ? loadData(agendaId) : Promise.resolve(),
      ]);
      setOk(j.message);
    } catch (e: any) {
      setErr(e.message);
    }
  };
  const googleAction = async (action: "sync" | "disconnect") => {
    if (!agendaId) return;
    if (action === "disconnect" && !confirm("Desvincular o Google Calendar?"))
      return;
    try {
      setBusy(true);
      const r = await fetch(`/api/agendas/${agendaId}/google-calendar`, {
          method: action === "sync" ? "POST" : "DELETE",
        }),
        j = await r.json();
      if (!r.ok || !j.ok) throw Error(j.error);
      await loadGoogle(agendaId);
      setOk(
        action === "sync" ? "Google sincronizado." : "Google desvinculado.",
      );
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const loadConfigDetails = async (calendarId?: string) => {
    setConfigDetailsLoading(true);
    setConfigDetailsError("");
    try {
      const query = calendarId
        ? `?agenda_id=${encodeURIComponent(calendarId)}`
        : "";
      const [optionsResponse, rulesResponse] = await Promise.all([
        fetch(`/api/agendas/automacoes/opcoes${query}`, {
          cache: "no-store",
        }),
        calendarId
          ? fetch(`/api/agendas/${calendarId}/automacoes`, {
              cache: "no-store",
            })
          : Promise.resolve(null),
      ]);
      const optionsData = await optionsResponse.json();
      if (!optionsResponse.ok || !optionsData?.ok)
        throw Error(
          optionsData?.error || "Não foi possível carregar as integrações.",
        );

      let rules: AgendaAutomationRule[] = [];
      if (rulesResponse) {
        const rulesData = await rulesResponse.json();
        if (!rulesResponse.ok || !rulesData?.ok)
          throw Error(
            rulesData?.error || "Não foi possível carregar as automações.",
          );
        rules = Array.isArray(rulesData.regras) ? rulesData.regras : [];
      }

      const options: AgendaAutomationOptions = {
        integracoes: optionsData.integracoes || [],
        templates: optionsData.todos_templates || optionsData.templates || [],
        fluxos: optionsData.todos_fluxos || optionsData.fluxos || [],
        variaveis: optionsData.variaveis || [],
      };
      const selected = Array.isArray(optionsData.agenda_integracao_whatsapp_ids)
        ? optionsData.agenda_integracao_whatsapp_ids
        : options.integracoes.map((item) => item.id);

      setConfigOptions(options);
      setAgendaIntegrationIds(
        selected.length > 0
          ? selected
          : options.integracoes.map((item) => item.id),
      );
      setAutomationCards(automationCardsFromRules(rules));
    } catch (error) {
      setConfigDetailsError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar as configurações da agenda.",
      );
    } finally {
      setConfigDetailsLoading(false);
    }
  };
  const openConfig = async (isNew: boolean) => {
    setConfigNew(isNew);
    setUnidadeDuracaoAgenda("minutos");
    setUnidadeIntervaloAgenda("minutos");
    setUnidadeAntecedenciaAgenda("minutos");
    if (isNew) {
      setAf({
        nome: "",
        descricao: "",
        duracao_minutos: "60",
        intervalo_minutos: "30",
        antecedencia_minutos: "120",
        janela_dias: "14",
        status: "ativo",
      });
      setDisp(
        dias.map((_, i) => ({
          dia_semana: i,
          hora_inicio: "09:00",
          hora_fim: "18:00",
          ativo: i > 0 && i < 6,
          intervalos: [],
        })),
      );
      void loadConfigDetails();
    } else if (agenda) {
      setAf({
        nome: agenda.nome,
        descricao: agenda.descricao || "",
        duracao_minutos: String(agenda.duracao_minutos),
        intervalo_minutos: String(agenda.intervalo_minutos),
        antecedencia_minutos: String(agenda.antecedencia_minutos),
        janela_dias: String(agenda.janela_dias),
        status: agenda.status,
      });
      const r = await fetch(`/api/agendas/${agenda.id}/disponibilidades`, {
          cache: "no-store",
        }),
        j = await r.json();
      if (j.ok && j.disponibilidades?.length) {
        const m = new Map<number, Disp>(
          j.disponibilidades.map((x: Disp) => [
            x.dia_semana,
            {
              ...x,
              intervalos: Array.isArray(x.intervalos) ? x.intervalos : [],
            },
          ]),
        );
        setDisp(
          dias.map(
            (_, i) =>
              m.get(i) || {
                dia_semana: i,
                hora_inicio: "09:00",
                hora_fim: "18:00",
                ativo: false,
                intervalos: [],
              },
          ),
        );
      }
      void loadConfigDetails(agenda.id);
    }
    setConfig(true);
  };
  const saveConfig = async () => {
    try {
      setBusy(true);
      if (
        configOptions.integracoes.length > 0 &&
        agendaIntegrationIds.length === 0
      )
        throw Error("Selecione ao menos uma integração para o calendário.");

      for (const card of automationCards.filter((item) => item.ativo)) {
        if (card.canais.length === 0)
          throw Error("Selecione um canal para cada automação ativa.");
        if (
          card.canais.includes("whatsapp") &&
          (!card.integracaoId || !card.templateId)
        )
          throw Error(
            "Selecione a integração e o template em todas as automações ativas do WhatsApp.",
          );
        const template = configOptions.templates.find(
          (item) => item.id === card.templateId,
        );
        if (
          template?.categoria.toUpperCase() === "MARKETING" &&
          !card.templateConfig.marketing_aceito
        )
          throw Error(
            "Confirme a ciência sobre o template de Marketing antes de salvar.",
          );
        if (card.canais.includes("fluxo") && !card.fluxoId)
          throw Error("Selecione o fluxo da automação de pós-atendimento.");
      }

      let id = agendaId;
      const payload = {
        ...af,
        duracao_minutos: Number(af.duracao_minutos),
        intervalo_minutos: Number(af.intervalo_minutos),
        antecedencia_minutos: Number(af.antecedencia_minutos),
        janela_dias: Number(af.janela_dias),
        integracao_whatsapp_ids: agendaIntegrationIds,
      };
      const r = await fetch(configNew ? "/api/agendas" : `/api/agendas/${id}`, {
          method: configNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
        j = await r.json();
      if (!r.ok || !j.ok) throw Error(j.error);
      if (configNew) id = j.agenda.id;
      const ar = await fetch(`/api/agendas/${id}/disponibilidades`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ disponibilidades: disp }),
        }),
        aj = await ar.json();
      if (!ar.ok || !aj.ok) throw Error(aj.error);
      const automationResponse = await fetch(`/api/agendas/${id}/automacoes`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            regras: serializeAutomationCards(automationCards),
            integracao_whatsapp_ids: agendaIntegrationIds,
          }),
        }),
        automationData = await automationResponse.json();
      if (!automationResponse.ok || !automationData?.ok)
        throw Error(
          automationData?.error || "Não foi possível salvar as automações.",
        );
      setConfig(false);
      await loadAgendas(id);
      setAgendaId(id);
      setOk(configNew ? "Agenda criada." : "Agenda atualizada.");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const archive = async () => {
    if (!agenda) return;
    const status = agenda.status === "arquivado" ? "ativo" : "arquivado";
    if (status === "arquivado" && !confirm("Arquivar esta agenda?")) return;
    try {
      setBusy(true);
      const r = await fetch(`/api/agendas/${agenda.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }),
        j = await r.json();
      if (!r.ok || !j.ok) throw Error(j.error);
      setConfig(false);
      await loadAgendas(agenda.id);
      setOk(status === "arquivado" ? "Agenda arquivada." : "Agenda reativada.");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const delAgenda = async () => {
    if (!agenda || !confirm("Excluir esta agenda permanentemente?")) return;
    try {
      setBusy(true);
      const r = await fetch(`/api/agendas/${agenda.id}`, { method: "DELETE" }),
        j = await r.json();
      if (!r.ok || !j.ok) throw Error(j.error);
      setConfig(false);
      setAgendaId("");
      await loadAgendas();
      setOk("Agenda excluída.");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (load && agendas.length === 0)
    return (
      <div className="a2">
        <Header />
        <div className="empty">
          <RefreshCw className="spin" /> Carregando...
        </div>
      </div>
    );
  return (
    <div className="a2">
      <Header />
      <FeedbackToast
        success={ok}
        error={err}
        onSuccessDismiss={() => setOk("")}
        onErrorDismiss={() => setErr("")}
      />
      <main className="wrap">
        <div className={`head ${styles.calendarManagementBar}`}>
          <select
            className={`select ${styles.calendarSelect}`}
            value={agendaId}
            onChange={(event) => setAgendaId(event.target.value)}
          >
            {agendas.length === 0 ? (
              <option value="">Nenhum calendário</option>
            ) : null}
            {agendas.map((item) => (
              <option key={item.id} value={item.id}>
                {calendarLabel(item.nome)}
                {item.status === "arquivado" ? " (arquivado)" : ""}
              </option>
            ))}
          </select>

          <button
            className="btn"
            onClick={() => openConfig(false)}
            disabled={!agenda}
          >
            <Settings2 size={15} />
            Configuração
          </button>

          <button
            className={`btn ${styles.calendarSyncButton}`}
            onClick={() =>
              google.conectado
                ? void googleAction("sync")
                : (location.href = `/api/agendas/${agendaId}/google-calendar?acao=conectar`)
            }
            disabled={!agendaId || busy}
          >
            <RefreshCw size={15} className={busy ? "spin" : ""} />
            {google.conectado ? "Sincronizar" : "Conectar Google"}
          </button>

          {google.conectado ? (
            <div
              className={`${styles.googleHeaderSummary} ${
                google.sync_status === "erro" ? styles.googleHeaderError : ""
              }`}
              title={google.ultimo_erro || undefined}
            >
              <span className={styles.googleCalendarMark} aria-hidden="true" />
              <div>
                <strong>Google Calendar</strong>
                <small>
                  {google.sync_status === "erro"
                    ? `Sincronização requer atenção${google.email ? ` · ${google.email}` : ""}`
                    : google.bidirecional_ativa
                      ? `Bidirecional ativa${google.email ? ` · ${google.email}` : ""}`
                      : `Conectado${google.email ? ` · ${google.email}` : ""}`}
                </small>
              </div>
            </div>
          ) : null}

          <button
            className={`btn ${styles.calendarNewButton}`}
            onClick={() => openConfig(true)}
          >
            <Plus size={15} />
            Novo calendário
          </button>
          <button
            className="btn primary"
            onClick={() => newAg()}
            disabled={!agenda || agenda.status === "arquivado"}
          >
            <CalendarPlus size={16} />
            Novo agendamento
          </button>
        </div>
        {feedbacks.length > 0 &&
          (() => {
            const feedback = feedbacks[0],
              contato = relationOne(feedback.contatos),
              calendario = relationOne(feedback.agenda_calendarios),
              nomeCliente =
                feedback.nome_cliente ||
                contato?.nome ||
                "Cliente não informado",
              telefone = feedback.telefone_cliente || contato?.telefone || "";
            const abrirDetalhes = () => {
              const agendamento = ags.find((a) => a.id === feedback.id);
              if (agendamento) {
                edit(agendamento);
                return;
              }
              const data = new Date(feedback.inicio_at);
              if (feedback.agenda_id && feedback.agenda_id !== agendaId)
                setAgendaId(feedback.agenda_id);
              setMonth(new Date(data.getFullYear(), data.getMonth(), 1));
              setDay(key(data));
            };
            return (
              <section className="feedbackCard">
                <div className="feedbackIcon">
                  <Clock3 size={19} />
                </div>
                <div className="feedbackMain">
                  <div className="feedbackHead">
                    <span className="feedbackHeadLabel">
                      Confirme o resultado do agendamento
                    </span>
                    <span className="feedbackCounter">
                      {feedbacks.length} pendente
                      {feedbacks.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <strong className="feedbackTitle">
                    {feedback.titulo || "Agendamento"}
                  </strong>
                  <div className="feedbackClient">
                    <UserRound size={13} />
                    <b>{nomeCliente}</b>
                    {telefone && <span>· {telefone}</span>}
                  </div>
                  <div className="feedbackMeta">
                    <span className="feedbackMetaItem">
                      <CalendarDays size={13} />
                      <strong>{dt(feedback.inicio_at)}</strong>
                      {feedback.fim_at && (
                        <span>até {time(feedback.fim_at)}</span>
                      )}
                    </span>
                    <span className="feedbackMetaItem">
                      <CalendarDays size={13} />
                      <span>
                        Calendário:{" "}
                        <strong>{calendario?.nome || "Não informado"}</strong>
                      </span>
                    </span>
                    <span className="feedbackMetaItem">
                      <span>
                        Status:{" "}
                        <strong>
                          {labels[feedback.status] ||
                            feedback.status ||
                            "Agendado"}
                        </strong>
                      </span>
                    </span>
                    <span className="feedbackMetaItem">
                      <span>
                        Origem:{" "}
                        <strong>{feedbackOriginLabel(feedback.origem)}</strong>
                      </span>
                    </span>
                    {feedback.local && (
                      <span className="feedbackMetaItem">
                        <span>
                          Local: <strong>{feedback.local}</strong>
                        </span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="feedbackActions">
                  <button className="btn feedbackOpen" onClick={abrirDetalhes}>
                    <ExternalLink size={13} />
                    Detalhes
                  </button>
                  <button
                    className="btn feedbackSuccess"
                    onClick={() => answer(feedback.id, "realizado")}
                  >
                    <Check size={13} />
                    Realizado
                  </button>
                  <button
                    className="btn feedbackMissed"
                    onClick={() => answer(feedback.id, "faltou")}
                  >
                    <X size={13} />
                    Não compareceu
                  </button>
                </div>
              </section>
            );
          })()}
        <div className="stats">
          <div className="stat">
            <small>Ativos no mês</small>
            <b>{stats.ativos}</b>
          </div>
          <div className="stat">
            <small>Confirmados</small>
            <b>{stats.conf}</b>
          </div>
          <div className="stat">
            <small>Realizados</small>
            <b>{stats.done}</b>
          </div>
          <div className="stat">
            <small>Não compareceram</small>
            <b>{stats.miss}</b>
          </div>
          <div className="stat">
            <small>Confirmações pendentes</small>
            <b>{stats.pend}</b>
          </div>
        </div>
        <div className="layout">
          <section className="card">
            <div className="toolbar">
              <div className="nav">
                <button
                  className="btn"
                  onClick={() =>
                    setMonth(
                      new Date(month.getFullYear(), month.getMonth() - 1, 1),
                    )
                  }
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setMonth(new Date());
                    setDay(key(new Date()));
                  }}
                >
                  Hoje
                </button>
                <span className="month">
                  {new Intl.DateTimeFormat("pt-BR", {
                    month: "long",
                    year: "numeric",
                  }).format(month)}
                </span>
                <button
                  className="btn"
                  onClick={() =>
                    setMonth(
                      new Date(month.getFullYear(), month.getMonth() + 1, 1),
                    )
                  }
                >
                  <ChevronRight size={15} />
                </button>
              </div>
              <div className="filters">
                <div className="search">
                  <Search size={14} />
                  <input
                    placeholder="Buscar cliente, local..."
                    value={filter.q}
                    onChange={(e) =>
                      setFilter({ ...filter, q: e.target.value })
                    }
                  />
                </div>
                <select
                  value={filter.tipo}
                  onChange={(e) =>
                    setFilter({ ...filter, tipo: e.target.value })
                  }
                >
                  <option value="todos">Todos os tipos</option>
                  {tipos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
                <select
                  value={filter.resp}
                  onChange={(e) =>
                    setFilter({ ...filter, resp: e.target.value })
                  }
                >
                  <option value="todos">Todos os responsáveis</option>
                  {resps.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome}
                    </option>
                  ))}
                </select>
                <select
                  value={filter.status}
                  onChange={(e) =>
                    setFilter({ ...filter, status: e.target.value })
                  }
                >
                  <option value="todos">Todos os status</option>
                  {Object.entries(labels).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <select
                  value={filter.origem}
                  onChange={(e) =>
                    setFilter({ ...filter, origem: e.target.value })
                  }
                >
                  <option value="todos">Todas as origens</option>
                  <option value="manual">Manual</option>
                  <option value="automacao">Automação</option>
                  <option value="api">API</option>
                  <option value="google">Google</option>
                </select>
              </div>
            </div>
            <div className="grid">
              {dias.map((x) => (
                <div className="wd" key={x}>
                  {x}
                </div>
              ))}
              {days.map((x) => {
                const aa = byDay.get(x.k) || [],
                  gg =
                    filter.origem === "todos" || filter.origem === "google"
                      ? gby.get(x.k) || []
                      : [],
                  items = [...aa, ...gg].slice(0, 3);
                return (
                  <div
                    key={x.k}
                    className={`day ${!x.ok ? "muted" : ""} ${x.k === day ? "selected" : ""} ${x.k === key(new Date()) ? "today" : ""}`}
                    onClick={() => setDay(x.k)}
                  >
                    <div className="dh">
                      <span className="num">{x.d.getDate()}</span>
                      <button
                        className="add"
                        onClick={(e) => {
                          e.stopPropagation();
                          newAg(x.k);
                        }}
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                    {items.map((it) =>
                      "dia_inteiro" in it ? (
                        <div className="event g" key={`g${it.id}`}>
                          <b>
                            {it.dia_inteiro
                              ? "Dia inteiro"
                              : time(it.inicio_at)}
                          </b>
                          <span>{it.titulo} · Google</span>
                        </div>
                      ) : (
                        <button
                          className={`event ${it.status === "cancelado" ? "cancel" : ""}`}
                          style={
                            {
                              "--c": it.tipo?.cor || "#109b75",
                            } as React.CSSProperties
                          }
                          key={it.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            edit(it);
                          }}
                        >
                          <b>
                            {time(it.inicio_at)} · {it.titulo}
                          </b>
                          <span>
                            {it.nome_cliente ||
                              it.contato?.nome ||
                              it.responsavel?.nome ||
                              labels[it.status]}
                          </span>
                        </button>
                      ),
                    )}
                    {aa.length + gg.length > 3 ? (
                      <span className="pill">
                        Mais {aa.length + gg.length - 3}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
          <aside className="aside">
            <div className="card side">
              <h3>
                {new Intl.DateTimeFormat("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                }).format(new Date(`${day}T12:00`))}
              </h3>
              {(byDay.get(day) || []).map((a) => (
                <div className="item" key={a.id} onClick={() => edit(a)}>
                  <span
                    className={`pill agendaSideBadge agendaSideBadge-${a.status} ${["confirmado", "realizado"].includes(a.status) ? "on" : ""}`}
                  >
                    {labels[a.status]}
                  </span>
                  <b>
                    {" "}
                    {time(a.inicio_at)} · {a.titulo}
                  </b>
                  <div>
                    {a.nome_cliente ||
                      a.contato?.nome ||
                      "Cliente não informado"}
                    {a.responsavel?.nome ? ` · ${a.responsavel.nome}` : ""}
                  </div>
                </div>
              ))}
              {(gby.get(day) || []).map((g) => (
                <div className="item" key={g.id}>
                  <span className="pill agendaSideBadge agendaSideBadge-google">
                    Google
                  </span>
                  <b> {g.titulo}</b>
                  <div>
                    {g.dia_inteiro
                      ? "Dia inteiro"
                      : `${time(g.inicio_at)} – ${time(g.fim_at)}`}
                  </div>
                </div>
              ))}
              {!(byDay.get(day) || []).length &&
                !(gby.get(day) || []).length && (
                  <div className="empty">
                    <CalendarDays />
                    <br />
                    Nenhum evento.
                  </div>
                )}
            </div>
            <div className="card side">
              <h3>Google Calendar</h3>
              <div className="mini">
                <span className={`pill ${google.conectado ? "on" : ""}`}>
                  {google.conectado ? "Conectado" : "Desconectado"}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--crm-ui-private-content-hex-718096)",
                  }}
                >
                  {google.email}
                </span>
              </div>
              <div className="mini" style={{ marginTop: 9 }}>
                {google.conectado ? (
                  <>
                    <button
                      className="btn"
                      style={{ height: 31 }}
                      onClick={() => googleAction("sync")}
                    >
                      <RefreshCw size={13} />
                      Sincronizar
                    </button>
                    <button
                      className="btn"
                      style={{ height: 31 }}
                      onClick={() => googleAction("disconnect")}
                    >
                      <Unlink size={13} />
                    </button>
                  </>
                ) : (
                  <button
                    className="btn"
                    style={{ height: 31 }}
                    onClick={() =>
                      (location.href = `/api/agendas/${agendaId}/google-calendar?acao=conectar`)
                    }
                    disabled={!agendaId}
                  >
                    <Link2 size={13} />
                    Conectar
                  </button>
                )}
              </div>
            </div>
          </aside>
        </div>
      </main>
      {open && (
        <div
          className="overlay"
          onMouseDown={(e) =>
            e.target === e.currentTarget && !busy && setOpen(false)
          }
        >
          <aside className="drawer">
            <div className="dhead">
              <CalendarDays size={20} />
              <div>
                <h2>{form.id ? form.titulo : "Novo agendamento"}</h2>
                <p>
                  {form.id
                    ? `${dt(iso(form.inicio_at))} · ${labels[form.status]}`
                    : "Cadastre todas as informações do compromisso."}
                </p>
              </div>
              <button className="btn" onClick={() => setOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="body">
              <section className="section">
                <h3>
                  <CalendarDays size={15} />
                  Informações principais
                </h3>
                <div className="form">
                  <div className="field full">
                    <label>Título*</label>
                    <input
                      value={form.titulo}
                      onChange={(e) =>
                        setForm({ ...form, titulo: e.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Tipo</label>
                    <div className="row">
                      <select
                        style={{ flex: 1 }}
                        value={form.tipo_id}
                        onChange={(e) =>
                          setForm({ ...form, tipo_id: e.target.value })
                        }
                      >
                        <option value="">Sem tipo</option>
                        {tipos.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nome}
                          </option>
                        ))}
                      </select>
                      <button className="btn" onClick={customType}>
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="field">
                    <label>Status</label>
                    <select
                      value={form.status}
                      onChange={(e) =>
                        setForm({ ...form, status: e.target.value })
                      }
                    >
                      {Object.entries(labels).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Início*</label>
                    <input
                      type="datetime-local"
                      value={form.inicio_at}
                      onChange={(e) =>
                        ajustarInicioComDuracaoAgenda(e.target.value)
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Fim*</label>
                    <input
                      type="datetime-local"
                      value={form.fim_at}
                      onChange={(e) =>
                        setForm({ ...form, fim_at: e.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Responsável</label>
                    <select
                      value={form.responsavel_id}
                      onChange={(e) =>
                        setForm({ ...form, responsavel_id: e.target.value })
                      }
                    >
                      <option value="">Sem responsável</option>
                      {resps.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Prioridade</label>
                    <select
                      value={form.prioridade}
                      onChange={(e) =>
                        setForm({ ...form, prioridade: e.target.value })
                      }
                    >
                      <option value="baixa">Baixa</option>
                      <option value="normal">Normal</option>
                      <option value="alta">Alta</option>
                      <option value="urgente">Urgente</option>
                    </select>
                  </div>
                  <div className="field full">
                    <label>Local / endereço</label>
                    <input
                      value={form.local}
                      onChange={(e) =>
                        setForm({ ...form, local: e.target.value })
                      }
                      placeholder="Endereço, sala ou unidade"
                    />
                  </div>
                  <div className="field full">
                    <label>Link da reunião</label>
                    <input
                      value={form.link_reuniao}
                      onChange={(e) =>
                        setForm({ ...form, link_reuniao: e.target.value })
                      }
                    />
                  </div>
                  <div className="field full">
                    <label>Descrição</label>
                    <textarea
                      value={form.observacoes}
                      onChange={(e) =>
                        setForm({ ...form, observacoes: e.target.value })
                      }
                    />
                  </div>
                </div>
              </section>
              <section className="section">
                <h3>
                  <UserRound size={15} />
                  Cliente
                </h3>
                {contact ? (
                  <div className="contact">
                    <UserRound size={18} />
                    <div>
                      <b>{contact.nome || "Contato sem nome"}</b>
                      <small>
                        {contact.telefone}
                        {contact.email ? ` · ${contact.email}` : ""}
                      </small>
                    </div>
                    <button
                      className="btn"
                      style={{ height: 30 }}
                      onClick={() => {
                        setContact(null);
                        setForm({
                          ...form,
                          contato_id: "",
                          nome_cliente: "",
                          telefone_cliente: "",
                          email_cliente: "",
                        });
                      }}
                    >
                      Trocar
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="search">
                      <Search size={14} />
                      <input
                        style={{ width: "100%" }}
                        placeholder="Buscar contato"
                        value={cq}
                        onChange={(e) => setCq(e.target.value)}
                      />
                    </div>
                    {contacts.length > 0 && (
                      <div className="results">
                        {contacts.map((c) => (
                          <button
                            className="result"
                            key={c.id}
                            onClick={() => choose(c)}
                          >
                            <b>{c.nome || "Sem nome"}</b>
                            <div>
                              {c.telefone}
                              {c.email ? ` · ${c.email}` : ""}
                              {c.empresa ? ` · ${c.empresa}` : ""}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
                <div className="form" style={{ marginTop: 9 }}>
                  <div className="field">
                    <label>Nome*</label>
                    <input
                      value={form.nome_cliente}
                      onChange={(e) =>
                        setForm({ ...form, nome_cliente: e.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Telefone</label>
                    <input
                      value={form.telefone_cliente}
                      onChange={(e) =>
                        setForm({ ...form, telefone_cliente: e.target.value })
                      }
                    />
                  </div>
                  <div className="field full">
                    <label>E-mail</label>
                    <input
                      value={form.email_cliente}
                      onChange={(e) =>
                        setForm({ ...form, email_cliente: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="mini" style={{ marginTop: 8 }}>
                  {form.telefone_cliente && (
                    <a
                      className="btn"
                      style={{ height: 30 }}
                      target="_blank"
                      rel="noreferrer"
                      href={`https://wa.me/55${form.telefone_cliente.replace(/\D/g, "")}`}
                    >
                      <MessageCircle size={13} />
                      WhatsApp
                    </a>
                  )}
                  {form.contato_id && (
                    <a
                      className="btn"
                      style={{ height: 30 }}
                      href={`/contatos?contato=${form.contato_id}`}
                    >
                      <ExternalLink size={13} />
                      Abrir contato
                    </a>
                  )}
                </div>
              </section>
                <section className="section">
                  <div className={styles.cardHeader}>
                    <div className={styles.cardHeading}>
                      <h3 className={styles.cardTitle}>
                        <UsersRound size={15} />
                        Participantes
                      </h3>

                      <p className={styles.cardDescription}>
                        Inclua acompanhantes, responsáveis ou membros da equipe que também
                        participarão deste compromisso.
                      </p>
                    </div>

                    <button
                      type="button"
                      className="btn"
                      style={{ height: 30 }}
                      onClick={addPart}
                    >
                      <Plus size={13} />
                      Adicionar
                    </button>
                  </div>
                {form.participantes.map((p, i) => (
                  <div className="repeat" key={i}>
                    <div className="row">
                      <b>Participante {i + 1}</b>
                      <button
                        className="remove"
                        onClick={() =>
                          setForm({
                            ...form,
                            participantes: form.participantes.filter(
                              (_, x) => x !== i,
                            ),
                          })
                        }
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div className="form">
                      <div className="field">
                        <label>Nome*</label>
                        <input
                          value={p.nome}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              participantes: form.participantes.map((x, n) =>
                                n === i ? { ...x, nome: e.target.value } : x,
                              ),
                            })
                          }
                        />
                      </div>
                      <div className="field">
                        <label>Papel</label>
                        <input
                          value={p.papel}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              participantes: form.participantes.map((x, n) =>
                                n === i ? { ...x, papel: e.target.value } : x,
                              ),
                            })
                          }
                        />
                      </div>
                      <div className="field">
                        <label>E-mail</label>
                        <input
                          value={p.email}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              participantes: form.participantes.map((x, n) =>
                                n === i ? { ...x, email: e.target.value } : x,
                              ),
                            })
                          }
                        />
                      </div>
                      <div className="field">
                        <label>Telefone</label>
                        <input
                          value={p.telefone}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              participantes: form.participantes.map((x, n) =>
                                n === i
                                  ? { ...x, telefone: e.target.value }
                                  : x,
                              ),
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {form.participantes.length === 0 && (
                  <div className="empty">Nenhum participante adicional.</div>
                )}
              </section>
                <section className={`section ${styles.relatedSection}`}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardHeading}>
                      <div className={styles.relatedTitleGroup}>
                        <h3 className={styles.cardTitle}>
                          <Link2 size={15} />
                          {relatedPresentation.titulo}
                        </h3>

                        {niche?.nome ? (
                          <span className={styles.relatedNicheBadge}>
                            {niche.nome}
                          </span>
                        ) : null}
                      </div>

                      <p className={styles.cardDescription}>
                        {relatedPresentation.dica}
                      </p>
                    </div>

                    <button
                      type="button"
                      className="btn"
                      style={{ height: 30 }}
                      onClick={addLink}
                    >
                      <Plus size={13} />
                      {relatedPresentation.botao}
                    </button>
                  </div>
                {form.vinculos.map((v, i) => (
                  <div className="repeat" key={i}>
                    <div className="row">
                      <b>Registro {i + 1}</b>
                      <button
                        className="remove"
                        onClick={() =>
                          setForm({
                            ...form,
                            vinculos: form.vinculos.filter((_, x) => x !== i),
                          })
                        }
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div className="form">
                      <div className="field">
                        <label>Tipo</label>
                        <select
                          value={v.entidade_tipo}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              vinculos: form.vinculos.map((x, n) =>
                                n === i
                                  ? { ...x, entidade_tipo: e.target.value }
                                  : x,
                              ),
                            })
                          }
                        >
                          {relatedPresentation.tipos.map((type) => (
                            <option key={type} value={type}>
                              {relatedTypeLabels[type] || type}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>Código / ID</label>
                        <input
                          value={v.entidade_id}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              vinculos: form.vinculos.map((x, n) =>
                                n === i
                                  ? { ...x, entidade_id: e.target.value }
                                  : x,
                              ),
                            })
                          }
                        />
                      </div>
                      <div className="field full">
                        <label>Título*</label>
                        <input
                          value={v.titulo}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              vinculos: form.vinculos.map((x, n) =>
                                n === i ? { ...x, titulo: e.target.value } : x,
                              ),
                            })
                          }
                        />
                      </div>
                      <div className="field">
                        <label>Papel</label>
                        <input
                          value={v.papel}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              vinculos: form.vinculos.map((x, n) =>
                                n === i ? { ...x, papel: e.target.value } : x,
                              ),
                            })
                          }
                        />
                      </div>
                      <div className="field">
                        <label>Resumo</label>
                        <input
                          value={v.subtitulo}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              vinculos: form.vinculos.map((x, n) =>
                                n === i
                                  ? { ...x, subtitulo: e.target.value }
                                  : x,
                              ),
                            })
                          }
                        />
                      </div>
                      <div className="field full">
                        <label>URL da imagem</label>
                        <input
                          value={v.imagem_url}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              vinculos: form.vinculos.map((x, n) =>
                                n === i
                                  ? { ...x, imagem_url: e.target.value }
                                  : x,
                              ),
                            })
                          }
                        />
                      </div>
                      <div className="field">
                        <label>Campo adicional</label>
                        <input
                          value={Object.keys(v.dados_json)[0] || ""}
                          onChange={(e) => {
                            const val = Object.values(v.dados_json)[0] || "";
                            setForm({
                              ...form,
                              vinculos: form.vinculos.map((x, n) =>
                                n === i
                                  ? {
                                      ...x,
                                      dados_json: e.target.value
                                        ? { [e.target.value]: val }
                                        : {},
                                    }
                                  : x,
                              ),
                            });
                          }}
                        />
                      </div>
                      <div className="field">
                        <label>Valor</label>
                        <input
                          value={Object.values(v.dados_json)[0] || ""}
                          onChange={(e) => {
                            const k =
                              Object.keys(v.dados_json)[0] || "Informação";
                            setForm({
                              ...form,
                              vinculos: form.vinculos.map((x, n) =>
                                n === i
                                  ? {
                                      ...x,
                                      dados_json: e.target.value
                                        ? { [k]: e.target.value }
                                        : {},
                                    }
                                  : x,
                              ),
                            });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {form.vinculos.length === 0 && (
                  <div className="empty">Nenhum registro relacionado.</div>
                )}
              </section>
              <section className="section">
                <div className={styles.reminderHeader}>
                  <div className={styles.reminderHeading}>
                    <h3 className={styles.reminderTitle}>
                      <Bell size={15} />
                      Lembretes e confirmação
                    </h3>

                    <p className={styles.reminderDescription}>
                      Crie avisos extras somente para este compromisso. Eles serão
                      processados e exibidos junto das automações em Disparos agendados.
                    </p>
                  </div>

                  <button
                    type="button"
                    className={`btn ${styles.reminderButton}`}
                    onClick={addRem}
                  >
                    <Plus size={13} />
                    Lembrete
                  </button>
                </div>
                {form.lembretes.length === 0 && (
                  <div className="empty">
                    Nenhum lembrete adicional. Clique em Lembrete para
                    configurar um envio.
                  </div>
                )}
                {form.lembretes.map((r, i) => {
                  const reminderMetadata = r.metadata_json || {};
                  const selectedTemplate = reminderOptions.templates.find(
                    (item) => item.id === reminderMetadata.whatsapp_template_id,
                  );
                  const compatibleTemplates = reminderOptions.templates.filter(
                    (item) =>
                      !reminderMetadata.integracao_whatsapp_id ||
                      item.integracao_whatsapp_id ===
                        reminderMetadata.integracao_whatsapp_id,
                  );
                  const fallbackConfiguration =
                    defaultTemplateConfiguration(selectedTemplate);
                  const templateConfiguration: AgendaTemplateConfigurationValue =
                    {
                      template_variaveis: Array.isArray(
                        reminderMetadata.template_variaveis,
                      )
                        ? reminderMetadata.template_variaveis
                        : fallbackConfiguration.template_variaveis,
                      template_botoes: Array.isArray(
                        reminderMetadata.template_botoes,
                      )
                        ? reminderMetadata.template_botoes
                        : fallbackConfiguration.template_botoes,
                      marketing_aceito:
                        reminderMetadata.marketing_aceito === true,
                    };
                  return (
                    <div className="repeat" key={r.id || i}>
                      <div className="rem">
                        <div className="field">
                          <label>Canal</label>
                          <select
                            value={r.canal}
                            onChange={(e) => {
                              const canal = e.target.value;
                              setForm({
                                ...form,
                                lembretes: form.lembretes.map((x, n) =>
                                  n === i
                                    ? {
                                        ...x,
                                        canal,
                                        metadata_json:
                                          canal === "whatsapp"
                                            ? x.metadata_json || {}
                                            : x.metadata_json,
                                      }
                                    : x,
                                ),
                              });
                            }}
                          >
                            {r.destinatario_tipo === "responsavel" ? (
                              <>
                                <option value="sistema">Sistema</option>
                                <option value="email">E-mail</option>
                              </>
                            ) : (
                              <>
                                <option value="email">E-mail</option>
                                <option value="whatsapp">WhatsApp</option>
                              </>
                            )}
                          </select>
                        </div>
                        <div className="field">
                          <label>Antecedência</label>
                          <select
                            value={r.antecedencia_minutos}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                lembretes: form.lembretes.map((x, n) =>
                                  n === i
                                    ? {
                                        ...x,
                                        antecedencia_minutos: Number(
                                          e.target.value,
                                        ),
                                      }
                                    : x,
                                ),
                              })
                            }
                          >
                            <option value={15}>15 min</option>
                            <option value={30}>30 min</option>
                            <option value={60}>1 hora</option>
                            <option value={120}>2 horas</option>
                            <option value={1440}>1 dia</option>
                            <option value={2880}>2 dias</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>Destinatário</label>
                          <select
                            value={r.destinatario_tipo}
                            onChange={(e) => {
                              const destinatario_tipo = e.target.value;
                              setForm({
                                ...form,
                                lembretes: form.lembretes.map((x, n) => {
                                  if (n !== i) return x;
                                  const canal =
                                    destinatario_tipo === "responsavel"
                                      ? x.canal === "whatsapp"
                                        ? "sistema"
                                        : x.canal
                                      : x.canal === "sistema"
                                        ? "email"
                                        : x.canal;
                                  return {
                                    ...x,
                                    destinatario_tipo,
                                    canal,
                                    metadata_json:
                                      canal === "whatsapp"
                                        ? x.metadata_json || {}
                                        : x.metadata_json,
                                  };
                                }),
                              });
                            }}
                          >
                            <option value="responsavel">Responsável</option>
                            <option value="cliente">Cliente</option>
                            <option value="participantes">Participantes</option>
                          </select>
                        </div>
                        <button
                          className="remove"
                          onClick={() =>
                            setForm({
                              ...form,
                              lembretes: form.lembretes.filter(
                                (_, x) => x !== i,
                              ),
                            })
                          }
                        >
                          <X size={14} />
                        </button>
                      </div>
                      {r.canal === "whatsapp" && (
                        <div className="remWhatsapp">
                          <div className="field">
                            <label>Integração do WhatsApp</label>
                            <select
                              value={
                                reminderMetadata.integracao_whatsapp_id || ""
                              }
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  lembretes: form.lembretes.map((x, n) =>
                                    n === i
                                      ? {
                                          ...x,
                                          metadata_json: {
                                            ...(x.metadata_json || {}),
                                            integracao_whatsapp_id:
                                              e.target.value || null,
                                            whatsapp_template_id: null,
                                            marketing_aceito: false,
                                            template_variaveis: [],
                                            template_botoes: [],
                                          },
                                        }
                                      : x,
                                  ),
                                })
                              }
                            >
                              <option value="">Selecione</option>
                              {reminderOptions.integracoes.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.nome_conexao}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="field">
                            <label>Template aprovado</label>
                            <select
                              value={
                                reminderMetadata.whatsapp_template_id || ""
                              }
                              onChange={(e) =>
                                setForm((current) => {
                                  const templateId = e.target.value;
                                  const template =
                                    reminderOptions.templates.find(
                                      (item) => item.id === templateId,
                                    );
                                  const configuration =
                                    defaultTemplateConfiguration(template);
                                  return {
                                    ...current,
                                    lembretes: current.lembretes.map((x, n) =>
                                      n === i
                                        ? {
                                            ...x,
                                            metadata_json: {
                                              ...(x.metadata_json || {}),
                                              whatsapp_template_id:
                                                templateId || null,
                                              ...configuration,
                                            },
                                          }
                                        : x,
                                    ),
                                  };
                                })
                              }
                            >
                              <option value="">Selecione</option>
                              {compatibleTemplates.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.nome} · {item.idioma} · {item.categoria}
                                </option>
                              ))}
                            </select>
                          </div>
                          <AgendaTemplateConfiguration
                            template={selectedTemplate}
                            flows={reminderOptions.fluxos}
                            customVariables={reminderOptions.variaveis}
                            value={templateConfiguration}
                            onChange={(configuration) =>
                              setForm((current) => ({
                                ...current,
                                lembretes: current.lembretes.map(
                                  (item, position) =>
                                    position === i
                                      ? {
                                          ...item,
                                          metadata_json: {
                                            ...(item.metadata_json || {}),
                                            ...configuration,
                                          },
                                        }
                                      : item,
                                ),
                              }))
                            }
                          />
                        </div>
                      )}
                      {r.erro && (
                        <small
                          style={{
                            display: "block",
                            marginTop: 7,
                            color: "var(--crm-ui-private-content-hex-c32640)",
                          }}
                        >
                          {r.erro}
                        </small>
                      )}
                    </div>
                  );
                })}
              </section>
              <section className="section">
                <h3>
                  <Check size={15} />
                  Resultado e informações internas
                </h3>
                <div className="form">
                  <div className="field">
                    <label>Status final</label>
                    <select
                      value={form.status}
                      onChange={(e) =>
                        setForm({ ...form, status: e.target.value })
                      }
                    >
                      {Object.entries(labels).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Resumo do resultado</label>
                    <input
                      value={form.resultado}
                      onChange={(e) =>
                        setForm({ ...form, resultado: e.target.value })
                      }
                      placeholder="Ex.: proposta enviada"
                    />
                  </div>
                  <div className="field full">
                    <label>Observações internas</label>
                    <textarea
                      value={form.observacoes_internas}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          observacoes_internas: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </section>
              {form.id && (
                <section className="section">
                  <h3>
                    <History size={15} />
                    Histórico
                  </h3>
                  <div className="history">
                    {(ags.find((a) => a.id === form.id)?.historico || []).map(
                      (h) => (
                        <div className="hist" key={h.id}>
                          <b>{h.acao.replaceAll("_", " ")}</b>
                          <p>{h.descricao || "Alteração registrada."}</p>
                          <small>
                            {h.usuario_nome || "Sistema"} · {dt(h.created_at)}
                          </small>
                        </div>
                      ),
                    )}
                    {!(ags.find((a) => a.id === form.id)?.historico || [])
                      .length && (
                      <div className="empty">Sem alterações registradas.</div>
                    )}
                  </div>
                </section>
              )}
            </div>
            <div className="foot">
              <div>
                {form.id && form.status !== "cancelado" && (
                  <button
                    className="btn danger eventFooterAction"
                    onClick={() => setCancelConfirm(true)}
                  >
                    <X size={15} />
                    Cancelar evento
                  </button>
                )}
              </div>
              <div className="mini">
                <button className="btn" onClick={() => setOpen(false)}>
                  Fechar
                </button>
                <button
                  className="btn primary"
                  onClick={() => save()}
                  disabled={busy}
                >
                  {busy ? (
                    <RefreshCw className="spin" size={15} />
                  ) : (
                    <Check size={15} />
                  )}
                  Salvar
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
      {cancelConfirm && (
        <div
          className="modalbg cancelConfirmBg"
          onMouseDown={(e) =>
            e.target === e.currentTarget && !busy && setCancelConfirm(false)
          }
        >
          <div
            className="confirmModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-event-title"
          >
            <div className="confirmBody">
              <div className="confirmIcon">
                <X size={22} />
              </div>
              <h2 id="cancel-event-title">Cancelar evento?</h2>
              <p>
                O agendamento <strong>{form.titulo || "selecionado"}</strong>{" "}
                será marcado como cancelado. Esta ação ficará registrada no
                histórico.
              </p>
              <div className="confirmSummary">
                <CalendarDays size={18} />
                <div>
                  <b>{dt(iso(form.inicio_at))}</b>
                  <span>
                    {form.nome_cliente ||
                      contact?.nome ||
                      "Cliente não informado"}
                  </span>
                </div>
              </div>
            </div>
            <div className="confirmActions">
              <button
                className="btn"
                onClick={() => setCancelConfirm(false)}
                disabled={busy}
              >
                Voltar
              </button>
              <button
                className="btn confirmDanger"
                onClick={() => {
                  setCancelConfirm(false);
                  void save("cancelado");
                }}
                disabled={busy}
              >
                {busy ? (
                  <RefreshCw className="spin" size={15} />
                ) : (
                  <X size={15} />
                )}
                Cancelar evento
              </button>
            </div>
          </div>
        </div>
      )}
      {typeModal && (
        <div
          className="modalbg typeModalBg"
          onMouseDown={(e) =>
            e.target === e.currentTarget && !typeBusy && setTypeModal(false)
          }
        >
          <div
            className="typeModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="type-modal-title"
          >
            <div className="dhead">
              <div className="typeModalIcon">
                <CalendarPlus size={19} />
              </div>
              <div>
                <h2 id="type-modal-title">Novo tipo de agendamento</h2>
                <p>
                  Crie uma categoria para organizar e identificar os
                  compromissos.
                </p>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => setTypeModal(false)}
                disabled={typeBusy}
                aria-label="Fechar"
              >
                <X size={15} />
              </button>
            </div>
            <div className="body">
              <p className="typeModalIntro">
                Defina um nome claro e uma cor para destacar este tipo no
                calendário.
              </p>
              <div className="typeModalForm">
                <div className="field">
                  <label>Nome do tipo*</label>
                  <input
                    autoFocus
                    maxLength={80}
                    value={typeDraft.nome}
                    onChange={(e) =>
                      setTypeDraft({ ...typeDraft, nome: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveCustomType();
                    }}
                    placeholder="Ex.: Visita ao imóvel"
                  />
                </div>
                <div className="field">
                  <label>Cor de identificação</label>
                  <div className="typeColorControl">
                    <input
                      type="color"
                      value={
                        /^#[0-9a-fA-F]{6}$/.test(typeDraft.cor)
                          ? typeDraft.cor
                          : "#22c55e"
                      }
                      onChange={(e) =>
                        setTypeDraft({ ...typeDraft, cor: e.target.value })
                      }
                      aria-label="Selecionar cor"
                    />
                    <input
                      value={typeDraft.cor}
                      onChange={(e) =>
                        setTypeDraft({ ...typeDraft, cor: e.target.value })
                      }
                      maxLength={7}
                      placeholder="#22c55e"
                    />
                  </div>
                </div>
              </div>
              <div className="typePreview">
                <span
                  className="typePreviewMark"
                  style={{
                    backgroundColor: /^#[0-9a-fA-F]{6}$/.test(typeDraft.cor)
                      ? typeDraft.cor
                      : "#22c55e",
                  }}
                />
                <div>
                  <strong>{typeDraft.nome.trim() || "Novo tipo"}</strong>
                  <small>Prévia da identificação no calendário.</small>
                </div>
              </div>
              {typeError && <div className="typeModalError">{typeError}</div>}
            </div>
            <div className="foot">
              <button
                type="button"
                className="btn"
                onClick={() => setTypeModal(false)}
                disabled={typeBusy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => void saveCustomType()}
                disabled={typeBusy}
              >
                {typeBusy ? (
                  <RefreshCw className="spin" size={15} />
                ) : (
                  <Check size={15} />
                )}
                Criar tipo
              </button>
            </div>
          </div>
        </div>
      )}
      {config && (
        <div className="modalbg">
          <div className="modal">
            <div className="dhead">
              <Settings2 size={18} />
              <div>
                <h2>
                  {configNew ? "Novo calendário" : "Configurar calendário"}
                </h2>
                <p>Defina regras e disponibilidade semanal.</p>
              </div>
              <button className="btn" onClick={() => setConfig(false)}>
                <X size={15} />
              </button>
            </div>
            <div className="body">
              <div className="form">
                <div className="field full">
                  <label className={styles.configMainLabel}>Nome*</label>
                  <input
                    value={af.nome}
                    onChange={(e) => setAf({ ...af, nome: e.target.value })}
                  />
                </div>

                <div className="field full">
                  <label className={styles.configMainLabel}>Descrição</label>
                  <textarea
                    value={af.descricao}
                    onChange={(e) =>
                      setAf({ ...af, descricao: e.target.value })
                    }
                  />
                </div>
              </div>
              <section className={styles.googleConfigCard}>
                <span className={styles.googleConfigMark} aria-hidden="true" />
                <h3>Google Calendar</h3>
                <p className={styles.googleConfigSubtitle}>
                  Vincule somente este calendário e mantenha criação, alterações
                  e cancelamentos sincronizados.
                </p>
                <div className={`mini ${styles.googleConfigState}`}>
                  <span className={`pill ${google.conectado ? "on" : ""}`}>
                    {google.conectado ? "Conectado" : "Não conectado"}
                  </span>
                  <span className={styles.googleConfigStatus}>
                    {configNew
                      ? "Salve o calendário para habilitar a conexão individual."
                      : google.email ||
                        "Este calendário ainda não está vinculado ao Google Calendar."}
                  </span>
                  <span className={styles.googleOfficialBadge}>
                    Integração oficial
                  </span>
                  {google.conectado && google.bidirecional_ativa ? (
                    <span className={styles.googleBidirectionalBadge}>
                      Bidirecional ativa
                    </span>
                  ) : null}
                </div>
                <div className={`mini ${styles.googleConfigActions}`}>
                  {!configNew && google.conectado ? (
                    <>
                      <button
                        type="button"
                        className={`btn ${styles.googleConfigSync}`}
                        onClick={() => void googleAction("sync")}
                        disabled={busy}
                      >
                        <RefreshCw size={14} />
                        Sincronizar agora
                      </button>
                      <button
                        type="button"
                        className={`btn danger ${styles.googleConfigDisconnect}`}
                        onClick={() => void googleAction("disconnect")}
                        disabled={busy}
                      >
                        <Unlink size={14} />
                        Desvincular
                      </button>
                    </>
                  ) : !configNew ? (
                    <button
                      type="button"
                      className={`btn ${styles.googleConfigSync}`}
                      onClick={() =>
                        (location.href = `/api/agendas/${agendaId}/google-calendar?acao=conectar`)
                      }
                    >
                      <Link2 size={14} />
                      Conectar este calendário
                    </button>
                  ) : null}
                </div>
              </section>
              {configOptions.integracoes.length > 1 && (
                <AgendaCalendarIntegrationScope
                  integrations={configOptions.integracoes}
                  selectedIds={agendaIntegrationIds}
                  onChange={setAgendaIntegrationIds}
                  loading={configDetailsLoading}
                  error={configDetailsError}
                />
              )}
              <section className={styles.settingsCard}>
                <div className={styles.settingsHeader}>
                  <h3>Configurações de agendamento</h3>
                  <p>
                    Defina a duração dos atendimentos, o espaço entre horários,
                    a antecedência mínima e o período disponível para novos
                    agendamentos.
                  </p>
                </div>

                <div className={styles.settingsGrid}>
                  <div className="field">
                    <label>Duração padrão</label>
                    <div className="agendaTimeUnitControl">
                      <input
                        type="number"
                        min={unidadeDuracaoAgenda === "horas" ? "0.25" : "1"}
                        step={unidadeDuracaoAgenda === "horas" ? "0.25" : "1"}
                        value={valorTempoAgenda(
                          af.duracao_minutos,
                          unidadeDuracaoAgenda,
                        )}
                        onChange={(event) =>
                          atualizarTempoAgenda(
                            "duracao_minutos",
                            event.target.value,
                            unidadeDuracaoAgenda,
                          )
                        }
                      />
                      <select
                        value={unidadeDuracaoAgenda}
                        onChange={(event) =>
                          setUnidadeDuracaoAgenda(
                            event.target.value as "minutos" | "horas",
                          )
                        }
                        aria-label="Unidade da duração padrão"
                      >
                        <option value="minutos">minutos</option>
                        <option value="horas">horas</option>
                      </select>
                    </div>
                  </div>

                  <div className="field">
                    <label>Espaço entre horários</label>
                    <div className="agendaTimeUnitControl">
                      <input
                        type="number"
                        min="0"
                        step={unidadeIntervaloAgenda === "horas" ? "0.25" : "1"}
                        value={valorTempoAgenda(
                          af.intervalo_minutos,
                          unidadeIntervaloAgenda,
                        )}
                        onChange={(event) =>
                          atualizarTempoAgenda(
                            "intervalo_minutos",
                            event.target.value,
                            unidadeIntervaloAgenda,
                          )
                        }
                      />
                      <select
                        value={unidadeIntervaloAgenda}
                        onChange={(event) =>
                          setUnidadeIntervaloAgenda(
                            event.target.value as "minutos" | "horas",
                          )
                        }
                        aria-label="Unidade do intervalo"
                      >
                        <option value="minutos">minutos</option>
                        <option value="horas">horas</option>
                      </select>
                    </div>
                  </div>

                  <div className="field">
                    <label>Antecedência mínima</label>
                    <div className="agendaTimeUnitControl">
                      <input
                        type="number"
                        min="0"
                        step={
                          unidadeAntecedenciaAgenda === "horas" ? "0.25" : "1"
                        }
                        value={valorTempoAgenda(
                          af.antecedencia_minutos,
                          unidadeAntecedenciaAgenda,
                        )}
                        onChange={(event) =>
                          atualizarTempoAgenda(
                            "antecedencia_minutos",
                            event.target.value,
                            unidadeAntecedenciaAgenda,
                          )
                        }
                      />
                      <select
                        value={unidadeAntecedenciaAgenda}
                        onChange={(event) =>
                          setUnidadeAntecedenciaAgenda(
                            event.target.value as "minutos" | "horas",
                          )
                        }
                        aria-label="Unidade da antecedência mínima"
                      >
                        <option value="minutos">minutos</option>
                        <option value="horas">horas</option>
                      </select>
                    </div>
                  </div>

                  <div className="field">
                    <label>Janela em dias</label>
                    <input
                      type="number"
                      value={af.janela_dias}
                      onChange={(event) =>
                        setAf({ ...af, janela_dias: event.target.value })
                      }
                    />
                  </div>
                </div>
              </section>
              <h3 className={styles.availabilitySectionTitle}>
                Disponibilidade semanal
              </h3>
              <p className="availabilityHint">
                Defina o início e o fim de cada dia e adicione até 5 intervalos
                que não poderão receber agendamentos, como almoço, café ou
                compromissos internos.
              </p>
              <AgendaAvailabilityEditor
                days={disp}
                dayNames={diasFull}
                onChange={setDisp}
              />

              <AgendaAutomationSettings
                options={configOptions}
                selectedIntegrationIds={agendaIntegrationIds}
                cards={automationCards}
                onChange={setAutomationCards}
                loading={configDetailsLoading}
                error={configDetailsError}
              />
            </div>
            <div className="foot">
              <div className="mini">
                {!configNew && (
                  <button className="btn" onClick={archive}>
                    {agenda?.status === "arquivado" ? (
                      <ArchiveRestore size={14} />
                    ) : (
                      <Archive size={14} />
                    )}{" "}
                    {agenda?.status === "arquivado" ? "Reativar" : "Arquivar"}
                  </button>
                )}
                {!configNew && agenda?.status === "arquivado" && (
                  <button className="btn danger" onClick={delAgenda}>
                    <Trash2 size={14} />
                    Excluir
                  </button>
                )}
              </div>
              <div className="mini">
                <button className="btn" onClick={() => setConfig(false)}>
                  Cancelar
                </button>
                <button
                  className="btn primary"
                  onClick={saveConfig}
                  disabled={busy || configDetailsLoading}
                >
                  <Check size={14} />
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default function AgendasPage() {
  return (
    <div className={styles.scope}>
      <div className="agendaTemplateShell">
        <Suspense fallback={<div>Carregando...</div>}>
          <Page />
        </Suspense>
      </div>
    </div>
  );
}
