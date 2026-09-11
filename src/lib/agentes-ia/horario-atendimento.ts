export type HorarioAtendimentoAgente = {
  ativo: boolean;
  dias: number[];
  inicio: string;
  fim: string;
  timezone: string;
};

export const FUSOS_HORARIOS_AMERICA_LATINA = [
  { value: "America/Argentina/Buenos_Aires", label: "Argentina — Buenos Aires" },
  { value: "America/Argentina/Catamarca", label: "Argentina — Catamarca" },
  { value: "America/Argentina/Cordoba", label: "Argentina — Córdoba" },
  { value: "America/Argentina/Jujuy", label: "Argentina — Jujuy" },
  { value: "America/Argentina/La_Rioja", label: "Argentina — La Rioja" },
  { value: "America/Argentina/Mendoza", label: "Argentina — Mendoza" },
  { value: "America/Argentina/Rio_Gallegos", label: "Argentina — Río Gallegos" },
  { value: "America/Argentina/Salta", label: "Argentina — Salta" },
  { value: "America/Argentina/San_Juan", label: "Argentina — San Juan" },
  { value: "America/Argentina/San_Luis", label: "Argentina — San Luis" },
  { value: "America/Argentina/Tucuman", label: "Argentina — Tucumán" },
  { value: "America/Argentina/Ushuaia", label: "Argentina — Ushuaia" },
  { value: "America/La_Paz", label: "Bolívia — La Paz" },
  { value: "America/Belem", label: "Brasil — Belém" },
  { value: "America/Boa_Vista", label: "Brasil — Boa Vista" },
  { value: "America/Cuiaba", label: "Brasil — Cuiabá" },
  { value: "America/Fortaleza", label: "Brasil — Fortaleza" },
  { value: "America/Maceio", label: "Brasil — Maceió" },
  { value: "America/Manaus", label: "Brasil — Manaus" },
  { value: "America/Noronha", label: "Brasil — Fernando de Noronha" },
  { value: "America/Porto_Velho", label: "Brasil — Porto Velho" },
  { value: "America/Recife", label: "Brasil — Recife" },
  { value: "America/Rio_Branco", label: "Brasil — Rio Branco" },
  { value: "America/Bahia", label: "Brasil — Salvador / Bahia" },
  { value: "America/Sao_Paulo", label: "Brasil — São Paulo / Brasília" },
  { value: "America/Santiago", label: "Chile — Santiago" },
  { value: "America/Punta_Arenas", label: "Chile — Punta Arenas" },
  { value: "Pacific/Easter", label: "Chile — Ilha de Páscoa" },
  { value: "America/Bogota", label: "Colômbia — Bogotá" },
  { value: "America/Costa_Rica", label: "Costa Rica — San José" },
  { value: "America/Havana", label: "Cuba — Havana" },
  { value: "America/Santo_Domingo", label: "República Dominicana — Santo Domingo" },
  { value: "America/Guayaquil", label: "Equador — Guayaquil / Quito" },
  { value: "Pacific/Galapagos", label: "Equador — Galápagos" },
  { value: "America/El_Salvador", label: "El Salvador — San Salvador" },
  { value: "America/Cayenne", label: "Guiana Francesa — Cayenne" },
  { value: "America/Guatemala", label: "Guatemala — Cidade da Guatemala" },
  { value: "America/Port-au-Prince", label: "Haiti — Porto Príncipe" },
  { value: "America/Tegucigalpa", label: "Honduras — Tegucigalpa" },
  { value: "America/Bahia_Banderas", label: "México — Bahía de Banderas" },
  { value: "America/Cancun", label: "México — Cancún" },
  { value: "America/Chihuahua", label: "México — Chihuahua" },
  { value: "America/Ciudad_Juarez", label: "México — Ciudad Juárez" },
  { value: "America/Hermosillo", label: "México — Hermosillo" },
  { value: "America/Matamoros", label: "México — Matamoros" },
  { value: "America/Mazatlan", label: "México — Mazatlán" },
  { value: "America/Merida", label: "México — Mérida" },
  { value: "America/Mexico_City", label: "México — Cidade do México" },
  { value: "America/Monterrey", label: "México — Monterrey" },
  { value: "America/Tijuana", label: "México — Tijuana" },
  { value: "America/Managua", label: "Nicarágua — Manágua" },
  { value: "America/Panama", label: "Panamá — Cidade do Panamá" },
  { value: "America/Asuncion", label: "Paraguai — Assunção" },
  { value: "America/Lima", label: "Peru — Lima" },
  { value: "America/Puerto_Rico", label: "Porto Rico — San Juan" },
  { value: "America/Montevideo", label: "Uruguai — Montevidéu" },
  { value: "America/Caracas", label: "Venezuela — Caracas" },
] as const;

const FUSOS_PERMITIDOS = new Set<string>(
  FUSOS_HORARIOS_AMERICA_LATINA.map((item) => item.value)
);

export const HORARIO_ATENDIMENTO_PADRAO: HorarioAtendimentoAgente = {
  ativo: false,
  dias: [1, 2, 3, 4, 5],
  inicio: "08:00",
  fim: "18:00",
  timezone: "America/Sao_Paulo",
};

function horarioValido(valor: unknown, fallback: string) {
  const texto = String(valor || "").trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(texto)) return fallback;
  return texto;
}

function timezoneValido(valor: unknown) {
  const timezone = String(valor || HORARIO_ATENDIMENTO_PADRAO.timezone).trim();
  return FUSOS_PERMITIDOS.has(timezone)
    ? timezone
    : HORARIO_ATENDIMENTO_PADRAO.timezone;
}

export function normalizarHorarioAtendimento(valor: unknown): HorarioAtendimentoAgente {
  const obj = valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
  const dias = Array.isArray(obj.dias)
    ? Array.from(
        new Set(
          obj.dias
            .map((dia) => Number(dia))
            .filter((dia) => Number.isInteger(dia) && dia >= 1 && dia <= 7)
        )
      ).sort((a, b) => a - b)
    : [...HORARIO_ATENDIMENTO_PADRAO.dias];

  return {
    ativo: obj.ativo === true,
    dias,
    inicio: horarioValido(obj.inicio, HORARIO_ATENDIMENTO_PADRAO.inicio),
    fim: horarioValido(obj.fim, HORARIO_ATENDIMENTO_PADRAO.fim),
    timezone: timezoneValido(obj.timezone),
  };
}

type PartesFuso = {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  diaSemana: number;
};

function partesNoFuso(data: Date, timezone: string): PartesFuso {
  const formatador = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const partes = Object.fromEntries(
    formatador.formatToParts(data).map((parte) => [parte.type, parte.value])
  );
  const ano = Number(partes.year);
  const mes = Number(partes.month);
  const dia = Number(partes.day);
  const diaJs = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
  return {
    ano,
    mes,
    dia,
    hora: Number(partes.hour),
    minuto: Number(partes.minute),
    diaSemana: diaJs === 0 ? 7 : diaJs,
  };
}

function minutosDoDia(horario: string) {
  const [hora, minuto] = horario.split(":").map(Number);
  return hora * 60 + minuto;
}

function localParaUtc(params: {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  timezone: string;
}) {
  const alvoComoUtc = Date.UTC(
    params.ano,
    params.mes - 1,
    params.dia,
    params.hora,
    params.minuto,
    0,
    0
  );
  let estimativa = alvoComoUtc;

  for (let tentativa = 0; tentativa < 4; tentativa += 1) {
    const observada = partesNoFuso(new Date(estimativa), params.timezone);
    const observadaComoUtc = Date.UTC(
      observada.ano,
      observada.mes - 1,
      observada.dia,
      observada.hora,
      observada.minuto,
      0,
      0
    );
    const diferenca = alvoComoUtc - observadaComoUtc;
    estimativa += diferenca;
    if (Math.abs(diferenca) < 60_000) break;
  }

  return new Date(estimativa);
}

export function estaDentroHorarioAtendimento(
  valor: unknown,
  agora: Date = new Date()
) {
  const horario = normalizarHorarioAtendimento(valor);
  if (!horario.ativo) return true;
  if (!horario.dias.length) return false;

  const local = partesNoFuso(agora, horario.timezone);
  const atual = local.hora * 60 + local.minuto;
  const inicio = minutosDoDia(horario.inicio);
  const fim = minutosDoDia(horario.fim);

  if (inicio === fim) return horario.dias.includes(local.diaSemana);
  if (fim > inicio) {
    return horario.dias.includes(local.diaSemana) && atual >= inicio && atual < fim;
  }

  const diaAnterior = local.diaSemana === 1 ? 7 : local.diaSemana - 1;
  return (
    (horario.dias.includes(local.diaSemana) && atual >= inicio) ||
    (horario.dias.includes(diaAnterior) && atual < fim)
  );
}

export function calcularProximaAbertura(
  valor: unknown,
  agora: Date = new Date()
): Date | null {
  const horario = normalizarHorarioAtendimento(valor);
  if (!horario.ativo) return agora;
  if (!horario.dias.length) return null;
  if (estaDentroHorarioAtendimento(horario, agora)) return agora;

  const local = partesNoFuso(agora, horario.timezone);
  const [horaInicio, minutoInicio] = horario.inicio.split(":").map(Number);
  const baseCalendario = new Date(Date.UTC(local.ano, local.mes - 1, local.dia));

  for (let deslocamento = 0; deslocamento <= 7; deslocamento += 1) {
    const calendario = new Date(baseCalendario.getTime());
    calendario.setUTCDate(calendario.getUTCDate() + deslocamento);
    const diaJs = calendario.getUTCDay();
    const diaSemana = diaJs === 0 ? 7 : diaJs;
    if (!horario.dias.includes(diaSemana)) continue;

    const candidata = localParaUtc({
      ano: calendario.getUTCFullYear(),
      mes: calendario.getUTCMonth() + 1,
      dia: calendario.getUTCDate(),
      hora: horaInicio,
      minuto: minutoInicio,
      timezone: horario.timezone,
    });
    if (candidata.getTime() > agora.getTime() + 500) return candidata;
  }

  return null;
}
