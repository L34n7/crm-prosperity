/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  listarOcupacoesGoogleCalendar,
  reconciliarExclusoesGoogleCalendar,
} from "@/lib/agendas/google-calendar";
import {
  formatarSlotAgenda,
  interpretarDataHorarioAgenda as interpretarDataHorarioAgendaCore,
  zonedTimeToUtc,
  type AgendaSlot,
  type AgendaSlotsDisponiveisResultado,
  type InterpretacaoDataHorarioAgenda,
} from "./agenda-service-core";

export * from "./agenda-service-core";

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

type AgendaDisponibilidade = {
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
  ativo: boolean;
};

type AgendaIntervaloDia = {
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
  ativo: boolean;
};

function clamp(numero: number, minimo: number, maximo: number) {
  if (!Number.isFinite(numero)) return minimo;
  return Math.max(minimo, Math.min(maximo, numero));
}

function pad2(numero: number) {
  return String(numero).padStart(2, "0");
}

function ymdKey(parts: Pick<LocalParts, "year" | "month" | "day">) {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function parseHora(valor: string) {
  const [horaRaw, minutoRaw] = String(valor || "").split(":");
  const hora = clamp(Number(horaRaw), 0, 23);
  const minuto = clamp(Number(minutoRaw || 0), 0, 59);

  return hora * 60 + minuto;
}

function localParts(date: Date, timezone: string): LocalParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  const hour = Number(map.get("hour") || "0");

  return {
    year: Number(map.get("year")),
    month: Number(map.get("month")),
    day: Number(map.get("day")),
    hour: hour === 24 ? 0 : hour,
    minute: Number(map.get("minute") || "0"),
    second: Number(map.get("second") || "0"),
  };
}

function adicionarDias(
  parts: Pick<LocalParts, "year" | "month" | "day">,
  dias: number
) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + dias));

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function diaSemanaLocal(parts: Pick<LocalParts, "year" | "month" | "day">) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

function normalizarTextoAgenda(valor: string) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function interpretarDataHorarioAgenda(
  mensagem: string,
  timezone = "America/Sao_Paulo"
): InterpretacaoDataHorarioAgenda {
  const resultado = interpretarDataHorarioAgendaCore(mensagem, timezone);
  const preferencia = resultado.preferencia;
  const texto = normalizarTextoAgenda(mensagem);

  if (
    preferencia?.tipo === "a_partir_de" &&
    preferencia.hora_minutos != null &&
    /\b(?:depois|apos)\b/.test(texto)
  ) {
    return {
      ...resultado,
      preferencia: {
        ...preferencia,
        // "A partir das 16" inclui 16:00. "Depois das 16" não inclui.
        inicio_minutos: Math.min(24 * 60, Number(preferencia.hora_minutos) + 1),
      },
    };
  }

  return resultado;
}

export async function listarSlotsDisponiveis(params: {
  supabase: any;
  empresaId: string;
  agendaId: string;
  data?: string | null;
  janelaDias?: number | null;
  limite?: number | null;
}): Promise<AgendaSlotsDisponiveisResultado> {
  const { data: agendaRaw, error: agendaError } = await params.supabase
    .from("calendarios")
    .select(
      "id, empresa_id, nome, timezone, duracao_minutos, intervalo_minutos, antecedencia_minutos, janela_dias, status"
    )
    .eq("empresa_id", params.empresaId)
    .eq("id", params.agendaId)
    .maybeSingle();

  if (agendaError) {
    throw new Error(`Erro ao buscar agenda: ${agendaError.message}`);
  }

  const agenda = agendaRaw as any;

  if (!agenda || agenda.status !== "ativo") {
    return {
      agenda: agenda || null,
      slots: [],
      tem_disponibilidade_no_periodo: false,
      dias_sem_disponibilidade: [],
    };
  }

  const timezone = agenda.timezone || "America/Sao_Paulo";
  const duracaoMinutos = clamp(Number(agenda.duracao_minutos || 60), 5, 1440);
  const intervaloMinutos = clamp(Number(agenda.intervalo_minutos ?? 0), 0, 1440);
  const passoEntreInicios = duracaoMinutos + intervaloMinutos;
  const antecedenciaMinutos = clamp(
    Number(agenda.antecedencia_minutos || 0),
    0,
    525600
  );
  const janelaDias = clamp(
    Number(params.janelaDias || agenda.janela_dias || 14),
    1,
    180
  );
  const limite = clamp(Number(params.limite || 12), 1, 50);

  const [disponibilidadesResult, intervalosResult] = await Promise.all([
    params.supabase
      .from("agenda_disponibilidades")
      .select("dia_semana, hora_inicio, hora_fim, ativo")
      .eq("empresa_id", params.empresaId)
      .eq("agenda_id", params.agendaId)
      .eq("ativo", true),
    params.supabase
      .from("agenda_disponibilidade_intervalos")
      .select("dia_semana, hora_inicio, hora_fim, ativo")
      .eq("empresa_id", params.empresaId)
      .eq("agenda_id", params.agendaId)
      .eq("ativo", true),
  ]);

  if (disponibilidadesResult.error) {
    throw new Error(
      `Erro ao buscar disponibilidade: ${disponibilidadesResult.error.message}`
    );
  }

  if (intervalosResult.error) {
    throw new Error(`Erro ao buscar intervalos: ${intervalosResult.error.message}`);
  }

  const disponibilidades = (disponibilidadesResult.data || []) as AgendaDisponibilidade[];
  const intervalos = (intervalosResult.data || []) as AgendaIntervaloDia[];

  if (!disponibilidades.length) {
    return {
      agenda,
      slots: [],
      tem_disponibilidade_no_periodo: false,
      dias_sem_disponibilidade: [],
    };
  }

  const agora = new Date();
  const agoraLocal = localParts(agora, timezone);
  const primeiroDia = params.data
    ? {
        year: Number(params.data.slice(0, 4)),
        month: Number(params.data.slice(5, 7)),
        day: Number(params.data.slice(8, 10)),
      }
    : adicionarDias(agoraLocal, 0);
  const totalDias = params.data ? 1 : janelaDias;
  const limiteMinimo = new Date(agora.getTime() + antecedenciaMinutos * 60_000);
  const rangeInicio = zonedTimeToUtc({
    data: ymdKey(primeiroDia),
    minutosDoDia: 0,
    timezone,
  });
  const rangeFimLocal = adicionarDias(primeiroDia, totalDias + 1);
  const rangeFim = zonedTimeToUtc({
    data: ymdKey(rangeFimLocal),
    minutosDoDia: 0,
    timezone,
  });

  await reconciliarExclusoesGoogleCalendar({
    empresaId: params.empresaId,
    agendaId: params.agendaId,
    inicioAt: rangeInicio.toISOString(),
    fimAt: rangeFim.toISOString(),
  });

  const { data: agendamentos, error: agendamentosError } = await params.supabase
    .from("agenda_agendamentos")
    .select("id, inicio_at, fim_at")
    .eq("empresa_id", params.empresaId)
    .eq("agenda_id", params.agendaId)
    .in("status", ["agendado", "confirmado"])
    .lt("inicio_at", rangeFim.toISOString())
    .gt("fim_at", rangeInicio.toISOString());

  if (agendamentosError) {
    throw new Error(
      `Erro ao buscar agendamentos existentes: ${agendamentosError.message}`
    );
  }

  const ocupados: Array<{ inicio: number; fim: number }> = (agendamentos || []).map(
    (item: any) => ({
      inicio: new Date(item.inicio_at).getTime(),
      fim: new Date(item.fim_at).getTime(),
    })
  );
  const ocupacoesGoogle = await listarOcupacoesGoogleCalendar({
    empresaId: params.empresaId,
    agendaId: params.agendaId,
    inicioAt: rangeInicio.toISOString(),
    fimAt: rangeFim.toISOString(),
  });

  for (const ocupacao of ocupacoesGoogle) {
    ocupados.push({
      inicio: new Date(ocupacao.start).getTime(),
      fim: new Date(ocupacao.end).getTime(),
    });
  }

  const slots: AgendaSlot[] = [];
  let temDisponibilidadeNoPeriodo = false;
  const diasSemDisponibilidade: string[] = [];
  const intervaloMs = intervaloMinutos * 60_000;

  for (let diaOffset = 0; diaOffset < totalDias; diaOffset++) {
    const dia = adicionarDias(primeiroDia, diaOffset);
    const data = ymdKey(dia);
    const diaSemana = diaSemanaLocal(dia);
    const janelas = disponibilidades.filter(
      (item) => Number(item.dia_semana) === diaSemana
    );
    const intervalosDia = intervalos.filter(
      (item) => Number(item.dia_semana) === diaSemana
    );

    if (janelas.length > 0) {
      temDisponibilidadeNoPeriodo = true;
    } else {
      diasSemDisponibilidade.push(data);
    }

    for (const janela of janelas) {
      const inicioJanela = parseHora(janela.hora_inicio);
      const fimJanela = parseHora(janela.hora_fim);

      for (
        let minuto = inicioJanela;
        minuto + duracaoMinutos <= fimJanela;
        minuto += passoEntreInicios
      ) {
        const inicio = zonedTimeToUtc({
          data,
          minutosDoDia: minuto,
          timezone,
        });
        const fim = new Date(inicio.getTime() + duracaoMinutos * 60_000);
        const fimMinuto = minuto + duracaoMinutos;
        const interceptaIntervalo = intervalosDia.some(
          (intervalo) =>
            minuto < parseHora(intervalo.hora_fim) &&
            fimMinuto > parseHora(intervalo.hora_inicio)
        );

        if (interceptaIntervalo) continue;
        if (inicio.getTime() <= limiteMinimo.getTime()) continue;

        // intervalo_minutos é um buffer real entre atendimentos, e não o
        // passo da grade. Também protegemos esse buffer contra compromissos
        // já existentes no CRM ou no Google Calendar.
        const temConflito = ocupados.some(
          (ocupado) =>
            inicio.getTime() < ocupado.fim + intervaloMs &&
            fim.getTime() + intervaloMs > ocupado.inicio
        );

        if (temConflito) continue;

        const labels = formatarSlotAgenda(
          inicio.toISOString(),
          fim.toISOString(),
          timezone
        );

        slots.push({
          indice: 0,
          inicio_at: inicio.toISOString(),
          fim_at: fim.toISOString(),
          ...labels,
        });
      }
    }
  }

  slots.sort(
    (a, b) => new Date(a.inicio_at).getTime() - new Date(b.inicio_at).getTime()
  );

  return {
    agenda,
    slots: slots.slice(0, limite).map((slot, index) => ({
      ...slot,
      indice: index + 1,
    })),
    tem_disponibilidade_no_periodo: temDisponibilidadeNoPeriodo,
    dias_sem_disponibilidade: diasSemDisponibilidade,
  };
}
