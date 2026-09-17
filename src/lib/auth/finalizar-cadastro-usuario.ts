import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isPermissaoInternaOculta } from "@/lib/permissoes/internas";

const supabaseAdmin = getSupabaseAdmin();

type UsuarioRow = {
  id: string;
  empresa_id: string | null;
  auth_user_id?: string | null;
};

async function garantirConfiguracaoEmpresa(empresaId: string) {
  const { data } = await supabaseAdmin
    .from("configuracoes_empresa")
    .select("empresa_id")
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (data) return;

  const { error } = await supabaseAdmin
    .from("configuracoes_empresa")
    .insert({ empresa_id: empresaId });

  if (error) {
    throw new Error(`Erro ao criar configuracao da empresa: ${error.message}`);
  }
}

async function garantirBootstrapAdminEmpresa(params: {
  empresaId: string;
  usuarioId: string;
}) {
  const { empresaId, usuarioId } = params;

  await garantirConfiguracaoEmpresa(empresaId);

  const { count: totalPerfis, error: totalPerfisError } = await supabaseAdmin
    .from("perfis_empresa")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId);

  if (totalPerfisError) {
    throw new Error(`Erro ao verificar perfis: ${totalPerfisError.message}`);
  }

  if ((totalPerfis ?? 0) > 0) return;

  const { data: setorExistente, error: setorBuscaError } = await supabaseAdmin
    .from("setores")
    .select("id")
    .eq("empresa_id", empresaId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (setorBuscaError) {
    throw new Error(`Erro ao buscar setor inicial: ${setorBuscaError.message}`);
  }

  let setorId = setorExistente?.id ?? null;

  if (!setorId) {
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
      .single();

    if (setorError || !setor) {
      throw new Error(`Erro ao criar setor inicial: ${setorError?.message}`);
    }

    setorId = setor.id;
  }

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
    .single();

  if (perfilError || !perfil) {
    throw new Error(`Erro ao criar perfil administrador: ${perfilError?.message}`);
  }

  const { data: permissoes, error: permissoesError } = await supabaseAdmin
    .from("permissoes")
    .select("codigo");

  if (permissoesError) {
    throw new Error(`Erro ao buscar permissoes: ${permissoesError.message}`);
  }

  const permissoesGerenciaveis =
    permissoes?.filter((item) => !isPermissaoInternaOculta(item.codigo)) || [];

  if (permissoesGerenciaveis.length) {
    const { error: perfilPermissoesError } = await supabaseAdmin
      .from("perfil_permissoes")
      .insert(
        permissoesGerenciaveis.map((item) => ({
          perfil_empresa_id: perfil.id,
          permissao_codigo: item.codigo,
        }))
      );

    if (perfilPermissoesError) {
      throw new Error(
        `Erro ao vincular permissoes ao administrador: ${perfilPermissoesError.message}`
      );
    }
  }

  const { error: usuarioPerfilError } = await supabaseAdmin
    .from("usuarios_perfis")
    .insert({
      usuario_id: usuarioId,
      perfil_empresa_id: perfil.id,
    });

  if (usuarioPerfilError) {
    throw new Error(`Erro ao vincular usuario ao perfil: ${usuarioPerfilError.message}`);
  }

  const { error: usuarioSetorError } = await supabaseAdmin
    .from("usuarios_setores")
    .insert({
      usuario_id: usuarioId,
      setor_id: setorId,
      is_principal: true,
    });

  if (usuarioSetorError) {
    throw new Error(`Erro ao vincular usuario ao setor: ${usuarioSetorError.message}`);
  }
}

export async function finalizarCadastroAuthUser(authUser: User) {
  const email = authUser.email?.trim().toLowerCase();

  if (!email) {
    throw new Error("Usuário sem email.");
  }

  const telefone = authUser.user_metadata?.telefone ?? null;
  const nome =
    authUser.user_metadata?.nome ||
    authUser.email?.split("@")[0] ||
    "Usuário";

  const { data: usuarioExistente, error: erroBuscaUsuario } = await supabaseAdmin
    .from("usuarios")
    .select("*")
    .eq("email", email)
    .limit(1)
    .maybeSingle();

  if (erroBuscaUsuario) {
    throw new Error(erroBuscaUsuario.message);
  }

  let usuario = usuarioExistente;
  const empresaId =
    authUser.user_metadata?.empresa_id ?? usuarioExistente?.empresa_id ?? null;

  if (!empresaId) {
    throw new Error("empresa_id ausente no cadastro.");
  }

  if (!usuario) {
    const { data: novoUsuario, error: erroNovoUsuario } = await supabaseAdmin
      .from("usuarios")
      .insert({
        empresa_id: empresaId,
        auth_user_id: authUser.id,
        nome,
        email,
        senha_hash: null,
        status: "ativo",
        telefone,
        avatar_url: null,
        ultimo_acesso: null,
        documento: null,
        cpf: null,
        rg: null,
        rg_uf: null,
        cidade: null,
        estado: null,
        data_nascimento: null,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (erroNovoUsuario || !novoUsuario) {
      throw new Error(erroNovoUsuario?.message || "Erro ao criar usuário.");
    }

    usuario = novoUsuario;
  } else if (!(usuario as UsuarioRow).auth_user_id) {
    const { data: usuarioAtualizado, error: erroAtualizacao } = await supabaseAdmin
      .from("usuarios")
      .update({
        auth_user_id: authUser.id,
        empresa_id: empresaId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", usuario.id)
      .select("*")
      .single();

    if (erroAtualizacao || !usuarioAtualizado) {
      throw new Error(
        erroAtualizacao?.message || "Erro ao vincular usuário à autenticação."
      );
    }

    usuario = usuarioAtualizado;
  }

  await garantirBootstrapAdminEmpresa({
    empresaId,
    usuarioId: (usuario as UsuarioRow).id,
  });

  const { data: lead, error: erroLead } = await supabaseAdmin
    .from("leads_cadastro")
    .select("*")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (erroLead) {
    throw new Error(erroLead.message);
  }

  if (lead) {
    const { error: erroAtualizacaoLead } = await supabaseAdmin
      .from("leads_cadastro")
      .update({
        status: "convertido",
        usuario_id: usuario.id,
        empresa_id: empresaId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id);

    if (erroAtualizacaoLead) {
      throw new Error(erroAtualizacaoLead.message);
    }
  }

  return {
    usuario_id: usuario.id as string,
    empresa_id: empresaId as string,
  };
}
