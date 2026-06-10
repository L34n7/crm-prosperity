import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const BUCKET_MIDIAS = "midias";
const LIMITE_STORAGE_MIDIAS_EMPRESA_BYTES = 100 * 1024 * 1024; // 100 MB

async function obterContextoUsuario() {
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
    usuarioSistema,
  };
}

function montarResumoMidias(midias: any[]) {
  const total = midias.length;
  const imagens = midias.filter((midia) => midia.tipo === "imagem").length;
  const videos = midias.filter((midia) => midia.tipo === "video").length;
  const audios = midias.filter((midia) => midia.tipo === "audio").length;

  const tamanhoTotalBytes = midias.reduce(
    (totalBytes, midia) => totalBytes + Number(midia.tamanho_bytes || 0),
    0
  );

  return {
    total,
    imagens,
    videos,
    audios,
    tamanhoTotalBytes,
    limiteStorageBytes: LIMITE_STORAGE_MIDIAS_EMPRESA_BYTES,
    limiteStorageAtingido:
      tamanhoTotalBytes >= LIMITE_STORAGE_MIDIAS_EMPRESA_BYTES,
  };
}

export async function GET(req: NextRequest) {
  try {
    const contexto = await obterContextoUsuario();

    if (!contexto.ok) {
      return contexto.response;
    }

    const tipo = req.nextUrl.searchParams.get("tipo");

    let query = contexto.supabaseAdmin
      .from("midias")
      .select("id, nome, tipo, url, mime_type, tamanho_bytes, created_at")
      .eq("empresa_id", contexto.usuarioSistema.empresa_id)
      .order("created_at", { ascending: false });

    if (tipo) {
      query = query.eq("tipo", tipo);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const { data: todasMidias, error: resumoError } = await contexto.supabaseAdmin
      .from("midias")
      .select("tipo, tamanho_bytes")
      .eq("empresa_id", contexto.usuarioSistema.empresa_id);

    if (resumoError) {
      throw resumoError;
    }

    return NextResponse.json({
      ok: true,
      midias: data || [],
      resumo: montarResumoMidias(todasMidias || []),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro ao carregar mídias.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const contexto = await obterContextoUsuario();

    if (!contexto.ok) {
      return contexto.response;
    }

    const body = await req.json().catch(() => null);
    const id = String(body?.id || "").trim();

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID da mídia não informado." },
        { status: 400 }
      );
    }

    const { data: midia, error: midiaError } = await contexto.supabaseAdmin
      .from("midias")
      .select("id, empresa_id, nome, url, storage_path")
      .eq("id", id)
      .eq("empresa_id", contexto.usuarioSistema.empresa_id)
      .single();

    if (midiaError || !midia) {
      return NextResponse.json(
        { ok: false, error: "Mídia não encontrada." },
        { status: 404 }
      );
    }

    if (midia.storage_path) {
      const { error: storageError } = await contexto.supabaseAdmin.storage
        .from(BUCKET_MIDIAS)
        .remove([midia.storage_path]);

      if (storageError) {
        throw storageError;
      }
    }

    const { error: deleteError } = await contexto.supabaseAdmin
      .from("midias")
      .delete()
      .eq("id", id)
      .eq("empresa_id", contexto.usuarioSistema.empresa_id);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({
      ok: true,
      message: "Mídia excluída definitivamente.",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro ao excluir mídia.",
      },
      { status: 500 }
    );
  }
}