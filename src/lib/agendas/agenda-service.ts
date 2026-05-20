/* eslint-disable @typescript-eslint/no-explicit-any */

export type AgendaSlot = {
  indice: number;
  inicio_at: string;
  fim_at: string;
  label: string;
  data_label: string;
  hora_label: string;
};

export type PreferenciaHorarioAgenda = {
  tipo: "a_partir_de" | "antes_de" | "periodo" | "exato" | "por_volta";
  inicio_minutos?: number | null;
  fim_minutos?: number | null;
  hora_minutos?: number | null;
  periodo?: "manha" | "tarde" | "noite" | null;
};

export type InterpretacaoDataHorarioAgenda = {
  data: string | null;
  preferencia: PreferenciaHorarioAgenda | null;
};

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

type AgendaCalendario = {
  id: string;
  empresa_id: string;
  nome: string;
  timezone: string | null;
  duracao_minutos: number | null;
  intervalo_minutos: number | null;
  antecedencia_minutos: number | null;
  janela_dias: number | null;
  status: string;
};

type AgendaDisponibilidade = {
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

function removerAcentos(valor: string) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizarTextoAgenda(valor: string) {
  return removerAcentos(valor).toLowerCase().replace(/\s+/g, " ").trim();
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

function adicionarMeses(
  parts: Pick<LocalParts, "year" | "month" | "day">,
  meses: number
) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1 + meses, parts.day));

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function diaSemanaLocal(parts: Pick<LocalParts, "year" | "month" | "day">) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

export function dataLocalDeIso(iso: string, timezone: string) {
  return ymdKey(localParts(new Date(iso), timezone));
}

export function minutosLocaisDeIso(iso: string, timezone: string) {
  const parts = localParts(new Date(iso), timezone);

  return parts.hour * 60 + parts.minute;
}

export function zonedTimeToUtc(params: {
  data: string;
  minutosDoDia: number;
  timezone: string;
}) {
  const [year, month, day] = params.data.split("-").map(Number);
  const hour = Math.floor(params.minutosDoDia / 60);
  const minute = params.minutosDoDia % 60;

  let utc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0);

  for (let index = 0; index < 3; index++) {
    const parts = localParts(utc, params.timezone);
    const current = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );

    const diff = desired - current;

    if (diff === 0) break;

    utc = new Date(utc.getTime() + diff);
  }

  return utc;
}

export function formatarSlotAgenda(
  inicioAt: string,
  fimAt: string,
  timezone = "America/Sao_Paulo"
) {
  const inicio = new Date(inicioAt);
  const fim = new Date(fimAt);

  const diaSemanaLabel = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    weekday: "long",
  })
    .format(inicio)
    .replace("-feira", "");

  const dataCurtaLabel = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
  })
    .format(inicio)
    .replace(".", "");

  const dataLabel = `${diaSemanaLabel}, ${dataCurtaLabel}`;

  const horaInicio = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(inicio);

  const horaFim = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(fim);

  return {
    data_label: dataLabel,
    hora_label: horaInicio,
    label: `${dataLabel} às ${horaInicio} (${horaFim})`,
  };
}

function interpretarDataNumerica(
  texto: string,
  hojeLocal: Pick<LocalParts, "year" | "month" | "day">
) {
  const dataCompleta = texto.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/);

  if (dataCompleta) {
    const dia = Number(dataCompleta[1]);
    const mes = Number(dataCompleta[2]);
    const anoRaw = Number(dataCompleta[3]);
    const ano = anoRaw < 100 ? 2000 + anoRaw : anoRaw;

    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
      return ymdKey({ year: ano, month: mes, day: dia });
    }
  }

  const dataSemAno = texto.match(/\b(\d{1,2})[\/.-](\d{1,2})\b/);

  if (dataSemAno) {
    const dia = Number(dataSemAno[1]);
    const mes = Number(dataSemAno[2]);

    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
      let ano = hojeLocal.year;

      if (
        mes < hojeLocal.month ||
        (mes === hojeLocal.month && dia < hojeLocal.day)
      ) {
        ano += 1;
      }

      return ymdKey({ year: ano, month: mes, day: dia });
    }
  }

  const diaMes = texto.match(/\bdia\s+(\d{1,2})\b/);

  if (diaMes) {
    const dia = Number(diaMes[1]);

    if (dia >= 1 && dia <= 31) {
      const dataBase =
        dia < hojeLocal.day ? adicionarMeses(hojeLocal, 1) : hojeLocal;

      return ymdKey({
        year: dataBase.year,
        month: dataBase.month,
        day: dia,
      });
    }
  }

  const numeroSolto = texto.match(/^\s*(\d{1,2})\s*$/);

  if (numeroSolto) {
    const dia = Number(numeroSolto[1]);

    if (dia >= 8 && dia <= 31) {
      const dataBase =
        dia < hojeLocal.day ? adicionarMeses(hojeLocal, 1) : hojeLocal;

      return ymdKey({
        year: dataBase.year,
        month: dataBase.month,
        day: dia,
      });
    }
  }

  return null;
}

function interpretarDataRelativa(
  texto: string,
  hojeLocal: Pick<LocalParts, "year" | "month" | "day">
) {
  if (/\bhoje\b/.test(texto)) {
    return ymdKey(hojeLocal);
  }

  if (/\bdepois de amanha\b/.test(texto)) {
    return ymdKey(adicionarDias(hojeLocal, 2));
  }

  if (/\bamanha\b/.test(texto)) {
    return ymdKey(adicionarDias(hojeLocal, 1));
  }

  const diasSemana = [
    ["domingo", "dom"],
    ["segunda", "seg"],
    ["terca", "ter"],
    ["quarta", "qua"],
    ["quinta", "qui"],
    ["sexta", "sex"],
    ["sabado", "sab"],
  ];

  for (let indice = 0; indice < diasSemana.length; indice++) {
    const aliases = diasSemana[indice];
    const encontrou = aliases.some((alias) =>
      new RegExp(`\\b${alias}(?:-feira)?\\b`).test(texto)
    );

    if (!encontrou) continue;

    const hojeSemana = diaSemanaLocal(hojeLocal);
    let distancia = (indice - hojeSemana + 7) % 7;

    if (distancia === 0 || /\bproxim[ao]\b/.test(texto)) {
      distancia = distancia || 7;
    }

    return ymdKey(adicionarDias(hojeLocal, distancia));
  }

  return null;
}

function horaMatchParaMinutos(match: RegExpMatchArray | null) {
  if (!match) return null;

  const hora = Number(match[1]);
  const minuto = Number(match[2] || 0);

  if (hora < 0 || hora > 23 || minuto < 0 || minuto > 59) {
    return null;
  }

  return hora * 60 + minuto;
}

function extrairHoraPorPadrao(texto: string, padrao: RegExp) {
  return horaMatchParaMinutos(texto.match(padrao));
}

function interpretarPreferenciaHorario(texto: string): PreferenciaHorarioAgenda | null {
  if (/\b(manha|pela manha|de manha)\b/.test(texto)) {
    return {
      tipo: "periodo",
      inicio_minutos: 8 * 60,
      fim_minutos: 12 * 60,
      periodo: "manha",
    };
  }

  if (/\b(tarde|pela tarde|a tarde|de tarde)\b/.test(texto)) {
    return {
      tipo: "periodo",
      inicio_minutos: 12 * 60,
      fim_minutos: 18 * 60,
      periodo: "tarde",
    };
  }

  if (/\b(noite|pela noite|a noite|de noite)\b/.test(texto)) {
    return {
      tipo: "periodo",
      inicio_minutos: 18 * 60,
      fim_minutos: 22 * 60,
      periodo: "noite",
    };
  }

  if (/\b(a partir|partir|depois|apos)\b/.test(texto)) {
    const hora = extrairHoraPorPadrao(
      texto,
      /\b(?:a partir|partir|depois|apos)\s+(?:das|de|as)?\s*(\d{1,2})(?:[:h]\s*(\d{2}))?\s*(?:h|hr|hrs|horas)?\b/
    );

    if (hora == null) return null;

    return {
      tipo: "a_partir_de",
      inicio_minutos: hora,
      hora_minutos: hora,
    };
  }

  if (/\b(antes|ate)\b/.test(texto)) {
    const hora = extrairHoraPorPadrao(
      texto,
      /\b(?:antes|ate)\s+(?:das|de|as)?\s*(\d{1,2})(?:[:h]\s*(\d{2}))?\s*(?:h|hr|hrs|horas)?\b/
    );

    if (hora == null) return null;

    return {
      tipo: "antes_de",
      fim_minutos: hora,
      hora_minutos: hora,
    };
  }

  if (/\b(por volta|perto|proximo)\b/.test(texto)) {
    const hora = extrairHoraPorPadrao(
      texto,
      /\b(?:por volta|perto|proximo)\s+(?:das|de|as)?\s*(\d{1,2})(?:[:h]\s*(\d{2}))?\s*(?:h|hr|hrs|horas)?\b/
    );

    if (hora == null) return null;

    return {
      tipo: "por_volta",
      hora_minutos: hora,
    };
  }

  if (/\b(as|às)\b/.test(String(texto))) {
    const hora = extrairHoraPorPadrao(
      texto,
      /\b(?:as|às)\s*(\d{1,2})(?:[:h]\s*(\d{2}))?\s*(?:h|hr|hrs|horas)?\b/
    );

    if (hora == null) return null;

    return {
      tipo: "exato",
      hora_minutos: hora,
    };
  }

  return null;
}

export function interpretarDataHorarioAgenda(
  mensagem: string,
  timezone = "America/Sao_Paulo"
): InterpretacaoDataHorarioAgenda {
  const texto = normalizarTextoAgenda(mensagem);
  const hojeLocal = localParts(new Date(), timezone);
  const data =
    interpretarDataNumerica(texto, hojeLocal) ||
    interpretarDataRelativa(texto, hojeLocal);

  return {
    data,
    preferencia: interpretarPreferenciaHorario(texto),
  };
}

export function filtrarSlotsPorPreferencia(
  slots: AgendaSlot[],
  preferencia: PreferenciaHorarioAgenda | null | undefined,
  timezone = "America/Sao_Paulo"
) {
  if (!preferencia) return slots;

  let filtrados = slots.filter((slot) => {
    const minutos = minutosLocaisDeIso(slot.inicio_at, timezone);

    if (
      preferencia.inicio_minutos != null &&
      minutos < preferencia.inicio_minutos
    ) {
      return false;
    }

    if (preferencia.fim_minutos != null && minutos >= preferencia.fim_minutos) {
      return false;
    }

    if (preferencia.tipo === "exato" && preferencia.hora_minutos != null) {
      return minutos === preferencia.hora_minutos;
    }

    return true;
  });

  if (preferencia.tipo === "por_volta" && preferencia.hora_minutos != null) {
    filtrados = [...slots].sort((a, b) => {
      const aMinutos = minutosLocaisDeIso(a.inicio_at, timezone);
      const bMinutos = minutosLocaisDeIso(b.inicio_at, timezone);

      return (
        Math.abs(aMinutos - Number(preferencia.hora_minutos)) -
        Math.abs(bMinutos - Number(preferencia.hora_minutos))
      );
    });
  }

  return filtrados;
}

export async function existeConflitoAgenda(params: {
  supabase: any;
  empresaId: string;
  agendaId: string;
  inicioAt: string;
  fimAt: string;
  ignorarAgendamentoId?: string | null;
}) {
  let query = params.supabase
    .from("agenda_agendamentos")
    .select("id")
    .eq("empresa_id", params.empresaId)
    .eq("agenda_id", params.agendaId)
    .in("status", ["agendado", "confirmado"])
    .lt("inicio_at", params.fimAt)
    .gt("fim_at", params.inicioAt)
    .limit(1);

  if (params.ignorarAgendamentoId) {
    query = query.neq("id", params.ignorarAgendamentoId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Erro ao verificar conflito de agenda: ${error.message}`);
  }

  return (data || []).length > 0;
}

export async function listarSlotsDisponiveis(params: {
  supabase: any;
  empresaId: string;
  agendaId: string;
  data?: string | null;
  janelaDias?: number | null;
  limite?: number | null;
}) {
  const { data: agendaRaw, error: agendaError } = await params.supabase
    .from("agenda_calendarios")
    .select(
      "id, empresa_id, nome, timezone, duracao_minutos, intervalo_minutos, antecedencia_minutos, janela_dias, status"
    )
    .eq("empresa_id", params.empresaId)
    .eq("id", params.agendaId)
    .maybeSingle();

  if (agendaError) {
    throw new Error(`Erro ao buscar agenda: ${agendaError.message}`);
  }

  const agenda = agendaRaw as AgendaCalendario | null;

  if (!agenda || agenda.status !== "ativo") {
    return {
      agenda: agenda || null,
      slots: [] as AgendaSlot[],
    };
  }

  const timezone = agenda.timezone || "America/Sao_Paulo";
  const duracaoMinutos = clamp(Number(agenda.duracao_minutos || 60), 5, 1440);
  const intervaloMinutos = clamp(Number(agenda.intervalo_minutos || 30), 5, 1440);
  const antecedenciaMinutos = clamp(Number(agenda.antecedencia_minutos || 0), 0, 525600);
  const janelaDias = clamp(
    Number(params.janelaDias || agenda.janela_dias || 14),
    1,
    180
  );
  const limite = clamp(Number(params.limite || 12), 1, 50);

  const { data: disponibilidadesRaw, error: disponibilidadesError } =
    await params.supabase
      .from("agenda_disponibilidades")
      .select("dia_semana, hora_inicio, hora_fim, ativo")
      .eq("empresa_id", params.empresaId)
      .eq("agenda_id", params.agendaId)
      .eq("ativo", true);

  if (disponibilidadesError) {
    throw new Error(
      `Erro ao buscar disponibilidade: ${disponibilidadesError.message}`
    );
  }

  const disponibilidades = (disponibilidadesRaw || []) as AgendaDisponibilidade[];

  if (!disponibilidades.length) {
    return {
      agenda,
      slots: [] as AgendaSlot[],
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

  const ocupados: Array<{ inicio: number; fim: number }> = (agendamentos || []).map((item: any) => ({
    inicio: new Date(item.inicio_at).getTime(),
    fim: new Date(item.fim_at).getTime(),
  }));

  const slots: AgendaSlot[] = [];

  for (let diaOffset = 0; diaOffset < totalDias; diaOffset++) {
    const dia = adicionarDias(primeiroDia, diaOffset);
    const data = ymdKey(dia);
    const diaSemana = diaSemanaLocal(dia);
    const janelas = disponibilidades.filter(
      (item: AgendaDisponibilidade) => Number(item.dia_semana) === diaSemana
    );

    for (const janela of janelas) {
      const inicioJanela = parseHora(janela.hora_inicio);
      const fimJanela = parseHora(janela.hora_fim);

      for (
        let minuto = inicioJanela;
        minuto + duracaoMinutos <= fimJanela;
        minuto += intervaloMinutos
      ) {
        const inicio = zonedTimeToUtc({
          data,
          minutosDoDia: minuto,
          timezone,
        });
        const fim = new Date(inicio.getTime() + duracaoMinutos * 60_000);

        if (inicio.getTime() <= limiteMinimo.getTime()) {
          continue;
        }

        const temConflito = ocupados.some(
          (ocupado: { inicio: number; fim: number }) =>
            inicio.getTime() < ocupado.fim && fim.getTime() > ocupado.inicio
        );

        if (temConflito) {
          continue;
        }

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
  };
}
