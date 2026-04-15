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
  if (normalized.includes("application/msword")) return ".doc";
  if (
    normalized.includes(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
  ) {
    return ".docx";
  }
  if (normalized.includes("application/vnd.ms-excel")) return ".xls";
  if (
    normalized.includes(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
  ) {
    return ".xlsx";
  }

  return "";
}

function buildSafeFilename(mediaId: string, mimeType?: string | null) {
  const ext = getFileExtensionFromMimeType(mimeType);
  return `whatsapp-media-${mediaId}${ext}`;
}

export async function GET(
  _req: NextRequest,
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
          error:
            "WHATSAPP_ACCESS_TOKEN não definido nas variáveis de ambiente",
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

      console.error("[WHATSAPP MEDIA] Erro ao buscar metadados da mídia:", {
        status: mediaInfoResponse.status,
        body: errorText,
        mediaId,
      });

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

    const mediaInfo =
      (await mediaInfoResponse.json()) as MetaMediaInfoResponse;

    if (!mediaInfo.url) {
      return NextResponse.json(
        {
          ok: false,
          error: "A Meta não retornou a URL de download da mídia",
        },
        { status: 502 }
      );
    }

    const mediaDownloadResponse = await fetch(mediaInfo.url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    if (!mediaDownloadResponse.ok) {
      const errorText = await mediaDownloadResponse.text();

      console.error("[WHATSAPP MEDIA] Erro ao baixar mídia:", {
        status: mediaDownloadResponse.status,
        body: errorText,
        mediaId,
      });

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

    const arrayBuffer = await mediaDownloadResponse.arrayBuffer();
    const contentType =
      mediaDownloadResponse.headers.get("content-type") ||
      mediaInfo.mime_type ||
      "application/octet-stream";

    const contentLength =
      mediaDownloadResponse.headers.get("content-length") ||
      (mediaInfo.file_size ? String(mediaInfo.file_size) : null);

    const filename = buildSafeFilename(mediaId, contentType);

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        ...(contentLength ? { "Content-Length": contentLength } : {}),
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store, max-age=0",
      },
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