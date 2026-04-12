import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listarPermissoesDoUsuario } from "@/lib/permissoes/can";
import { can } from "@/lib/permissoes/frontend";
import { listMetaTemplates } from "@/lib/whatsapp/templates";

type UsuarioSistema = {
  id: string;
  empresa_id: string | null;
  status: "ativo" | "inativo" | "bloqueado";
};

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

    const { data: integracao, error: integracaoError } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .select("id, empresa_id, nome_conexao, status, waba_id, token_ref")
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

    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

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

    for (const item of templates) {
      const metaTemplateId = String(item.id || "");
      const nome = String(item.name || "");
      const categoria = String(item.category || "UTILITY");
      const idioma = String(item.language || "pt_BR");
      const status = String(item.status || "desconhecido");

      const payload = {
        name: item.name ?? null,
        category: item.category ?? null,
        language: item.language ?? null,
        components: Array.isArray(item.components) ? item.components : [],
      };

      const { data: existente } = await supabaseAdmin
        .from("whatsapp_templates")
        .select("id")
        .eq("empresa_id", usuario.empresa_id)
        .eq("integracao_whatsapp_id", integracao.id)
        .eq("meta_template_id", metaTemplateId)
        .maybeSingle();

      if (existente?.id) {
        const { error: updateError } = await supabaseAdmin
          .from("whatsapp_templates")
          .update({
            nome,
            categoria,
            idioma,
            status,
            payload,
            resposta_meta: item,
            updated_by: usuario.id,
          })
          .eq("id", existente.id);

        if (!updateError) {
          atualizados += 1;
        }
      } else {
        const { error: insertError } = await supabaseAdmin
          .from("whatsapp_templates")
          .insert({
            empresa_id: usuario.empresa_id,
            integracao_whatsapp_id: integracao.id,
            waba_id: integracao.waba_id,
            meta_template_id: metaTemplateId,
            nome,
            categoria,
            idioma,
            status,
            payload,
            resposta_meta: item,
            created_by: usuario.id,
            updated_by: usuario.id,
          });

        if (!insertError) {
          inseridos += 1;
        }
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
    });
  } catch (error) {
    console.error("Erro ao sincronizar templates:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao sincronizar templates." },
      { status: 500 }
    );
  }
}