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

function podeGerenciarConversas(
  perfil: UsuarioSistema["perfil"]
) {
  return ["super_admin", "admin_empresa", "supervisor", "atendente"].includes(
    perfil
  );
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

  if (!podeGerenciarConversas(usuario.perfil)) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para listar conversas" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const prioridade = searchParams.get("prioridade");
  const contatoId = searchParams.get("contato_id");
  const setorId = searchParams.get("setor_id");
  const responsavelId = searchParams.get("responsavel_id");

  let query = supabaseAdmin
    .from("conversas")
    .select(`
      *,
      contatos (
        id,
        nome,
        telefone,
        email
      ),
      setores (
        id,
        nome
      ),
      responsavel:usuarios (
        id,
        nome,
        email
      ),
      integracoes_whatsapp (
        id,
        nome_conexao,
        numero
      )
    `)
    .order("created_at", { ascending: false });

  if (usuario.perfil !== "super_admin") {
    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada" },
        { status: 400 }
      );
    }

    query = query.eq("empresa_id", usuario.empresa_id);

    if (usuario.perfil === "atendente") {
      query = query.eq("responsavel_id", usuario.id);
    }

    if (usuario.perfil === "supervisor" && usuario.setor_id) {
      query = query.eq("setor_id", usuario.setor_id);
    }
  }

  if (
    status &&
    [
      "aberta",
      "bot",
      "fila",
      "em_atendimento",
      "aguardando_cliente",
      "encerrada",
    ].includes(status)
  ) {
    query = query.eq("status", status);
  }

  if (prioridade && ["baixa", "media", "alta", "urgente"].includes(prioridade)) {
    query = query.eq("prioridade", prioridade);
  }

  if (contatoId) {
    query = query.eq("contato_id", contatoId);
  }

  if (setorId) {
    query = query.eq("setor_id", setorId);
  }

  if (responsavelId) {
    query = query.eq("responsavel_id", responsavelId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    conversas: data ?? [],
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

  if (!podeGerenciarConversas(usuario.perfil)) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para criar conversa" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const contato_id = body?.contato_id || null;
  const setor_id = body?.setor_id || null;
  const responsavel_id = body?.responsavel_id || null;
  const integracao_whatsapp_id = body?.integracao_whatsapp_id || null;
  const status = body?.status || "aberta";
  const canal = body?.canal || "whatsapp";
  const origem_atendimento = body?.origem_atendimento || "manual";
  const prioridade = body?.prioridade || "media";
  const assunto = body?.assunto?.trim() || null;
  const empresa_id =
    usuario.perfil === "super_admin"
      ? body?.empresa_id || usuario.empresa_id || null
      : usuario.empresa_id;

  if (!empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Empresa é obrigatória" },
      { status: 400 }
    );
  }

  if (!contato_id) {
    return NextResponse.json(
      { ok: false, error: "Contato é obrigatório" },
      { status: 400 }
    );
  }

  if (
    ![
      "aberta",
      "bot",
      "fila",
      "em_atendimento",
      "aguardando_cliente",
      "encerrada",
    ].includes(status)
  ) {
    return NextResponse.json(
      { ok: false, error: "Status inválido" },
      { status: 400 }
    );
  }

  if (!["whatsapp"].includes(canal)) {
    return NextResponse.json(
      { ok: false, error: "Canal inválido" },
      { status: 400 }
    );
  }

  if (
    !["entrada_cliente", "bot", "manual", "reativacao"].includes(
      origem_atendimento
    )
  ) {
    return NextResponse.json(
      { ok: false, error: "Origem de atendimento inválida" },
      { status: 400 }
    );
  }

  if (!["baixa", "media", "alta", "urgente"].includes(prioridade)) {
    return NextResponse.json(
      { ok: false, error: "Prioridade inválida" },
      { status: 400 }
    );
  }

  const { data: empresa } = await supabaseAdmin
    .from("empresas")
    .select("id")
    .eq("id", empresa_id)
    .maybeSingle();

  if (!empresa) {
    return NextResponse.json(
      { ok: false, error: "Empresa não encontrada" },
      { status: 404 }
    );
  }

  const { data: contato } = await supabaseAdmin
    .from("contatos")
    .select("id, empresa_id")
    .eq("id", contato_id)
    .maybeSingle();

  if (!contato) {
    return NextResponse.json(
      { ok: false, error: "Contato não encontrado" },
      { status: 404 }
    );
  }

  if (contato.empresa_id !== empresa_id) {
    return NextResponse.json(
      { ok: false, error: "O contato não pertence à empresa selecionada" },
      { status: 400 }
    );
  }

  if (setor_id) {
    const { data: setor } = await supabaseAdmin
      .from("setores")
      .select("id, empresa_id")
      .eq("id", setor_id)
      .maybeSingle();

    if (!setor) {
      return NextResponse.json(
        { ok: false, error: "Setor não encontrado" },
        { status: 404 }
      );
    }

    if (setor.empresa_id !== empresa_id) {
      return NextResponse.json(
        { ok: false, error: "O setor não pertence à empresa selecionada" },
        { status: 400 }
      );
    }
  }

  if (responsavel_id) {
    const { data: responsavel } = await supabaseAdmin
      .from("usuarios")
      .select("id, empresa_id")
      .eq("id", responsavel_id)
      .maybeSingle();

    if (!responsavel) {
      return NextResponse.json(
        { ok: false, error: "Responsável não encontrado" },
        { status: 404 }
      );
    }

    if (responsavel.empresa_id !== empresa_id) {
      return NextResponse.json(
        { ok: false, error: "O responsável não pertence à empresa selecionada" },
        { status: 400 }
      );
    }
  }

  if (integracao_whatsapp_id) {
    const { data: integracao } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .select("id, empresa_id")
      .eq("id", integracao_whatsapp_id)
      .maybeSingle();

    if (!integracao) {
      return NextResponse.json(
        { ok: false, error: "Integração WhatsApp não encontrada" },
        { status: 404 }
      );
    }

    if (integracao.empresa_id !== empresa_id) {
      return NextResponse.json(
        { ok: false, error: "A integração não pertence à empresa selecionada" },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabaseAdmin
    .from("conversas")
    .insert([
      {
        empresa_id,
        contato_id,
        setor_id,
        responsavel_id,
        integracao_whatsapp_id,
        status,
        canal,
        origem_atendimento,
        prioridade,
        assunto,
      },
    ])
    .select(`
      *,
      contatos (
        id,
        nome,
        telefone,
        email
      ),
      setores (
        id,
        nome
      ),
      responsavel:usuarios (
        id,
        nome,
        email
      )
    `)
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Conversa criada com sucesso",
    conversa: data,
  });
}