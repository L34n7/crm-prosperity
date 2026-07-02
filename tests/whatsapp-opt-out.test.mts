import assert from "node:assert/strict";
import test from "node:test";
import {
  WHATSAPP_OPT_OUT_FEEDBACKS,
  WHATSAPP_OPT_OUT_FOOTERS,
  aplicarFooterOptOut,
  escopoOptOutBloqueiaCategoria,
  identificarComandoOptOutWhatsapp,
  obterFeedbackOptOut,
  templatePossuiInstrucaoOptOut,
} from "../src/lib/whatsapp/opt-out-policy.ts";

test("identifica somente comandos exatos de opt-out", () => {
  assert.equal(identificarComandoOptOutWhatsapp("SAIR"), "sair");
  assert.equal(identificarComandoOptOutWhatsapp("  Saír! "), "sair");
  assert.equal(identificarComandoOptOutWhatsapp("STOP"), "stop");
  assert.equal(identificarComandoOptOutWhatsapp("vou sair amanhã"), null);
  assert.equal(identificarComandoOptOutWhatsapp("não quero sair da fila"), null);
});

test("aplica o footer específico de utility", () => {
  const componentesUtility = aplicarFooterOptOut(
    [
      { type: "BODY", text: "Seu pedido foi atualizado." },
      { type: "FOOTER", text: "Equipe de atendimento" },
      { type: "BUTTONS", buttons: [] },
    ],
    "UTILITY"
  );

  assert.deepEqual(
    componentesUtility.filter((item) => item.type === "FOOTER"),
    [{ type: "FOOTER", text: WHATSAPP_OPT_OUT_FOOTERS.utility }]
  );
  assert.equal(
    templatePossuiInstrucaoOptOut(
      { components: componentesUtility },
      "UTILITY"
    ),
    true
  );
  assert.equal(
    templatePossuiInstrucaoOptOut(
      { components: componentesUtility },
      "MARKETING"
    ),
    false
  );
  assert.deepEqual(
    componentesUtility.map((item) => item.type),
    ["BODY", "FOOTER", "BUTTONS"]
  );
});

test("mantém mensagens de saída independentes por categoria", () => {
  const componentesMarketing = aplicarFooterOptOut(
    [{ type: "BODY", text: "Confira nossas ofertas." }],
    "MARKETING"
  );

  assert.deepEqual(
    componentesMarketing.filter((item) => item.type === "FOOTER"),
    [{ type: "FOOTER", text: WHATSAPP_OPT_OUT_FOOTERS.marketing }]
  );
  assert.equal(
    templatePossuiInstrucaoOptOut(
      { components: componentesMarketing },
      "MARKETING"
    ),
    true
  );
  assert.equal(
    obterFeedbackOptOut("MARKETING"),
    WHATSAPP_OPT_OUT_FEEDBACKS.marketing
  );
  assert.equal(
    obterFeedbackOptOut("UTILITY"),
    WHATSAPP_OPT_OUT_FEEDBACKS.utility
  );
  assert.notEqual(
    WHATSAPP_OPT_OUT_FEEDBACKS.marketing,
    WHATSAPP_OPT_OUT_FEEDBACKS.utility
  );
});

test("mantém compatibilidade com o footer geral já aprovado pela Meta", () => {
  const payloadLegado = {
    components: [
      {
        type: "FOOTER",
        text: "Para não receber mais mensagens, responda SAIR.",
      },
    ],
  };

  assert.equal(
    templatePossuiInstrucaoOptOut(payloadLegado, "MARKETING"),
    true
  );
  assert.equal(templatePossuiInstrucaoOptOut(payloadLegado, "UTILITY"), true);
});

test("classifica template sincronizado sem footer como sem opt-out", () => {
  assert.equal(
    templatePossuiInstrucaoOptOut(
      {
        components: [
          { type: "BODY", text: "Seu pedido foi atualizado." },
        ],
      },
      "UTILITY"
    ),
    false
  );
});

test("bloqueia somente a categoria recusada", () => {
  assert.equal(escopoOptOutBloqueiaCategoria("marketing", "MARKETING"), true);
  assert.equal(escopoOptOutBloqueiaCategoria("marketing", "UTILITY"), false);
  assert.equal(escopoOptOutBloqueiaCategoria("utility", "UTILITY"), true);
  assert.equal(escopoOptOutBloqueiaCategoria("utility", "MARKETING"), false);
  assert.equal(
    escopoOptOutBloqueiaCategoria("todos_disparos", "MARKETING"),
    true
  );
  assert.equal(
    escopoOptOutBloqueiaCategoria("todos_disparos", "UTILITY"),
    true
  );
});

test("não altera templates de autenticação", () => {
  const componentes = [{ type: "BODY", text: "Código {{1}}" }];

  assert.deepEqual(
    aplicarFooterOptOut(componentes, "AUTHENTICATION"),
    componentes
  );
});
