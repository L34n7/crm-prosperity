import type { WhatsAppWebhookBody } from "./meta";

export type WebhookWhatsappIdentificadores = {
  phoneNumberIds: string[];
  mensagemExternaIds: string[];
  telefonesContatos: string[];
};

function textoUnico(valores: unknown[]) {
  return Array.from(
    new Set(
      valores
        .map((valor) => String(valor || "").trim())
        .filter(Boolean)
    )
  );
}

export function extrairIdentificadoresWebhookWhatsapp(
  body: WhatsAppWebhookBody
): WebhookWhatsappIdentificadores {
  const phoneNumberIds: unknown[] = [];
  const mensagemExternaIds: unknown[] = [];
  const telefonesContatos: unknown[] = [];

  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value;
      const phoneNumberId = value?.metadata?.phone_number_id;

      if (phoneNumberId) {
        phoneNumberIds.push(phoneNumberId);
      }

      for (const mensagem of value?.messages || []) {
        mensagemExternaIds.push(mensagem?.id);
        telefonesContatos.push(mensagem?.from);
      }

      for (const status of value?.statuses || []) {
        mensagemExternaIds.push(status?.id);
        telefonesContatos.push(status?.recipient_id);
      }

      for (const echo of value?.message_echoes || []) {
        mensagemExternaIds.push(echo?.id);
        telefonesContatos.push(echo?.to);
      }

      for (const historyItem of value?.history || []) {
        for (const thread of historyItem?.threads || []) {
          telefonesContatos.push(thread?.id);

          for (const mensagem of thread?.messages || []) {
            mensagemExternaIds.push(mensagem?.id);
            telefonesContatos.push(mensagem?.to || mensagem?.from);
          }
        }
      }

      for (const state of value?.state_sync || []) {
        telefonesContatos.push(state?.contact?.phone_number);
      }
    }
  }

  return {
    phoneNumberIds: textoUnico(phoneNumberIds),
    mensagemExternaIds: textoUnico(mensagemExternaIds),
    telefonesContatos: textoUnico(telefonesContatos),
  };
}

export function webhookWhatsappPertenceAosNumeros(
  body: WhatsAppWebhookBody,
  phoneNumberIdsPermitidos: Iterable<string>
) {
  const permitidos = new Set(
    Array.from(phoneNumberIdsPermitidos)
      .map((item) => String(item || "").trim())
      .filter(Boolean)
  );
  const identificadores = extrairIdentificadoresWebhookWhatsapp(body);

  return (
    identificadores.phoneNumberIds.length > 0 &&
    identificadores.phoneNumberIds.every((item) => permitidos.has(item))
  );
}
