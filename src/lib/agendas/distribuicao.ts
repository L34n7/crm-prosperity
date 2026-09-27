/* eslint-disable @typescript-eslint/no-explicit-any */

import { listarSlotsDisponiveis } from "./agenda-service";
import {
  zonedTimeToUtc,
  type AgendaSlot,
} from "./agenda-service-core";
import type { AgendaEstrategiaDistribuicao } from "./capacidade";

export type AgendaSlotDistribuido = AgendaSlot & {
  agenda_id: string;
  agenda_nome: string;
  agenda_responsavel_id?: string | null;
  grupo_distribuicao_id: string;
};

function minutosHora(valor: string) {
  const [horaRaw, minutoRaw] = String(valor || "").split(":");
  const hora = Math.max(0, Math.min(23, Number(horaRaw) || 0));
  const minuto = Math.max(0, Math.min(59, Number(minutoRaw) || 0));
  return hora * 60 + minuto;
}

function diaSemanaIso(data: string) {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

async function calcularCargaCalendario(params: {
  supabase: any;
  empresaId: string;
  agendaId: string;
  data: string;
  timezone?: string | null;
}) {
  const diaSemana = diaSemanaIso(params.data);
  const timezone = params.timezone || "America/Sao_Paulo";
  const inicioDia = zonedTimeToUtc({
    data: params.data,
    minutosDoDia: 0,
    timezone,
  }).toISOString();
  const dataSeguinte = new Date(params.data + "T12:00:00Z");
  dataSeguinte.setUTCDate(dataSeguinte.getUTCDate() + 1);
  const proximoDia =
    String(dataSeguinte.getUTCFullYear()).padStart(4, "0") +
    "-" +
    String(dataSeguinte.getUTCMonth() + 1).padStart(2, "0") +
    "-" +
    String(dataSeguinte.getUTCDate()).padStart(2, "0");
  const fimDia = zonedTimeToUtc({
    data: proximoDia,
    minutosDoDia: 0,
    timezone,
  }).toISOString();

  const [disponibilidade, intervalos, agendamentos] = await Promise.all([
    params.supabase
      .from("agenda_disponibilidades")
      .select("hora_inicio, hora_fim")
      .eq("empresa_id", params.empresaId)
      .eq("agenda_id", params.agendaId)
      .eq("dia_semana", diaSemana)
      .eq("ativo", true),
    params.supabase
      .from("agenda_disponibilidade_intervalos")
      .select("hora_inicio, hora_fim")
      .eq("empresa_id", params.empresaId)
      .eq("agenda_id", params.agendaId)
      .eq("dia_semana", diaSemana)
      .eq("ativo", true),
    params.supabase
      .from("agenda_agendamentos")
      .select("inicio_at, fim_at")
      .eq("empresa_id", params.empresaId)
      .eq("agenda_id", params.agendaId)
      .in("status", ["agendado", "confirmado"])
      .lt("inicio_at", fimDia)
      .gt("fim_at", inicioDia),
  ]);

  if (disponibilidade.error || intervalos.error || agendamentos.error) {
    return { ocupados: 0, disponiveis: 1, taxa: 0 };
  }

  const minutosDisponiveisBrutos = (disponibilidade.data || []).reduce(
    (total: number, item: any) =>
      total +
      Math.max(0, minutosHora(item.hora_fim) - minutosHora(item.hora_inicio)),
    0,
  );
  const minutosIntervalos = (intervalos.data || []).reduce(
    (total: number, item: any) =>
      total +
      Math.max(0, minutosHora(item.hora_fim) - minutosHora(item.hora_inicio)),
    0,
  );
  const disponiveis = Math.max(
    1,
    minutosDisponiveisBrutos - minutosIntervalos,
  );

  const ocupados = (agendamentos.data || []).reduce(
    (total: number, item: any) => {
      const inicio = new Date(item.inicio_at).getTime();
      const fimAt = new Date(item.fim_at).getTime();
      if (!Number.isFinite(inicio) || !Number.isFinite(fimAt)) return total;
      return total + Math.max(0, Math.round((fimAt - inicio) / 60_000));
    },
    0,
  );

  return {
    ocupados,
    disponiveis,
    taxa: ocupados / disponiveis,
  };
}

export async function obterGrupoDistribuicao(params: {
  supabase: any;
  empresaId: string;
  grupoId: string;
}) {
  const [{ data: grupo, error: grupoError }, { data: membros, error: membrosError }] =
    await Promise.all([
      params.supabase
        .from("agenda_grupos_distribuicao")
        .select("id, nome, estrategia, ativo, ultimo_agenda_id")
        .eq("empresa_id", params.empresaId)
        .eq("id", params.grupoId)
        .maybeSingle(),
      params.supabase
        .from("agenda_grupos_distribuicao_calendarios")
        .select("agenda_id, ordem, ativo")
        .eq("empresa_id", params.empresaId)
        .eq("grupo_id", params.grupoId)
        .eq("ativo", true)
        .order("ordem", { ascending: true }),
    ]);

  if (grupoError || membrosError) {
    throw new Error(
      grupoError?.message ||
        membrosError?.message ||
        "Erro ao carregar grupo de distribuição.",
    );
  }

  if (!grupo || grupo.ativo !== true) return null;

  const agendaIds = (membros || []).map((item: any) => String(item.agenda_id));
  if (agendaIds.length === 0) return null;

  const { data: calendarios, error: calendariosError } = await params.supabase
    .from("calendarios")
    .select(
      "id, nome, timezone, duracao_minutos, intervalo_minutos, responsavel_id, status",
    )
    .eq("empresa_id", params.empresaId)
    .in("id", agendaIds)
    .eq("status", "ativo");

  if (calendariosError) {
    throw new Error(
      `Erro ao carregar calendários do grupo: ${calendariosError.message}`,
    );
  }

  const porId = new Map((calendarios || []).map((item: any) => [item.id, item]));
  const ordenados = (membros || [])
    .map((membro: any) => porId.get(membro.agenda_id))
    .filter(Boolean);

  return {
    id: String(grupo.id),
    nome: String(grupo.nome),
    estrategia: String(grupo.estrategia) as AgendaEstrategiaDistribuicao,
    ultimo_agenda_id: grupo.ultimo_agenda_id
      ? String(grupo.ultimo_agenda_id)
      : null,
    calendarios: ordenados,
  };
}

export async function listarSlotsGrupoDistribuicao(params: {
  supabase: any;
  empresaId: string;
  grupoId: string;
  data: string;
  janelaDias?: number | null;
  limite?: number | null;
}) {
  const grupo = await obterGrupoDistribuicao(params);
  if (!grupo) {
    return {
      grupo: null,
      agenda: null,
      slots: [] as AgendaSlotDistribuido[],
      dias_sem_disponibilidade: [params.data],
    };
  }

  const limite = Math.max(1, Math.min(100, Number(params.limite || 50)));

  const resultados = await Promise.all(
    grupo.calendarios.map(async (agenda: any) => {
      const resultado = await listarSlotsDisponiveis({
        supabase: params.supabase,
        empresaId: params.empresaId,
        agendaId: agenda.id,
        data: params.data,
        janelaDias: params.janelaDias || 1,
        limite: 100,
      });

      return {
        agenda,
        resultado,
      };
    }),
  );

  const cargas = new Map<string, { taxa: number; ocupados: number; disponiveis: number }>();
  if (grupo.estrategia === "menor_carga") {
    await Promise.all(
      grupo.calendarios.map(async (agenda: any) => {
        cargas.set(
          agenda.id,
          await calcularCargaCalendario({
            supabase: params.supabase,
            empresaId: params.empresaId,
            agendaId: agenda.id,
            data: params.data,
            timezone: agenda.timezone,
          }),
        );
      }),
    );
  }

  const candidatos = resultados.flatMap(({ agenda, resultado }) =>
    resultado.slots.map((slot) => ({
      ...slot,
      agenda_id: String(agenda.id),
      agenda_nome: String(agenda.nome),
      agenda_responsavel_id: agenda.responsavel_id
        ? String(agenda.responsavel_id)
        : null,
      grupo_distribuicao_id: grupo.id,
    })),
  );

  const ordemCalendarios = grupo.calendarios.map((agenda: any) =>
    String(agenda.id),
  );
  const ultimoIndex = grupo.ultimo_agenda_id
    ? ordemCalendarios.indexOf(grupo.ultimo_agenda_id)
    : -1;
  const ordemRodizio =
    ordemCalendarios.length > 0
      ? [
          ...ordemCalendarios.slice(ultimoIndex + 1),
          ...ordemCalendarios.slice(0, ultimoIndex + 1),
        ]
      : [];

  const rankRodizio = new Map(
    ordemRodizio.map((agendaId, index) => [agendaId, index]),
  );

  candidatos.sort((a, b) => {
    const tempo =
      new Date(a.inicio_at).getTime() - new Date(b.inicio_at).getTime();
    if (tempo !== 0) return tempo;

    if (grupo.estrategia === "menor_carga") {
      const cargaA = cargas.get(a.agenda_id)?.taxa ?? 0;
      const cargaB = cargas.get(b.agenda_id)?.taxa ?? 0;
      if (cargaA !== cargaB) return cargaA - cargaB;
    }

    if (grupo.estrategia === "rodizio") {
      return (
        (rankRodizio.get(a.agenda_id) ?? 999) -
        (rankRodizio.get(b.agenda_id) ?? 999)
      );
    }

    return (
      ordemCalendarios.indexOf(a.agenda_id) -
      ordemCalendarios.indexOf(b.agenda_id)
    );
  });

  // Para um mesmo início, o cliente precisa enxergar um horário, não uma
  // duplicação por vendedor. O calendário escolhido fica embutido no slot.
  const escolhidos: AgendaSlotDistribuido[] = [];
  const vistos = new Set<string>();
  let cursorRodizio = 0;

  const porInicio = new Map<string, AgendaSlotDistribuido[]>();
  for (const candidato of candidatos) {
    const chave = candidato.inicio_at;
    porInicio.set(chave, [...(porInicio.get(chave) || []), candidato]);
  }

  for (const inicio of Array.from(porInicio.keys()).sort()) {
    const opcoes = porInicio.get(inicio) || [];
    if (opcoes.length === 0) continue;

    let escolhido = opcoes[0];

    if (grupo.estrategia === "rodizio" && ordemRodizio.length > 0) {
      for (let tentativa = 0; tentativa < ordemRodizio.length; tentativa += 1) {
        const agendaId =
          ordemRodizio[(cursorRodizio + tentativa) % ordemRodizio.length];
        const candidato = opcoes.find((item) => item.agenda_id === agendaId);
        if (candidato) {
          escolhido = candidato;
          cursorRodizio =
            (ordemRodizio.indexOf(agendaId) + 1) % ordemRodizio.length;
          break;
        }
      }
    } else if (grupo.estrategia === "menor_carga") {
      escolhido = [...opcoes].sort((a, b) => {
        const cargaA = cargas.get(a.agenda_id)?.taxa ?? 0;
        const cargaB = cargas.get(b.agenda_id)?.taxa ?? 0;
        return cargaA - cargaB;
      })[0];

      const carga = cargas.get(escolhido.agenda_id);
      if (carga) {
        const duracao = Math.max(
          0,
          Math.round(
            (new Date(escolhido.fim_at).getTime() -
              new Date(escolhido.inicio_at).getTime()) /
              60_000,
          ),
        );
        carga.ocupados += duracao;
        carga.taxa = carga.ocupados / Math.max(1, carga.disponiveis);
      }
    }

    const chaveFinal = `${escolhido.inicio_at}|${escolhido.fim_at}`;
    if (vistos.has(chaveFinal)) continue;
    vistos.add(chaveFinal);
    escolhidos.push(escolhido);
  }

  escolhidos.sort(
    (a, b) =>
      new Date(a.inicio_at).getTime() - new Date(b.inicio_at).getTime(),
  );

  const slots = escolhidos.slice(0, limite).map((slot, index) => ({
    ...slot,
    indice: index + 1,
  }));

  return {
    grupo,
    agenda: grupo.calendarios[0] || null,
    slots,
    dias_sem_disponibilidade:
      slots.length === 0 ? [params.data] : ([] as string[]),
  };
}
