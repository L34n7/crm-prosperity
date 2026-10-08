import type { WhatsAppIntegrationMode } from "@/lib/whatsapp/integration-mode";

export const WHATSAPP_EMBEDDED_SIGNUP_LAUNCHER_VERSION =
  "v4-config-driven" as const;

export type WhatsAppEmbeddedSignupData = {
  waba_id: string | null;
  phone_number_id: string | null;
  business_portfolio_id: string | null;
  event: string;
  session_version: string | null;
  launcher_version: typeof WHATSAPP_EMBEDDED_SIGNUP_LAUNCHER_VERSION;
  raw: unknown;
};

type EmbeddedSignupV4Options = {
  config_id: string;
  auth_type: "rerequest";
  response_type: "code";
  override_default_response_type: true;
  extras: {
    setup: Record<string, never>;
    featureType?: "whatsapp_business_app_onboarding";
  };
};

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function buildWhatsAppEmbeddedSignupV4Options(params: {
  configId: string;
  modoIntegracao: WhatsAppIntegrationMode;
}): EmbeddedSignupV4Options {
  const configId = String(params.configId || "").trim();

  if (!configId) {
    throw new Error(
      "NEXT_PUBLIC_META_CONFIG_ID não configurado para o Embedded Signup v4."
    );
  }

  return {
    config_id: configId,
    auth_type: "rerequest",
    response_type: "code",
    override_default_response_type: true,
    extras:
      params.modoIntegracao === "coexistence"
        ? {
            setup: {},
            featureType: "whatsapp_business_app_onboarding",
          }
        : {
            setup: {},
          },
  };
}

export function isWhatsAppEmbeddedSignupFinishEvent(value: unknown) {
  const event = textValue(value);

  return (
    event === "FINISH" ||
    event === "FINISH_ONLY_WABA" ||
    event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"
  );
}

export function normalizeWhatsAppEmbeddedSignupEvent(
  value: unknown
): WhatsAppEmbeddedSignupData | null {
  const root = recordValue(value);

  if (textValue(root.type) !== "WA_EMBEDDED_SIGNUP") {
    return null;
  }

  const event = textValue(root.event);
  const data = recordValue(root.data);

  if (!event) return null;

  return {
    waba_id:
      textValue(data.waba_id) ||
      textValue(data.whatsapp_business_account_id) ||
      null,
    phone_number_id:
      textValue(data.phone_number_id) ||
      textValue(data.business_phone_number_id) ||
      null,
    business_portfolio_id:
      textValue(data.business_id) ||
      textValue(data.businessId) ||
      textValue(data.business_portfolio_id) ||
      null,
    event,
    session_version: textValue(root.version) || null,
    launcher_version: WHATSAPP_EMBEDDED_SIGNUP_LAUNCHER_VERSION,
    raw: value,
  };
}
