import assert from "node:assert/strict";
import test from "node:test";
import {
  WHATSAPP_OPT_OUT_FOOTER,
  aplicarFooterOptOut,
  identificarComandoOptOutWhatsapp,
  templatePossuiInstrucaoOptOut,
} from "../src/lib/whatsapp/opt-out-policy.ts";

test("identifica somente comandos exatos de opt-out", () => {
  assert.equal(identificarComandoOptOutWhatsapp("SAIR"), "sair");
  assert.equal(identificarComandoOptOutWhatsapp("  Saír! "), "sair");
  assert.equal(identificarComandoOptOutWhatsapp("STOP"), "stop");
  assert.equal(identificarComandoOptOutWhatsapp("vou sair amanhã"), null);
  assert.equal(identificarComandoOptOutWhatsapp("não quero sair da fila"), null);
});

test("força o footer de opt-out em utility e marketing", () => {
  const componentes = aplicarFooterOptOut(
    [
      { type: "BODY", text: "Seu pedido foi atualizado." },
      { type: "FOOTER", text: "Equipe de atendimento" },
      { type: "BUTTONS", buttons: [] },
    ],
    "UTILITY"
  );

  assert.deepEqual(
    componentes.filter((item) => item.type === "FOOTER"),
    [{ type: "FOOTER", text: WHATSAPP_OPT_OUT_FOOTER }]
  );
  assert.equal(templatePossuiInstrucaoOptOut({ components: componentes }), true);
  assert.deepEqual(
    componentes.map((item) => item.type),
    ["BODY", "FOOTER", "BUTTONS"]
  );
});

test("não altera templates de autenticação", () => {
  const componentes = [{ type: "BODY", text: "Código {{1}}" }];

  assert.deepEqual(
    aplicarFooterOptOut(componentes, "AUTHENTICATION"),
    componentes
  );
});
