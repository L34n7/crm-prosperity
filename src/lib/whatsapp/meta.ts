export type WhatsAppWebhookBody = {
  object?: string;
  entry?: WhatsAppEntry[];
};

export type WhatsAppEntry = {
  id?: string;
  changes?: WhatsAppChange[];
};

type WhatsAppContactProfile = {
  name?: string;
};

type WhatsAppWebhookContact = {
  profile?: WhatsAppContactProfile;
  wa_id?: string;
};

type WhatsAppTextMessage = {
  body?: string;
};

type WhatsAppImageMessage = {
  id?: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
  url?: string;
};

type WhatsAppAudioMessage = {
  id?: string;
  mime_type?: string;
  sha256?: string;
  voice?: boolean;
  url?: string;
};

type WhatsAppVideoMessage = {
  id?: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
  url?: string;
};

type WhatsAppDocumentMessage = {
  id?: string;
  mime_type?: string;
  sha256?: string;
  filename?: string;
  caption?: string;
  url?: string;
};

type WhatsAppLocationMessage = {
  latitude?: number;
  longitude?: number;
  name?: string;
  address?: string;
};

type WhatsAppUnsupportedMessage = {
  type?: string;
};

type WhatsAppMessageError = {
  code?: number;
  title?: string;
  message?: string;
  error_data?: {
    details?: string;
  };
};

type WhatsAppSharedContactName = {
  formatted_name?: string;
  first_name?: string;
  last_name?: string;
};

type WhatsAppSharedContactPhone = {
  phone?: string;
  wa_id?: string;
  type?: string;
};

type WhatsAppSharedContactEmail = {
  email?: string;
  type?: string;
};

type WhatsAppSharedContactAddress = {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  country_code?: string;
  type?: string;
};

type WhatsAppSharedContactOrg = {
  company?: string;
  department?: string;
  title?: string;
};

type WhatsAppSharedContact = {
  name?: WhatsAppSharedContactName;
  phones?: WhatsAppSharedContactPhone[];
  emails?: WhatsAppSharedContactEmail[];
  addresses?: WhatsAppSharedContactAddress[];
  org?: WhatsAppSharedContactOrg;
};

type WhatsAppInteractiveMessage = unknown;

type WhatsAppButtonMessage = {
  text?: string;
  payload?: string;
};

type WhatsAppIncomingRawMessage = {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: WhatsAppTextMessage;
  image?: WhatsAppImageMessage;
  audio?: WhatsAppAudioMessage;
  video?: WhatsAppVideoMessage;
  document?: WhatsAppDocumentMessage;
  location?: WhatsAppLocationMessage;
  unsupported?: WhatsAppUnsupportedMessage;
  errors?: WhatsAppMessageError[];
  contacts?: WhatsAppSharedContact[];
  button?: WhatsAppButtonMessage;
  interactive?: WhatsAppInteractiveMessage;
};

type WhatsAppStatusConversation = {
  id?: string;
  origin?: {
    type?: string;
  };
  expiration_timestamp?: string;
};

type WhatsAppStatusPricing = {
  billable?: boolean;
  pricing_model?: string;
  category?: string;
};

type WhatsAppStatusError = {
  code?: number;
  title?: string;
  message?: string;
  error_data?: {
    details?: string;
  };
};

type WhatsAppRawStatus = {
  id?: string;
  status?: "sent" | "delivered" | "read" | "failed";
  timestamp?: string;
  recipient_id?: string;
  conversation?: WhatsAppStatusConversation;
  pricing?: WhatsAppStatusPricing;
  errors?: WhatsAppStatusError[];
};

export type ExtractedMessageStatus = {
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  mensagemExternaId: string;
  status: "enviada" | "entregue" | "lida" | "falha";
  timestamp: string | null;
  recipientId: string | null;
  conversationId: string | null;
  conversationOriginType: string | null;
  expirationTimestamp: string | null;
  pricingCategory: string | null;
  pricingModel: string | null;
  pricingBillable: boolean | null;
  errorMessage: string | null;
  rawStatus: WhatsAppRawStatus;
};

export type WhatsAppChange = {
  field?: string;
  value?: {
    messaging_product?: string;
    metadata?: {
      display_phone_number?: string;
      phone_number_id?: string;
    };
    contacts?: WhatsAppWebhookContact[];
    messages?: WhatsAppIncomingRawMessage[];
    statuses?: WhatsAppRawStatus[];
  };
};

export type NormalizedMessageMetadata = {
  tipo_original_whatsapp: string;
  media_id?: string | null;
  mime_type?: string | null;
  sha256?: string | null;
  caption?: string | null;
  filename?: string | null;
  url?: string | null;
  voice?: boolean | null;
  contacts?: WhatsAppSharedContact[] | null;
  location?: {
    latitude?: number | null;
    longitude?: number | null;
    name?: string | null;
    address?: string | null;
  } | null;
  unsupported?: {
    type?: string | null;
    details?: string | null;
  } | null;
};

export type ExtractedIncomingMessage = {
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  from: string;
  waId: string | null;
  profileName: string | null;
  messageId: string;
  timestamp: string | null;
  type: string;
  text: string | null;
  tipoMensagem: string;
  conteudo: string;
  metadataJson: NormalizedMessageMetadata;
  rawMessage: WhatsAppIncomingRawMessage;
};

function mapWhatsAppTypeToInternalType(type?: string | null): string {
  switch (type) {
    case "text":
      return "texto";
    case "image":
      return "imagem";
    case "audio":
      return "audio";
    case "video":
      return "video";
    case "document":
      return "documento";
    case "contacts":
      return "contato";
    case "location":
      return "localizacao";
    case "button":
      return "botao";
    case "interactive":
      return "lista";
    case "unsupported":
      return "unsupported";
    default:
      return "texto";
  }
}

function buildContactSharedPreview(contacts?: WhatsAppSharedContact[]): string {
  if (!contacts?.length) return "👤 Contato compartilhado";

  const primeiro = contacts[0];
  const nome =
    primeiro.name?.formatted_name ||
    [primeiro.name?.first_name, primeiro.name?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();

  if (!nome) return "👤 Contato compartilhado";

  return `👤 Contato compartilhado: ${nome}`;
}

function buildConteudo(
  rawMessage: WhatsAppIncomingRawMessage,
  tipoMensagem: string
): string {
  if (tipoMensagem === "texto") {
    return rawMessage.text?.body?.trim() || "";
  }

  if (tipoMensagem === "imagem") {
    return rawMessage.image?.caption?.trim() || "📷 Imagem";
  }

  if (tipoMensagem === "audio") {
    return rawMessage.audio?.voice ? "🎤 Áudio" : "🎵 Áudio";
  }

  if (tipoMensagem === "video") {
    return rawMessage.video?.caption?.trim() || "🎥 Vídeo";
  }

  if (tipoMensagem === "documento") {
    const nomeArquivo = rawMessage.document?.filename?.trim();
    return nomeArquivo ? `📄 Documento: ${nomeArquivo}` : "📄 Documento";
  }

  if (tipoMensagem === "contato") {
    return buildContactSharedPreview(rawMessage.contacts);
  }

  if (tipoMensagem === "localizacao") {
    return "📍 Localização compartilhada";
  }

  if (tipoMensagem === "botao") {
    return rawMessage.button?.text?.trim() || "🔘 Botão";
  }

  if (tipoMensagem === "lista") {
    return "📋 Interação de lista";
  }

  if (tipoMensagem === "unsupported") {
    return "⚠️ Mensagem não suportada pela API do WhatsApp";
  }

  return "Mensagem recebida";
}

function buildMetadataJson(
  rawMessage: WhatsAppIncomingRawMessage
): NormalizedMessageMetadata {
  const tipo = rawMessage.type ?? "unknown";

  if (tipo === "image") {
    return {
      tipo_original_whatsapp: tipo,
      media_id: rawMessage.image?.id ?? null,
      mime_type: rawMessage.image?.mime_type ?? null,
      sha256: rawMessage.image?.sha256 ?? null,
      caption: rawMessage.image?.caption ?? null,
      filename: null,
      url: rawMessage.image?.url ?? null,
      voice: null,
      contacts: null,
      location: null,
      unsupported: null,
    };
  }

  if (tipo === "audio") {
    return {
      tipo_original_whatsapp: tipo,
      media_id: rawMessage.audio?.id ?? null,
      mime_type: rawMessage.audio?.mime_type ?? null,
      sha256: rawMessage.audio?.sha256 ?? null,
      caption: null,
      filename: null,
      url: rawMessage.audio?.url ?? null,
      voice: rawMessage.audio?.voice ?? null,
      contacts: null,
      location: null,
      unsupported: null,
    };
  }

  if (tipo === "video") {
    return {
      tipo_original_whatsapp: tipo,
      media_id: rawMessage.video?.id ?? null,
      mime_type: rawMessage.video?.mime_type ?? null,
      sha256: rawMessage.video?.sha256 ?? null,
      caption: rawMessage.video?.caption ?? null,
      filename: null,
      url: rawMessage.video?.url ?? null,
      voice: null,
      contacts: null,
      location: null,
      unsupported: null,
    };
  }

  if (tipo === "document") {
    return {
      tipo_original_whatsapp: tipo,
      media_id: rawMessage.document?.id ?? null,
      mime_type: rawMessage.document?.mime_type ?? null,
      sha256: rawMessage.document?.sha256 ?? null,
      caption: rawMessage.document?.caption ?? null,
      filename: rawMessage.document?.filename ?? null,
      url: rawMessage.document?.url ?? null,
      voice: null,
      contacts: null,
      location: null,
      unsupported: null,
    };
  }

  if (tipo === "contacts") {
    return {
      tipo_original_whatsapp: tipo,
      media_id: null,
      mime_type: null,
      sha256: null,
      caption: null,
      filename: null,
      url: null,
      voice: null,
      contacts: rawMessage.contacts ?? null,
      location: null,
      unsupported: null,
    };
  }

  if (tipo === "location") {
    return {
      tipo_original_whatsapp: tipo,
      media_id: null,
      mime_type: null,
      sha256: null,
      caption: null,
      filename: null,
      url: null,
      voice: null,
      contacts: null,
      location: {
        latitude: rawMessage.location?.latitude ?? null,
        longitude: rawMessage.location?.longitude ?? null,
        name: rawMessage.location?.name ?? null,
        address: rawMessage.location?.address ?? null,
      },
      unsupported: null,
    };
  }

  if (tipo === "unsupported") {
    return {
      tipo_original_whatsapp: tipo,
      media_id: null,
      mime_type: null,
      sha256: null,
      caption: null,
      filename: null,
      url: null,
      voice: null,
      contacts: null,
      location: null,
      unsupported: {
        type: rawMessage.unsupported?.type ?? null,
        details: rawMessage.errors?.[0]?.error_data?.details ?? null,
      },
    };
  }

  return {
    tipo_original_whatsapp: tipo,
    media_id: null,
    mime_type: null,
    sha256: null,
    caption: null,
    filename: null,
    url: null,
    voice: null,
    contacts: null,
    location: null,
    unsupported: null,
  };
}

export function extractIncomingMessages(
  body: WhatsAppWebhookBody
): ExtractedIncomingMessage[] {
  const results: ExtractedIncomingMessage[] = [];

  if (!body?.entry?.length) return results;

  for (const entry of body.entry) {
    if (!entry?.changes?.length) continue;

    for (const change of entry.changes) {
      if (change?.field !== "messages") continue;

      const value = change.value;
      if (!value) continue;

      const phoneNumberId = value.metadata?.phone_number_id ?? "";
      const displayPhoneNumber = value.metadata?.display_phone_number ?? null;

      const firstContact = value.contacts?.[0];
      const profileName = firstContact?.profile?.name ?? null;
      const waId = firstContact?.wa_id ?? null;

      const messages = value.messages ?? [];

      for (const message of messages) {
        const type = message.type ?? "unknown";
        const tipoMensagem = mapWhatsAppTypeToInternalType(type);
        const conteudo = buildConteudo(message, tipoMensagem);
        const metadataJson = buildMetadataJson(message);

        results.push({
          phoneNumberId,
          displayPhoneNumber,
          from: message.from ?? "",
          waId,
          profileName,
          messageId: message.id ?? "",
          timestamp: message.timestamp ?? null,
          type,
          text: message.text?.body ?? null,
          tipoMensagem,
          conteudo,
          metadataJson,
          rawMessage: message,
        });
      }
    }
  }

  return results.filter(
    (message) =>
      !!message.from && !!message.messageId && !!message.phoneNumberId
  );
}

export function extractTextMessages(body: WhatsAppWebhookBody) {
  return extractIncomingMessages(body).filter(
    (message) => message.type === "text" && !!message.text
  );
}

function mapWhatsAppStatusToInternalStatus(
  status?: string | null
): "enviada" | "entregue" | "lida" | "falha" | null {
  switch (status) {
    case "sent":
      return "enviada";
    case "delivered":
      return "entregue";
    case "read":
      return "lida";
    case "failed":
      return "falha";
    default:
      return null;
  }
}

export function extractMessageStatuses(
  body: WhatsAppWebhookBody
): ExtractedMessageStatus[] {
  const results: ExtractedMessageStatus[] = [];

  if (!body?.entry?.length) return results;

  for (const entry of body.entry) {
    if (!entry?.changes?.length) continue;

    for (const change of entry.changes) {
      if (change?.field !== "messages") continue;

      const value = change.value;
      if (!value) continue;

      const phoneNumberId = value.metadata?.phone_number_id ?? "";
      const displayPhoneNumber = value.metadata?.display_phone_number ?? null;
      const statuses = value.statuses ?? [];

      for (const statusItem of statuses) {
        const mappedStatus = mapWhatsAppStatusToInternalStatus(
          statusItem.status ?? null
        );

        if (!mappedStatus) continue;
        if (!statusItem.id) continue;
        if (!phoneNumberId) continue;

        results.push({
          phoneNumberId,
          displayPhoneNumber,
          mensagemExternaId: statusItem.id,
          status: mappedStatus,
          timestamp: statusItem.timestamp ?? null,
          recipientId: statusItem.recipient_id ?? null,
          conversationId: statusItem.conversation?.id ?? null,
          conversationOriginType: statusItem.conversation?.origin?.type ?? null,
          expirationTimestamp:
            statusItem.conversation?.expiration_timestamp ?? null,
          pricingCategory: statusItem.pricing?.category ?? null,
          pricingModel: statusItem.pricing?.pricing_model ?? null,
          pricingBillable:
            typeof statusItem.pricing?.billable === "boolean"
              ? statusItem.pricing.billable
              : null,
          errorMessage:
            statusItem.errors?.[0]?.message ??
            statusItem.errors?.[0]?.error_data?.details ??
            null,
          rawStatus: statusItem,
        });
      }
    }
  }

  return results;
}