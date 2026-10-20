
import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

const BUCKET = "white-label-branding";
const LOGO_MAX_BYTES = 3 * 1024 * 1024;
const FAVICON_MAX_BYTES = 512 * 1024;

export type WhiteLabelAssetTipo = "logo" | "favicon";

const MIME_EXTENSAO: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
};

function tiposPermitidos(tipo: WhiteLabelAssetTipo) {
  if (tipo === "logo") {
    return new Set(["image/png", "image/jpeg", "image/webp"]);
  }

  return new Set([
    "image/png",
    "image/webp",
    "image/x-icon",
    "image/vnd.microsoft.icon",
  ]);
}

function limiteBytes(tipo: WhiteLabelAssetTipo) {
  return tipo === "logo" ? LOGO_MAX_BYTES : FAVICON_MAX_BYTES;
}

export function validarWhiteLabelAsset(
  arquivo: File | null | undefined,
  tipo: WhiteLabelAssetTipo
) {
  if (!arquivo || arquivo.size === 0) return;

  const mime = String(arquivo.type || "").toLowerCase();
  const permitidos = tiposPermitidos(tipo);

  if (!permitidos.has(mime) || !MIME_EXTENSAO[mime]) {
    throw new Error(
      tipo === "logo"
        ? "Logo inválida. Envie PNG, JPG ou WEBP."
        : "Favicon inválido. Envie PNG, WEBP ou ICO."
    );
  }

  if (arquivo.size > limiteBytes(tipo)) {
    throw new Error(
      tipo === "logo"
        ? "A logo deve ter no máximo 3 MB."
        : "O favicon deve ter no máximo 512 KB."
    );
  }
}

export async function enviarWhiteLabelAsset(params: {
  whiteLabelId: string;
  arquivo: File;
  tipo: WhiteLabelAssetTipo;
}) {
  validarWhiteLabelAsset(params.arquivo, params.tipo);

  const supabaseAdmin = getSupabaseAdmin();
  const mime = params.arquivo.type.toLowerCase();
  const extensao = MIME_EXTENSAO[mime];
  const nome =
    params.tipo +
    "-" +
    Date.now() +
    "-" +
    crypto.randomUUID() +
    "." +
    extensao;
  const caminho = params.whiteLabelId + "/" + nome;
  const bytes = Buffer.from(await params.arquivo.arrayBuffer());

  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(caminho, bytes, {
    contentType: mime,
    cacheControl: "3600",
    upsert: false,
  });

  if (error) {
    throw new Error("Não foi possível enviar o arquivo de branding: " + error.message);
  }

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(caminho);

  if (!data.publicUrl) {
    await supabaseAdmin.storage.from(BUCKET).remove([caminho]).catch(() => null);
    throw new Error("Não foi possível gerar a URL pública do arquivo.");
  }

  return {
    url: data.publicUrl,
    caminho,
  };
}

export function extrairCaminhoWhiteLabelAsset(url: string | null | undefined) {
  const valor = String(url || "").trim();
  if (!valor) return null;

  const marcador = "/storage/v1/object/public/" + BUCKET + "/";
  const indice = valor.indexOf(marcador);

  if (indice < 0) return null;

  const caminho = valor.slice(indice + marcador.length).split("?")[0];
  if (!caminho) return null;

  try {
    return decodeURIComponent(caminho);
  } catch {
    return caminho;
  }
}

export async function removerWhiteLabelAssetPorUrl(
  url: string | null | undefined
) {
  const caminho = extrairCaminhoWhiteLabelAsset(url);
  if (!caminho) return;

  const supabaseAdmin = getSupabaseAdmin();
  await supabaseAdmin.storage.from(BUCKET).remove([caminho]).catch(() => null);
}

export async function removerWhiteLabelAssetsPorCaminhos(caminhos: string[]) {
  const validos = caminhos.filter(Boolean);
  if (!validos.length) return;

  const supabaseAdmin = getSupabaseAdmin();
  await supabaseAdmin.storage.from(BUCKET).remove(validos).catch(() => null);
}
