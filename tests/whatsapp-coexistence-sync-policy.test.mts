import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyCoexistenceSyncError,
  getCoexistenceSyncWindow,
  isCoexistenceSyncJobFromCurrentOnboarding,
  isCoexistenceSyncTerminalStatus,
  shouldReuseCoexistenceSyncJob,
} from "../src/lib/whatsapp/coexistence-sync-policy.ts";

test("permite sincronização dentro das 24 horas do onboarding", () => {
  const result = getCoexistenceSyncWindow({
    onboardedAt: "2026-07-13T20:00:00.000Z",
    now: new Date("2026-07-14T19:59:59.000Z"),
  });

  assert.equal(result.allowed, true);
  assert.equal(result.reason, null);
});

test("bloqueia sincronização após a janela de 24 horas", () => {
  const result = getCoexistenceSyncWindow({
    onboardedAt: "2026-07-13T20:00:00.000Z",
    now: new Date("2026-07-14T20:00:00.000Z"),
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "window_expired");
});

test("reutiliza job já tentado no mesmo onboarding", () => {
  const job = {
    status: "erro",
    solicitado_em: null,
    created_at: "2026-07-13T20:00:30.000Z",
    metadata_json: {
      meta_response: { error: { code: 4 } },
    },
  };

  assert.equal(
    shouldReuseCoexistenceSyncJob(job, "2026-07-13T20:00:00.000Z"),
    true
  );
});

test("libera um novo job depois de um novo onboarding", () => {
  const job = {
    status: "erro",
    solicitado_em: "2026-07-13T20:00:30.000Z",
    created_at: "2026-07-13T20:00:20.000Z",
    updated_at: "2026-07-13T20:00:31.000Z",
  };

  assert.equal(
    isCoexistenceSyncJobFromCurrentOnboarding(
      job,
      "2026-07-15T10:00:00.000Z"
    ),
    false
  );
  assert.equal(
    shouldReuseCoexistenceSyncJob(job, "2026-07-15T10:00:00.000Z"),
    false
  );
});

test("classifica limite de sincronização como não repetível", () => {
  const result = classifyCoexistenceSyncError({
    data: {
      error: {
        code: 4,
        error_data: {
          details:
            "You have exceeded the maximum number of times to call the synchronization api for this phone number.",
        },
      },
    },
    fallback: "Erro de sincronização.",
  });

  assert.equal(result.classification, "request_limit_exceeded");
  assert.equal(result.retryable, false);
});

test("classifica solicitação fora da janela permitida", () => {
  const result = classifyCoexistenceSyncError({
    data: {
      error: {
        code: 4,
        message:
          "Synchronization Request made outside of allowed time window: Synchronization request can only be made within 24 hours of onboarding",
      },
    },
    fallback: "Erro de sincronização.",
  });

  assert.equal(result.classification, "window_expired");
  assert.equal(result.retryable, false);
});

test("considera erro de importação terminal sem derrubar a conexão", () => {
  assert.equal(isCoexistenceSyncTerminalStatus("erro"), true);
  assert.equal(isCoexistenceSyncTerminalStatus("processando"), false);
});
