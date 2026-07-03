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

type WhatsAppInteractiveMessage = {
  type?: string;
  button_reply?: {
    id?: string;
    title?: string;
  };
  list_reply?: {
    id?: string;
    title?: string;
    description?: string;
  };
};

type WhatsAppButtonMessage = {
  text?: string;
  payload?: string;
};

type WhatsAppMessageContext = {
  from?: string;
  id?: string;
  forwarded?: boolean;
  frequently_forwarded?: boolean;
};

export type WhatsAppReferral = {
  source_url?: string;
  source_type?: string;
  source_id?: string;
  headline?: string;
  body?: string;
  media_type?: string;
  image_url?: string;
  video_url?: string;
  thumbnail_url?: string;
  ctwa_clid?: string;
};

type WhatsAppHistoryContext = {
  status?: string;
};

export type WhatsAppIncomingRawMessage = {
  from?: string;
  to?: string;
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
  context?: WhatsAppMessageContext;
  referral?: WhatsAppReferral;
  history_context?: WhatsAppHistoryContext;
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
  type?: string;
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
  pricingType: string | null;
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
    message_echoes?: WhatsAppIncomingRawMessage[];
    history?: Array<{
      metadata?: {
        phase?: number;
        chunk_order?: number;
        progress?: number;
      };
      threads?: Array<{
        id?: string;
        context?: {
          wa_id?: string;
          user_id?: string;
          username?: string;
        };
        messages?: WhatsAppIncomingRawMessage[];
      }>;
      errors?: Array<{
        code?: number;
        title?: string;
        message?: string;
        error_data?: {
          details?: string;
        };
      }>;
    }>;
    state_sync?: Array<{
      type?: string;
      contact?: {
        full_name?: string;
        first_name?: string;
        phone_number?: string;
      };
      action?: "add" | "remove";
      metadata?: {
        timestamp?: string;
      };
    }>;
    event?: string;
    waba_info?: {
      waba_id?: string;
      owner_business_id?: string;
    };
    disconnection_info?: {
      reason?: string;
      initiated_by?: string;
    };
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
  interactive?: WhatsAppInteractiveMessage | null;
  context?: WhatsAppMessageContext | null;
  unsupported?: {
    type?: string | null;
    details?: string | null;
  } | null;
  referral?: WhatsAppReferral | null;
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
  referral: WhatsAppReferral | null;
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
      return "botao";
    case "unsupported":
    case "media_placeholder":
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
    return (
      rawMessage.button?.text?.trim() ||
      rawMessage.interactive?.button_reply?.title?.trim() ||
      rawMessage.interactive?.button_reply?.id?.trim() ||
      rawMessage.interactive?.list_reply?.title?.trim() ||
      rawMessage.interactive?.list_reply?.id?.trim() ||
      "🔘 Botão"
    );
  }

  if (tipoMensagem === "lista") {
    return "📋 Interação de lista";
  }

  if (tipoMensagem === "unsupported") {
    if (rawMessage.type === "media_placeholder") {
      return "Mídia do histórico do WhatsApp";
    }

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
      referral: rawMessage.referral ?? null,
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
      referral: rawMessage.referral ?? null,
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
      referral: rawMessage.referral ?? null,
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
      referral: rawMessage.referral ?? null,
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
      referral: rawMessage.referral ?? null,
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
      referral: rawMessage.referral ?? null,
    };
  }

  if (tipo === "interactive") {
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
      interactive: rawMessage.interactive ?? null,
      unsupported: null,
      referral: rawMessage.referral ?? null,
    };
  }

  if (tipo === "unsupported" || tipo === "media_placeholder") {
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
        type: rawMessage.unsupported?.type ?? tipo,
        details:
          tipo === "media_placeholder"
            ? "A mídia histórica será enviada pela Meta em um evento separado quando estiver disponível."
            : rawMessage.errors?.[0]?.error_data?.details ?? null,
      },
      referral: rawMessage.referral ?? null,
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
    referral: rawMessage.referral ?? null,
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
        metadataJson.context = message.context ?? null;
        const textoExtraido =
          message.text?.body ??
          message.interactive?.button_reply?.id ??
          message.interactive?.button_reply?.title ??
          message.interactive?.list_reply?.id ??
          message.interactive?.list_reply?.title ??
          message.button?.payload ??
          message.button?.text ??
          null;
          
        results.push({
          phoneNumberId,
          displayPhoneNumber,
          from: message.from ?? "",
          waId,
          profileName,
          messageId: message.id ?? "",
          timestamp: message.timestamp ?? null,
          type,
          text: textoExtraido,
          tipoMensagem,
          conteudo,
          referral: message.referral ?? null,
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
          pricingType: statusItem.pricing?.type ?? null,
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

export type ExtractedCoexistenceEcho = {
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  to: string;
  messageId: string;
  timestamp: string | null;
  type: string;
  tipoMensagem: string;
  conteudo: string;
  metadataJson: NormalizedMessageMetadata;
  rawMessage: WhatsAppIncomingRawMessage;
};

export type ExtractedCoexistenceHistoryMessage = {
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  contactPhone: string;
  direction: "inbound" | "outbound";
  messageId: string;
  timestamp: string | null;
  type: string;
  tipoMensagem: string;
  conteudo: string;
  status: string | null;
  phase: number | null;
  chunkOrder: number | null;
  progress: number | null;
  threadId: string | null;
  threadContext: Record<string, unknown> | null;
  metadataJson: NormalizedMessageMetadata;
  rawMessage: WhatsAppIncomingRawMessage;
};

export type ExtractedCoexistenceHistoryState = {
  phoneNumberId: string;
  phase: number | null;
  chunkOrder: number | null;
  progress: number | null;
  errorCode: number | null;
  errorMessage: string | null;
};

export type ExtractedCoexistenceContact = {
  phoneNumberId: string;
  phone: string;
  fullName: string | null;
  firstName: string | null;
  action: "add" | "remove";
  timestamp: string | null;
};

export type ExtractedWhatsAppAccountUpdate = {
  wabaId: string;
  event: string;
  reason: string | null;
  initiatedBy: string | null;
};

function normalizePhoneForComparison(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

export function extractCoexistenceMessageEchoes(
  body: WhatsAppWebhookBody
): ExtractedCoexistenceEcho[] {
  const results: ExtractedCoexistenceEcho[] = [];

  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      if (change?.field !== "smb_message_echoes") continue;

      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id || "";
      const displayPhoneNumber =
        value?.metadata?.display_phone_number || null;

      for (const message of value?.message_echoes || []) {
        const to = String(message.to || "").trim();
        const messageId = String(message.id || "").trim();
        if (!phoneNumberId || !to || !messageId) continue;

        const type = message.type || "unknown";
        const tipoMensagem = mapWhatsAppTypeToInternalType(type);
        const metadataJson = buildMetadataJson(message);
        metadataJson.context = message.context ?? null;

        results.push({
          phoneNumberId,
          displayPhoneNumber,
          to,
          messageId,
          timestamp: message.timestamp || null,
          type,
          tipoMensagem,
          conteudo: buildConteudo(message, tipoMensagem),
          metadataJson,
          rawMessage: message,
        });
      }
    }
  }

  return results;
}

export function extractCoexistenceHistoryMessages(
  body: WhatsAppWebhookBody
): ExtractedCoexistenceHistoryMessage[] {
  const results: ExtractedCoexistenceHistoryMessage[] = [];

  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      if (change?.field !== "history") continue;

      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id || "";
      const displayPhoneNumber =
        value?.metadata?.display_phone_number || null;
      const businessPhone = normalizePhoneForComparison(displayPhoneNumber);

      for (const historyItem of value?.history || []) {
        const phase = Number.isFinite(Number(historyItem.metadata?.phase))
          ? Number(historyItem.metadata?.phase)
          : null;
        const chunkOrder = Number.isFinite(
          Number(historyItem.metadata?.chunk_order)
        )
          ? Number(historyItem.metadata?.chunk_order)
          : null;
        const progress = Number.isFinite(
          Number(historyItem.metadata?.progress)
        )
          ? Number(historyItem.metadata?.progress)
          : null;

        for (const thread of historyItem.threads || []) {
          const threadId = String(thread.id || "").trim() || null;

          for (const message of thread.messages || []) {
            const messageId = String(message.id || "").trim();
            if (!phoneNumberId || !messageId) continue;

            const from = normalizePhoneForComparison(message.from);
            const hasExplicitRecipient =
              normalizePhoneForComparison(message.to).length > 0;
            const direction =
              hasExplicitRecipient ||
              (!!businessPhone && from === businessPhone)
                ? "outbound"
                : "inbound";
            const contactPhone = normalizePhoneForComparison(
              direction === "outbound"
                ? message.to || threadId
                : message.from || threadId
            );

            if (!contactPhone) continue;

            const type = message.type || "unknown";
            const tipoMensagem = mapWhatsAppTypeToInternalType(type);
            const metadataJson = buildMetadataJson(message);
            metadataJson.context = message.context ?? null;

            results.push({
              phoneNumberId,
              displayPhoneNumber,
              contactPhone,
              direction,
              messageId,
              timestamp: message.timestamp || null,
              type,
              tipoMensagem,
              conteudo: buildConteudo(message, tipoMensagem),
              status: message.history_context?.status || null,
              phase,
              chunkOrder,
              progress,
              threadId,
              threadContext:
                thread.context &&
                typeof thread.context === "object"
                  ? thread.context
                  : null,
              metadataJson,
              rawMessage: message,
            });
          }
        }
      }
    }
  }

  return results;
}

export function extractCoexistenceHistoryStates(
  body: WhatsAppWebhookBody
): ExtractedCoexistenceHistoryState[] {
  const results: ExtractedCoexistenceHistoryState[] = [];

  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      if (change?.field !== "history") continue;

      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id || "";

      for (const historyItem of value?.history || []) {
        const error = historyItem.errors?.[0];
        results.push({
          phoneNumberId,
          phase: Number.isFinite(Number(historyItem.metadata?.phase))
            ? Number(historyItem.metadata?.phase)
            : null,
          chunkOrder: Number.isFinite(
            Number(historyItem.metadata?.chunk_order)
          )
            ? Number(historyItem.metadata?.chunk_order)
            : null,
          progress: Number.isFinite(
            Number(historyItem.metadata?.progress)
          )
            ? Number(historyItem.metadata?.progress)
            : null,
          errorCode: Number.isFinite(Number(error?.code))
            ? Number(error?.code)
            : null,
          errorMessage:
            error?.error_data?.details ||
            error?.message ||
            error?.title ||
            null,
        });
      }
    }
  }

  return results;
}

export function extractCoexistenceContacts(
  body: WhatsAppWebhookBody
): ExtractedCoexistenceContact[] {
  const results: ExtractedCoexistenceContact[] = [];

  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      if (change?.field !== "smb_app_state_sync") continue;

      const phoneNumberId =
        change.value?.metadata?.phone_number_id || "";

      for (const state of change.value?.state_sync || []) {
        const phone = normalizePhoneForComparison(
          state.contact?.phone_number
        );
        const action = state.action;

        if (
          !phoneNumberId ||
          !phone ||
          (action !== "add" && action !== "remove")
        ) {
          continue;
        }

        results.push({
          phoneNumberId,
          phone,
          fullName:
            String(state.contact?.full_name || "").trim() || null,
          firstName:
            String(state.contact?.first_name || "").trim() || null,
          action,
          timestamp:
            String(state.metadata?.timestamp || "").trim() || null,
        });
      }
    }
  }

  return results;
}

export function extractWhatsAppAccountUpdates(
  body: WhatsAppWebhookBody
): ExtractedWhatsAppAccountUpdate[] {
  const results: ExtractedWhatsAppAccountUpdate[] = [];

  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      if (change?.field !== "account_update") continue;

      const event = String(change.value?.event || "").trim();
      const wabaId = String(
        change.value?.waba_info?.waba_id || entry.id || ""
      ).trim();

      if (!event || !wabaId) continue;

      results.push({
        wabaId,
        event,
        reason:
          String(
            change.value?.disconnection_info?.reason || ""
          ).trim() || null,
        initiatedBy:
          String(
            change.value?.disconnection_info?.initiated_by || ""
          ).trim() || null,
      });
    }
  }

  return results;
}

export function countCoexistenceWebhookItems(body: WhatsAppWebhookBody) {
  let messageEchoes = 0;
  let historyMessages = 0;
  let historyStates = 0;
  let contacts = 0;
  let accountUpdates = 0;

  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      if (change.field === "smb_message_echoes") {
        messageEchoes += change.value?.message_echoes?.length || 0;
      } else if (change.field === "history") {
        const history = change.value?.history || [];
        historyStates += history.length;

        for (const historyItem of history) {
          for (const thread of historyItem.threads || []) {
            historyMessages += thread.messages?.length || 0;
          }
        }
      } else if (change.field === "smb_app_state_sync") {
        contacts += change.value?.state_sync?.length || 0;
      } else if (
        change.field === "account_update" &&
        change.value?.event
      ) {
        accountUpdates += 1;
      }
    }
  }

  return {
    messageEchoes,
    historyMessages,
    historyStates,
    contacts,
    accountUpdates,
    total:
      messageEchoes +
      historyMessages +
      historyStates +
      contacts +
      accountUpdates,
  };
}
