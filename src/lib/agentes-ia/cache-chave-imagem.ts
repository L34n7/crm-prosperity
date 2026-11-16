// A chave isola cada empresa no banco. O SHA-256 do webhook identifica
// conteúdo idêntico, mesmo quando o WhatsApp cria outra mensagem/media_id.
export function chaveCacheInterpretacaoImagem(params: {
  mensagemId: string;
  metadataJson: unknown;
}): string {
  const metadata = params.metadataJson && typeof params.metadataJson === "object"
    && !Array.isArray(params.metadataJson)
      ? params.metadataJson as Record<string, unknown>
      : {};
  const image = metadata.image && typeof metadata.image === "object"
    && !Array.isArray(metadata.image)
      ? metadata.image as Record<string, unknown>
      : {};
  const hash = typeof metadata.sha256 === "string"
    ? metadata.sha256.trim()
    : typeof image.sha256 === "string" ? image.sha256.trim() : "";
  return /^[A-Za-z0-9+/]{43}=$/.test(hash)
    ? "v2:sha256:" + hash
    : "v2:mensagem:" + params.mensagemId;
}
