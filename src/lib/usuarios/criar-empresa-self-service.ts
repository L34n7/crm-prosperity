import { getSupabaseAdmin } from "@/lib/supabase/admin";

type CriarEmpresaSelfServiceInput = {
  auth_user_id: string;
  nome_fantasia: string;
  razao_social?: string;
  documento?: string;
  email_empresa: string;
  telefone_empresa?: string;
  nome_responsavel?: string;
  nome_usuario: string;
  email_usuario: string;
  plano_slug: string;
};

type PlanoRow = {
  id: string;
  nome: string;
  slug: string;
  limite_usuarios: number;
};

type EmpresaRow = {
  id: string;
};

type UsuarioRow = {
  id: string;
};

type PerfilRow = {
  id: string;
};

type SetorRow = {
  id: string;
};

export async function criarEmpresaSelfService(
  input: CriarEmpresaSelfServiceInput
) {
  const supabaseAdmin = getSupabaseAdmin();

  const authUserId = input.auth_user_id.trim();
  const nomeFantasia = input.nome_fantasia.trim();
  const razaoSocial = (input.razao_social ?? "").trim();
  const documento = (input.documento ?? "").trim();
  const emailEmpresa = input.email_empresa.trim().toLowerCase();
  const telefoneEmpresa = (input.telefone_empresa ?? "").trim();
  const nomeResponsavel = (input.nome_responsavel ?? "").trim();
  const nomeUsuario = input.nome_usuario.trim();
  const emailUsuario = input.email_usuario.trim().toLowerCase();
  const planoSlug = input.plano_slug.trim().toLowerCase();

  if (!authUserId) {
    throw new Error("auth_user_id é obrigatório.");
  }

  if (!nomeFantasia) {
    throw new Error("Nome fantasia é obrigatório.");
  }

  if (!emailEmpresa) {
    throw new Error("Email da empresa é obrigatório.");
  }

  if (!nomeUsuario) {
    throw new Error("Nome do usuário é obrigatório.");
  }

  if (!emailUsuario) {
    throw new Error("Email do usuário é obrigatório.");
  }

  if (!planoSlug) {
    throw new Error("Plano é obrigatório.");
  }

  const {
    data: authUserResponse,
    error: authUserError,
  } = await supabaseAdmin.auth.admin.getUserById(authUserId);

  if (authUserError || !authUserResponse?.user) {
    throw new Error("Usuário de autenticação não encontrado.");
  }

  const authEmail = authUserResponse.user.email?.toLowerCase() ?? "";

  if (!authEmail || authEmail !== emailUsuario) {
    throw new Error("O email autenticado não corresponde ao email informado.");
  }

  const { data: usuarioExistentePorAuth } = await supabaseAdmin
    .from("usuarios")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (usuarioExistentePorAuth) {
    throw new Error("Este usuário já foi vinculado a uma empresa.");
  }

  const { data: usuarioExistentePorEmail } = await supabaseAdmin
    .from("usuarios")
    .select("id")
    .eq("email", emailUsuario)
    .maybeSingle();

  if (usuarioExistentePorEmail) {
    throw new Error("Já existe um usuário cadastrado com este email.");
  }

  const { data: plano, error: planoError } = await supabaseAdmin
    .from("planos")
    .select("id, nome, slug, limite_usuarios")
    .eq("slug", planoSlug)
    .eq("status", "ativo")
    .maybeSingle<PlanoRow>();

  if (planoError || !plano) {
    throw new Error("Plano padrão não encontrado.");
  }

  let empresaId: string | null = null;
  let usuarioId: string | null = null;
  let setorId: string | null = null;
  let perfilId: string | null = null;

  try {
    const { data: empresa, error: empresaError } = await supabaseAdmin
      .from("empresas")
      .insert({
        plano_id: plano.id,
        nome_fantasia: nomeFantasia,
        razao_social: razaoSocial || null,
        documento: documento || null,
        email: emailEmpresa,
        telefone: telefoneEmpresa || null,
        nome_responsavel: nomeResponsavel || null,
        status: "ativa",
        timezone: "America/Sao_Paulo",
      })
      .select("id")
      .single<EmpresaRow>();

    if (empresaError || !empresa) {
      throw new Error("Erro ao criar empresa.");
    }

    empresaId = empresa.id;

    const { data: usuario, error: usuarioError } = await supabaseAdmin
      .from("usuarios")
      .insert({
        empresa_id: empresaId,
        auth_user_id: authUserId,
        nome: nomeUsuario,
        email: emailUsuario,
        status: "ativo",
        nivel: "avancado",
      })
      .select("id")
      .single<UsuarioRow>();

    if (usuarioError || !usuario) {
      throw new Error("Erro ao criar usuário interno.");
    }

    usuarioId = usuario.id;

    const { error: configEmpresaError } = await supabaseAdmin
      .from("configuracoes_empresa")
      .insert({
        empresa_id: empresaId,
      });

    if (configEmpresaError) {
      throw new Error("Erro ao criar configurações iniciais da empresa.");
    }

    const { data: setor, error: setorError } = await supabaseAdmin
      .from("setores")
      .insert({
        empresa_id: empresaId,
        nome: "Geral",
        descricao: "Setor inicial criado automaticamente no cadastro.",
        status: "ativo",
        ativo: true,
        ordem_exibicao: 0,
        created_by: usuarioId,
        updated_by: usuarioId,
      })
      .select("id")
      .single<SetorRow>();

    if (setorError || !setor) {
      throw new Error("Erro ao criar setor inicial.");
    }

    setorId = setor.id;

    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from("perfis_empresa")
      .insert({
        empresa_id: empresaId,
        nome: "Administrador",
        descricao: "Perfil administrador criado automaticamente no cadastro.",
        ativo: true,
        created_by: usuarioId,
        updated_by: usuarioId,
      })
      .select("id")
      .single<PerfilRow>();

    if (perfilError || !perfil) {
      throw new Error("Erro ao criar perfil administrador.");
    }

    perfilId = perfil.id;

    const { data: permissoes, error: permissoesError } = await supabaseAdmin
      .from("permissoes")
      .select("codigo");

    if (permissoesError) {
      throw new Error("Erro ao buscar permissões.");
    }

    if (permissoes && permissoes.length > 0) {
      const payloadPermissoes = permissoes.map((item) => ({
        perfil_empresa_id: perfilId,
        permissao_codigo: item.codigo,
      }));

      const { error: perfilPermissoesError } = await supabaseAdmin
        .from("perfil_permissoes")
        .insert(payloadPermissoes);

      if (perfilPermissoesError) {
        throw new Error("Erro ao vincular permissões ao perfil administrador.");
      }
    }

    const { error: usuarioPerfilError } = await supabaseAdmin
      .from("usuarios_perfis")
      .insert({
        usuario_id: usuarioId,
        perfil_empresa_id: perfilId,
      });

    if (usuarioPerfilError) {
      throw new Error("Erro ao vincular usuário ao perfil administrador.");
    }

    const { error: usuarioSetorError } = await supabaseAdmin
      .from("usuarios_setores")
      .insert({
        usuario_id: usuarioId,
        setor_id: setorId,
        is_principal: true,
      });

    if (usuarioSetorError) {
      throw new Error("Erro ao vincular usuário ao setor inicial.");
    }

    const { error: logError } = await supabaseAdmin
      .from("logs_eventos")
      .insert({
        empresa_id: empresaId,
        usuario_id: usuarioId,
        tipo_evento: "cadastro_self_service",
        descricao: "Empresa criada via cadastro público.",
        metadata_json: {
          plano_slug: plano.slug,
          plano_nome: plano.nome,
          limite_usuarios: plano.limite_usuarios,
        },
      });

    if (logError) {
      throw new Error("Erro ao registrar log inicial.");
    }

    return {
      ok: true,
      message:
        "Cadastro concluído. Confirme seu email para acessar a plataforma.",
      empresa_id: empresaId,
      usuario_id: usuarioId,
    };
  } catch (error) {
    if (usuarioId) {
      await supabaseAdmin.from("usuarios_setores").delete().eq("usuario_id", usuarioId);
      await supabaseAdmin.from("usuarios_perfis").delete().eq("usuario_id", usuarioId);
    }

    if (perfilId) {
      await supabaseAdmin
        .from("perfil_permissoes")
        .delete()
        .eq("perfil_empresa_id", perfilId);

      await supabaseAdmin.from("perfis_empresa").delete().eq("id", perfilId);
    }

    if (setorId) {
      await supabaseAdmin.from("setores").delete().eq("id", setorId);
    }

    if (usuarioId) {
      await supabaseAdmin.from("usuarios").delete().eq("id", usuarioId);
    }

    if (empresaId) {
      await supabaseAdmin
        .from("configuracoes_empresa")
        .delete()
        .eq("empresa_id", empresaId);

      await supabaseAdmin.from("logs_eventos").delete().eq("empresa_id", empresaId);
      await supabaseAdmin.from("empresas").delete().eq("id", empresaId);
    }

    throw error;
  }
}