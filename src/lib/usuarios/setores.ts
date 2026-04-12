import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

export type VinculoUsuarioSetor = {
  id: string;
  usuario_id: string;
  setor_id: string;
  is_principal: boolean;
  created_at: string;
};

export async function listarSetoresDoUsuario(usuarioId: string) {
  const { data, error } = await supabaseAdmin
    .from("usuarios_setores")
    .select("id, usuario_id, setor_id, is_principal, created_at")
    .eq("usuario_id", usuarioId)
    .order("is_principal", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Erro ao listar setores do usuário: ${error.message}`);
  }

  return (data ?? []) as VinculoUsuarioSetor[];
}

export async function listarIdsSetoresDoUsuario(usuarioId: string) {
  const vinculos = await listarSetoresDoUsuario(usuarioId);
  return vinculos.map((item) => item.setor_id);
}

export async function usuarioPertenceAoSetor(
  usuarioId: string,
  setorId: string | null | undefined
) {
  if (!setorId) return false;

  const { data, error } = await supabaseAdmin
    .from("usuarios_setores")
    .select("id")
    .eq("usuario_id", usuarioId)
    .eq("setor_id", setorId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao validar setor do usuário: ${error.message}`);
  }

  return !!data;
}

export async function buscarSetorPrincipalDoUsuario(usuarioId: string) {
  const { data, error } = await supabaseAdmin
    .from("usuarios_setores")
    .select("id, usuario_id, setor_id, is_principal, created_at")
    .eq("usuario_id", usuarioId)
    .eq("is_principal", true)
    .order("created_at", { ascending: true })
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar setor principal do usuário: ${error.message}`);
  }

  return (data as VinculoUsuarioSetor | null) ?? null;
}

export async function definirSetoresDoUsuario(
  usuarioId: string,
  setorIds: string[],
  setorPrincipalId?: string | null
) {
  const setorIdsUnicos = Array.from(
    new Set(
      (setorIds ?? [])
        .filter(Boolean)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );

  if (setorIdsUnicos.length === 0) {
    const { error: deleteError } = await supabaseAdmin
      .from("usuarios_setores")
      .delete()
      .eq("usuario_id", usuarioId);

    if (deleteError) {
      throw new Error(`Erro ao limpar setores do usuário: ${deleteError.message}`);
    }

    return [];
  }

  const principalValido =
    setorPrincipalId && setorIdsUnicos.includes(setorPrincipalId)
      ? setorPrincipalId
      : setorIdsUnicos[0];

  const { error: deleteError } = await supabaseAdmin
    .from("usuarios_setores")
    .delete()
    .eq("usuario_id", usuarioId);

  if (deleteError) {
    throw new Error(`Erro ao resetar setores do usuário: ${deleteError.message}`);
  }

  const payload = setorIdsUnicos.map((setorId) => ({
    usuario_id: usuarioId,
    setor_id: setorId,
    is_principal: setorId === principalValido,
  }));

  const { data, error } = await supabaseAdmin
    .from("usuarios_setores")
    .insert(payload)
    .select("id, usuario_id, setor_id, is_principal, created_at")
    .order("is_principal", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Erro ao definir setores do usuário: ${error.message}`);
  }

  return (data ?? []) as VinculoUsuarioSetor[];
}