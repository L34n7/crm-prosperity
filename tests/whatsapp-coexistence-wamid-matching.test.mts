import assert from "node:assert/strict";
import test from "node:test";
import { obterSufixoIdentidadeWhatsapp } from "../src/lib/whatsapp/mensagem-id-coexistencia.ts";

const logicalId = "FENFQUMxRkM4MDYyRDY5REFGOEQwAA==";
const cloudId = "wamid.HBgNNTUxOTk5Nzk1NDA5ORUCABEY" + logicalId;
const businessId = "wamid.HBgTQlIuMTQzODgyOTA4MTcyMzE1MhUUABEY" + logicalId;

test("WAMIDs com prefixos diferentes mantem a mesma identidade lógica", () => {
  assert.notEqual(cloudId, businessId);
  assert.equal(obterSufixoIdentidadeWhatsapp(cloudId), logicalId);
  assert.equal(obterSufixoIdentidadeWhatsapp(businessId), logicalId);
});

test("IDs inválidos não permitem pesquisa por sufixo", () => {
  assert.equal(obterSufixoIdentidadeWhatsapp(null), null);
  assert.equal(obterSufixoIdentidadeWhatsapp("123"), null);
  assert.equal(obterSufixoIdentidadeWhatsapp("wamid.abc"), null);
  assert.equal(obterSufixoIdentidadeWhatsapp("wamid." + "x".repeat(35) + "%"), null);
});
