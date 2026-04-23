import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

  return { usuario };
}

function montarNomeConexaoPadrao(nomeEmpresa?: string | null) {
  if (nomeEmpresa && nomeEmpresa.trim()) {
    return `WhatsApp ${nomeEmpresa.trim()}`;
  }
  return "WhatsApp principal";
}

export async function GET() {
  try {
    const auth = await getUsuarioLogado();

    if ("error" in auth) {
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status }
      );
    }

    const { usuario } = auth;

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 🔍 Busca integração existente
    const { data: integracaoExistente, error: integracaoError } =
      await supabaseAdmin
        .from("integracoes_whatsapp")
        .select("*")
        .eq("empresa_id", usuario.empresa_id)
        .eq("provider", "meta_official")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (integracaoError) {
      return NextResponse.json(
        { ok: false, error: integracaoError.message },
        { status: 500 }
      );
    }

    // ✅ Se já existe, retorna
    if (integracaoExistente) {
      return NextResponse.json({
        ok: true,
        created: false,
        integracao: integracaoExistente,
      });
    }

    // 🔍 Busca empresa
    const { data: empresa, error: empresaError } = await supabaseAdmin
      .from("empresas")
      .select("id, nome_fantasia")
      .eq("id", usuario.empresa_id)
      .maybeSingle();

    if (empresaError || !empresa) {
      return NextResponse.json(
        { ok: false, error: "Empresa não encontrada." },
        { status: 404 }
      );
    }

    const agora = new Date().toISOString();

    // 🆕 Cria integração inicial
    const { data: novaIntegracao, error: createError } =
      await supabaseAdmin
        .from("integracoes_whatsapp")
        .insert({
          empresa_id: usuario.empresa_id,
          nome_conexao: montarNomeConexaoPadrao(empresa.nome_fantasia),
          numero: `pendente_${usuario.empresa_id}`,
          provider: "meta_official",
          status: "pendente",
          webhook_verificado: false,

          // onboarding
          onboarding_etapa: "inicio",
          onboarding_status: "pendente",
          phone_registered: false,
          payment_method_added: false,
          app_assigned: false,

          config_json: {},

          created_at: agora,
          updated_at: agora,
        })
        .select("*")
        .single();

    if (createError) {
      return NextResponse.json(
        { ok: false, error: createError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      created: true,
      integracao: novaIntegracao,
    });
  } catch (error) {
    console.error("Erro ao iniciar integração WhatsApp:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno." },
      { status: 500 }
    );
  }
}