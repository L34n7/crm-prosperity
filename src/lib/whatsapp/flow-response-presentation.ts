export type WhatsAppFlowResponseField = {
  key: string;
  label: string;
  value: string;
};

export type WhatsAppFlowResponsePresentation = {
  title: string;
  status: string;
  fields: WhatsAppFlowResponseField[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readRecord(
  source: Record<string, unknown>,
  key: string
): Record<string, unknown> | null {
  const value = source[key];
  return isRecord(value) ? value : null;
}

function readText(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function parseResponseJson(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function formatFieldValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(formatFieldValue).filter(Boolean).join(", ");
  }

  return "";
}

function formatFieldLabel(key: string) {
  const normalized = key
    .replace(/^screen_\d+_/i, "")
    .replace(/_\d+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const knownLabels: Record<string, string> = {
    name: "Nome",
    nome: "Nome",
    email: "E-mail",
    "e mail": "E-mail",
    phone: "Telefone",
    telefone: "Telefone",
    cpf: "CPF",
    cnpj: "CNPJ",
  };
  const known = knownLabels[normalized.toLocaleLowerCase("pt-BR")];
  if (known) return known;
  if (!normalized) return "Resposta";

  return normalized.charAt(0).toLocaleUpperCase("pt-BR") + normalized.slice(1);
}

function isInternalFlowField(key: string) {
  return /^flow(?:_|$)/i.test(key);
}

function formatStatus(body: string) {
  if (/^(sent|submitted)$/i.test(body)) return "Resposta enviada.";
  return body || "Resposta enviada.";
}

export function getWhatsAppFlowResponsePresentation(
  metadata: unknown
): WhatsAppFlowResponsePresentation | null {
  if (!isRecord(metadata)) return null;

  const interactive = readRecord(metadata, "interactive");
  if (!interactive) return null;

  const nfmReply = readRecord(interactive, "nfm_reply");
  const interactiveType = readText(interactive, "type").toLocaleLowerCase();
  if (!nfmReply || interactiveType !== "nfm_reply") return null;

  const referral = readRecord(metadata, "referral");
  const welcomeMessage = referral ? readRecord(referral, "welcome_message") : null;
  const welcomeButton = welcomeMessage
    ? readRecord(welcomeMessage, "button")
    : null;
  const title = readText(welcomeButton, "text") || "Formulário enviado";
  const response = parseResponseJson(nfmReply.response_json);
  const fields = response
    ? Object.entries(response)
        .filter(([key]) => !isInternalFlowField(key))
        .map(([key, value]) => ({
          key,
          label: formatFieldLabel(key),
          value: formatFieldValue(value),
        }))
        .filter((field) => !!field.value)
    : [];

  return {
    title,
    status: formatStatus(readText(nfmReply, "body")),
    fields,
  };
}
