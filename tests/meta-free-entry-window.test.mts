import assert from "node:assert/strict";
import test from "node:test";
import { resolverVencimentoPontoEntradaMeta } from "../src/lib/whatsapp/meta-free-entry-window.ts";
const agora = new Date("2026-11-13T02:00:00.000Z");
const base = {
  status: "enviada",
  pricingType: "free_entry_point",
  originType: "referral_conversion",
  eventTimestamp: "1794535200",
  agora,
};
test("usa expiração real da Meta sem presumir prazo fixo", () => {
  const expiraMs = agora.getTime() + 5 * 24 * 60 * 60 * 1000;
  const result = resolverVencimentoPontoEntradaMeta({
    ...base, expirationTimestamp: String(expiraMs / 1000),
  });
  assert.equal(result?.expiraEm, new Date(expiraMs).toISOString());
});
test("rejeita status negativo, cobrança normal e origem não qualificada", () => {
  const expirationTimestamp = String(Math.floor(agora.getTime() / 1000) + 3 * 86400);
  assert.equal(resolverVencimentoPontoEntradaMeta({ ...base, status: "falha", expirationTimestamp }), null);
  assert.equal(resolverVencimentoPontoEntradaMeta({ ...base, pricingType: "regular", expirationTimestamp }), null);
  assert.equal(resolverVencimentoPontoEntradaMeta({ ...base, originType: "marketing", expirationTimestamp }), null);
});
test("rejeita vencimentos inválidos, antigos ou além da janela máxima", () => {
  const current = Math.floor(agora.getTime() / 1000);
  for (const expirationTimestamp of [
    String(current - 20), String(current + 9 * 86400), "abc", "0", "",
  ]) {
    assert.equal(resolverVencimentoPontoEntradaMeta({ ...base, expirationTimestamp }), null);
  }
});
