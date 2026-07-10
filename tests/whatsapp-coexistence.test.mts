import assert from "node:assert/strict";
import test from "node:test";
import {
  countCoexistenceWebhookItems,
  extractCoexistenceContacts,
  extractCoexistenceHistoryMessages,
  extractCoexistenceHistoryStates,
  extractCoexistenceMessageEchoes,
  extractWhatsAppAccountUpdates,
  type WhatsAppWebhookBody,
} from "../src/lib/whatsapp/meta.ts";
import { isCoexistencePhoneReady } from "../src/lib/whatsapp/integration-mode.ts";

const phoneNumberId = "phone-coex-1";
const businessPhone = "5511999999999";
const contactPhone = "5511888888888";

test("extrai mensagem enviada pelo WhatsApp Business App como echo de saída", () => {
  const body: WhatsAppWebhookBody = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-1",
        changes: [
          {
            field: "smb_message_echoes",
            value: {
              metadata: {
                phone_number_id: phoneNumberId,
                display_phone_number: businessPhone,
              },
              message_echoes: [
                {
                  from: businessPhone,
                  to: contactPhone,
                  id: "wamid.echo.1",
                  timestamp: "1760000000",
                  type: "text",
                  text: { body: "Resposta enviada pelo celular" },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const echoes = extractCoexistenceMessageEchoes(body);

  assert.equal(echoes.length, 1);
  assert.equal(echoes[0].to, contactPhone);
  assert.equal(echoes[0].conteudo, "Resposta enviada pelo celular");
  assert.equal(countCoexistenceWebhookItems(body).messageEchoes, 1);
});

test("preserva direção, timestamp e progresso das mensagens históricas", () => {
  const body: WhatsAppWebhookBody = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-1",
        changes: [
          {
            field: "history",
            value: {
              metadata: {
                phone_number_id: phoneNumberId,
                display_phone_number: businessPhone,
              },
              history: [
                {
                  metadata: {
                    phase: 1,
                    chunk_order: 3,
                    progress: 55,
                  },
                  threads: [
                    {
                      id: contactPhone,
                      context: {
                        wa_id: contactPhone,
                        username: "Cliente",
                      },
                      messages: [
                        {
                          from: contactPhone,
                          id: "wamid.history.in",
                          timestamp: "1750000000",
                          type: "text",
                          text: { body: "Mensagem antiga recebida" },
                          history_context: { status: "READ" },
                        },
                        {
                          from: businessPhone,
                          to: contactPhone,
                          id: "wamid.history.out",
                          timestamp: "1750000010",
                          type: "text",
                          text: { body: "Mensagem antiga enviada" },
                          history_context: { status: "DELIVERED" },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const messages = extractCoexistenceHistoryMessages(body);
  const states = extractCoexistenceHistoryStates(body);

  assert.equal(messages.length, 2);
  assert.equal(messages[0].direction, "inbound");
  assert.equal(messages[0].contactPhone, contactPhone);
  assert.equal(messages[1].direction, "outbound");
  assert.equal(messages[1].contactPhone, contactPhone);
  assert.equal(messages[1].chunkOrder, 3);
  assert.equal(states[0].progress, 55);
});

test("reconhece recusa do compartilhamento de histórico", () => {
  const body: WhatsAppWebhookBody = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-1",
        changes: [
          {
            field: "history",
            value: {
              metadata: {
                phone_number_id: phoneNumberId,
              },
              history: [
                {
                  errors: [
                    {
                      code: 2593109,
                      message: "History sharing is turned off",
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const states = extractCoexistenceHistoryStates(body);

  assert.equal(states.length, 1);
  assert.equal(states[0].errorCode, 2593109);
  assert.equal(countCoexistenceWebhookItems(body).historyStates, 1);
});

test("preserva mensagens historicas errors como unsupported", () => {
  const body: WhatsAppWebhookBody = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-1",
        changes: [
          {
            field: "history",
            value: {
              metadata: {
                phone_number_id: phoneNumberId,
                display_phone_number: businessPhone,
              },
              history: [
                {
                  threads: [
                    {
                      id: contactPhone,
                      messages: [
                        {
                          from: contactPhone,
                          id: "wamid.history.error",
                          timestamp: "1750000020",
                          type: "errors",
                          errors: [
                            {
                              code: 131051,
                              message: "Message type is not supported",
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const messages = extractCoexistenceHistoryMessages(body);

  assert.equal(messages.length, 1);
  assert.equal(messages[0].tipoMensagem, "unsupported");
  assert.equal(messages[0].metadataJson.tipo_original_whatsapp, "errors");
});

test("extrai contatos sincronizados sem tratar remoção como exclusão do CRM", () => {
  const body: WhatsAppWebhookBody = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-1",
        changes: [
          {
            field: "smb_app_state_sync",
            value: {
              metadata: {
                phone_number_id: phoneNumberId,
              },
              state_sync: [
                {
                  type: "contact",
                  contact: {
                    full_name: "Cliente Teste",
                    phone_number: contactPhone,
                  },
                  action: "add",
                  metadata: { timestamp: "1760000000" },
                },
                {
                  type: "contact",
                  contact: {
                    phone_number: "5511777777777",
                  },
                  action: "remove",
                  metadata: { timestamp: "1760000010" },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const contacts = extractCoexistenceContacts(body);

  assert.deepEqual(
    contacts.map((item) => item.action),
    ["add", "remove"]
  );
  assert.equal(contacts[0].fullName, "Cliente Teste");
});

test("extrai PARTNER_REMOVED e valida prontidão por modo", () => {
  const body: WhatsAppWebhookBody = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-1",
        changes: [
          {
            field: "account_update",
            value: {
              event: "PARTNER_REMOVED",
              waba_info: { waba_id: "waba-1" },
              disconnection_info: {
                reason: "PRIMARY_INACTIVITY",
                initiated_by: "SYSTEM",
              },
            },
          },
        ],
      },
    ],
  };

  const updates = extractWhatsAppAccountUpdates(body);

  assert.equal(updates[0].event, "PARTNER_REMOVED");
  assert.equal(updates[0].reason, "PRIMARY_INACTIVITY");
  assert.equal(
    isCoexistencePhoneReady({
      modo_integracao: "coexistence",
      is_on_biz_app: true,
      platform_type: "CLOUD_API",
      coex_status: "sincronizando",
    }),
    true
  );
  assert.equal(
    isCoexistencePhoneReady({
      modo_integracao: "cloud_api",
      is_on_biz_app: true,
      platform_type: "CLOUD_API",
      coex_status: "ativo",
    }),
    false
  );
});
