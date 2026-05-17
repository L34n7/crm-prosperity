export async function baixarMidiaWhatsapp(params: {
  mediaId: string;
  accessToken: string;
}) {
  const resInfo = await fetch(
    `https://graph.facebook.com/v22.0/${params.mediaId}`,
    {
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
      },
    }
  );

  const info = await resInfo.json();

  if (!resInfo.ok || !info.url) {
    throw new Error("Erro ao obter URL da mídia do WhatsApp.");
  }

  const resArquivo = await fetch(info.url, {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
  });

  if (!resArquivo.ok) {
    throw new Error("Erro ao baixar arquivo do WhatsApp.");
  }

  const arrayBuffer = await resArquivo.arrayBuffer();

  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: info.mime_type || null,
    sha256: info.sha256 || null,
    fileSize: info.file_size || null,
  };
}