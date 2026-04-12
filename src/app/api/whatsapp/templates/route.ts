import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissoes/frontend";
import { listarPermissoesDoUsuario } from "@/lib/permissoes/can";
import {
  createMetaTemplate,
  normalizeTemplateName,
  validateTemplateInput,
  type CreateTemplateInput,
} from "@/lib/whatsapp/templates";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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

  return { supabase, usuario, permissoes };
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

    const { supabase, usuario, permissoes } = auth;

    if (!can(permissoes, "whatsapp_templates.criar")) {
      return NextResponse.json(
        { ok: false, error: "Sem permissão para criar template." },
        { status: 403 }
      );
    }

    const body = await req.json();

    const integracaoWhatsAppId = String(body.integracao_whatsapp_id || "").trim();

    console.log("integracaoWhatsAppId recebido:", integracaoWhatsAppId);
    console.log("usuario.empresa_id:", usuario.empresa_id);

    const input: CreateTemplateInput = {
      name: normalizeTemplateName(String(body.name || "")),
      category: body.category,
      language: body.language || "pt_BR",
      components: Array.isArray(body.components) ? body.components : [],
    };

    const errors = validateTemplateInput(input);

    if (!integracaoWhatsAppId) {
      errors.push("Integração WhatsApp é obrigatória.");
    }

    if (!usuario.empresa_id) {
      errors.push("Usuário sem empresa vinculada.");
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { ok: false, error: errors.join(" ") },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: integracao, error: integracaoError } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .select("id, empresa_id, waba_id, token_ref, status, nome_conexao")
      .eq("id", integracaoWhatsAppId)
      .eq("empresa_id", usuario.empresa_id)
      .single();

    console.log("integracao encontrada:", integracao);
    console.log("erro integracao:", integracaoError);

    if (integracaoError || !integracao) {
      return NextResponse.json(
        { ok: false, error: "Integração WhatsApp não encontrada." },
        { status: 404 }
      );
    }

    if (!integracao.waba_id) {
      return NextResponse.json(
        { ok: false, error: "Esta integração não possui WABA ID configurado." },
        { status: 400 }
      );
    }

    if (integracao.status !== "ativa") {
      return NextResponse.json(
        { ok: false, error: "A integração WhatsApp não está ativa." },
        { status: 400 }
      );
    }

    // Ajuste aqui depois para buscar token por token_ref, vault, etc.
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: "WHATSAPP_ACCESS_TOKEN não configurado no servidor." },
        { status: 500 }
      );
    }

    const metaResponse = await createMetaTemplate({
      wabaId: integracao.waba_id,
      accessToken,
      data: input,
    });

    console.log("metaResponse.ok:", metaResponse.ok);
    console.log("metaResponse.status:", metaResponse.status);
    console.log("metaResponse.data:", JSON.stringify(metaResponse.data, null, 2));

    const templateStatus = metaResponse.ok
      ? String(metaResponse.data?.status || "PENDING")
      : "erro_envio";

    const metaTemplateId =
      metaResponse.data?.id ||
      metaResponse.data?.template_id ||
      null;

    const { data: created, error: insertError } = await supabaseAdmin
      .from("whatsapp_templates")
      .insert({
        empresa_id: usuario.empresa_id,
        integracao_whatsapp_id: integracao.id,
        waba_id: integracao.waba_id,
        meta_template_id: metaTemplateId,
        nome: input.name,
        categoria: input.category,
        idioma: input.language,
        status: templateStatus,
        payload: input,
        resposta_meta: metaResponse.data,
        created_by: usuario.id,
        updated_by: usuario.id,
      })
      .select("*")
      .single();

    if (insertError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Template enviado ao Meta, mas falhou ao salvar no banco.",
          db_error: insertError.message,
          meta: metaResponse.data,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: metaResponse.ok,
      data: created,
      meta: metaResponse.data,
      status_http_meta: metaResponse.status,
    });
  } catch (error) {
    console.error("Erro ao criar template:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao criar template." },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getUsuarioLogado();

    if ("error" in auth) {
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status }
      );
    }

    const { usuario, permissoes } = auth;

    if (!can(permissoes, "whatsapp_templates.visualizar")) {
      return NextResponse.json(
        { ok: false, error: "Sem permissão para visualizar templates." },
        { status: 403 }
      );
    }

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const integracaoWhatsAppId = searchParams.get("integracao_whatsapp_id");

    const supabaseAdmin = getSupabaseAdmin();

    let query = supabaseAdmin
      .from("whatsapp_templates")
      .select("*")
      .eq("empresa_id", usuario.empresa_id)
      .order("created_at", { ascending: false });

    if (integracaoWhatsAppId) {
      query = query.eq("integracao_whatsapp_id", integracaoWhatsAppId);
    }

    const { data, error } = await query;

    console.log("templates listados:", data);
    console.log("erro ao listar templates:", error);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: data || [],
    });
  } catch (error) {
    console.error("Erro ao listar templates:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao listar templates." },
      { status: 500 }
    );
  }
}