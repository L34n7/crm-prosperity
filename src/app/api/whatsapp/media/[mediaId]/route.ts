import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getWhatsAppAccessToken } from "@/lib/whatsapp/access-token";

export const runtime = "nodejs";

const supabaseAdmin = getSupabaseAdmin();

type MetaMediaInfoResponse = {
  url?: string;
  mime_type?: string;
  sha256?: string;
  file_size?: number;
  id?: string;
  messaging_product?: string;
};

type IntegracaoWhatsapp = {
  id: string;
  status: string | null;
  token_ref?: string | null;
  config_json: {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
  } | null;
};

function getFileExtensionFromMimeType(mimeType?: string | null) {
  if (!mimeType) return "";

  const normalized = mimeType.toLowerCase();

  if (normalized.includes("image/jpeg")) return ".jpg";
  if (normalized.includes("image/png")) return ".png";
  if (normalized.includes("image/webp")) return ".webp";
  if (normalized.includes("audio/ogg")) return ".ogg";
  if (normalized.includes("audio/mpeg")) return ".mp3";
  if (normalized.includes("audio/mp4")) return ".m4a";
  if (normalized.includes("video/mp4")) return ".mp4";
  if (normalized.includes("application/pdf")) return ".pdf";

  return "";
}

function buildSafeFilename(mediaId: string, mimeType?: string | null) {
  const ext = getFileExtensionFromMimeType(mimeType);
  return `whatsapp-media-${mediaId}${ext}`;
}

async function buscarAccessTokenDaMidia(mediaId: string) {
  const { data: mensagem, error: mensagemError } = await supabaseAdmin
    .from("mensagens")
    .select("id, conversa_id, metadata_json")
    .filter("metadata_json->>media_id", "eq", mediaId)
    .maybeSingle();

  if (mensagemError) {
    throw new Error(mensagemError.message);
  }

  if (!mensagem?.conversa_id) {
    return process.env.WHATSAPP_ACCESS_TOKEN || "";
  }

  const { data: conversa, error: conversaError } = await supabaseAdmin
    .from("conversas")
    .select("id, integracao_whatsapp_id")
    .eq("id", mensagem.conversa_id)
    .maybeSingle();

  if (conversaError) {
    throw new Error(conversaError.message);
  }

  if (!conversa?.integracao_whatsapp_id) {
    return process.env.WHATSAPP_ACCESS_TOKEN || "";
  }

  const { data: integracao, error: integracaoError } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select("id, status, token_ref, config_json")
    .eq("id", conversa.integracao_whatsapp_id)
    .maybeSingle();

  if (integracaoError) {
    throw new Error(integracaoError.message);
  }

  return getWhatsAppAccessToken(
    integracao as IntegracaoWhatsapp
  );
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ mediaId: string }> }
) {
  try {
    const { mediaId } = await context.params;

    if (!mediaId) {
      return NextResponse.json(
        { ok: false, error: "mediaId é obrigatório" },
        { status: 400 }
      );
    }

    const accessToken = await buscarAccessTokenDaMidia(mediaId);
    const apiVersion = process.env.WHATSAPP_API_VERSION || "v23.0";

    if (!accessToken) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Token do WhatsApp não encontrado na integração nem nas variáveis de ambiente",
        },
        { status: 500 }
      );
    }

    const mediaInfoUrl = `https://graph.facebook.com/${apiVersion}/${mediaId}`;

    const mediaInfoResponse = await fetch(mediaInfoUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    if (!mediaInfoResponse.ok) {
      const errorText = await mediaInfoResponse.text();

      return NextResponse.json(
        {
          ok: false,
          error: "Erro ao buscar metadados da mídia na Meta",
          status_meta: mediaInfoResponse.status,
          detalhe: errorText,
        },
        { status: mediaInfoResponse.status }
      );
    }

    const mediaInfo = (await mediaInfoResponse.json()) as MetaMediaInfoResponse;

    if (!mediaInfo.url) {
      return NextResponse.json(
        {
          ok: false,
          error: "A Meta não retornou a URL de download da mídia",
        },
        { status: 502 }
      );
    }

    const rangeHeader = req.headers.get("range");

    const mediaDownloadResponse = await fetch(mediaInfo.url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(rangeHeader ? { Range: rangeHeader } : {}),
      },
      cache: "no-store",
    });

    if (!mediaDownloadResponse.ok) {
      const errorText = await mediaDownloadResponse.text();

      return NextResponse.json(
        {
          ok: false,
          error: "Erro ao baixar mídia da Meta",
          status_meta: mediaDownloadResponse.status,
          detalhe: errorText,
        },
        { status: mediaDownloadResponse.status }
      );
    }

    const contentType =
      mediaDownloadResponse.headers.get("content-type") ||
      mediaInfo.mime_type ||
      "application/octet-stream";

    const contentLength = mediaDownloadResponse.headers.get("content-length");
    const contentRange = mediaDownloadResponse.headers.get("content-range");
    const filename = buildSafeFilename(mediaId, contentType);

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", contentType);
    responseHeaders.set("Content-Disposition", `inline; filename="${filename}"`);
    responseHeaders.set("Cache-Control", "private, no-store, max-age=0");
    responseHeaders.set("Accept-Ranges", "bytes");

    if (contentLength) {
      responseHeaders.set("Content-Length", contentLength);
    }

    if (contentRange) {
      responseHeaders.set("Content-Range", contentRange);
    }

    return new NextResponse(mediaDownloadResponse.body, {
      status: mediaDownloadResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("[WHATSAPP MEDIA] Erro interno:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao processar mídia do WhatsApp",
      },
      { status: 500 }
    );
  }
}
