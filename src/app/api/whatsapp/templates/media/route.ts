import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { getWhatsAppAccessToken } from "@/lib/whatsapp/access-token";
import { getWhatsAppGraphUrl } from "@/lib/whatsapp/graph-api";
import { usuarioPodeAcessarIntegracaoWhatsapp } from "@/lib/whatsapp/integracoes-multiplas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITE_IMAGEM_TEMPLATE_BYTES = 5 * 1024 * 1024;
const MIME_IMAGENS_TEMPLATE = new Set(["image/jpeg", "image/png"]);

function normalizarMimeImagem(file: File) {
  const mime = String(file.type || "").trim().toLowerCase();

  if (mime === "image/jpg") {
    return "image/jpeg";
  }

  if (MIME_IMAGENS_TEMPLATE.has(mime)) {
    return mime;
  }

  const nome = String(file.name || "").toLowerCase();

  if (nome.endsWith(".jpg") || nome.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (nome.endsWith(".png")) {
    return "image/png";
  }

  return "";
}

function extrairErroMeta(raw: unknown, fallback: string) {
  if (!raw || typeof raw !== "object") return fallback;

  const error = "error" in raw
    ? (raw as { error?: { error_user_msg?: string; message?: string } }).error
    : null;

  return (
    String(error?.error_user_msg || "").trim() ||
    String(error?.message || "").trim() ||
    fallback
  );
}

export async function POST(request: NextRequest) {
  try {
    const contexto = await getUsuarioContexto();

    if (!contexto.ok) {
      return NextResponse.json(
        { ok: false, error: contexto.error },
        { status: contexto.status }
      );
    }

    const bloqueio = bloquearSemPermissao(
      contexto.usuario,
      "whatsapp_templates.criar",
      "Você não tem permissão para enviar mídia de template."
    );

    if (bloqueio) return bloqueio;

    if (!contexto.usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const integracaoWhatsappId = String(
      formData.get("integracao_whatsapp_id") || ""
    ).trim();
    const file = formData.get("file");

    if (!integracaoWhatsappId) {
      return NextResponse.json(
        { ok: false, error: "Integração WhatsApp é obrigatória." },
        { status: 400 }
      );
    }

    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json(
        { ok: false, error: "Selecione uma imagem válida." },
        { status: 400 }
      );
    }

    const mimeType = normalizarMimeImagem(file);

    if (!mimeType) {
      return NextResponse.json(
        {
          ok: false,
          error: "Formato inválido. A Meta aceita JPG/JPEG ou PNG para este cabeçalho.",
        },
        { status: 400 }
      );
    }

    if (file.size > LIMITE_IMAGEM_TEMPLATE_BYTES) {
      return NextResponse.json(
        { ok: false, error: "A imagem do template deve ter no máximo 5 MB." },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const podeUsarIntegracao = await usuarioPodeAcessarIntegracaoWhatsapp({
      usuario: contexto.usuario,
      empresaId: contexto.usuario.empresa_id,
      integracaoId: integracaoWhatsappId,
    });

    if (!podeUsarIntegracao) {
      return NextResponse.json(
        { ok: false, error: "Sem acesso a esta integração WhatsApp." },
        { status: 403 }
      );
    }

    const { data: integracao, error: integracaoError } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .select("id, empresa_id, status, token_ref, config_json")
      .eq("id", integracaoWhatsappId)
      .eq("empresa_id", contexto.usuario.empresa_id)
      .maybeSingle();

    if (integracaoError || !integracao) {
      return NextResponse.json(
        { ok: false, error: "Integração WhatsApp não encontrada." },
        { status: 404 }
      );
    }

    if (String(integracao.status || "").toLowerCase() !== "ativa") {
      return NextResponse.json(
        { ok: false, error: "A integração WhatsApp não está ativa." },
        { status: 400 }
      );
    }

    const accessToken = getWhatsAppAccessToken(integracao);
    const appId = String(process.env.META_APP_ID || "").trim();

    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: "Token da integração WhatsApp não disponível." },
        { status: 500 }
      );
    }

    if (!appId) {
      return NextResponse.json(
        { ok: false, error: "META_APP_ID não configurado no servidor." },
        { status: 500 }
      );
    }

    const sessionUrl = new URL(getWhatsAppGraphUrl(`${appId}/uploads`));
    sessionUrl.searchParams.set("file_length", String(file.size));
    sessionUrl.searchParams.set("file_type", mimeType);
    sessionUrl.searchParams.set("file_name", file.name || "template-header");

    const sessionResponse = await fetch(sessionUrl.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });
    const sessionRaw = await sessionResponse.json().catch(() => null);
    const uploadId =
      sessionRaw &&
      typeof sessionRaw === "object" &&
      "id" in sessionRaw
        ? String((sessionRaw as { id?: unknown }).id || "").trim()
        : "";

    if (!sessionResponse.ok || !uploadId) {
      return NextResponse.json(
        {
          ok: false,
          error: extrairErroMeta(
            sessionRaw,
            "A Meta não conseguiu iniciar o upload da imagem do template."
          ),
          meta: sessionRaw,
        },
        { status: sessionResponse.status || 400 }
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const uploadResponse = await fetch(getWhatsAppGraphUrl(uploadId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": mimeType,
        file_offset: "0",
      },
      body: fileBuffer,
      cache: "no-store",
    });
    const uploadRaw = await uploadResponse.json().catch(() => null);
    const handle =
      uploadRaw &&
      typeof uploadRaw === "object" &&
      "h" in uploadRaw
        ? String((uploadRaw as { h?: unknown }).h || "").trim()
        : "";

    if (!uploadResponse.ok || !handle) {
      return NextResponse.json(
        {
          ok: false,
          error: extrairErroMeta(
            uploadRaw,
            "A Meta não conseguiu concluir o upload da imagem do template."
          ),
          meta: uploadRaw,
        },
        { status: uploadResponse.status || 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      handle,
      arquivo: {
        nome: file.name,
        mime_type: mimeType,
        tamanho_bytes: file.size,
      },
    });
  } catch (error) {
    console.error("[TEMPLATE WHATSAPP MEDIA] Erro:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao enviar imagem do template.",
      },
      { status: 500 }
    );
  }
}
