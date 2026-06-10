import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

export const runtime = "nodejs";

const require = createRequire(import.meta.url);

type TipoMidia = "imagem" | "video" | "audio";

type UsuarioSistema = {
  id: string;
  empresa_id: string;
};

const BUCKET_MIDIAS = "midias";
const LIMITE_IMAGEM = 5 * 1024 * 1024;
const LIMITE_VIDEO = 16 * 1024 * 1024;
const LIMITE_AUDIO = 16 * 1024 * 1024;

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

function trocarExtensaoParaMp4(nome: string) {
  const nomeLimpo = nome.trim() || `video-${Date.now()}.mp4`;
  const semExtensao = nomeLimpo.replace(/\.[^/.]+$/, "");

  return `${semExtensao}-whatsapp.mp4`;
}

async function converterVideoParaWhatsapp(file: File): Promise<File> {
  const buffer = Buffer.from(await file.arrayBuffer());

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "crm-video-"));
  const inputPath = path.join(tmpDir, file.name || "input-video");
  const outputPath = path.join(tmpDir, "output-whatsapp.mp4");

  try {
    await fs.writeFile(inputPath, buffer);

    await new Promise<void>(async (resolve, reject) => {
      let ffmpegBinaryPath = "";

      try {
        ffmpegBinaryPath = await getFfmpegBinaryPath();
      } catch (error) {
        reject(error);
        return;
      }

      const ffmpeg = spawn(ffmpegBinaryPath, [
        "-i",
        inputPath,

        "-c:v",
        "libx264",

        "-profile:v",
        "main",

        "-pix_fmt",
        "yuv420p",

        "-preset",
        "medium",

        "-crf",
        "23",

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
            `Falha ao converter vídeo com FFmpeg. Código: ${code}. Detalhes: ${stderr}`
          )
        );
      });
    });

    const convertidoBuffer = await fs.readFile(outputPath);

    return new File([convertidoBuffer], trocarExtensaoParaMp4(file.name), {
      type: "video/mp4",
    });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
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

  const validacao = validarMetadadosArquivo({
    nome: String(obterCampoJson(body, "nome") || ""),
    mimeType: String(obterCampoJson(body, "mimeType") || ""),
    tamanhoBytes: Number(obterCampoJson(body, "tamanhoBytes") || 0),
  });

  if (!validacao.ok) {
    return validacao.response;
  }

  const storagePath = String(obterCampoJson(body, "storagePath") || "").trim();
  const prefixoEsperado = `${contexto.usuarioSistema.empresa_id}/${validacao.tipo}/`;

  if (!storagePath.startsWith(prefixoEsperado)) {
    return NextResponse.json(
      { ok: false, error: "Caminho de mídia inválido." },
      { status: 400 }
    );
  }

  const { error: infoError } = await contexto.supabaseAdmin.storage
    .from(BUCKET_MIDIAS)
    .info(storagePath);

  if (infoError) {
    return NextResponse.json(
      { ok: false, error: "Upload da mídia não encontrado no Storage." },
      { status: 400 }
    );
  }

  const nomeIndisponivel = await verificarNomeDisponivel({
    supabaseAdmin: contexto.supabaseAdmin,
    empresaId: contexto.usuarioSistema.empresa_id,
    nome: validacao.nomeArquivoOriginal,
  });

  if (nomeIndisponivel) {
    return nomeIndisponivel;
  }

  const midia = await registrarMidia({
    supabaseAdmin: contexto.supabaseAdmin,
    usuarioSistema: contexto.usuarioSistema,
    nomeArquivoOriginal: validacao.nomeArquivoOriginal,
    tipo: validacao.tipo,
    storagePath,
    mimeType: validacao.mimeType,
    tamanhoBytes: validacao.tamanhoBytes,
  });

  return NextResponse.json({
    ok: true,
    midia,
  });
}

async function uploadMultipartLegado(req: NextRequest) {
  const contexto = await obterUsuarioSistema();

  if (!contexto.ok) {
    return contexto.response;
  }

  const formData = await req.formData();
  const arquivo = formData.get("arquivo");

  if (!(arquivo instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "Arquivo não enviado." },
      { status: 400 }
    );
  }

  const validacaoOriginal = validarMetadadosArquivo({
    nome: arquivo.name,
    mimeType: arquivo.type,
    tamanhoBytes: arquivo.size,
  });

  if (!validacaoOriginal.ok) {
    return validacaoOriginal.response;
  }

  let arquivoParaSalvar = arquivo;
  let nomeArquivoParaSalvar = validacaoOriginal.nomeArquivoOriginal;
  let mimeTypeParaSalvar = validacaoOriginal.mimeType;
  let tamanhoBytesParaSalvar = validacaoOriginal.tamanhoBytes;
  let extensao = extensaoPorNome(arquivo.name);

  if (validacaoOriginal.tipo === "video") {
    console.info("[UPLOAD MIDIA AUTOMAÇÃO] Convertendo vídeo para WhatsApp", {
      nomeOriginal: arquivo.name,
      mimeTypeOriginal: arquivo.type,
      tamanhoOriginal: arquivo.size,
    });

    arquivoParaSalvar = await converterVideoParaWhatsapp(arquivo);
    nomeArquivoParaSalvar = trocarExtensaoParaMp4(
      validacaoOriginal.nomeArquivoOriginal
    );
    mimeTypeParaSalvar = "video/mp4";
    tamanhoBytesParaSalvar = arquivoParaSalvar.size;
    extensao = "mp4";

    console.info("[UPLOAD MIDIA AUTOMAÇÃO] Vídeo convertido", {
      nomeConvertido: arquivoParaSalvar.name,
      mimeTypeConvertido: arquivoParaSalvar.type,
      tamanhoConvertido: arquivoParaSalvar.size,
    });

    if (tamanhoBytesParaSalvar > LIMITE_VIDEO) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "O vídeo foi convertido para o formato aceito pelo WhatsApp, mas ainda ficou acima de 16MB. Reduza a duração ou a qualidade do vídeo e tente novamente.",
        },
        { status: 400 }
      );
    }
  }

  const nomeIndisponivel = await verificarNomeDisponivel({
    supabaseAdmin: contexto.supabaseAdmin,
    empresaId: contexto.usuarioSistema.empresa_id,
    nome: nomeArquivoParaSalvar,
  });

  if (nomeIndisponivel) {
    return nomeIndisponivel;
  }

  const nomeArquivoStorage = `${crypto.randomUUID()}.${extensao}`;
  const storagePath = `${contexto.usuarioSistema.empresa_id}/${validacaoOriginal.tipo}/${nomeArquivoStorage}`;

  const { error: uploadError } = await contexto.supabaseAdmin.storage
    .from(BUCKET_MIDIAS)
    .upload(storagePath, arquivoParaSalvar, {
      contentType: mimeTypeParaSalvar,
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  const midia = await registrarMidia({
    supabaseAdmin: contexto.supabaseAdmin,
    usuarioSistema: contexto.usuarioSistema,
    nomeArquivoOriginal: nomeArquivoParaSalvar,
    tipo: validacaoOriginal.tipo,
    storagePath,
    mimeType: mimeTypeParaSalvar,
    tamanhoBytes: tamanhoBytesParaSalvar,
  });

  return NextResponse.json({
    ok: true,
    midia,
  });
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body: unknown = await req.json();
      const acao = String(obterCampoJson(body, "acao") || "");

      if (acao === "preparar_upload") {
        return prepararUploadDireto(body);
      }

      if (acao === "concluir_upload") {
        return concluirUploadDireto(body);
      }

      return NextResponse.json(
        { ok: false, error: "Ação de upload inválida." },
        { status: 400 }
      );
    }

    return uploadMultipartLegado(req);
  } catch (error: unknown) {
    const mensagem = error instanceof Error ? error.message : "";

    if (/request entity too large|payload too large|body exceeded/i.test(mensagem)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Arquivo muito grande para passar pela API. Tente enviar novamente pelo upload direto ou reduza o tamanho.",
        },
        { status: 413 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: mensagem || "Erro ao enviar mídia.",
      },
      { status: 500 }
    );
  }
}
