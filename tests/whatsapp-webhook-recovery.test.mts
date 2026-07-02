import assert from "node:assert/strict";
import test from "node:test";
import {
  extrairIdentificadoresWebhookWhatsapp,
  webhookWhatsappPertenceAosNumeros,
} from "../src/lib/whatsapp/webhook-recovery.ts";
import type { WhatsAppWebhookBody } from "../src/lib/whatsapp/meta.ts";

const body: WhatsAppWebhookBody = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "waba-1",
      changes: [
        {
          field: "messages",
          value: {
            metadata: {
              phone_number_id: "phone-1",
              display_phone_number: "5511999999999",
            },
            messages: [
              {
                id: "wamid.1",
                from: "5511888888888",
                type: "text",
                text: { body: "Olá" },
              },
            ],
            statuses: [
              {
                id: "wamid.2",
                recipient_id: "5511777777777",
                status: "delivered",
              },
            ],
          },
        },
      ],
    },
  ],
};

test("extrai identificadores necessários para localizar a conversa com falha", () => {
  assert.deepEqual(extrairIdentificadoresWebhookWhatsapp(body), {
    phoneNumberIds: ["phone-1"],
    mensagemExternaIds: ["wamid.1", "wamid.2"],
    telefonesContatos: ["5511888888888", "5511777777777"],
  });
});

test("somente permite recuperar eventos pertencentes à empresa", () => {
  assert.equal(
    webhookWhatsappPertenceAosNumeros(body, new Set(["phone-1"])),
    true
  );
  assert.equal(
    webhookWhatsappPertenceAosNumeros(body, new Set(["phone-2"])),
    false
  );
});
