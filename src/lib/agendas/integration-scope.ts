export type AgendaIntegrationScope = {
  modo: "todas" | "selecionadas";
  ids: string[];
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeIntegrationIds(value: unknown) {
  const values = Array.isArray(value) ? value : [];
  return Array.from(
    new Set(
      values
        .map((item) => String(item || "").trim())
        .filter((item) => UUID_PATTERN.test(item))
    )
  );
}

export function readIntegrationScope(metadata: unknown): AgendaIntegrationScope {
  const root = asRecord(metadata);
  const raw = asRecord(root.integracoes_whatsapp);
  const ids = normalizeIntegrationIds(raw.ids);
  return raw.modo === "selecionadas" && ids.length > 0
    ? { modo: "selecionadas", ids }
    : { modo: "todas", ids: [] };
}

export function calendarIntegrationIds(metadata: unknown) {
  const scope = readIntegrationScope(metadata);
  return scope.modo === "selecionadas" ? scope.ids : [];
}

export function withCalendarIntegrationIds(
  metadata: unknown,
  integrationIds: unknown
) {
  const root = asRecord(metadata);
  const ids = normalizeIntegrationIds(integrationIds);
  return {
    ...root,
    integracoes_whatsapp: {
      modo: "selecionadas",
      ids,
    },
  };
}

export function flowSupportsCalendar(
  flowConfiguration: unknown,
  calendarIds: string[]
) {
  if (calendarIds.length === 0) return true;
  const scope = readIntegrationScope(flowConfiguration);
  if (scope.modo === "todas") return true;
  return scope.ids.some((id) => calendarIds.includes(id));
}

export function flowSupportsIntegration(
  flowConfiguration: unknown,
  integrationId: unknown
) {
  const id = String(integrationId || "").trim();
  if (!id) return false;
  const scope = readIntegrationScope(flowConfiguration);
  return scope.modo === "todas" || scope.ids.includes(id);
}
