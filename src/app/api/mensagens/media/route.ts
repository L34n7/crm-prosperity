import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { usuarioPertenceAoSetor } from "@/lib/usuarios/setores";
import {
  getUsuarioContexto,
  type UsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";
import {
  isAdministrador,
  podeAtribuirConversas,
  podeEnviarMensagens,
} from "@/lib/auth/authorization";
import { canSendFreeformWhatsAppMessage } from "@/lib/whatsapp/can-send-message";
import { uploadWhatsAppMedia } from "@/lib/whatsapp/upload-media";
import { sendWhatsAppMediaMessage } from "@/lib/whatsapp/send-media-message";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

export const runtime = "nodejs";

const supabaseAdmin = getSupabaseAdmin();
const require = createRequire(import.meta.url);

type ConversaAcesso = {
  id: string;
  empresa_id: string;
  setor_id: string | null;
  responsavel_id: string | null;
  status?: string | null;
  contato_id?: string | null;
  integracao_whatsapp_id?: string | null;
};

async function usuarioPodeAcessarConversa(
  usuario: UsuarioContexto,
  conversa: ConversaAcesso
) {
  if (!usuario.empresa_id || conversa.empresa_id !== usuario.empresa_id) {
    return false;
  }

  if (isAdministrador(usuario)) return true;

  const podeAtribuir = await podeAtribuirConversas(usuario);

  if (podeAtribuir) {
    return await usuarioPertenceAoSetor(usuario.id, conversa.setor_id);
  }

  if (conversa.responsavel_id === usuario.id) {
    return true;
  }

  const pertenceAoSetorDaConversa = await usuarioPertenceAoSetor(
    usuario.id,
    conversa.setor_id
  );

  if (
    pertenceAoSetorDaConversa &&
    conversa.responsavel_id === null &&
    conversa.status === "fila"
  ) {
    return true;
  }

  return false;
}

function detectarTipoMensagemPorMime(mimeType: string) {
  if (mimeType.startsWith("image/")) return "imagem";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return "documento";
}

function getConteudoPadrao(tipoMensagem: string, fileName?: string | null) {
  switch (tipoMensagem) {
    case "imagem":
      return "📷 Imagem";
    case "audio":
      return "🎵 Áudio";
    case "video":
      return "🎥 Vídeo";
    case "documento":
      return fileName ? `📄 Documento: ${fileName}` : "📄 Documento";
    default:
      return "Mídia enviada";
  }
}

function normalizarCaminhoRootPlaceholder(caminho: string) {
  const cwd = process.cwd();

  if (caminho.startsWith("\\ROOT\\")) {
    return path.join(cwd, caminho.replace(/^\\ROOT\\/, ""));
  }

  if (caminho.startsWith("/ROOT/")) {
    return path.join(cwd, caminho.replace(/^\/ROOT\//, ""));
  }

  if (caminho.startsWith("ROOT\\")) {
    return path.join(cwd, caminho.replace(/^ROOT\\/, ""));
  }

  if (caminho.startsWith("ROOT/")) {
    return path.join(cwd, caminho.replace(/^ROOT\//, ""));
  }

  return caminho;
}

async function getFfmpegBinaryPath() {
  const resolved = require("ffmpeg-static");

  if (!resolved || typeof resolved !== "string") {
    throw new Error("Não foi possível localizar o binário do FFmpeg.");
  }

  const caminhoNormalizado = normalizarCaminhoRootPlaceholder(resolved);

  try {
    await fs.access(caminhoNormalizado);
    return caminhoNormalizado;
  } catch {
    throw new Error(
      `Binário do FFmpeg não encontrado no caminho: ${caminhoNormalizado}`
    );
  }
}

async function converterAudioWebmParaM4a(file: File): Promise<File> {
  const buffer = Buffer.from(await file.arrayBuffer());

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "crm-audio-"));
  const inputPath = path.join(tmpDir, "input.webm");
  const outputPath = path.join(tmpDir, "output.m4a");

  await fs.writeFile(inputPath, buffer);

  await new Promise<void>(async (resolve, reject) => {
    let ffmpegBinaryPath = "";

    try {
      ffmpegBinaryPath = await getFfmpegBinaryPath();
      console.log("[FFMPEG] Caminho resolvido:", ffmpegBinaryPath);
    } catch (error) {
      reject(error);
      return;
    }

    const ffmpeg = spawn(ffmpegBinaryPath, [
      "-i",
      inputPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "44100",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      "-f",
      "mp4",
      "-y",
      outputPath,
    ]);

    let stderr = "";

    ffmpeg.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    ffmpeg.on("error", (error) => {
      reject(error);
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Falha ao converter áudio com FFmpeg. Código: ${code}. Detalhes: ${stderr}`
        )
      );
    });
  });

  const convertidoBuffer = await fs.readFile(outputPath);
  await fs.rm(tmpDir, { recursive: true, force: true });

  return new File([convertidoBuffer], `audio-${Date.now()}.m4a`, {
    type: "audio/mp4",
  });
}

async function prepararArquivoParaUpload(file: File): Promise<File> {
  if (file.type === "audio/webm" || file.name.toLowerCase().endsWith(".webm")) {
    return await converterAudioWebmParaM4a(file);
  }

  return file;
}

export async function POST(request: Request) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!(await podeEnviarMensagens(usuario))) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para enviar mensagens" },
      { status: 403 }
    );
  }

  try {
    const formData = await request.formData();

    const conversaId = String(formData.get("conversa_id") || "");
    const legenda = String(formData.get("caption") || "");
    const file = formData.get("file");

    if (!conversaId) {
      return NextResponse.json(
        { ok: false, error: "conversa_id é obrigatório" },
        { status: 400 }
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Arquivo é obrigatório" },
        { status: 400 }
      );
    }

    const arquivoPreparado = await prepararArquivoParaUpload(file);

    console.log("[MEDIA] arquivo original:", {
      nome: file.name,
      type: file.type,
      size: file.size,
    });

    console.log("[MEDIA] arquivo preparado:", {
      nome: arquivoPreparado.name,
      type: arquivoPreparado.type,
      size: arquivoPreparado.size,
    });

    const mimeType = arquivoPreparado.type || "application/octet-stream";
    const tipoMensagem = detectarTipoMensagemPorMime(mimeType);

    const { data: conversa, error: conversaError } = await supabaseAdmin
      .from("conversas")
      .select(
        "id, empresa_id, setor_id, responsavel_id, status, contato_id, integracao_whatsapp_id"
      )
      .eq("id", conversaId)
      .maybeSingle<ConversaAcesso>();

    if (conversaError) {
      return NextResponse.json(
        { ok: false, error: conversaError.message },
        { status: 500 }
      );
    }

    if (!conversa) {
      return NextResponse.json(
        { ok: false, error: "Conversa não encontrada" },
        { status: 404 }
      );
    }

    if (!(await usuarioPodeAcessarConversa(usuario, conversa))) {
      return NextResponse.json(
        { ok: false, error: "Você não pode enviar mensagem nesta conversa" },
        { status: 403 }
      );
    }

    if (!conversa.contato_id) {
      return NextResponse.json(
        { ok: false, error: "A conversa não possui contato vinculado" },
        { status: 400 }
      );
    }

    if (!conversa.integracao_whatsapp_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "A conversa não possui integração WhatsApp vinculada",
        },
        { status: 400 }
      );
    }

    const { data: contato, error: contatoError } = await supabaseAdmin
      .from("contatos")
      .select("id, telefone")
      .eq("id", conversa.contato_id)
      .maybeSingle();

    if (contatoError) {
      return NextResponse.json(
        { ok: false, error: contatoError.message },
        { status: 500 }
      );
    }

    if (!contato?.telefone) {
      return NextResponse.json(
        { ok: false, error: "Contato sem telefone válido" },
        { status: 400 }
      );
    }

    const { data: integracao, error: integracaoError } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .select("id, status, phone_number_id")
      .eq("id", conversa.integracao_whatsapp_id)
      .maybeSingle();

    if (integracaoError) {
      return NextResponse.json(
        { ok: false, error: integracaoError.message },
        { status: 500 }
      );
    }

    if (!integracao) {
      return NextResponse.json(
        { ok: false, error: "Integração WhatsApp não encontrada" },
        { status: 404 }
      );
    }

    if (integracao.status !== "ativa") {
      return NextResponse.json(
        { ok: false, error: "A integração WhatsApp está inativa" },
        { status: 400 }
      );
    }

    const janela24h = await canSendFreeformWhatsAppMessage({
      conversaId,
    });

    if (!janela24h.podeEnviarMensagemLivre) {
      return NextResponse.json(
        {
          ok: false,
          error: janela24h.motivoBloqueio,
          janela_24h: janela24h,
        },
        { status: 400 }
      );
    }

    const phoneNumberId =
      integracao.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || "";

    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || "";

    if (!phoneNumberId || !accessToken) {
      return NextResponse.json(
        { ok: false, error: "Configuração do WhatsApp incompleta" },
        { status: 500 }
      );
    }

    const uploadResult = await uploadWhatsAppMedia({
      phoneNumberId,
      accessToken,
      file: arquivoPreparado,
    });

    if (!uploadResult.ok || !uploadResult.mediaId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Falha ao subir mídia para o WhatsApp",
          detalhes: uploadResult.error,
          retorno_meta: uploadResult.raw,
        },
        { status: 502 }
      );
    }

    const sendResult = await sendWhatsAppMediaMessage({
      phoneNumberId,
      accessToken,
      to: contato.telefone,
      tipoMensagem,
      mediaId: uploadResult.mediaId,
      caption: legenda || null,
      fileName: arquivoPreparado.name || null,
    });

    if (!sendResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Falha ao enviar mídia ao WhatsApp",
          detalhes: sendResult.error,
          retorno_meta: sendResult.raw,
        },
        { status: 502 }
      );
    }

    const conteudoFinal = legenda?.trim()
      ? legenda.trim()
      : getConteudoPadrao(tipoMensagem, arquivoPreparado.name);

    const metadataJson = {
      tipo_original_whatsapp:
        tipoMensagem === "imagem"
          ? "image"
          : tipoMensagem === "audio"
          ? "audio"
          : tipoMensagem === "video"
          ? "video"
          : "document",
      media_id: uploadResult.mediaId,
      mime_type: mimeType,
      sha256: null,
      caption: legenda?.trim() || null,
      filename: arquivoPreparado.name || null,
      url: null,
      voice: false,
      contacts: null,
      location: null,
      unsupported: null,
      whatsapp: {
        upload_meta: uploadResult.raw,
        envio_meta: sendResult.raw,
      },
    };

    const { data: mensagem, error: insertError } = await supabaseAdmin
      .from("mensagens")
      .insert([
        {
          empresa_id: conversa.empresa_id,
          conversa_id: conversaId,
          remetente_tipo: "usuario",
          remetente_id: usuario.id,
          conteudo: conteudoFinal,
          tipo_mensagem: tipoMensagem,
          origem: "enviada",
          status_envio: "enviada",
          mensagem_externa_id: sendResult.messageId,
          metadata_json: metadataJson,
        },
      ])
      .select("*")
      .single();

    if (insertError) {
      return NextResponse.json(
        { ok: false, error: insertError.message },
        { status: 500 }
      );
    }

    await supabaseAdmin
      .from("conversas")
      .update({
        last_message_at: new Date().toISOString(),
      })
      .eq("id", conversaId);

    return NextResponse.json({
      ok: true,
      message: "Mídia enviada com sucesso",
      mensagem,
    });
  } catch (error) {
    console.error("[MEDIA] erro ao enviar mídia:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro ao enviar mídia",
      },
      { status: 500 }
    );
  }
}