"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Trash2,
  X,
} from "lucide-react";
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

type ConfigForm = {
  nome: string;
  descricao: string;
  duracao_minutos: string;
  intervalo_minutos: string;
  antecedencia_minutos: string;
  janela_dias: string;
  status: string;
};

type CalendarDay = {
  key: string;
  date: Date;
  currentMonth: boolean;
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

export default function AgendasPage() {
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [agendaSelecionadaId, setAgendaSelecionadaId] = useState("");
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [slotsDia, setSlotsDia] = useState<Slot[]>([]);
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
  const [salvandoConfiguracoes, setSalvandoConfiguracoes] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroStatusAgenda, setFiltroStatusAgenda] = useState<
    "todos" | "ativo" | "inativo" | "arquivado"
  >("todos");

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

      const agendaAindaExiste = proximasAgendas.some(
        (agenda: Agenda) => agenda.id === agendaSelecionadaId
      );

      if (!agendaSelecionadaId || !agendaAindaExiste) {
        setAgendaSelecionadaId(proximasAgendas[0]?.id || "");
        setDiaSelecionado(null);
      }
    } catch (error: unknown) {
      setErro(mensagemErro(error, "Erro ao carregar agendas."));
    } finally {
      setCarregando(false);
    }
  }, [agendaSelecionadaId, busca, filtroStatusAgenda]);

  useEffect(() => {
    carregarAgendas();
  }, [carregarAgendas]);

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
    if (!agendaSelecionadaId || !diaSelecionado) {
      setSlotsDia([]);
      return;
    }

    carregarSlotsDia(agendaSelecionadaId, diaSelecionado);
  }, [agendaSelecionadaId, diaSelecionado, carregarSlotsDia]);

  function selecionarAgenda(agendaId: string) {
    setAgendaSelecionadaId(agendaId);
    setDiaSelecionado(null);
  }

  function abrirModalNovaAgenda() {
    setModoModal("criar");
    setForm({
      ...formPadrao(),
      nome: "Nova agenda",
    });
    setDisponibilidades(disponibilidadesPadrao());
    setErro("");
    setSucesso("");
    setModalConfigAberto(true);
  }

  function abrirModalConfiguracoes() {
    if (!agendaSelecionada) return;

    setModoModal("editar");
    setErro("");
    setSucesso("");
    setModalConfigAberto(true);
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
        subtitle="Horarios comerciais e marcacoes automaticas do WhatsApp"
      />

      <main
        className={`${styles.pageContent} ${
          diaSelecionado ? styles.pageContentWithDayPanel : ""
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
            {sucesso && <div className={styles.successAlert}>{sucesso}</div>}
          </div>

          {!agendaSelecionada ? (
            <div className={styles.emptyState}>Crie ou selecione uma agenda.</div>
          ) : (
            <div className={styles.calendarShell}>
              <div className={styles.calendarToolbar}>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => irMes(-1)}
                  aria-label="Mes anterior"
                >
                  <ChevronLeft size={18} />
                </button>

                <strong>{mesLabel(mesAtual)}</strong>

                <div className={styles.calendarToolbarRight}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() =>
                      agendaSelecionadaId && carregarDetalhesAgenda(agendaSelecionadaId)
                    }
                    disabled={!agendaSelecionadaId}
                  >
                    Atualizar
                  </button>

                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={abrirModalConfiguracoes}
                    disabled={!agendaSelecionadaId}
                  >
                    Configurações
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

              <button
                type="button"
                className={styles.closeButton}
                onClick={() => setDiaSelecionado(null)}
                aria-label="Fechar dia"
              >
                <X size={18} />
              </button>
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
                      <div key={slot.inicio_at} className={styles.slotItem}>
                        <span>{slot.hora_label}</span>
                        <strong>{slot.label}</strong>
                      </div>
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
                <button
                  type="button"
                  className={classeBotaoStatusAgenda()}
                  onClick={arquivarAgenda}
                  disabled={salvandoConfiguracoes}
                >
                  <Trash2 size={16} />
                  {textoBotaoStatusAgenda()}
                </button>
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
    </>
  );
}
