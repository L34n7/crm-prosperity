export const COEXISTENCE_SYNC_WINDOW_MS = 24 * 60 * 60 * 1000;

export type CoexistenceSyncErrorClassification =
  | "window_expired"
  | "request_limit_exceeded"
  | "meta_rejected"
  | "unknown_result";

type SyncJobLike = {
  status?: string | null;
  solicitado_em?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  metadata_json?: unknown;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseDate(value: unknown) {
  const timestamp = new Date(String(value || "")).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function getCoexistenceSyncWindow(params: {
  onboardedAt?: string | null;
  now?: Date;
}) {
  const onboardedAt = parseDate(params.onboardedAt);
  const now = (params.now || new Date()).getTime();

  if (onboardedAt === null) {
    return {
      allowed: false,
      expiresAt: null,
      remainingMs: 0,
      reason: "missing_onboarding" as const,
    };
  }

  const expiresAt = onboardedAt + COEXISTENCE_SYNC_WINDOW_MS;
  const remainingMs = Math.max(0, expiresAt - now);

  return {
    allowed: now < expiresAt,
    expiresAt: new Date(expiresAt).toISOString(),
    remainingMs,
    reason: now < expiresAt ? null : ("window_expired" as const),
  };
}

export function isCoexistenceSyncTerminalStatus(status: unknown) {
  return ["concluido", "recusado_usuario", "erro"].includes(
    String(status || "")
  );
}

export function isCoexistenceSyncJobFromCurrentOnboarding(
  job: SyncJobLike | null | undefined,
  onboardedAt?: string | null
) {
  if (!job) return false;

  const onboardingTimestamp = parseDate(onboardedAt);
  if (onboardingTimestamp === null) return true;

  const metadata = objectValue(job.metadata_json);
  const recordedOnboardingTimestamp = parseDate(
    metadata.coex_onboarded_at
  );

  if (recordedOnboardingTimestamp !== null) {
    return Math.abs(recordedOnboardingTimestamp - onboardingTimestamp) < 1000;
  }

  const jobTimestamp =
    parseDate(job.solicitado_em) ??
    parseDate(job.created_at) ??
    parseDate(job.updated_at);

  if (jobTimestamp === null) return true;

  // Tolerância para criação do job e persistência do onboarding ocorrerem
  // praticamente ao mesmo tempo em chamadas concorrentes.
  return jobTimestamp >= onboardingTimestamp - 5000;
}

export function shouldReuseCoexistenceSyncJob(
  job: SyncJobLike | null | undefined,
  onboardedAt?: string | null
) {
  if (!job) return false;
  if (!isCoexistenceSyncJobFromCurrentOnboarding(job, onboardedAt)) {
    return false;
  }

  const metadata = objectValue(job.metadata_json);
  const requestStartedAt = parseDate(metadata.request_started_at);
  const externalRequestMade = metadata.external_request_made === true;

  return (
    String(job.status || "") !== "pendente" ||
    !!job.solicitado_em ||
    requestStartedAt !== null ||
    externalRequestMade
  );
}

export function classifyCoexistenceSyncError(params: {
  data?: unknown;
  fallback: string;
  unknownResult?: boolean;
}) {
  const root = objectValue(params.data);
  const error = objectValue(root.error);
  const errorData = objectValue(error.error_data);
  const rawMessage =
    String(errorData.details || "").trim() ||
    String(error.message || "").trim() ||
    params.fallback;
  const normalized = rawMessage.toLowerCase();

  let classification: CoexistenceSyncErrorClassification =
    params.unknownResult ? "unknown_result" : "meta_rejected";
  let userMessage = rawMessage;

  if (
    normalized.includes("outside of allowed time window") ||
    normalized.includes("within 24 hours") ||
    normalized.includes("dentro de 24 horas") ||
    normalized.includes("janela de tempo permitida")
  ) {
    classification = "window_expired";
    userMessage =
      "A janela de 24 horas da Meta para importar os dados anteriores terminou.";
  } else if (
    normalized.includes("maximum number of times") ||
    normalized.includes("sync request limit") ||
    normalized.includes("limite de solicitações de sincronização") ||
    normalized.includes("número máximo de vezes")
  ) {
    classification = "request_limit_exceeded";
    userMessage =
      "A Meta informou que a solicitação única de sincronização deste número já foi utilizada.";
  } else if (params.unknownResult) {
    userMessage =
      "Não foi possível confirmar o resultado da solicitação. Por segurança, ela não será repetida automaticamente.";
  }

  return {
    classification,
    rawMessage,
    userMessage,
    retryable: false,
    metaCode: String(error.code || "").trim() || null,
    metaSubcode: String(error.error_subcode || "").trim() || null,
  };
}
