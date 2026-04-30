import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function tipoMidiaPorMime(mimeType: string) {
  if (mimeType.startsWith("image/")) return "imagem";
  if (mimeType.startsWith("video/")) return "video";
  return "";
}

function extensaoPorNome(nome: string) {
  const partes = nome.split(".");
  return partes.length > 1 ? partes.pop()?.toLowerCase() || "bin" : "bin";
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const supabaseAdmin = getSupabaseAdmin();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401 }
      );
    }

    const { data: usuarioSistema, error: usuarioError } = await supabaseAdmin
      .from("usuarios")
      .select("id, empresa_id")
      .eq("auth_user_id", user.id)
      .single();

    if (usuarioError || !usuarioSistema?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const arquivo = formData.get("arquivo");

    if (!(arquivo instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Arquivo não enviado." },
        { status: 400 }
      );
    }

    const tipo = tipoMidiaPorMime(arquivo.type);

    if (!tipo) {
      return NextResponse.json(
        { ok: false, error: "Envie apenas imagem ou vídeo." },
        { status: 400 }
      );
    }

    const limiteImagem = 5 * 1024 * 1024;
    const limiteVideo = 16 * 1024 * 1024;

    if (tipo === "imagem" && arquivo.size > limiteImagem) {
      return NextResponse.json(
        { ok: false, error: "A imagem deve ter no máximo 5MB." },
        { status: 400 }
      );
    }

    if (tipo === "video" && arquivo.size > limiteVideo) {
      return NextResponse.json(
        { ok: false, error: "O vídeo deve ter no máximo 16MB." },
        { status: 400 }
      );
    }

    const nomeArquivoOriginal = arquivo.name.trim();

    const { data: midiaExistente, error: midiaExistenteError } =
      await supabaseAdmin
        .from("midias")
        .select("id")
        .eq("empresa_id", usuarioSistema.empresa_id)
        .eq("nome", nomeArquivoOriginal)
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

    const extensao = extensaoPorNome(arquivo.name);
    const nomeArquivo = `${crypto.randomUUID()}.${extensao}`;
    const storagePath = `${usuarioSistema.empresa_id}/${tipo}/${nomeArquivo}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("midias")
      .upload(storagePath, arquivo, {
        contentType: arquivo.type,
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from("midias")
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData.publicUrl;

    const { data: midia, error: insertError } = await supabaseAdmin
      .from("midias")
      .insert({
        empresa_id: usuarioSistema.empresa_id,
        nome: nomeArquivoOriginal,
        tipo,
        url: publicUrl,
        storage_path: storagePath,
        mime_type: arquivo.type,
        tamanho_bytes: arquivo.size,
        created_by: usuarioSistema.id,
      })
      .select("id, nome, tipo, url, mime_type, tamanho_bytes, created_at")
      .single();

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({
      ok: true,
      midia,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro ao enviar mídia.",
      },
      { status: 500 }
    );
  }
}