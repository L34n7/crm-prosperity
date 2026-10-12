import assert from "node:assert/strict";
import test from "node:test";
import { deveLimparAvisoPagamentoMeta } from "../src/lib/whatsapp/meta-payment-warning-policy.ts";

test("limpa aviso apenas com envio criado depois da última falha financeira", () => {
  assert.equal(
    deveLimparAvisoPagamentoMeta({
      ativo: true,
      ultimaFalhaEm: "2026-10-12T18:00:00.000Z",
      mensagemCriadaEm: "2026-10-12T18:00:01.000Z",
    }),
    true
  );
});

test("não limpa aviso com callback de mensagem anterior à falha", () => {
  assert.equal(
    deveLimparAvisoPagamentoMeta({
      ativo: true,
      ultimaFalhaEm: "2026-10-12T18:00:00.000Z",
      mensagemCriadaEm: "2026-10-12T17:59:59.000Z",
    }),
    false
  );
});

test("não limpa aviso inativo, sem data válida ou no mesmo instante da falha", () => {
  assert.equal(
    deveLimparAvisoPagamentoMeta({
      ativo: false,
      ultimaFalhaEm: "2026-10-12T18:00:00.000Z",
      mensagemCriadaEm: "2026-10-12T18:00:01.000Z",
    }),
    false
  );

  assert.equal(
    deveLimparAvisoPagamentoMeta({
      ativo: true,
      ultimaFalhaEm: "data-invalida",
      mensagemCriadaEm: "2026-10-12T18:00:01.000Z",
    }),
    false
  );

  assert.equal(
    deveLimparAvisoPagamentoMeta({
      ativo: true,
      ultimaFalhaEm: "2026-10-12T18:00:00.000Z",
      mensagemCriadaEm: "2026-10-12T18:00:00.000Z",
    }),
    false
  );
});
