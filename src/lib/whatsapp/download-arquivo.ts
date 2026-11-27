export async function baixarMidiaWhatsapp(params: {
  mediaId: string;
  accessToken: string;
  maxBytes?: number;
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

  const maxBytes = Number(params.maxBytes || 0);
  if (maxBytes > 0 && Number(info.file_size || 0) > maxBytes) {
    throw new Error("Arquivo excede o limite permitido para análise.");
  }

  const resArquivo = await fetch(info.url, {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
  });

  if (!resArquivo.ok) {
    throw new Error("Erro ao baixar arquivo do WhatsApp.");
  }

  // Limite também durante o streaming: um Content-Length ausente não pode
  // causar consumo excessivo de memória do worker.
  let buffer: Buffer;
  if (maxBytes > 0 && resArquivo.body) {
    const reader = resArquivo.body.getReader();
    const partes: Buffer[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new Error("Arquivo excede o limite permitido para análise.");
        }
        partes.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    buffer = Buffer.concat(partes, total);
  } else {
    buffer = Buffer.from(await resArquivo.arrayBuffer());
  }
  return {
    buffer,
    mimeType: info.mime_type || null,
    sha256: info.sha256 || null,
    fileSize: info.file_size || null,
  };
}