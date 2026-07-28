import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

async function listarIdsPerfisAdministradorDaEmpresa(empresaId: string) {
  const { data, error } = await supabaseAdmin
    .from("perfis_empresa")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("nome", "Administrador")
    .eq("ativo", true);

  if (error) {
    throw new Error(`Erro ao buscar perfil Administrador: ${error.message}`);
  }

  return (data || [])
    .map((perfil) => String(perfil.id || "").trim())
    .filter(Boolean);
}

export async function listarIdsUsuariosAdministradoresDaEmpresa(
  empresaId: string
) {
  const empresaIdNormalizado = String(empresaId || "").trim();
  if (!empresaIdNormalizado) return [];

  const perfilIds = await listarIdsPerfisAdministradorDaEmpresa(
    empresaIdNormalizado
  );

  if (perfilIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("usuarios_perfis")
    .select("usuario_id")
    .in("perfil_empresa_id", perfilIds);

  if (error) {
    throw new Error(`Erro ao buscar administradores da empresa: ${error.message}`);
  }

  return Array.from(
    new Set(
      (data || [])
        .map((vinculo) => String(vinculo.usuario_id || "").trim())
        .filter(Boolean)
    )
  );
}

export async function usuarioEhAdministradorDaEmpresa(params: {
  usuarioId: string;
  empresaId: string;
}) {
  const usuarioId = String(params.usuarioId || "").trim();
  if (!usuarioId) return false;

  const administradores = await listarIdsUsuariosAdministradoresDaEmpresa(
    params.empresaId
  );

  return administradores.includes(usuarioId);
}
