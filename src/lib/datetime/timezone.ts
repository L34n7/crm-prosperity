export const TIMEZONE_PADRAO_EMPRESA = "America/Sao_Paulo";

export function normalizarTimezoneEmpresa(valor?: string | null) {
  const timezone = String(valor || "").trim() || TIMEZONE_PADRAO_EMPRESA;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return TIMEZONE_PADRAO_EMPRESA;
  }
}

type PartesDataHora = {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
};

function parseDataHoraLocal(valor: string): PartesDataHora {
  const match = String(valor || "")
    .trim()
    .match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
    );

  if (!match) {
    throw new Error("Data e hora inválidas.");
  }

  const partes: PartesDataHora = {
    ano: Number(match[1]),
    mes: Number(match[2]),
    dia: Number(match[3]),
    hora: Number(match[4]),
    minuto: Number(match[5]),
    segundo: Number(match[6] || 0),
  };

  const teste = new Date(
    Date.UTC(
      partes.ano,
      partes.mes - 1,
      partes.dia,
      partes.hora,
      partes.minuto,
      partes.segundo
    )
  );

  if (
    teste.getUTCFullYear() !== partes.ano ||
    teste.getUTCMonth() !== partes.mes - 1 ||
    teste.getUTCDate() !== partes.dia ||
    teste.getUTCHours() !== partes.hora ||
    teste.getUTCMinutes() !== partes.minuto ||
    teste.getUTCSeconds() !== partes.segundo
  ) {
    throw new Error("Data e hora inválidas.");
  }

  return partes;
}

function partesNoTimezone(timestampMs: number, timezone: string): PartesDataHora {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const partes = formatter.formatToParts(new Date(timestampMs));
  const obter = (tipo: Intl.DateTimeFormatPartTypes) =>
    Number(partes.find((parte) => parte.type === tipo)?.value || 0);

  return {
    ano: obter("year"),
    mes: obter("month"),
    dia: obter("day"),
    hora: obter("hour"),
    minuto: obter("minute"),
    segundo: obter("second"),
  };
}

function obterOffsetTimezoneMs(timestampMs: number, timezone: string) {
  const timestampSegundo = Math.floor(timestampMs / 1000) * 1000;
  const partes = partesNoTimezone(timestampSegundo, timezone);
  const representacaoUtc = Date.UTC(
    partes.ano,
    partes.mes - 1,
    partes.dia,
    partes.hora,
    partes.minuto,
    partes.segundo
  );

  return representacaoUtc - timestampSegundo;
}

function partesIguais(a: PartesDataHora, b: PartesDataHora) {
  return (
    a.ano === b.ano &&
    a.mes === b.mes &&
    a.dia === b.dia &&
    a.hora === b.hora &&
    a.minuto === b.minuto &&
    a.segundo === b.segundo
  );
}

export function converterDataHoraLocalParaUtc(
  valorLocal: string,
  timezoneInformado?: string | null
) {
  const timezone = normalizarTimezoneEmpresa(timezoneInformado);
  const local = parseDataHoraLocal(valorLocal);
  const localComoUtc = Date.UTC(
    local.ano,
    local.mes - 1,
    local.dia,
    local.hora,
    local.minuto,
    local.segundo
  );

  let timestampUtc =
    localComoUtc - obterOffsetTimezoneMs(localComoUtc, timezone);

  const offsetConfirmado = obterOffsetTimezoneMs(timestampUtc, timezone);
  timestampUtc = localComoUtc - offsetConfirmado;

  const partesConvertidas = partesNoTimezone(timestampUtc, timezone);

  if (!partesIguais(local, partesConvertidas)) {
    throw new Error(
      `O horário informado não existe no fuso ${timezone}. Escolha outro horário.`
    );
  }

  return new Date(timestampUtc).toISOString();
}
