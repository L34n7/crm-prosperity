import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

const PERMISSAO_GERENCIAR_PERFIS = "perfis.alterar_permissoes";

type EfeitoPermissao = "permitir" | "bloquear";

type OverridePermissao = {
  permissao_codigo: string;
  efeito: EfeitoPermissao;
};

type ValidarAdminGerenciadorInput = {
  empresaId: string;
  perfilAlterado?: {
    perfilEmpresaId: string;
    permissoes: string[];
  };
  usuarioAlterado?: {
    usuarioId: string;
    permissoes: OverridePermissao[];
  };
};

export async function empresaManteraAdminGerenciador(
  input: ValidarAdminGerenciadorInput
) {
  const { data: usuarios, error: usuariosError } = await supabaseAdmin
    .from("usuarios")
    .select("id")
    .eq("empresa_id", input.empresaId)
    .eq("status", "ativo");

  if (usuariosError) {
    throw new Error(
      `Erro ao listar administradores ativos: ${usuariosError.message}`
    );
  }

  const usuarioIds = (usuarios || []).map((usuario) => usuario.id);

  if (usuarioIds.length === 0) return false;

  const { data: vinculos, error: vinculosError } = await supabaseAdmin
    .from("usuarios_perfis")
    .select("usuario_id, perfil_empresa_id")
    .in("usuario_id", usuarioIds);

  if (vinculosError) {
    throw new Error(
      `Erro ao listar perfis dos administradores: ${vinculosError.message}`
    );
  }

  const perfilIds = Array.from(
    new Set((vinculos || []).map((vinculo) => vinculo.perfil_empresa_id))
  );

  if (perfilIds.length === 0) return false;

  const [
    { data: perfis, error: perfisError },
    { data: permissoesPerfis, error: permissoesPerfisError },
    { data: overrides, error: overridesError },
  ] = await Promise.all([
    supabaseAdmin
      .from("perfis_empresa")
      .select("id, nome, ativo")
      .in("id", perfilIds),
    supabaseAdmin
      .from("perfil_permissoes")
      .select("perfil_empresa_id")
      .in("perfil_empresa_id", perfilIds)
      .eq("permissao_codigo", PERMISSAO_GERENCIAR_PERFIS),
    supabaseAdmin
      .from("usuario_permissoes")
      .select("usuario_id, efeito")
      .eq("empresa_id", input.empresaId)
      .eq("permissao_codigo", PERMISSAO_GERENCIAR_PERFIS),
  ]);

  if (perfisError || permissoesPerfisError || overridesError) {
    throw new Error(
      `Erro ao validar administrador gerenciador: ${
        perfisError?.message ||
        permissoesPerfisError?.message ||
        overridesError?.message
      }`
    );
  }

  const perfisAtivos = new Set(
    (perfis || []).filter((perfil) => perfil.ativo).map((perfil) => perfil.id)
  );
  const perfisAdministradores = new Set(
    (perfis || [])
      .filter((perfil) => perfil.ativo && perfil.nome === "Administrador")
      .map((perfil) => perfil.id)
  );
  const perfisComPermissao = new Set(
    (permissoesPerfis || []).map((item) => item.perfil_empresa_id)
  );
  const overridePorUsuario = new Map(
    (overrides || []).map((item) => [item.usuario_id, item.efeito])
  );

  if (input.perfilAlterado) {
    if (
      input.perfilAlterado.permissoes.includes(PERMISSAO_GERENCIAR_PERFIS)
    ) {
      perfisComPermissao.add(input.perfilAlterado.perfilEmpresaId);
    } else {
      perfisComPermissao.delete(input.perfilAlterado.perfilEmpresaId);
    }
  }

  if (input.usuarioAlterado) {
    const override = input.usuarioAlterado.permissoes.find(
      (item) => item.permissao_codigo === PERMISSAO_GERENCIAR_PERFIS
    );

    if (override) {
      overridePorUsuario.set(input.usuarioAlterado.usuarioId, override.efeito);
    } else {
      overridePorUsuario.delete(input.usuarioAlterado.usuarioId);
    }
  }

  const perfisPorUsuario = new Map<string, string[]>();

  for (const vinculo of vinculos || []) {
    const lista = perfisPorUsuario.get(vinculo.usuario_id) || [];
    lista.push(vinculo.perfil_empresa_id);
    perfisPorUsuario.set(vinculo.usuario_id, lista);
  }

  return usuarioIds.some((usuarioId) => {
    const perfisUsuario = perfisPorUsuario.get(usuarioId) || [];
    const ehAdministrador = perfisUsuario.some((perfilId) =>
      perfisAdministradores.has(perfilId)
    );

    if (!ehAdministrador) return false;

    const override = overridePorUsuario.get(usuarioId);

    if (override === "bloquear") return false;
    if (override === "permitir") return true;

    return perfisUsuario.some(
      (perfilId) =>
        perfisAtivos.has(perfilId) && perfisComPermissao.has(perfilId)
    );
  });
}
