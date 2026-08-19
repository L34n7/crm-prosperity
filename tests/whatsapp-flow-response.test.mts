import assert from "node:assert/strict";
import test from "node:test";
import { getWhatsAppFlowResponsePresentation } from "../src/lib/whatsapp/flow-response-presentation.ts";
import { extractIncomingMessages } from "../src/lib/whatsapp/meta.ts";

const flowMessage = {
  type: "interactive",
  interactive: {
    type: "nfm_reply",
    nfm_reply: {
      body: "Sent",
      name: "flow",
      response_json: JSON.stringify({
        screen_0_Name_0: "Leandro Nunes ",
        screen_0_Email_1: "Leandro.isidorio@outlook.com",
        flow_token: "6366465F-7BE2-4B9B-A35C-BA83E6C53180",
        flow_id: "3307525322765474",
      }),
    },
  },
  referral: {
    welcome_message: {
      text: "Olá! Preencha o formulário abaixo para se cadastrar.",
      button: {
        text: "Participar agora",
        type: "flow",
      },
    },
  },
};

test("formata a resposta nativa de formulário do WhatsApp", () => {
  const presentation = getWhatsAppFlowResponsePresentation(flowMessage);

  assert.deepEqual(presentation, {
    title: "Participar agora",
    status: "Resposta enviada.",
    fields: [
      { key: "screen_0_Name_0", label: "Nome", value: "Leandro Nunes" },
      {
        key: "screen_0_Email_1",
        label: "E-mail",
        value: "Leandro.isidorio@outlook.com",
      },
    ],
  });
});

test("ignora ids internos e tolera response_json inválido", () => {
  const presentation = getWhatsAppFlowResponsePresentation({
    interactive: {
      type: "nfm_reply",
      nfm_reply: { body: "Sent", response_json: "{" },
    },
  });

  assert.deepEqual(presentation, {
    title: "Formulário enviado",
    status: "Resposta enviada.",
    fields: [],
  });
});

test("salva o título do formulário no conteúdo da mensagem recebida", () => {
  const [message] = extractIncomingMessages({
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "123" },
              contacts: [{ wa_id: "5531975233266" }],
              messages: [
                {
                  ...flowMessage,
                  id: "wamid.flow-response",
                  from: "5531975233266",
                },
              ],
            },
          },
        ],
      },
    ],
  });

  assert.equal(message.tipoMensagem, "botao");
  assert.equal(message.conteudo, "Participar agora");
  assert.equal(message.metadataJson.interactive?.type, "nfm_reply");
});

test("não altera apresentação de botões interativos comuns", () => {
  assert.equal(
    getWhatsAppFlowResponsePresentation({
      interactive: {
        type: "button_reply",
        button_reply: { id: "sim", title: "Sim" },
      },
    }),
    null
  );
});
