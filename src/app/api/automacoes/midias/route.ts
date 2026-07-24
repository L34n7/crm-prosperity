import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const BUCKET_MIDIAS = "midias";
const LIMITE_STORAGE_MIDIAS_EMPRESA_BYTES = 50 * 1024 * 1024; // 50 MB
const TIPOS_NO_MIDIA = [
  "enviar_imagem",
  "enviar_video",
  "enviar_audio",
  "enviar_arquivo",
];
const CHAVES_REFERENCIA_MIDIA = [
  "midia_url",
  "midia_nome",
  "midia_id",
  "media_url",
  "media_nome",
  "media_id",
  "arquivo_url",
  "arquivo_nome",
  "arquivo_id",
  "storage_path",
  "storagePath",
  "midia_removida",
];

type MidiaParaRemocaoFluxos = {
  id: string;
  nome: string | null;
  url: string | null;
  storage_path: string | null;
};

function configuracaoComoObjeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function textoNormalizado(valor: unknown) {
  return String(valor || "").trim();
}

function configuracaoUsaMidia(
  configuracao: unknown,
  midia: MidiaParaRemocaoFluxos
) {
  const config = configuracaoComoObjeto(configuracao);
  const ids = new Set([midia.id].filter(Boolean));
  const urls = new Set([midia.url].filter(Boolean));
  const storagePaths = new Set([midia.storage_path].filter(Boolean));

  return (
    ids.has(textoNormalizado(config.midia_id)) ||
    ids.has(textoNormalizado(config.media_id)) ||
    ids.has(textoNormalizado(config.arquivo_id)) ||
    urls.has(textoNormalizado(config.midia_url)) ||
    urls.has(textoNormalizado(config.media_url)) ||
    urls.has(textoNormalizado(config.arquivo_url)) ||
    storagePaths.has(textoNormalizado(config.storage_path)) ||
    storagePaths.has(textoNormalizado(config.storagePath))
  );
}

function removerCamposMidiaConfiguracao(
  configuracao: unknown,
  removidaEm: string,
  registrarRemocao: boolean
) {
  const config = {
    ...configuracaoComoObjeto(configuracao),
  };

  for (const chave of CHAVES_REFERENCIA_MIDIA) {
    delete config[chave];
  }

  if (registrarRemocao) {
    config.midia_removida = {
      removida_em: removidaEm,
      motivo: "midia_excluida_biblioteca",
    };
  }

  return config;
}

async function removerMidiaDosFluxos(params: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  empresaId: string;
  usuarioId: string;
  midia: MidiaParaRemocaoFluxos;
}) {
  const { supabaseAdmin, empresaId, usuarioId, midia } = params;
  const removidaEm = new Date().toISOString();

  const { data: nosMidia, error: nosError } = await supabaseAdmin
    .from("automacao_nos")
    .select("id, fluxo_id, titulo, tipo_no, ativo, configuracao_json")
    .eq("empresa_id", empresaId)
    .in("tipo_no", TIPOS_NO_MIDIA);

  if (nosError) {
    throw new Error(
      `Erro ao buscar blocos que usam a midia: ${nosError.message}`
    );
  }

  const nosAfetados = (nosMidia || []).filter((no) =>
    configuracaoUsaMidia(no.configuracao_json, midia)
  );
  const nosAtivosAfetados = nosAfetados.filter((no) => no.ativo === true);
  const nosInativosAfetados = nosAfetados.filter((no) => no.ativo !== true);

  if (nosAfetados.length === 0) {
    return {
      total_blocos_afetados: 0,
      total_blocos_ativos_afetados: 0,
      total_blocos_inativos_higienizados: 0,
      total_fluxos_afetados: 0,
      total_fluxos_pausados: 0,
      blocos_afetados: [],
      fluxos_afetados: [],
      fluxos_pausados: [],
    };
  }

  const fluxoIds: string[] = Array.from(
    new Set<string>(
      nosAtivosAfetados.map((no: any) => String(no.fluxo_id)).filter(Boolean)
    )
  );

  const { data: fluxos, error: fluxosError } =
    fluxoIds.length > 0
      ? await supabaseAdmin
          .from("automacao_fluxos")
          .select("id, nome, status")
          .eq("empresa_id", empresaId)
          .in("id", fluxoIds)
      : { data: [], error: null };

  if (fluxosError) {
    throw new Error(
      `Erro ao buscar fluxos afetados pela midia: ${fluxosError.message}`
    );
  }

  const fluxosPorId = new Map<string, any>(
    (fluxos || []).map((fluxo: any) => [String(fluxo.id), fluxo])
  );

  for (const no of nosAfetados) {
    const { error: updateNoError } = await supabaseAdmin
      .from("automacao_nos")
      .update({
        configuracao_json: removerCamposMidiaConfiguracao(
          no.configuracao_json,
          removidaEm,
          no.ativo === true
        ),
        updated_at: removidaEm,
      })
      .eq("id", no.id)
      .eq("empresa_id", empresaId);

    if (updateNoError) {
      throw new Error(
        `Erro ao remover midia do bloco ${no.titulo || no.id}: ${updateNoError.message}`
      );
    }
  }

  const fluxoIdsPausar: string[] = (fluxos || [])
    .filter((fluxo: any) => String(fluxo.status || "") === "ativo")
    .map((fluxo: any) => String(fluxo.id));

  if (fluxoIdsPausar.length > 0) {
    const { error: pausarError } = await supabaseAdmin
      .from("automacao_fluxos")
      .update({
        status: "pausado",
        updated_at: removidaEm,
        atualizado_por: usuarioId,
      })
      .eq("empresa_id", empresaId)
      .in("id", fluxoIdsPausar);

    if (pausarError) {
      throw new Error(
        `Erro ao pausar fluxos afetados pela midia: ${pausarError.message}`
      );
    }
  }

  const fluxoIdsPausados = new Set<string>(fluxoIdsPausar);
  const fluxosAfetados = fluxoIds.map((fluxoId) => {
    const fluxo = fluxosPorId.get(fluxoId);
    const statusAnterior = String(fluxo?.status || "");

    return {
      id: fluxoId,
      nome: fluxo?.nome || null,
      status_anterior: statusAnterior || null,
      status_atual: fluxoIdsPausados.has(fluxoId)
        ? "pausado"
        : statusAnterior || null,
      pausado: fluxoIdsPausados.has(fluxoId),
    };
  });

  return {
    total_blocos_afetados: nosAfetados.length,
    total_blocos_ativos_afetados: nosAtivosAfetados.length,
    total_blocos_inativos_higienizados: nosInativosAfetados.length,
    total_fluxos_afetados: fluxoIds.length,
    total_fluxos_pausados: fluxoIdsPausar.length,
    blocos_afetados: nosAfetados.map((no) => ({
      id: no.id,
      fluxo_id: no.fluxo_id,
      titulo: no.titulo,
      tipo_no: no.tipo_no,
      ativo: no.ativo === true,
    })),
    fluxos_afetados: fluxosAfetados,
    fluxos_pausados: fluxosAfetados.filter((fluxo) => fluxo.pausado),
  };
}

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
  const arquivos = midias.filter((midia) => midia.tipo === "arquivo").length;

  const tamanhoTotalBytes = midias.reduce(
    (totalBytes, midia) => totalBytes + Number(midia.tamanho_bytes || 0),
    0
  );

  return {
    total,
    imagens,
    videos,
    audios,
    arquivos,
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

    const { data: todasMidias, error: resumoError } =
      await contexto.supabaseAdmin
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

    const impactoFluxos = await removerMidiaDosFluxos({
      supabaseAdmin: contexto.supabaseAdmin,
      empresaId: contexto.usuarioSistema.empresa_id,
      usuarioId: contexto.usuarioSistema.id,
      midia,
    });

    const { error: deleteError } = await contexto.supabaseAdmin
      .from("midias")
      .delete()
      .eq("id", id)
      .eq("empresa_id", contexto.usuarioSistema.empresa_id);

    if (deleteError) {
      throw deleteError;
    }

    let storageRemovido = true;
    let storageErro: string | null = null;

    if (midia.storage_path) {
      const { error: storageError } = await contexto.supabaseAdmin.storage
        .from(BUCKET_MIDIAS)
        .remove([midia.storage_path]);

      if (storageError) {
        storageRemovido = false;
        storageErro = storageError.message;
        console.error("[MIDIAS] Erro ao remover arquivo do Storage:", {
          midia_id: midia.id,
          storage_path: midia.storage_path,
          error: storageError,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      message:
        impactoFluxos.total_blocos_afetados > 0
          ? "Midia excluida e referencias removidas dos blocos afetados."
          : "Mídia excluída definitivamente.",
      impacto: impactoFluxos,
      storage_removido: storageRemovido,
      storage_erro: storageErro,
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
