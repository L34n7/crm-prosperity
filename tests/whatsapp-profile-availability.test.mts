import assert from "node:assert/strict";
import test from "node:test";
import { isWhatsAppProfileMetaAvailable } from "../src/lib/whatsapp/profile-availability.ts";

test("não consulta a Meta durante onboarding pendente", () => {
  assert.equal(
    isWhatsAppProfileMetaAvailable({
      status: "pendente",
      onboarding_status: "pendente",
      phone_number_id: "1254236227763929",
    }),
    false
  );
});

test("libera perfil após concluir o onboarding", () => {
  assert.equal(
    isWhatsAppProfileMetaAvailable({
      status: "ativa",
      onboarding_status: "concluido",
      phone_number_id: "123",
    }),
    true
  );
});

test("mantém compatibilidade com integração legada concluída", () => {
  assert.equal(
    isWhatsAppProfileMetaAvailable({
      status: "ativa",
      onboarding_status: null,
      setup_completed_at: "2026-01-01T00:00:00.000Z",
      phone_number_id: "123",
    }),
    true
  );
});
