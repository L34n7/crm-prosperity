"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Link2,
  RefreshCw,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import FeedbackToast from "@/components/FeedbackToast";
import Header from "@/components/Header";
import styles from "./agendas.module.css";

type Agenda = {
  id: string;
  nome: string;
  descricao: string | null;
  timezone: string;
  duracao_minutos: number;
  intervalo_minutos: number;
  antecedencia_minutos: number;
  janela_dias: number;
  status: "ativo" | "inativo" | "arquivado";
  created_at: string;
  updated_at: string;
  proximo_agendamento?: Agendamento | null;
};

type Disponibilidade = {
  id?: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
  ativo: boolean;
};

type Agendamento = {
  id: string;
  agenda_id: string;
  contato_id: string | null;
  titulo: string;
  nome_cliente: string | null;
  telefone_cliente: string | null;
  email_cliente: string | null;
  inicio_at: string;
  fim_at: string;
  status: "agendado" | "confirmado" | "cancelado" | "realizado" | "faltou";
  origem: "manual" | "automacao" | "api";
  observacoes: string | null;
  contatos?: {
    id: string;
    nome: string | null;
    telefone: string | null;
    email: string | null;
  } | null;
};

type Slot = {
  indice: number;
  inicio_at: string;
  fim_at: string;
  label: string;
  data_label: string;
  hora_label: string;
};

type GoogleCalendarEvento = {
  id: string;
  titulo: string;
  inicio_at: string;
  fim_at: string;
  dia_inteiro: boolean;
};

type ConfigForm = {
  nome: string;
  descricao: string;
  duracao_minutos: string;
  intervalo_minutos: string;
  antecedencia_minutos: string;
  janela_dias: string;
  status: string;
};

type AgendamentoForm = {
  titulo: string;
  nome_cliente: string;
  telefone_cliente: string;
  email_cliente: string;
  inicio_at: string;
  fim_at: string;
  observacoes: string;
};

type CalendarDay = {
  key: string;
  date: Date;
  currentMonth: boolean;
};

type GoogleCalendarIntegracao = {
  conectado: boolean;
  email?: string | null;
  ultima_sincronizacao_em?: string | null;
};

const DIAS = [
  { valor: 0, label: "Domingo", curto: "Dom" },
  { valor: 1, label: "Segunda", curto: "Seg" },
  { valor: 2, label: "Terca", curto: "Ter" },
  { valor: 3, label: "Quarta", curto: "Qua" },
  { valor: 4, label: "Quinta", curto: "Qui" },
  { valor: 5, label: "Sexta", curto: "Sex" },
  { valor: 6, label: "Sabado", curto: "Sab" },
];

function formPadrao(): ConfigForm {
  return {
    nome: "",
    descricao: "",
    duracao_minutos: "60",
    intervalo_minutos: "30",
    antecedencia_minutos: "120",
    janela_dias: "14",
    status: "ativo",
  };
}

function disponibilidadesPadrao(): Disponibilidade[] {
  return DIAS.map((dia) => ({
    dia_semana: dia.valor,
    hora_inicio: "09:00",
    hora_fim: "18:00",
    ativo: dia.valor >= 1 && dia.valor <= 5,
  }));
}

function mensagemErro(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function pad2(valor: number) {
  return String(valor).padStart(2, "0");
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )}`;
}

function dateKeyFromIso(valor: string) {
  return dateKey(new Date(valor));
}

function formatarData(valor?: string | null) {
  if (!valor) return "-";

  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(valor));
  } catch {
    return "-";
  }
}

function formatarHorarioGoogle(evento: GoogleCalendarEvento) {
  if (evento.dia_inteiro) return "Dia inteiro";

  const inicio = new Date(evento.inicio_at);
  const fim = new Date(evento.fim_at);

  return `${pad2(inicio.getHours())}:${pad2(inicio.getMinutes())} - ${pad2(
    fim.getHours()
  )}:${pad2(fim.getMinutes())}`;
}

function dateKeyEventoGoogle(evento: GoogleCalendarEvento) {
  return evento.dia_inteiro
    ? evento.inicio_at.slice(0, 10)
    : dateKeyFromIso(evento.inicio_at);
}

function formatarDiaSelecionado(valor?: string | null) {
  if (!valor) return "Dia";

  const [ano, mes, dia] = valor.split("-").map(Number);
  const date = new Date(ano, mes - 1, dia);

  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(date);
}

function paraDatetimeLocal(valor?: string | null) {
  if (!valor) return "";

  const date = new Date(valor);

  if (Number.isNaN(date.getTime())) return "";

  const ano = date.getFullYear();
  const mes = pad2(date.getMonth() + 1);
  const dia = pad2(date.getDate());
  const hora = pad2(date.getHours());
  const minuto = pad2(date.getMinutes());

  return `${ano}-${mes}-${dia}T${hora}:${minuto}`;
}

function criarDatetimeLocalDoDia(data: string, hora = "09:00") {
  return `${data}T${hora}`;
}

function somarMinutosDatetimeLocal(valor: string, minutos: number) {
  const date = new Date(valor);

  if (Number.isNaN(date.getTime())) return "";

  date.setMinutes(date.getMinutes() + minutos);

  return paraDatetimeLocal(date.toISOString());
}

function agendamentoFormPadrao(data?: string | null, duracaoMinutos = 60): AgendamentoForm {
  const inicio = data ? criarDatetimeLocalDoDia(data, "09:00") : "";
  const fim = inicio ? somarMinutosDatetimeLocal(inicio, duracaoMinutos) : "";

  return {
    titulo: "Agendamento",
    nome_cliente: "",
    telefone_cliente: "",
    email_cliente: "",
    inicio_at: inicio,
    fim_at: fim,
    observacoes: "",
  };
}


function statusLabel(status: string) {
  if (status === "ativo") return "Ativa";
  if (status === "inativo") return "Inativa";
  if (status === "arquivado") return "Arquivada";
  if (status === "agendado") return "Agendado";
  if (status === "confirmado") return "Confirmado";
  if (status === "cancelado") return "Cancelado";
  if (status === "realizado") return "Realizado";
  if (status === "faltou") return "Faltou";
  return status;
}

function statusClasse(status: string) {
  if (["ativo", "confirmado", "realizado"].includes(status)) {
    return `${styles.badge} ${styles.badgeGreen}`;
  }

  if (status === "agendado") {
    return `${styles.badge} ${styles.badgeBlue}`;
  }

  return `${styles.badge} ${styles.badgeGray}`;
}

function construirDiasCalendario(mesAtual: Date): CalendarDay[] {
  const ano = mesAtual.getFullYear();
  const mes = mesAtual.getMonth();
  const primeiroDia = new Date(ano, mes, 1);
  const inicio = new Date(ano, mes, 1 - primeiroDia.getDay());

  return Array.from({ length: 42 }).map((_, index) => {
    const date = new Date(inicio);
    date.setDate(inicio.getDate() + index);

    return {
      key: dateKey(date),
      date,
      currentMonth: date.getMonth() === mes,
    };
  });
}

function mesLabel(mesAtual: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(mesAtual);
}

function feedbackGoogleCalendar(status: string) {
  if (status === "conectado") {
    return { sucesso: "Conta Google vinculada e agenda sincronizada.", erro: "" };
  }

  if (status === "conectado_sync_pendente") {
    return {
      sucesso: "Conta Google vinculada. Use Sincronizar agora para repetir a sincronizacao.",
      erro: "",
    };
  }

  if (status === "cancelado") {
    return { sucesso: "", erro: "A vinculacao com o Google foi cancelada." };
  }

  return {
    sucesso: "",
    erro: "Nao foi possivel concluir a vinculacao com o Google Calendar.",
  };
}

function AgendasPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const agendaParam = searchParams.get("agenda");
  const mobileDetailActive = Boolean(agendaParam);

  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [agendaSelecionadaId, setAgendaSelecionadaId] = useState("");
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [slotsDia, setSlotsDia] = useState<Slot[]>([]);
  const [eventosGoogle, setEventosGoogle] = useState<GoogleCalendarEvento[]>([]);
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);
  const [mesAtual, setMesAtual] = useState(() => new Date());

  const [form, setForm] = useState<ConfigForm>(formPadrao());
  const [disponibilidades, setDisponibilidades] = useState<Disponibilidade[]>(
    disponibilidadesPadrao()
  );
  const [modalConfigAberto, setModalConfigAberto] = useState(false);
  const [modoModal, setModoModal] = useState<"criar" | "editar">("criar");

  const [carregando, setCarregando] = useState(true);
  const [carregandoDia, setCarregandoDia] = useState(false);
  const [atualizandoAgenda, setAtualizandoAgenda] = useState(false);
  const [salvandoConfiguracoes, setSalvandoConfiguracoes] = useState(false);
  const [googleCalendar, setGoogleCalendar] =
    useState<GoogleCalendarIntegracao | null>(null);
  const [carregandoGoogleCalendar, setCarregandoGoogleCalendar] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroStatusAgenda, setFiltroStatusAgenda] = useState<
    "todos" | "ativo" | "inativo" | "arquivado"
  >("todos");

  const [modalAgendamentoAberto, setModalAgendamentoAberto] = useState(false);
  const [salvandoAgendamento, setSalvandoAgendamento] = useState(false);
  const [erroAgendamento, setErroAgendamento] = useState("");
  const [formAgendamento, setFormAgendamento] = useState<AgendamentoForm>(() =>
    agendamentoFormPadrao()
  );

  const agendaSelecionada = useMemo(
    () => agendas.find((agenda) => agenda.id === agendaSelecionadaId) || null,
    [agendas, agendaSelecionadaId]
  );

  const diasCalendario = useMemo(
    () => construirDiasCalendario(mesAtual),
    [mesAtual]
  );

  const agendamentosAtivosPorDia = useMemo(() => {
    const mapa = new Map<string, number>();

    for (const agendamento of agendamentos) {
      if (!["agendado", "confirmado"].includes(agendamento.status)) continue;

      const key = dateKeyFromIso(agendamento.inicio_at);
      mapa.set(key, (mapa.get(key) || 0) + 1);
    }

    return mapa;
  }, [agendamentos]);

  const agendamentosDoDia = useMemo(() => {
    if (!diaSelecionado) return [];

    return agendamentos
      .filter((agendamento) => dateKeyFromIso(agendamento.inicio_at) === diaSelecionado)
      .sort(
        (a, b) =>
          new Date(a.inicio_at).getTime() - new Date(b.inicio_at).getTime()
      );
  }, [agendamentos, diaSelecionado]);

  const eventosGooglePorDia = useMemo(() => {
    const mapa = new Map<string, number>();

    for (const evento of eventosGoogle) {
      const key = dateKeyEventoGoogle(evento);
      mapa.set(key, (mapa.get(key) || 0) + 1);
    }

    return mapa;
  }, [eventosGoogle]);

  const eventosGoogleDoDia = useMemo(() => {
    if (!diaSelecionado) return [];

    return eventosGoogle
      .filter((evento) => dateKeyEventoGoogle(evento) === diaSelecionado)
      .sort(
        (a, b) =>
          new Date(a.inicio_at).getTime() - new Date(b.inicio_at).getTime()
      );
  }, [diaSelecionado, eventosGoogle]);

  const carregarAgendamentos = useCallback(async (agendaId: string) => {
    const res = await fetch(`/api/agendas/${agendaId}/agendamentos?status=todos`, {
      cache: "no-store",
    });
    const json = await res.json();

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Erro ao carregar agendamentos.");
    }

    setAgendamentos(json.agendamentos || []);
  }, []);

  const carregarEventosGoogle = useCallback(
    async (agendaId: string, mes: Date) => {
      const inicio = new Date(mes.getFullYear(), mes.getMonth(), 1);
      const fim = new Date(mes.getFullYear(), mes.getMonth() + 1, 1);
      const params = new URLSearchParams({
        inicio_at: inicio.toISOString(),
        fim_at: fim.toISOString(),
      });
      const res = await fetch(
        `/api/agendas/${agendaId}/google-calendar/ocupacoes?${params}`,
        { cache: "no-store" }
      );
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setEventosGoogle([]);
        return;
      }

      setEventosGoogle(json.eventos || []);

      if (json.agendamentos_cancelados?.length) {
        await carregarAgendamentos(agendaId);
      }
    },
    [carregarAgendamentos]
  );

  const carregarSlotsDia = useCallback(
    async (agendaId: string, data: string) => {
      try {
        setCarregandoDia(true);

        const params = new URLSearchParams({
          data,
          limite: "50",
        });

        const res = await fetch(`/api/agendas/${agendaId}/horarios?${params}`, {
          cache: "no-store",
        });
        const json = await res.json();

        if (!res.ok || !json.ok) {
          setSlotsDia([]);
          setErro(
            json.error ||
              "Nao foi possivel verificar a disponibilidade desta agenda."
          );
          return;
        }

        setSlotsDia(json.slots || []);
      } finally {
        setCarregandoDia(false);
      }
    },
    []
  );

  const carregarDetalhesAgenda = useCallback(
    async (agendaId: string) => {
      const res = await fetch(`/api/agendas/${agendaId}`, { cache: "no-store" });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar agenda.");
      }

      const agenda = json.agenda as Agenda;
      const disponibilidadesApi = Array.isArray(json.disponibilidades)
        ? json.disponibilidades
        : [];

      setForm({
        nome: agenda.nome || "",
        descricao: agenda.descricao || "",
        duracao_minutos: String(agenda.duracao_minutos || 60),
        intervalo_minutos: String(agenda.intervalo_minutos || 30),
        antecedencia_minutos: String(agenda.antecedencia_minutos || 120),
        janela_dias: String(agenda.janela_dias || 14),
        status: agenda.status || "ativo",
      });

      const porDia = new Map<number, Disponibilidade>();

      for (const item of disponibilidadesApi) {
        porDia.set(Number(item.dia_semana), {
          id: item.id,
          dia_semana: Number(item.dia_semana),
          hora_inicio: String(item.hora_inicio || "09:00").slice(0, 5),
          hora_fim: String(item.hora_fim || "18:00").slice(0, 5),
          ativo: item.ativo !== false,
        });
      }

      setDisponibilidades(
        disponibilidadesPadrao().map((item) => porDia.get(item.dia_semana) || item)
      );

      await carregarAgendamentos(agendaId);
    },
    [carregarAgendamentos]
  );

  const carregarAgendas = useCallback(async () => {
    try {
      setCarregando(true);
      setErro("");

      const params = new URLSearchParams();

      if (busca.trim()) {
        params.set("busca", busca.trim());
      }

      params.set("status", filtroStatusAgenda);

      const res = await fetch(`/api/agendas?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar agendas.");
      }

      const proximasAgendas = json.agendas || [];
      setAgendas(proximasAgendas);

      const agendaDaUrl = agendaParam
        ? proximasAgendas.find((agenda: Agenda) => agenda.id === agendaParam)
        : null;
      const agendaAindaExiste = proximasAgendas.some(
        (agenda: Agenda) => agenda.id === agendaSelecionadaId
      );

      if (agendaDaUrl && agendaSelecionadaId !== agendaDaUrl.id) {
        setAgendaSelecionadaId(agendaDaUrl.id);
        setDiaSelecionado(null);
      } else if (!agendaSelecionadaId || !agendaAindaExiste) {
        setAgendaSelecionadaId(proximasAgendas[0]?.id || "");
        setDiaSelecionado(null);
      }
    } catch (error: unknown) {
      setErro(mensagemErro(error, "Erro ao carregar agendas."));
    } finally {
      setCarregando(false);
    }
  }, [agendaParam, agendaSelecionadaId, busca, filtroStatusAgenda]);

  useEffect(() => {
    carregarAgendas();
  }, [carregarAgendas]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleCalendarStatus = params.get("google_calendar");

    if (!googleCalendarStatus) return;

    const feedback = feedbackGoogleCalendar(googleCalendarStatus);

    setSucesso(feedback.sucesso);
    setErro(feedback.erro);

    params.delete("google_calendar");
    params.delete("google_calendar_etapa");
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, []);

  useEffect(() => {
    if (!agendaSelecionadaId) {
      setAgendamentos([]);
      setSlotsDia([]);
      return;
    }

    carregarDetalhesAgenda(agendaSelecionadaId).catch((error: unknown) => {
      setErro(mensagemErro(error, "Erro ao carregar agenda."));
    });
  }, [agendaSelecionadaId, carregarDetalhesAgenda]);

  useEffect(() => {
    if (!agendaSelecionadaId) {
      setEventosGoogle([]);
      return;
    }

    carregarEventosGoogle(agendaSelecionadaId, mesAtual).catch(() => {
      setEventosGoogle([]);
    });
  }, [agendaSelecionadaId, carregarEventosGoogle, mesAtual]);

  useEffect(() => {
    if (!agendaSelecionadaId || !diaSelecionado) {
      setSlotsDia([]);
      return;
    }

    carregarSlotsDia(agendaSelecionadaId, diaSelecionado);
  }, [agendaSelecionadaId, diaSelecionado, carregarSlotsDia]);

  function selecionarAgenda(agendaId: string) {
    setAgendaSelecionadaId(agendaId);
    setDiaSelecionado(null);
    router.push(`/agendas?agenda=${encodeURIComponent(agendaId)}`);
  }

  function abrirModalNovaAgenda() {
    setModoModal("criar");
    setForm({
      ...formPadrao(),
      nome: "Nova agenda",
    });
    setDisponibilidades(disponibilidadesPadrao());
    setErro("");
    setErroAgendamento("");
    setSucesso("");
    setModalConfigAberto(true);
  }

  function abrirModalConfiguracoes() {
    if (!agendaSelecionada) return;

    setModoModal("editar");
    setErro("");
    setSucesso("");
    setModalConfigAberto(true);
    carregarGoogleCalendar(agendaSelecionada.id);
  }

  const carregarGoogleCalendar = useCallback(async (agendaId: string) => {
    try {
      setCarregandoGoogleCalendar(true);
      const res = await fetch(`/api/agendas/${agendaId}/google-calendar`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao consultar Google Calendar.");
      }

      setGoogleCalendar(json.integracao || { conectado: false });
    } catch (error: unknown) {
      setGoogleCalendar(null);
      setErro(mensagemErro(error, "Erro ao consultar Google Calendar."));
    } finally {
      setCarregandoGoogleCalendar(false);
    }
  }, []);

  useEffect(() => {
    function receberResultadoGoogleCalendar(event: MessageEvent) {
      if (
        event.origin !== window.location.origin ||
        event.data?.type !== "google-calendar-oauth"
      ) {
        return;
      }

      const feedback = feedbackGoogleCalendar(String(event.data.status || ""));

      setSucesso(feedback.sucesso);
      setErro(feedback.erro);

      if (agendaSelecionadaId && feedback.sucesso) {
        carregarGoogleCalendar(agendaSelecionadaId);
        carregarEventosGoogle(agendaSelecionadaId, mesAtual);
      }
    }

    window.addEventListener("message", receberResultadoGoogleCalendar);

    return () => {
      window.removeEventListener("message", receberResultadoGoogleCalendar);
    };
  }, [agendaSelecionadaId, carregarEventosGoogle, carregarGoogleCalendar, mesAtual]);

  function vincularGoogleCalendar() {
    if (!agendaSelecionadaId) return;

    const largura = 560;
    const altura = 720;
    const esquerda = Math.max(0, window.screenX + (window.outerWidth - largura) / 2);
    const topo = Math.max(0, window.screenY + (window.outerHeight - altura) / 2);
    const popup = window.open(
      `/api/agendas/${agendaSelecionadaId}/google-calendar?acao=conectar`,
      "google-calendar-oauth",
      `popup=yes,width=${largura},height=${altura},left=${Math.round(esquerda)},top=${Math.round(topo)}`
    );

    if (!popup) {
      setErro("O navegador bloqueou a janela do Google. Permita pop-ups e tente novamente.");
      return;
    }

    popup.focus();
  }

  async function sincronizarGoogleCalendar() {
    if (!agendaSelecionadaId) return;

    try {
      setCarregandoGoogleCalendar(true);
      setErro("");
      setSucesso("");

      const res = await fetch(`/api/agendas/${agendaSelecionadaId}/google-calendar`, {
        method: "POST",
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao sincronizar Google Calendar.");
      }

      setSucesso("Agenda sincronizada com o Google Calendar.");
      await carregarGoogleCalendar(agendaSelecionadaId);
      await carregarAgendamentos(agendaSelecionadaId);
      await carregarEventosGoogle(agendaSelecionadaId, mesAtual);

      if (diaSelecionado) {
        await carregarSlotsDia(agendaSelecionadaId, diaSelecionado);
      }
    } catch (error: unknown) {
      setErro(mensagemErro(error, "Erro ao sincronizar Google Calendar."));
    } finally {
      setCarregandoGoogleCalendar(false);
    }
  }

  async function atualizarAgendaCompleta() {
    if (!agendaSelecionadaId) return;

    try {
      setAtualizandoAgenda(true);
      setErro("");
      setSucesso("");

      const statusRes = await fetch(
        `/api/agendas/${agendaSelecionadaId}/google-calendar`,
        { cache: "no-store" }
      );
      const statusJson = await statusRes.json();

      if (!statusRes.ok || !statusJson.ok) {
        throw new Error(statusJson.error || "Erro ao consultar Google Calendar.");
      }

      const conectado = Boolean(statusJson.integracao?.conectado);

      if (conectado) {
        const syncRes = await fetch(
          `/api/agendas/${agendaSelecionadaId}/google-calendar`,
          { method: "POST" }
        );
        const syncJson = await syncRes.json();

        if (!syncRes.ok || !syncJson.ok) {
          throw new Error(syncJson.error || "Erro ao sincronizar Google Calendar.");
        }
      }

      await carregarDetalhesAgenda(agendaSelecionadaId);
      await carregarEventosGoogle(agendaSelecionadaId, mesAtual);

      if (diaSelecionado) {
        await carregarSlotsDia(agendaSelecionadaId, diaSelecionado);
      }

      setSucesso(
        conectado
          ? "Agenda atualizada e sincronizada com o Google Calendar."
          : "Agenda atualizada."
      );
    } catch (error: unknown) {
      setErro(mensagemErro(error, "Erro ao atualizar agenda."));
    } finally {
      setAtualizandoAgenda(false);
    }
  }

  async function desvincularGoogleCalendar() {
    if (!agendaSelecionadaId) return;

    try {
      setCarregandoGoogleCalendar(true);
      setErro("");
      setSucesso("");

      const res = await fetch(`/api/agendas/${agendaSelecionadaId}/google-calendar`, {
        method: "DELETE",
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao desvincular Google Calendar.");
      }

      setGoogleCalendar({ conectado: false });
      setSucesso("Conta Google desvinculada.");
    } catch (error: unknown) {
      setErro(mensagemErro(error, "Erro ao desvincular Google Calendar."));
    } finally {
      setCarregandoGoogleCalendar(false);
    }
  }


  function abrirModalNovoAgendamento(slot?: Slot) {
    if (!agendaSelecionada) return;

    const dataBase = diaSelecionado || dateKey(new Date());

    const inicio = slot?.inicio_at
      ? paraDatetimeLocal(slot.inicio_at)
      : criarDatetimeLocalDoDia(dataBase, "09:00");

    const fim = slot?.fim_at
      ? paraDatetimeLocal(slot.fim_at)
      : somarMinutosDatetimeLocal(
          inicio,
          agendaSelecionada.duracao_minutos || 60
        );

    setFormAgendamento({
      titulo: "Agendamento",
      nome_cliente: "",
      telefone_cliente: "",
      email_cliente: "",
      inicio_at: inicio,
      fim_at: fim,
      observacoes: "",
    });

    setErro("");
    setSucesso("");
    setModalAgendamentoAberto(true);
  }

  async function salvarAgendamentoManual() {
    if (!agendaSelecionadaId) return;

    try {
      setSalvandoAgendamento(true);
      setErroAgendamento("");
      setSucesso("");

      const payload = {
        titulo: formAgendamento.titulo.trim(),
        nome_cliente: formAgendamento.nome_cliente.trim(),
        telefone_cliente: formAgendamento.telefone_cliente.trim(),
        email_cliente: formAgendamento.email_cliente.trim(),
        inicio_at: formAgendamento.inicio_at
          ? new Date(formAgendamento.inicio_at).toISOString()
          : "",
        fim_at: formAgendamento.fim_at
          ? new Date(formAgendamento.fim_at).toISOString()
          : "",
        observacoes: formAgendamento.observacoes.trim(),
      };

      if (!payload.titulo) {
        throw new Error("Informe o título do agendamento.");
      }

      if (!payload.nome_cliente && !payload.telefone_cliente) {
        throw new Error("Informe o nome ou telefone do cliente.");
      }

      if (!payload.inicio_at || !payload.fim_at) {
        throw new Error("Informe o início e fim do agendamento.");
      }

      if (new Date(payload.fim_at).getTime() <= new Date(payload.inicio_at).getTime()) {
        throw new Error("O horário final precisa ser maior que o horário inicial.");
      }

      const res = await fetch(`/api/agendas/${agendaSelecionadaId}/agendamentos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao criar agendamento.");
      }

      setModalAgendamentoAberto(false);
      setErroAgendamento("");
      setSucesso("Agendamento criado.");

      const diaCriado = dateKeyFromIso(payload.inicio_at);

      setDiaSelecionado(diaCriado);

      await carregarAgendamentos(agendaSelecionadaId);
      await carregarSlotsDia(agendaSelecionadaId, diaCriado);
    } catch (error: unknown) {
      setErroAgendamento(mensagemErro(error, "Erro ao criar agendamento."));
    } finally {
      setSalvandoAgendamento(false);
    }
  }


  function irMes(delta: number) {
    setMesAtual((atual) => new Date(atual.getFullYear(), atual.getMonth() + delta, 1));
  }

  function atualizarDisponibilidade(
    diaSemana: number,
    campo: keyof Disponibilidade,
    valor: string | boolean
  ) {
    setDisponibilidades((atuais) =>
      atuais.map((item) =>
        item.dia_semana === diaSemana ? { ...item, [campo]: valor } : item
      )
    );
  }

  async function salvarConfiguracoes() {
    try {
      setSalvandoConfiguracoes(true);
      setErro("");
      setSucesso("");

      const payload = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim(),
        timezone: "America/Sao_Paulo",
        duracao_minutos: Number(form.duracao_minutos),
        intervalo_minutos: Number(form.intervalo_minutos),
        antecedencia_minutos: Number(form.antecedencia_minutos),
        janela_dias: Number(form.janela_dias),
        status: form.status,
      };

      if (!payload.nome) {
        throw new Error("Nome da agenda e obrigatorio.");
      }

      let agendaId = agendaSelecionadaId;

      if (modoModal === "criar") {
        const res = await fetch("/api/agendas", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const json = await res.json();

        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Erro ao criar agenda.");
        }

        agendaId = json.agenda.id;
      } else {
        const res = await fetch(`/api/agendas/${agendaId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const json = await res.json();

        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Erro ao salvar agenda.");
        }
      }

      const horariosRes = await fetch(`/api/agendas/${agendaId}/disponibilidades`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ disponibilidades }),
      });
      const horariosJson = await horariosRes.json();

      if (!horariosRes.ok || !horariosJson.ok) {
        throw new Error(horariosJson.error || "Erro ao salvar horarios.");
      }

      setAgendaSelecionadaId(agendaId);
      setModalConfigAberto(false);
      setSucesso(modoModal === "criar" ? "Agenda criada." : "Configuracoes salvas.");
      await carregarAgendas();
      await carregarDetalhesAgenda(agendaId);

      if (diaSelecionado) {
        await carregarSlotsDia(agendaId, diaSelecionado);
      }
    } catch (error: unknown) {
      setErro(mensagemErro(error, "Erro ao salvar configuracoes."));
    } finally {
      setSalvandoConfiguracoes(false);
    }
  }

  function statusDestinoBotaoAgenda() {
    if (agendaSelecionada?.status === "arquivado") return "ativo";
    if (agendaSelecionada?.status === "inativo") return "ativo";
    return "arquivado";
  }

  function textoBotaoStatusAgenda() {
    if (agendaSelecionada?.status === "arquivado") return "Desarquivar";
    if (agendaSelecionada?.status === "inativo") return "Ativar";
    return "Arquivar";
  }

  function mensagemSucessoStatusAgenda(statusDestino: string) {
    if (statusDestino === "ativo") return "Agenda ativada.";
    if (statusDestino === "arquivado") return "Agenda arquivada.";
    return "Status da agenda atualizado.";
  }

  async function arquivarAgenda() {
    if (!agendaSelecionadaId) return;

    const statusDestino = statusDestinoBotaoAgenda();

    try {
      setErro("");
      setSucesso("");
      setSalvandoConfiguracoes(true);

      const res = await fetch(`/api/agendas/${agendaSelecionadaId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: statusDestino,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao atualizar status da agenda.");
      }

      setModalConfigAberto(false);
      setSucesso(mensagemSucessoStatusAgenda(statusDestino));

      if (statusDestino === "arquivado") {
        setAgendaSelecionadaId("");
        setDiaSelecionado(null);
      }

      await carregarAgendas();

      if (statusDestino !== "arquivado") {
        await carregarDetalhesAgenda(agendaSelecionadaId);
      }
    } catch (error: unknown) {
      setErro(mensagemErro(error, "Erro ao atualizar status da agenda."));
    } finally {
      setSalvandoConfiguracoes(false);
    }
  }

  async function excluirAgenda() {
    if (!agendaSelecionadaId || agendaSelecionada?.status !== "arquivado") return;

    const confirmou = window.confirm(
      "Excluir esta agenda permanentemente? O historico de agendamentos e os eventos vinculados no Google Calendar tambem serao removidos. Esta acao nao pode ser desfeita."
    );

    if (!confirmou) return;

    try {
      setErro("");
      setSucesso("");
      setSalvandoConfiguracoes(true);

      const res = await fetch(`/api/agendas/${agendaSelecionadaId}`, {
        method: "DELETE",
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao excluir agenda.");
      }

      setModalConfigAberto(false);
      setAgendaSelecionadaId("");
      setDiaSelecionado(null);
      setSucesso("Agenda excluida permanentemente.");
      await carregarAgendas();
    } catch (error: unknown) {
      setErro(mensagemErro(error, "Erro ao excluir agenda."));
    } finally {
      setSalvandoConfiguracoes(false);
    }
  }

  function classeBotaoStatusAgenda() {
    if (agendaSelecionada?.status === "arquivado") {
      return styles.successButton;
    }

    if (agendaSelecionada?.status === "inativo") {
      return styles.successButton;
    }

    return styles.dangerButton;
  }

  async function atualizarStatusAgendamento(agendamento: Agendamento, status: string) {
    try {
      setErro("");
      setSucesso("");

      const res = await fetch(
        `/api/agendas/${agendamento.agenda_id}/agendamentos/${agendamento.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status }),
        }
      );
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao atualizar agendamento.");
      }

      setSucesso("Agendamento atualizado.");
      await carregarAgendamentos(agendamento.agenda_id);

      if (diaSelecionado) {
        await carregarSlotsDia(agendamento.agenda_id, diaSelecionado);
      }
    } catch (error: unknown) {
      setErro(mensagemErro(error, "Erro ao atualizar agendamento."));
    }
  }

  return (
    <>
      <Header
        title="Agendas"
        mobileBackHref={mobileDetailActive ? "/agendas" : undefined}
        mobileBackLabel="Voltar para agendas"
        subtitle="Horarios comerciais e marcacoes automaticas do WhatsApp"
      />

      <main
        className={`${styles.pageContent} ${
          diaSelecionado ? styles.pageContentWithDayPanel : ""
        } ${
          mobileDetailActive ? styles.mobileDetailActive : ""
        }`}
      >
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <p className={styles.eyebrow}>Agenda</p>
            <h2 className={styles.sidebarTitle}>Calendarios</h2>
            <p className={styles.sidebarSubtitle}>
              Selecione uma agenda ou crie uma nova.
            </p>
          </div>

          <div className={styles.sidebarFilters}>
            <input
              className={styles.input}
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar agenda..."
            />

            <div className={styles.filterRow}>
              <select
                className={styles.input}
                value={filtroStatusAgenda}
                onChange={(event) =>
                  setFiltroStatusAgenda(
                    event.target.value as
                      | "todos"
                      | "ativo"
                      | "inativo"
                      | "arquivado"
                  )
                }
              >
                <option value="todos">Todas</option>
                <option value="ativo">Ativas</option>
                <option value="inativo">Inativas</option>
                <option value="arquivado">Arquivadas</option>
              </select>

              <button
                type="button"
                className={styles.newAgendaButton}
                onClick={abrirModalNovaAgenda}
                title="Nova agenda"
                aria-label="Nova agenda"
              >
                +
              </button>
            </div>
          </div>

          <div className={styles.agendaList}>
            {carregando ? (
              <div className={styles.emptyMini}>Carregando agendas...</div>
            ) : agendas.length === 0 ? (
              <div className={styles.emptyMini}>Nenhuma agenda cadastrada.</div>
            ) : (
              agendas.map((agenda) => (
                <button
                  key={agenda.id}
                  type="button"
                  className={
                    agenda.id === agendaSelecionadaId
                      ? styles.agendaItemActive
                      : styles.agendaItem
                  }
                  onClick={() => selecionarAgenda(agenda.id)}
                >
                  <div className={styles.agendaItemTop}>
                    <strong>{agenda.nome}</strong>
                    <span className={statusClasse(agenda.status)}>
                      {statusLabel(agenda.status)}
                    </span>
                  </div>

                  <span className={styles.agendaMeta}>
                    {agenda.duracao_minutos}min | intervalo{" "}
                    {agenda.intervalo_minutos}min
                  </span>

                  {agenda.proximo_agendamento && (
                    <span className={styles.agendaNext}>
                      Proximo: {formatarData(agenda.proximo_agendamento.inicio_at)}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </aside>

        <section className={styles.mainPanel}>
          <div className={styles.alertArea}>
            {erro && <div className={styles.errorAlert}>{erro}</div>}
          </div>
          <FeedbackToast
            success={sucesso}
            onSuccessDismiss={() => setSucesso("")}
          />

          {!agendaSelecionada ? (
            <div className={styles.emptyState}>Crie ou selecione uma agenda.</div>
          ) : (
            <div className={styles.calendarShell}>
              <div className={styles.calendarToolbar}>
                <div className={styles.calendarToolbarLeft}>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => irMes(-1)}
                    aria-label="Mes anterior"
                  >
                    <ChevronLeft size={18} />
                  </button>

                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={abrirModalConfiguracoes}
                    disabled={!agendaSelecionadaId}
                  >
                    Configurações
                  </button>

                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={atualizarAgendaCompleta}
                    disabled={!agendaSelecionadaId || atualizandoAgenda}
                  >
                    <RefreshCw
                      size={16}
                      className={atualizandoAgenda ? styles.spinningIcon : ""}
                    />
                    {atualizandoAgenda ? "Atualizando..." : "Atualizar"}
                  </button>
                </div>

                <div className={styles.calendarToolbarCenter}>
                  <strong>{mesLabel(mesAtual)}</strong>
                </div>

                <div className={styles.calendarToolbarRight}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => abrirModalNovoAgendamento()}
                    disabled={!agendaSelecionadaId}
                  >
                    <CalendarPlus size={16} />
                    Criar agendamento
                  </button>

                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => irMes(1)}
                    aria-label="Proximo mes"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>

              <div className={styles.weekHeader}>
                {DIAS.map((dia) => (
                  <span key={dia.valor}>{dia.curto}</span>
                ))}
              </div>

              <div className={styles.calendarGrid}>
                {diasCalendario.map((dia) => {
                  const quantidadeMarcados = agendamentosAtivosPorDia.get(dia.key) || 0;
                  const quantidadeGoogle = eventosGooglePorDia.get(dia.key) || 0;
                  const selecionado = diaSelecionado === dia.key;
                  const hoje = dia.key === dateKey(new Date());

                  return (
                    <button
                      key={dia.key}
                      type="button"
                      className={[
                        styles.calendarDay,
                        !dia.currentMonth ? styles.calendarDayMuted : "",
                        selecionado ? styles.calendarDaySelected : "",
                        hoje ? styles.calendarDayToday : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => setDiaSelecionado(dia.key)}
                    >
                      <span className={styles.dayNumber}>{dia.date.getDate()}</span>

                      {quantidadeMarcados > 0 && (
                        <span className={styles.dayMarker}>
                          {quantidadeMarcados} marcado
                          {quantidadeMarcados > 1 ? "s" : ""}
                        </span>
                      )}

                      {quantidadeGoogle > 0 && (
                        <span className={styles.dayMarkerGoogle}>
                          {quantidadeGoogle} Google
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {diaSelecionado && agendaSelecionada && (
          <aside className={styles.dayPanel}>
            <div className={styles.dayPanelHeader}>
              <div>
                <p className={styles.eyebrow}>Dia selecionado</p>
                <h3>{formatarDiaSelecionado(diaSelecionado)}</h3>
              </div>

              <div className={styles.dayPanelHeaderActions}>
                <button
                  type="button"
                  className={styles.iconActionButton}
                  onClick={() => abrirModalNovoAgendamento()}
                  title="Criar agendamento"
                  aria-label="Criar agendamento"
                >
                  <CalendarPlus size={18} />
                </button>

                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={() => setDiaSelecionado(null)}
                  aria-label="Fechar dia"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className={styles.dayPanelBody}>

              <section className={styles.daySection}>
                <div className={styles.daySectionHeader}>
                  <strong>Marcados</strong>
                  <span>{agendamentosDoDia.length}</span>
                </div>

                {agendamentosDoDia.length === 0 ? (
                  <div className={styles.emptyMini}>Nenhum horario marcado.</div>
                ) : (
                  <div className={styles.appointmentList}>
                    {agendamentosDoDia.map((agendamento) => (
                      <div key={agendamento.id} className={styles.appointmentItem}>
                        <div className={styles.appointmentMain}>
                          <strong>
                            {agendamento.nome_cliente ||
                              agendamento.contatos?.nome ||
                              "Cliente sem nome"}
                          </strong>
                          <span>{formatarData(agendamento.inicio_at)}</span>
                          <small>
                            {agendamento.telefone_cliente ||
                              agendamento.contatos?.telefone ||
                              "Sem telefone"}
                          </small>
                        </div>

                        <div className={styles.appointmentActions}>
                          <span className={statusClasse(agendamento.status)}>
                            {statusLabel(agendamento.status)}
                          </span>

                          <select
                            className={styles.input}
                            value={agendamento.status}
                            onChange={(event) =>
                              atualizarStatusAgendamento(
                                agendamento,
                                event.target.value
                              )
                            }
                          >
                            <option value="agendado">Agendado</option>
                            <option value="confirmado">Confirmado</option>
                            <option value="realizado">Realizado</option>
                            <option value="faltou">Faltou</option>
                            <option value="cancelado">Cancelado</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className={styles.daySection}>
                <div className={styles.daySectionHeader}>
                  <strong>Ocupados no Google</strong>
                  <span>{eventosGoogleDoDia.length}</span>
                </div>

                {eventosGoogleDoDia.length === 0 ? (
                  <div className={styles.emptyMini}>
                    Nenhum bloqueio externo do Google.
                  </div>
                ) : (
                  <div className={styles.appointmentList}>
                    {eventosGoogleDoDia.map((evento) => (
                      <div key={evento.id} className={styles.googleAppointmentItem}>
                        <div className={styles.appointmentMain}>
                          <strong>{evento.titulo}</strong>
                          <span>{formatarHorarioGoogle(evento)}</span>
                          <small>Evento externo do Google Calendar</small>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className={styles.daySection}>
                <div className={styles.daySectionHeader}>
                  <strong>Horarios livres</strong>
                  <span>{slotsDia.length}</span>
                </div>

                {carregandoDia ? (
                  <div className={styles.emptyMini}>Carregando horarios...</div>
                ) : slotsDia.length === 0 ? (
                  <div className={styles.emptyMini}>Sem horarios livres.</div>
                ) : (
                  <div className={styles.slotList}>
                    {slotsDia.map((slot) => (
                      <button
                        key={slot.inicio_at}
                        type="button"
                        className={styles.slotItemButton}
                        onClick={() => abrirModalNovoAgendamento(slot)}
                      >
                        <span>{slot.hora_label}</span>
                        <strong>{slot.label}</strong>
                      </button>
                    ))}
                  </div>
                )}
              </section>

            </div>
          </aside>
        )}
      </main>

      {modalConfigAberto && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>
                  {modoModal === "criar" ? "Nova agenda" : "Configuracoes"}
                </p>
                <h3 className={styles.modalTitle}>
                  {modoModal === "criar" ? "Criar agenda" : form.nome}
                </h3>
              </div>

              <button
                type="button"
                className={styles.closeButton}
                onClick={() => setModalConfigAberto(false)}
                aria-label="Fechar configuracoes"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.configGrid}>
                <label className={styles.field}>
                  <span className={styles.label}>Nome</span>
                  <input
                    className={styles.input}
                    value={form.nome}
                    onChange={(event) =>
                      setForm((atual) => ({ ...atual, nome: event.target.value }))
                    }
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>Status</span>
                  <select
                    className={styles.input}
                    value={form.status}
                    onChange={(event) =>
                      setForm((atual) => ({ ...atual, status: event.target.value }))
                    }
                  >
                    <option value="ativo">Ativa</option>
                    <option value="inativo">Inativa</option>
                    <option value="arquivado">Arquivada</option>
                  </select>
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>Duracao</span>
                  <input
                    type="number"
                    min={5}
                    className={styles.input}
                    value={form.duracao_minutos}
                    onChange={(event) =>
                      setForm((atual) => ({
                        ...atual,
                        duracao_minutos: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>Intervalo</span>
                  <input
                    type="number"
                    min={5}
                    className={styles.input}
                    value={form.intervalo_minutos}
                    onChange={(event) =>
                      setForm((atual) => ({
                        ...atual,
                        intervalo_minutos: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>Antecedencia</span>
                  <input
                    type="number"
                    min={0}
                    className={styles.input}
                    value={form.antecedencia_minutos}
                    onChange={(event) =>
                      setForm((atual) => ({
                        ...atual,
                        antecedencia_minutos: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>Janela em dias</span>
                  <input
                    type="number"
                    min={1}
                    className={styles.input}
                    value={form.janela_dias}
                    onChange={(event) =>
                      setForm((atual) => ({
                        ...atual,
                        janela_dias: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className={`${styles.field} ${styles.fullField}`}>
                  <span className={styles.label}>Descricao</span>
                  <textarea
                    className={styles.textarea}
                    value={form.descricao}
                    onChange={(event) =>
                      setForm((atual) => ({ ...atual, descricao: event.target.value }))
                    }
                  />
                </label>
              </div>

              {modoModal === "editar" && (
                <section className={styles.googleCalendarCard}>
                  <div>
                    <p className={styles.eyebrow}>Google Calendar</p>
                    <h4>Sincronizacao da agenda</h4>
                    <p>
                      Vincule sua conta para enviar os agendamentos ao Google e
                      bloquear horarios ja ocupados no calendario.
                    </p>
                    {googleCalendar?.conectado && (
                      <small>
                        Conta vinculada: <strong>{googleCalendar.email || "Google"}</strong>
                        {googleCalendar.ultima_sincronizacao_em &&
                          ` · Ultima sincronizacao: ${formatarData(
                            googleCalendar.ultima_sincronizacao_em
                          )}`}
                      </small>
                    )}
                  </div>

                  <div className={styles.googleCalendarActions}>
                    {!googleCalendar?.conectado ? (
                      <button
                        type="button"
                        className={styles.googleButton}
                        onClick={vincularGoogleCalendar}
                        disabled={carregandoGoogleCalendar}
                      >
                        <Link2 size={16} />
                        {carregandoGoogleCalendar
                          ? "Consultando..."
                          : "Vincular conta Google"}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={styles.googleButton}
                          onClick={sincronizarGoogleCalendar}
                          disabled={carregandoGoogleCalendar}
                        >
                          <RefreshCw size={16} />
                          {carregandoGoogleCalendar ? "Sincronizando..." : "Sincronizar agora"}
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={desvincularGoogleCalendar}
                          disabled={carregandoGoogleCalendar}
                        >
                          <Unlink size={16} />
                          Desvincular
                        </button>
                      </>
                    )}
                  </div>
                </section>
              )}

              <div className={styles.modalSectionHeader}>
                <p className={styles.eyebrow}>Disponibilidade</p>
                <h4>Horarios da semana</h4>
              </div>

              <div className={styles.availabilityGrid}>
                {disponibilidades.map((item) => (
                  <div key={item.dia_semana} className={styles.availabilityRow}>
                    <label className={styles.switchMini}>
                      <input
                        type="checkbox"
                        checked={item.ativo}
                        onChange={(event) =>
                          atualizarDisponibilidade(
                            item.dia_semana,
                            "ativo",
                            event.target.checked
                          )
                        }
                      />
                      <span>{DIAS[item.dia_semana]?.label}</span>
                    </label>

                    <input
                      type="time"
                      className={styles.input}
                      value={item.hora_inicio}
                      disabled={!item.ativo}
                      onChange={(event) =>
                        atualizarDisponibilidade(
                          item.dia_semana,
                          "hora_inicio",
                          event.target.value
                        )
                      }
                    />

                    <input
                      type="time"
                      className={styles.input}
                      value={item.hora_fim}
                      disabled={!item.ativo}
                      onChange={(event) =>
                        atualizarDisponibilidade(
                          item.dia_semana,
                          "hora_fim",
                          event.target.value
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.modalFooter}>
              {modoModal === "editar" && (
                <>
                  {agendaSelecionada?.status === "arquivado" && (
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={excluirAgenda}
                      disabled={salvandoConfiguracoes}
                    >
                      <Trash2 size={16} />
                      Excluir permanentemente
                    </button>
                  )}
                  <button
                    type="button"
                    className={classeBotaoStatusAgenda()}
                    onClick={arquivarAgenda}
                    disabled={salvandoConfiguracoes}
                  >
                    {agendaSelecionada?.status === "arquivado" ? (
                      <ArchiveRestore size={16} />
                    ) : (
                      <Archive size={16} />
                    )}
                    {textoBotaoStatusAgenda()}
                  </button>
                </>
              )}

              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setModalConfigAberto(false)}
              >
                Cancelar
              </button>

              <button
                type="button"
                className={styles.primaryButton}
                onClick={salvarConfiguracoes}
                disabled={salvandoConfiguracoes}
              >
                {salvandoConfiguracoes ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalAgendamentoAberto && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Agendamento manual</p>
                <h3 className={styles.modalTitle}>Criar agendamento</h3>
              </div>

              <button
                type="button"
                className={styles.closeButton}
                onClick={() => {
                  setModalAgendamentoAberto(false);
                  setErroAgendamento("");
                }}
                aria-label="Fechar agendamento"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {erroAgendamento && (
                <div className={styles.errorAlert}>{erroAgendamento}</div>
              )}

              <div className={styles.configGrid}>
                <label className={styles.field}>
                  <span className={styles.label}>Título</span>
                  <input
                    className={styles.input}
                    value={formAgendamento.titulo}
                    onChange={(event) =>
                      setFormAgendamento((atual) => ({
                        ...atual,
                        titulo: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>Nome do cliente</span>
                  <input
                    className={styles.input}
                    value={formAgendamento.nome_cliente}
                    onChange={(event) =>
                      setFormAgendamento((atual) => ({
                        ...atual,
                        nome_cliente: event.target.value,
                      }))
                    }
                    placeholder="Ex: João Silva"
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>Telefone</span>
                  <input
                    className={styles.input}
                    value={formAgendamento.telefone_cliente}
                    onChange={(event) =>
                      setFormAgendamento((atual) => ({
                        ...atual,
                        telefone_cliente: event.target.value,
                      }))
                    }
                    placeholder="Ex: 31999999999"
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>E-mail</span>
                  <input
                    className={styles.input}
                    value={formAgendamento.email_cliente}
                    onChange={(event) =>
                      setFormAgendamento((atual) => ({
                        ...atual,
                        email_cliente: event.target.value,
                      }))
                    }
                    placeholder="cliente@email.com"
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>Início</span>
                  <input
                    type="datetime-local"
                    className={styles.input}
                    value={formAgendamento.inicio_at}
                    onChange={(event) => {
                      const inicio = event.target.value;

                      setFormAgendamento((atual) => ({
                        ...atual,
                        inicio_at: inicio,
                        fim_at: somarMinutosDatetimeLocal(
                          inicio,
                          agendaSelecionada?.duracao_minutos || 60
                        ),
                      }));
                    }}
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>Fim</span>
                  <input
                    type="datetime-local"
                    className={styles.input}
                    value={formAgendamento.fim_at}
                    onChange={(event) =>
                      setFormAgendamento((atual) => ({
                        ...atual,
                        fim_at: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className={`${styles.field} ${styles.fullField}`}>
                  <span className={styles.label}>Observações</span>
                  <textarea
                    className={styles.textarea}
                    value={formAgendamento.observacoes}
                    onChange={(event) =>
                      setFormAgendamento((atual) => ({
                        ...atual,
                        observacoes: event.target.value,
                      }))
                    }
                    placeholder="Observações internas sobre o agendamento"
                  />
                </label>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setModalAgendamentoAberto(false);
                  setErroAgendamento("");
                }}
              >
                Cancelar
              </button>

              <button
                type="button"
                className={styles.primaryButton}
                onClick={salvarAgendamentoManual}
                disabled={salvandoAgendamento}
              >
                {salvandoAgendamento ? "Criando..." : "Criar agendamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function AgendasPage() {
  return (
    <Suspense fallback={null}>
      <AgendasPageContent />
    </Suspense>
  );
}
