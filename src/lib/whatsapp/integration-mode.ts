export const WHATSAPP_INTEGRATION_MODES = [
  "cloud_api",
  "coexistence",
] as const;

export type WhatsAppIntegrationMode =
  (typeof WHATSAPP_INTEGRATION_MODES)[number];

export function normalizeWhatsAppIntegrationMode(
  value: unknown
): WhatsAppIntegrationMode {
  return value === "coexistence" ? "coexistence" : "cloud_api";
}

export function isWhatsAppIntegrationMode(value: unknown) {
  return WHATSAPP_INTEGRATION_MODES.includes(
    value as WhatsAppIntegrationMode
  );
}

export function isCoexistencePhoneReady(integration: {
  modo_integracao?: string | null;
  is_on_biz_app?: boolean | null;
  platform_type?: string | null;
  coex_status?: string | null;
}) {
  if (
    normalizeWhatsAppIntegrationMode(integration.modo_integracao) !==
    "coexistence"
  ) {
    return false;
  }

  return (
    integration.is_on_biz_app === true &&
    String(integration.platform_type || "").toUpperCase() === "CLOUD_API" &&
    String(integration.coex_status || "") === "ativo"
  );
}
