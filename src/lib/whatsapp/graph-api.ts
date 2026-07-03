export function getWhatsAppGraphVersion() {
  const configured = String(
    process.env.WHATSAPP_API_VERSION || "v25.0"
  ).trim();

  return configured.startsWith("v") ? configured : `v${configured}`;
}

export function getWhatsAppGraphUrl(path: string) {
  const normalizedPath = String(path || "").replace(/^\/+/, "");
  return `https://graph.facebook.com/${getWhatsAppGraphVersion()}/${normalizedPath}`;
}

