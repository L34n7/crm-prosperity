import { getWhatsAppGraphUrl } from "@/lib/whatsapp/graph-api";

export async function baixarAudioWhatsApp(
  mediaId: string,
  integrationAccessToken?: string | null
) {
  const accessToken =
    integrationAccessToken?.trim() ||
    process.env.WHATSAPP_ACCESS_TOKEN ||
    "";

  if (!accessToken) {
    throw new Error("WHATSAPP_ACCESS_TOKEN não configurado.");
  }

  const mediaRes = await fetch(
    getWhatsAppGraphUrl(mediaId),
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const mediaJson = await mediaRes.json();

  if (!mediaRes.ok || !mediaJson?.url) {
    throw new Error(
      mediaJson?.error?.message || "Erro ao buscar URL do áudio no WhatsApp."
    );
  }

  const audioRes = await fetch(mediaJson.url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!audioRes.ok) {
    throw new Error("Erro ao baixar áudio do WhatsApp.");
  }

  const arrayBuffer = await audioRes.arrayBuffer();

  return Buffer.from(arrayBuffer);
}
