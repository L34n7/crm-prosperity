import assert from "node:assert/strict";
import test from "node:test";

import { interpretarDataHorarioAgenda } from "../src/lib/agendas/agenda-service-core.ts";

test("numero isolado nao vira dia do mes", () => {
  const resultado = interpretarDataHorarioAgenda("16", "America/Sao_Paulo");
  assert.equal(resultado.data, null);
});

test("dia explicito continua sendo interpretado como data", () => {
  const resultado = interpretarDataHorarioAgenda("dia 16", "America/Sao_Paulo");
  assert.ok(resultado.data);
});
