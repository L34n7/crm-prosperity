import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

function extensaoPorMime(mimeType?: string | null) {
  const mime = String(mimeType || "").toLowerCase();

  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";

  return "bin";
}

export async function salvarArquivoAnaliseStorage(params: {
  empresaId: string;
  execucaoId: string;
  noId: string;
  mediaId: string;
  buffer: Buffer;
  mimeType?: string | null;
}) {
  const { empresaId, execucaoId, noId, mediaId, buffer, mimeType } = params;

  const ext = extensaoPorMime(mimeType);

  const storagePath = `${empresaId}/${execucaoId}/${noId}/${mediaId}.${ext}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from("automacao-arquivos-ia")
    .upload(storagePath, buffer, {
      contentType: mimeType || "application/octet-stream",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Erro ao salvar arquivo no Storage: ${uploadError.message}`);
  }

  const { data, error: signedUrlError } = await supabaseAdmin.storage
    .from("automacao-arquivos-ia")
    .createSignedUrl(storagePath, 60 * 15);

  if (signedUrlError || !data?.signedUrl) {
    throw new Error(
      signedUrlError?.message || "Erro ao gerar URL assinada do arquivo."
    );
  }

  return {
    storagePath,
    signedUrl: data.signedUrl,
  };
}