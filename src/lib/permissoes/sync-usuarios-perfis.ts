import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

export async function buscarPerfilDinamicoPorId(params: {
  perfilEmpresaId: string;
  empresaId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("perfis_empresa")
    .select("id, empresa_id, nome, ativo")
    .eq("id", params.perfilEmpresaId)
    .eq("empresa_id", params.empresaId)
    .eq("ativo", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar perfil dinâmico por id: ${error.message}`);
  }

  return data ?? null;
}

async function limparPerfisDoUsuario(usuarioId: string) {
  const { error } = await supabaseAdmin
    .from("usuarios_perfis")
    .delete()
    .eq("usuario_id", usuarioId);

  if (error) {
    throw new Error(
      `Erro ao limpar perfis dinâmicos do usuário: ${error.message}`
    );
  }
}

async function vincularPerfilAoUsuario(params: {
  usuarioId: string;
  perfilEmpresaId: string;
}) {
  const { error } = await supabaseAdmin
    .from("usuarios_perfis")
    .insert([
      {
        usuario_id: params.usuarioId,
        perfil_empresa_id: params.perfilEmpresaId,
      },
    ]);

  if (error) {
    throw new Error(
      `Erro ao vincular perfil dinâmico ao usuário: ${error.message}`
    );
  }
}

export async function resolverPerfilDinamicoPorId(params: {
  empresaId: string;
  perfilEmpresaId: string;
}) {
  const perfilDinamico = await buscarPerfilDinamicoPorId({
    perfilEmpresaId: params.perfilEmpresaId,
    empresaId: params.empresaId,
  });

  if (!perfilDinamico) {
    throw new Error("Perfil dinâmico não encontrado para esta empresa.");
  }

  return {
    perfilDinamico,
  };
}

export async function definirPerfilDinamicoPorIdDoUsuario(params: {
  usuarioId: string;
  empresaId: string;
  perfilEmpresaId: string;
}) {
  const perfilDinamico = await buscarPerfilDinamicoPorId({
    perfilEmpresaId: params.perfilEmpresaId,
    empresaId: params.empresaId,
  });

  if (!perfilDinamico) {
    throw new Error("Perfil dinâmico não encontrado para esta empresa.");
  }

  await limparPerfisDoUsuario(params.usuarioId);

  await vincularPerfilAoUsuario({
    usuarioId: params.usuarioId,
    perfilEmpresaId: perfilDinamico.id,
  });

  return {
    perfilDinamico,
  };
}