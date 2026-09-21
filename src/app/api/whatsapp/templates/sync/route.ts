import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listarPermissoesDoUsuario } from "@/lib/permissoes/can";
import { can } from "@/lib/permissoes/frontend";
import { listMetaTemplates } from "@/lib/whatsapp/templates";
import { salvarTemplateWhatsappLocalIdempotente } from "@/lib/whatsapp/templates-local";
import { templatePossuiInstrucaoOptOut } from "@/lib/whatsapp/opt-out-policy";
import { getWhatsAppAccessToken } from "@/lib/whatsapp/access-token";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { usuarioPodeAcessarIntegracaoWhatsapp } from "@/lib/whatsapp/integracoes-multiplas";

type UsuarioSistema = {
  id: string;
  empresa_id: string | null;
  status: "ativo" | "inativo" | "bloqueado";
};

const TEMPLATE_MEDIA_BUCKET = "midias";
const TEMPLATE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

function extensaoImagemPorMime(mimeType: string) {
  const mime = String(mimeType || "").split(";")[0].trim().toLowerCase();

  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

async function armazenarImagemTemplateSincronizado(params: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  empresaId: string;
  integracaoId: string;
  metaTemplateId: string;
  components: any[];
}) {
  const components = JSON.parse(JSON.stringify(params.components || [])) as any[];
  const header = components.find(
    (item) =>
      String(item?.type || "").toUpperCase() === "HEADER" &&
      String(item?.format || "").toUpperCase() === "IMAGE"
  );

  if (!header) {
    return { components, armazenada: false };
  }

  const handles = Array.isArray(header?.example?.header_handle)
    ? header.example.header_handle
    : [];
  const origem =
    handles
      .map((item: unknown) => String(item || "").trim())
      .find((item: string) => /^https?:\/\//i.test(item)) || "";

  if (!origem) {
    return { components, armazenada: false };
  }

  const resposta = await fetch(origem, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "image/*",
    },
  });

  if (!resposta.ok) {
    throw new Error(
      `Não foi possível baixar a imagem do template na Meta (HTTP ${resposta.status}).`
    );
  }

  const contentType = String(
    resposta.headers.get("content-type") || "image/jpeg"
  )
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (!contentType.startsWith("image/")) {
    throw new Error("A mídia retornada pela Meta não é uma imagem válida.");
  }

  const arquivo = new Uint8Array(await resposta.arrayBuffer());

  if (arquivo.byteLength <= 0) {
    throw new Error("A imagem retornada pela Meta está vazia.");
  }

  if (arquivo.byteLength > TEMPLATE_IMAGE_MAX_BYTES) {
    throw new Error("A imagem do template excede o limite de 5 MB.");
  }

  const extensao = extensaoImagemPorMime(contentType);
  const caminho = [
    "whatsapp-templates",
    params.empresaId,
    params.integracaoId,
    `${params.metaTemplateId}.${extensao}`,
  ].join("/");

  const { error: uploadError } = await params.supabaseAdmin.storage
    .from(TEMPLATE_MEDIA_BUCKET)
    .upload(caminho, arquivo, {
      contentType,
      upsert: true,
      cacheControl: "3600",
    });

  if (uploadError) {
    throw new Error(
      `Não foi possível armazenar a imagem do template: ${uploadError.message}`
    );
  }

  const { data: publicUrlData } = params.supabaseAdmin.storage
    .from(TEMPLATE_MEDIA_BUCKET)
    .getPublicUrl(caminho);

  const publicUrl = String(publicUrlData?.publicUrl || "").trim();

  if (!publicUrl) {
    throw new Error("Não foi possível gerar a URL permanente da imagem.");
  }

  header.example = {
    ...(header.example || {}),
    header_handle: [publicUrl],
  };

  return {
    components,
    armazenada: true,
  };
}

async function getUsuarioLogado() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Não autenticado", status: 401 as const };
  }

  const { data: usuario, error: usuarioError } = await supabase
    .from("usuarios")
    .select("id, empresa_id, status")
    .eq("auth_user_id", user.id)
    .single<UsuarioSistema>();

  if (usuarioError || !usuario) {
    return { error: "Usuário do sistema não encontrado.", status: 404 as const };
  }

  if (usuario.status !== "ativo") {
    return { error: "Usuário inativo.", status: 403 as const };
  }

  const permissoes = await listarPermissoesDoUsuario(usuario.id);

  return { usuario, permissoes };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getUsuarioLogado();

    if ("error" in auth) {
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status }
      );
    }

    const { usuario, permissoes } = auth;

    if (!can(permissoes, "whatsapp_templates.sincronizar")) {
      return NextResponse.json(
        { ok: false, error: "Sem permissão para sincronizar templates." },
        { status: 403 }
      );
    }

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const integracaoWhatsAppId = String(body.integracao_whatsapp_id || "").trim();

    if (!integracaoWhatsAppId) {
      return NextResponse.json(
        { ok: false, error: "Integração WhatsApp é obrigatória." },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const contexto = await getUsuarioContexto();

    if (!contexto.ok) {
      return NextResponse.json(
        { ok: false, error: contexto.error },
        { status: contexto.status }
      );
    }

    const podeUsarIntegracao = await usuarioPodeAcessarIntegracaoWhatsapp({
      usuario: contexto.usuario,
      empresaId: usuario.empresa_id,
      integracaoId: integracaoWhatsAppId,
    });

    if (!podeUsarIntegracao) {
      return NextResponse.json(
        { ok: false, error: "Sem acesso a esta integração WhatsApp." },
        { status: 403 }
      );
    }

    const { data: integracao, error: integracaoError } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .select(
        "id, empresa_id, nome_conexao, status, waba_id, token_ref, config_json"
      )
      .eq("id", integracaoWhatsAppId)
      .eq("empresa_id", usuario.empresa_id)
      .single();

    if (integracaoError || !integracao) {
      return NextResponse.json(
        { ok: false, error: "Integração WhatsApp não encontrada." },
        { status: 404 }
      );
    }

    if (!integracao.waba_id) {
      return NextResponse.json(
        { ok: false, error: "Integração sem WABA ID configurado." },
        { status: 400 }
      );
    }

    if (integracao.status !== "ativa") {
      return NextResponse.json(
        { ok: false, error: "A integração WhatsApp não está ativa." },
        { status: 400 }
      );
    }

    const accessToken = getWhatsAppAccessToken(integracao);

    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: "WHATSAPP_ACCESS_TOKEN não configurado no servidor." },
        { status: 500 }
      );
    }

    const metaResponse = await listMetaTemplates({
      wabaId: integracao.waba_id,
      accessToken,
    });

    if (!metaResponse.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Erro ao consultar templates no Meta.",
          meta: metaResponse.data,
        },
        { status: 400 }
      );
    }

    const templates = Array.isArray(metaResponse.data?.data)
      ? metaResponse.data.data
      : [];

    let inseridos = 0;
    let atualizados = 0;
    let midiasArmazenadas = 0;
    let falhasMidia = 0;

    for (const item of templates) {
      const metaTemplateId = String(item.id || "");
      const nome = String(item.name || "");
      const categoria = String(item.category || "UTILITY");
      const idioma = String(item.language || "pt_BR");
      const status = String(item.status || "desconhecido");

      let components = Array.isArray(item.components)
        ? item.components
        : [];

      try {
        const cacheMidia = await armazenarImagemTemplateSincronizado({
          supabaseAdmin,
          empresaId: usuario.empresa_id,
          integracaoId: integracao.id,
          metaTemplateId,
          components,
        });

        components = cacheMidia.components;

        if (cacheMidia.armazenada) {
          midiasArmazenadas += 1;
        }
      } catch (mediaError) {
        falhasMidia += 1;
        console.error("Erro ao armazenar mídia do template sincronizado:", {
          template: nome,
          idioma,
          error:
            mediaError instanceof Error
              ? mediaError.message
              : String(mediaError),
        });
      }

      const payload = {
        name: item.name ?? null,
        category: item.category ?? null,
        language: item.language ?? null,
        components,
      };

      const resultadoSalvar = await salvarTemplateWhatsappLocalIdempotente({
        supabase: supabaseAdmin,
        empresaId: usuario.empresa_id,
        integracaoWhatsAppId: integracao.id,
        wabaId: integracao.waba_id,
        metaTemplateId,
        nome,
        categoria,
        idioma,
        status,
        payload,
        respostaMeta: item,
        usuarioId: usuario.id,
        optOutHabilitado: templatePossuiInstrucaoOptOut(
          payload,
          categoria
        ),
      });

      if (resultadoSalvar.error) {
        console.error("Erro ao salvar template sincronizado:", {
          template: nome,
          idioma,
          error: resultadoSalvar.error.message,
        });
        continue;
      }

      if (resultadoSalvar.criado) {
        inseridos += 1;
      } else {
        atualizados += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      integracao: {
        id: integracao.id,
        nome_conexao: integracao.nome_conexao,
        waba_id: integracao.waba_id,
      },
      total_meta: templates.length,
      inseridos,
      atualizados,
      midias_armazenadas: midiasArmazenadas,
      falhas_midia: falhasMidia,
    });
  } catch (error) {
    console.error("Erro ao sincronizar templates:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao sincronizar templates." },
      { status: 500 }
    );
  }
}
