import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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

  const validacao = validarMetadadosArquivo({
    nome: arquivo.name,
    mimeType: arquivo.type,
    tamanhoBytes: arquivo.size,
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

  const extensao = extensaoPorNome(arquivo.name);
  const nomeArquivo = `${crypto.randomUUID()}.${extensao}`;
  const storagePath = `${contexto.usuarioSistema.empresa_id}/${validacao.tipo}/${nomeArquivo}`;

  const { error: uploadError } = await contexto.supabaseAdmin.storage
    .from(BUCKET_MIDIAS)
    .upload(storagePath, arquivo, {
      contentType: arquivo.type,
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
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
