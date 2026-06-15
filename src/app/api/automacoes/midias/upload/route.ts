import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import crypto from "node:crypto";

export const runtime = "nodejs";

const require = createRequire(import.meta.url);

type VideoCodecInfo = {
  precisaConverter: boolean;
  motivo: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  container: string | null;
};


type TipoMidia = "imagem" | "video" | "audio";

type UsuarioSistema = {
  id: string;
  empresa_id: string;
};

const BUCKET_MIDIAS = "midias";
const LIMITE_IMAGEM = 5 * 1024 * 1024;
const LIMITE_VIDEO = 16 * 1024 * 1024;
const LIMITE_AUDIO = 16 * 1024 * 1024;
const LIMITE_STORAGE_MIDIAS_EMPRESA_BYTES = 50 * 1024 * 1024; // 50 MB

function tipoMidiaPorMime(mimeType: string): TipoMidia | "" {
  if (mimeType.startsWith("image/")) return "imagem";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "";
}

function extensaoPorNome(nome: string) {
  const partes = nome.split(".");
  return partes.length > 1 ? partes.pop()?.toLowerCase() || "bin" : "bin";
}

function obterCampoJson(body: unknown, campo: string) {
  if (!body || typeof body !== "object") {
    return undefined;
  }

  return (body as Record<string, unknown>)[campo];
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

async function getFfprobeBinaryPath() {
  const ffprobeStatic = require("ffprobe-static");

  const caminhoResolvido =
    typeof ffprobeStatic === "string"
      ? ffprobeStatic
      : ffprobeStatic?.path;

  if (!caminhoResolvido || typeof caminhoResolvido !== "string") {
    throw new Error("Não foi possível localizar o binário do FFprobe.");
  }

  const caminhoNormalizado =
    normalizarCaminhoRootPlaceholder(caminhoResolvido);

  try {
    await fs.access(caminhoNormalizado);
    return caminhoNormalizado;
  } catch {
    throw new Error(
      `Binário do FFprobe não encontrado no caminho: ${caminhoNormalizado}`
    );
  }
}

async function inspecionarVideoParaWhatsapp(file: File): Promise<VideoCodecInfo> {
  const buffer = Buffer.from(await file.arrayBuffer());

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "crm-probe-video-"));
  const inputPath = path.join(tmpDir, file.name || "input-video");

  try {
    await fs.writeFile(inputPath, buffer);

    const ffprobeBinaryPath = await getFfprobeBinaryPath();

    const saida = await new Promise<string>((resolve, reject) => {
      const ffprobe = spawn(ffprobeBinaryPath, [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        inputPath,
      ]);

      let stdout = "";
      let stderr = "";

      ffprobe.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      ffprobe.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      ffprobe.on("error", reject);

      ffprobe.on("close", (code) => {
        if (code === 0) {
          resolve(stdout);
          return;
        }

        reject(
          new Error(
            `Falha ao inspecionar vídeo com FFprobe. Código: ${code}. Detalhes: ${stderr}`
          )
        );
      });
    });

    const json = JSON.parse(saida || "{}");

    const streams = Array.isArray(json.streams) ? json.streams : [];

    const videoStream = streams.find(
      (stream: any) => String(stream.codec_type || "") === "video"
    );

    const audioStream = streams.find(
      (stream: any) => String(stream.codec_type || "") === "audio"
    );

    const videoCodec = String(videoStream?.codec_name || "").toLowerCase() || null;
    const audioCodec = String(audioStream?.codec_name || "").toLowerCase() || null;
    const container = String(json.format?.format_name || "").toLowerCase() || null;

    const containerFormatos = String(container || "")
      .split(",")
      .map((item) => item.trim().toLowerCase());

    const containerEhMp4 =
      containerFormatos.includes("mp4") ||
      containerFormatos.includes("mov") ||
      containerFormatos.includes("m4a") ||
      containerFormatos.includes("3gp") ||
      containerFormatos.includes("3g2") ||
      containerFormatos.includes("mj2");

    const videoAceito = videoCodec === "h264";

    // Se não tiver áudio, pode aceitar. Se tiver áudio, precisa ser AAC.
    const audioAceito = !audioCodec || audioCodec === "aac";

    if (containerEhMp4 && videoAceito && audioAceito) {
      return {
        precisaConverter: false,
        motivo: null,
        videoCodec,
        audioCodec,
        container,
      };
    }

    const motivos: string[] = [];

    if (!containerEhMp4) {
      motivos.push("container diferente de MP4");
    }

    if (!videoAceito) {
      motivos.push(`codec de vídeo ${videoCodec || "desconhecido"}`);
    }

    if (!audioAceito) {
      motivos.push(`codec de áudio ${audioCodec || "desconhecido"}`);
    }

    return {
      precisaConverter: true,
      motivo: motivos.join(", "),
      videoCodec,
      audioCodec,
      container,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}


async function baixarArquivoStorageParaFile(params: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  storagePath: string;
  nomeArquivo: string;
  mimeType: string;
}) {
  const { data, error } = await params.supabaseAdmin.storage
    .from(BUCKET_MIDIAS)
    .download(params.storagePath);

  if (error || !data) {
    throw new Error(
      error?.message || "Não foi possível baixar o vídeo para inspeção."
    );
  }

  const buffer = await data.arrayBuffer();

  return new File([buffer], params.nomeArquivo, {
    type: params.mimeType,
  });
}

function validarMetadadosArquivo(params: {
  nome: string;
  mimeType: string;
  tamanhoBytes: number;
}) {
  const nomeArquivoOriginal = params.nome.trim();
  const mimeType = params.mimeType.trim();
  const tamanhoBytes = params.tamanhoBytes;

  if (!nomeArquivoOriginal) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Nome do arquivo não informado." },
        { status: 400 }
      ),
    };
  }

  if (!Number.isFinite(tamanhoBytes) || tamanhoBytes <= 0) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Tamanho do arquivo inválido." },
        { status: 400 }
      ),
    };
  }

  const tipo = tipoMidiaPorMime(mimeType);

  if (!tipo) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Envie apenas imagem, vídeo ou áudio." },
        { status: 400 }
      ),
    };
  }

  if (tipo === "video") {
    const nomeMinusculo = nomeArquivoOriginal.toLowerCase();
    const mimeMinusculo = mimeType.toLowerCase();

    const extensaoValida = nomeMinusculo.endsWith(".mp4");
    const mimeValido = mimeMinusculo === "video/mp4";

    if (!extensaoValida || !mimeValido) {
      return {
        ok: false as const,
        response: NextResponse.json(
          {
            ok: false,
            error:
              "Formato de vídeo não permitido. " +
              "Envie somente um arquivo MP4 com vídeo H.264/AVC e áudio AAC.",
          },
          { status: 400 }
        ),
      };
    }
  }

  if (tipo === "imagem" && tamanhoBytes > LIMITE_IMAGEM) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "A imagem deve ter no máximo 5MB." },
        { status: 400 }
      ),
    };
  }

  if (tipo === "video" && tamanhoBytes > LIMITE_VIDEO) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "O vídeo deve ter no máximo 16MB." },
        { status: 400 }
      ),
    };
  }

  if (tipo === "audio" && tamanhoBytes > LIMITE_AUDIO) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "O áudio deve ter no máximo 16MB." },
        { status: 400 }
      ),
    };
  }

  return {
    ok: true as const,
    nomeArquivoOriginal,
    mimeType,
    tamanhoBytes,
    tipo,
  };
}

async function obterUsuarioSistema() {
  const supabase = await createClient();
  const supabaseAdmin = getSupabaseAdmin();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401 }
      ),
    };
  }

  const { data: usuarioSistema, error: usuarioError } = await supabaseAdmin
    .from("usuarios")
    .select("id, empresa_id")
    .eq("auth_user_id", user.id)
    .single();

  if (usuarioError || !usuarioSistema?.empresa_id) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true as const,
    supabaseAdmin,
    usuarioSistema: usuarioSistema as UsuarioSistema,
  };
}


async function verificarLimiteStorageMidiasEmpresa(params: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  empresaId: string;
  tamanhoNovoArquivoBytes: number;
}) {
  const { data, error } = await params.supabaseAdmin
    .from("midias")
    .select("tamanho_bytes")
    .eq("empresa_id", params.empresaId);

  if (error) {
    throw error;
  }

  const totalAtualBytes = (data || []).reduce(
    (total, midia) => total + Number(midia.tamanho_bytes || 0),
    0
  );

  const tamanhoNovoArquivoBytes = Number(params.tamanhoNovoArquivoBytes || 0);
  const totalDepoisUpload = totalAtualBytes + tamanhoNovoArquivoBytes;

  if (totalDepoisUpload > LIMITE_STORAGE_MIDIAS_EMPRESA_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: `Limite de 50 MB de mídias atingido. Exclua uma mídia antes de enviar outra.`,
        limite_bytes: LIMITE_STORAGE_MIDIAS_EMPRESA_BYTES,
        usado_bytes: totalAtualBytes,
        arquivo_bytes: tamanhoNovoArquivoBytes,
      },
      { status: 409 }
    );
  }

  return null;
}

async function verificarNomeDisponivel(params: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  empresaId: string;
  nome: string;
}) {
  const { data: midiaExistente, error: midiaExistenteError } =
    await params.supabaseAdmin
      .from("midias")
      .select("id")
      .eq("empresa_id", params.empresaId)
      .eq("nome", params.nome)
      .maybeSingle();

  if (midiaExistenteError) {
    throw midiaExistenteError;
  }

  if (midiaExistente) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Já existe uma mídia com esse nome. Renomeie o arquivo ou selecione a mídia já cadastrada.",
      },
      { status: 409 }
    );
  }

  return null;
}

async function registrarMidia(params: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  usuarioSistema: UsuarioSistema;
  nomeArquivoOriginal: string;
  tipo: TipoMidia;
  storagePath: string;
  mimeType: string;
  tamanhoBytes: number;
}) {
  const { data: publicUrlData } = params.supabaseAdmin.storage
    .from(BUCKET_MIDIAS)
    .getPublicUrl(params.storagePath);

  const publicUrl = publicUrlData.publicUrl;

  const { data: midia, error: insertError } = await params.supabaseAdmin
    .from("midias")
    .insert({
      empresa_id: params.usuarioSistema.empresa_id,
      nome: params.nomeArquivoOriginal,
      tipo: params.tipo,
      url: publicUrl,
      storage_path: params.storagePath,
      mime_type: params.mimeType,
      tamanho_bytes: params.tamanhoBytes,
      created_by: params.usuarioSistema.id,
    })
    .select("id, nome, tipo, url, mime_type, tamanho_bytes, created_at")
    .single();

  if (insertError) {
    throw insertError;
  }

  return midia;
}

async function prepararUploadDireto(body: unknown) {
  const contexto = await obterUsuarioSistema();

  if (!contexto.ok) {
    return contexto.response;
  }

  const validacao = validarMetadadosArquivo({
    nome: String(obterCampoJson(body, "nome") || ""),
    mimeType: String(obterCampoJson(body, "mimeType") || ""),
    tamanhoBytes: Number(obterCampoJson(body, "tamanhoBytes") || 0),
  });

  if (!validacao.ok) {
    return validacao.response;
  }

  const limiteAtingido = await verificarLimiteStorageMidiasEmpresa({
    supabaseAdmin: contexto.supabaseAdmin,
    empresaId: contexto.usuarioSistema.empresa_id,
    tamanhoNovoArquivoBytes: Number(obterCampoJson(body, "tamanhoBytes") || 0),
  });

  if (limiteAtingido) {
    return limiteAtingido;
  }

  const nomeIndisponivel = await verificarNomeDisponivel({
    supabaseAdmin: contexto.supabaseAdmin,
    empresaId: contexto.usuarioSistema.empresa_id,
    nome: validacao.nomeArquivoOriginal,
  });

  if (nomeIndisponivel) {
    return nomeIndisponivel;
  }

  const extensao = extensaoPorNome(validacao.nomeArquivoOriginal);
  const nomeArquivo = `${crypto.randomUUID()}.${extensao}`;
  const storagePath = `${contexto.usuarioSistema.empresa_id}/${validacao.tipo}/${nomeArquivo}`;

  const { data: uploadAssinado, error: signedUploadError } =
    await contexto.supabaseAdmin.storage
      .from(BUCKET_MIDIAS)
      .createSignedUploadUrl(storagePath, { upsert: false });

  if (signedUploadError || !uploadAssinado?.token) {
    throw signedUploadError || new Error("Erro ao preparar envio da mídia.");
  }

  return NextResponse.json({
    ok: true,
    upload: {
      bucket: BUCKET_MIDIAS,
      path: storagePath,
      token: uploadAssinado.token,
    },
  });
}

async function concluirUploadDireto(body: unknown) {
  const contexto = await obterUsuarioSistema();

  if (!contexto.ok) {
    return contexto.response;
  }

  const nome = String(obterCampoJson(body, "nome") || "");
  const mimeType = String(obterCampoJson(body, "mimeType") || "");
  const tamanhoInformado = Number(
    obterCampoJson(body, "tamanhoBytes") || 0
  );

  const validacaoInicial = validarMetadadosArquivo({
    nome,
    mimeType,
    tamanhoBytes: tamanhoInformado,
  });

  if (!validacaoInicial.ok) {
    return validacaoInicial.response;
  }

  const storagePath = String(
    obterCampoJson(body, "storagePath") || ""
  ).trim();

  const prefixoEsperado =
    `${contexto.usuarioSistema.empresa_id}/` +
    `${validacaoInicial.tipo}/`;

  if (!storagePath.startsWith(prefixoEsperado)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Caminho de mídia inválido.",
      },
      { status: 400 }
    );
  }

  const removerArquivoStorage = async () => {
    const { error } = await contexto.supabaseAdmin.storage
      .from(BUCKET_MIDIAS)
      .remove([storagePath]);

    if (error) {
      console.error(
        "[UPLOAD MIDIAS] Erro ao remover arquivo inválido:",
        {
          storagePath,
          error,
        }
      );
    }
  };

  const { data: arquivoInfo, error: infoError } =
    await contexto.supabaseAdmin.storage
      .from(BUCKET_MIDIAS)
      .info(storagePath);

  if (infoError || !arquivoInfo) {
    return NextResponse.json(
      {
        ok: false,
        error: "Upload da mídia não encontrado no Storage.",
      },
      { status: 400 }
    );
  }

  const tamanhoRealBytes = Number(arquivoInfo.size || 0);

  if (!Number.isFinite(tamanhoRealBytes) || tamanhoRealBytes <= 0) {
    await removerArquivoStorage();

    return NextResponse.json(
      {
        ok: false,
        error: "Não foi possível confirmar o tamanho do arquivo enviado.",
      },
      { status: 400 }
    );
  }

  const validacaoReal = validarMetadadosArquivo({
    nome,
    mimeType,
    tamanhoBytes: tamanhoRealBytes,
  });

  if (!validacaoReal.ok) {
    await removerArquivoStorage();
    return validacaoReal.response;
  }

  if (validacaoReal.tipo === "video") {
    try {
      const arquivoVideo = await baixarArquivoStorageParaFile({
        supabaseAdmin: contexto.supabaseAdmin,
        storagePath,
        nomeArquivo: validacaoReal.nomeArquivoOriginal,
        mimeType: validacaoReal.mimeType,
      });

      const codecInfo =
        await inspecionarVideoParaWhatsapp(arquivoVideo);

      console.info("[UPLOAD MIDIAS] Inspeção do vídeo", {
        nomeOriginal: validacaoReal.nomeArquivoOriginal,
        mimeTypeOriginal: validacaoReal.mimeType,
        tamanhoRealBytes,
        compativel: !codecInfo.precisaConverter,
        motivo: codecInfo.motivo,
        videoCodec: codecInfo.videoCodec,
        audioCodec: codecInfo.audioCodec,
        container: codecInfo.container,
      });

      if (codecInfo.precisaConverter) {
        await removerArquivoStorage();

        return NextResponse.json(
          {
            ok: false,
            error:
              "Este vídeo não é compatível com o WhatsApp. " +
              "Envie um arquivo MP4 com vídeo H.264/AVC e áudio AAC.",
            detalhes: {
              motivo: codecInfo.motivo,
              videoCodec: codecInfo.videoCodec,
              audioCodec: codecInfo.audioCodec,
              container: codecInfo.container,
            },
          },
          { status: 400 }
        );
      }
    } catch (error: unknown) {
      await removerArquivoStorage();

      const mensagem =
        error instanceof Error
          ? error.message
          : "Erro desconhecido durante a inspeção.";

      console.error("[UPLOAD MIDIAS] Falha ao inspecionar vídeo:", {
        storagePath,
        error,
      });

      return NextResponse.json(
        {
          ok: false,
          error: `Não foi possível verificar o vídeo: ${mensagem}`,
        },
        { status: 400 }
      );
    }
  }

  const limiteAtingido =
    await verificarLimiteStorageMidiasEmpresa({
      supabaseAdmin: contexto.supabaseAdmin,
      empresaId: contexto.usuarioSistema.empresa_id,
      tamanhoNovoArquivoBytes: tamanhoRealBytes,
    });

  if (limiteAtingido) {
    await removerArquivoStorage();
    return limiteAtingido;
  }

  const nomeIndisponivel = await verificarNomeDisponivel({
    supabaseAdmin: contexto.supabaseAdmin,
    empresaId: contexto.usuarioSistema.empresa_id,
    nome: validacaoReal.nomeArquivoOriginal,
  });

  if (nomeIndisponivel) {
    await removerArquivoStorage();
    return nomeIndisponivel;
  }

  try {
    const midia = await registrarMidia({
      supabaseAdmin: contexto.supabaseAdmin,
      usuarioSistema: contexto.usuarioSistema,
      nomeArquivoOriginal: validacaoReal.nomeArquivoOriginal,
      tipo: validacaoReal.tipo,
      storagePath,
      mimeType: validacaoReal.mimeType,
      tamanhoBytes: tamanhoRealBytes,
    });

    return NextResponse.json({
      ok: true,
      midia,
    });
  } catch (error) {
    await removerArquivoStorage();
    throw error;
  }
}


export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        {
          ok: false,
          error: "Formato de upload não suportado.",
        },
        { status: 415 }
      );
    }

    const body: unknown = await req.json();
    const acao = String(obterCampoJson(body, "acao") || "");

    if (acao === "preparar_upload") {
      return prepararUploadDireto(body);
    }

    if (acao === "concluir_upload") {
      return concluirUploadDireto(body);
    }

    return NextResponse.json(
      {
        ok: false,
        error: "Ação de upload inválida.",
      },
      { status: 400 }
    );
  } catch (error: unknown) {
    const mensagem =
      error instanceof Error ? error.message : "";

    console.error("[UPLOAD MIDIAS] Erro:", error);

    return NextResponse.json(
      {
        ok: false,
        error: mensagem || "Erro ao enviar mídia.",
      },
      { status: 500 }
    );
  }
}
