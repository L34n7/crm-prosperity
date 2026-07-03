import { decryptText, encryptText } from "@/lib/security/crypto";

type IntegrationWithToken = {
  config_json?: Record<string, unknown> | null;
  token_ref?: string | null;
};

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function encryptWhatsAppAccessToken(accessToken: string) {
  return encryptText(accessToken.trim());
}

export function getWhatsAppAccessToken(
  integration: IntegrationWithToken,
  options: { allowGlobalFallback?: boolean } = {}
) {
  const config = objectValue(integration.config_json);
  const encryptedToken = stringValue(config.access_token_encrypted);

  if (encryptedToken) {
    try {
      return decryptText(encryptedToken).trim();
    } catch (error) {
      console.error(
        "[WHATSAPP TOKEN] Nao foi possivel descriptografar o token da integracao:",
        error
      );
    }
  }

  // Compatibilidade com integracoes criadas antes da criptografia do token.
  const legacyToken =
    stringValue(config.access_token) ||
    stringValue(config.accessToken) ||
    stringValue(config.token) ||
    stringValue(config.meta_access_token) ||
    stringValue(config.long_lived_token) ||
    stringValue(objectValue(config.meta_token_response).access_token);

  if (legacyToken) {
    return legacyToken;
  }

  const tokenRef = stringValue(integration.token_ref);
  if (tokenRef && !tokenRef.startsWith("config_json.")) {
    const environmentToken = stringValue(process.env[tokenRef]);
    if (environmentToken) return environmentToken;
  }

  if (options.allowGlobalFallback !== false) {
    return stringValue(process.env.WHATSAPP_ACCESS_TOKEN);
  }

  return "";
}

export function hasWhatsAppAccessToken(
  integration: IntegrationWithToken
) {
  return !!getWhatsAppAccessToken(integration, {
    allowGlobalFallback: false,
  });
}

function sanitizeConfigJson(configValue: unknown) {
  const config = objectValue(configValue);
  const sanitized = { ...config };

  delete sanitized.access_token;
  delete sanitized.access_token_encrypted;
  delete sanitized.accessToken;
  delete sanitized.token;
  delete sanitized.meta_access_token;
  delete sanitized.long_lived_token;

  if (sanitized.meta_token_response) {
    const metaTokenResponse = {
      ...objectValue(sanitized.meta_token_response),
    };
    delete metaTokenResponse.access_token;
    sanitized.meta_token_response = metaTokenResponse;
  }

  return sanitized;
}

export function sanitizeWhatsAppIntegrationForClient<
  T extends Record<string, unknown>,
>(integration: T) {
  return {
    ...integration,
    config_json: sanitizeConfigJson(integration.config_json),
    tem_token: hasWhatsAppAccessToken(integration),
  };
}
