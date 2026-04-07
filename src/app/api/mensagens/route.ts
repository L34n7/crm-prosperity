import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

type UsuarioSistema = {
  id: string;
  empresa_id: string | null;
  perfil: "super_admin" | "admin_empresa" | "supervisor" | "atendente";
  status: "ativo" | "inativo" | "bloqueado";
  setor_id?: string | null;
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
    .select("id, empresa_id, perfil, status, setor_id")
    .eq("auth_user_id", user.id)
    .maybeSingle<UsuarioSistema>();

  if (usuarioError) {
    return {
      error: "Erro ao buscar usuário do sistema",
      status: 500 as const,
    };
  }

  if (!usuario) {
    return {
      error: "Usuário não encontrado na tabela usuarios",
      status: 404 as const,
    };
  }

  if (usuario.status !== "ativo") {
    return {
      error: "Usuário inativo ou bloqueado",
      status: 403 as const,
    };
  }

  return { usuario };
}

function podeGerenciarMensagens(perfil: UsuarioSistema["perfil"]) {
  return ["super_admin", "admin_empresa", "supervisor", "atendente"].includes(
    perfil
  );
}

function usuarioPodeAcessarConversa(
  usuario: UsuarioSistema,
  conversa: {
    empresa_id: string;
    setor_id: string | null;
    responsavel_id: string | null;
    status?: string | null;
  }
) {
  if (usuario.perfil === "super_admin") return true;

  if (!usuario.empresa_id || conversa.empresa_id !== usuario.empresa_id) {
    return false;
  }

  if (usuario.perfil === "admin_empresa") return true;

  if (usuario.perfil === "supervisor") {
    if (!usuario.setor_id) return false;
    return conversa.setor_id === usuario.setor_id;
  }

  if (usuario.perfil === "atendente") {
    if (conversa.responsavel_id === usuario.id) {
      return true;
    }

    if (
      usuario.setor_id &&
      conversa.setor_id === usuario.setor_id &&
      conversa.responsavel_id === null &&
      conversa.status === "fila"
    ) {
      return true;
    }

    return false;
  }

  return false;
}

export async function GET(request: Request) {
  const resultado = await getUsuarioLogado();

  if ("error" in resultado) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!podeGerenciarMensagens(usuario.perfil)) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para listar mensagens" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const conversaId = searchParams.get("conversa_id");

  if (!conversaId) {
    return NextResponse.json(
      { ok: false, error: "conversa_id é obrigatório" },
      { status: 400 }
    );
  }

  const { data: conversa, error: conversaError } = await supabaseAdmin
    .from("conversas")
    .select("id, empresa_id, setor_id, responsavel_id, status")
    .eq("id", conversaId)
    .maybeSingle();

  if (conversaError) {
    return NextResponse.json(
      { ok: false, error: conversaError.message },
      { status: 500 }
    );
  }

  if (!conversa) {
    return NextResponse.json(
      { ok: false, error: "Conversa não encontrada" },
      { status: 404 }
    );
  }

  if (!usuarioPodeAcessarConversa(usuario, conversa)) {
    return NextResponse.json(
      { ok: false, error: "Você não pode acessar as mensagens desta conversa" },
      { status: 403 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("mensagens")
    .select("*")
    .eq("conversa_id", conversaId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    mensagens: data ?? [],
  });
}

export async function POST(request: Request) {
  const resultado = await getUsuarioLogado();

  if ("error" in resultado) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!podeGerenciarMensagens(usuario.perfil)) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para criar mensagem" },
      { status: 403 }
    );
  }

  const body = await request.json();

  const conversa_id = body?.conversa_id || null;
  const remetente_tipo = body?.remetente_tipo || "usuario";
  const remetente_id = body?.remetente_id || usuario.id;
  const conteudo = body?.conteudo?.trim();
  const tipo_mensagem = body?.tipo_mensagem || "texto";
  const origem = body?.origem || "enviada";
  const status_envio = body?.status_envio || "enviada";

  if (!conversa_id) {
    return NextResponse.json(
      { ok: false, error: "Conversa é obrigatória" },
      { status: 400 }
    );
  }

  if (!conteudo) {
    return NextResponse.json(
      { ok: false, error: "Conteúdo da mensagem é obrigatório" },
      { status: 400 }
    );
  }

  if (!["contato", "bot", "ia", "usuario", "sistema"].includes(remetente_tipo)) {
    return NextResponse.json(
      { ok: false, error: "remetente_tipo inválido" },
      { status: 400 }
    );
  }

  if (
    !["texto", "imagem", "audio", "video", "documento", "template", "botao", "lista"].includes(
      tipo_mensagem
    )
  ) {
    return NextResponse.json(
      { ok: false, error: "tipo_mensagem inválido" },
      { status: 400 }
    );
  }

  if (!["recebida", "enviada", "automatica"].includes(origem)) {
    return NextResponse.json(
      { ok: false, error: "origem inválida" },
      { status: 400 }
    );
  }

  if (!["pendente", "enviada", "entregue", "lida", "falha"].includes(status_envio)) {
    return NextResponse.json(
      { ok: false, error: "status_envio inválido" },
      { status: 400 }
    );
  }

  const { data: conversa, error: conversaError } = await supabaseAdmin
    .from("conversas")
    .select("id, empresa_id, setor_id, responsavel_id, status")
    .eq("id", conversa_id)
    .maybeSingle();

  if (conversaError) {
    return NextResponse.json(
      { ok: false, error: conversaError.message },
      { status: 500 }
    );
  }

  if (!conversa) {
    return NextResponse.json(
      { ok: false, error: "Conversa não encontrada" },
      { status: 404 }
    );
  }

  if (!usuarioPodeAcessarConversa(usuario, conversa)) {
    return NextResponse.json(
      { ok: false, error: "Você não pode enviar mensagem nesta conversa" },
      { status: 403 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("mensagens")
    .insert([
      {
        empresa_id: conversa.empresa_id,
        conversa_id,
        remetente_tipo,
        remetente_id,
        conteudo,
        tipo_mensagem,
        origem,
        status_envio,
      },
    ])
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  await supabaseAdmin
    .from("conversas")
    .update({
      last_message_at: new Date().toISOString(),
    })
    .eq("id", conversa_id);

  return NextResponse.json({
    ok: true,
    message: "Mensagem criada com sucesso",
    mensagem: data,
  });
}