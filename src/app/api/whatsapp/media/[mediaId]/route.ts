import { NextRequest, NextResponse } from "next/server";

type MetaMediaInfoResponse = {
  url?: string;
  mime_type?: string;
  sha256?: string;
  file_size?: number;
  id?: string;
  messaging_product?: string;
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

    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const apiVersion = process.env.WHATSAPP_API_VERSION || "v23.0";

    if (!accessToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "WHATSAPP_ACCESS_TOKEN não definido nas variáveis de ambiente",
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
    responseHeaders.set(
      "Content-Disposition",
      `inline; filename="${filename}"`
    );
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
        error: "Erro interno ao processar mídia do WhatsApp",
      },
      { status: 500 }
    );
  }
}