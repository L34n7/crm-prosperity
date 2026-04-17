import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { usuarioPertenceAoSetor } from "@/lib/usuarios/setores";

const supabaseAdmin = getSupabaseAdmin();

type RouteConversationToSectorParams = {
  conversaId: string;
  empresaId: string;
  setorId: string;
  preferSingleUserAutoAssign?: boolean;
};

type AssumeConversationParams = {
  conversaId: string;
  usuarioId: string;
  empresaId: string;
  setorId: string | null;
};

type TransferConversationByUserParams = {
  conversaId: string;
  empresaId: string;
  setorId: string;
};

type UsuarioAtivoSetor = {
  id: string;
  status: "ativo" | "inativo" | "bloqueado";
};

async function getActiveUsersFromSector(params: {
  empresaId: string;
  setorId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("usuarios_setores")
    .select(`
      usuario_id,
      usuarios!inner (
        id,
        status,
        empresa_id
      )
    `)
    .eq("setor_id", params.setorId)
    .eq("usuarios.empresa_id", params.empresaId)
    .eq("usuarios.status", "ativo");

  if (error) {
    throw new Error(`Erro ao buscar usuários ativos do setor: ${error.message}`);
  }

  const usuariosNormalizados = (data ?? [])
    .map((item) => {
      const usuario = Array.isArray(item.usuarios)
        ? item.usuarios[0]
        : item.usuarios;

      if (!usuario) return null;

      return {
        id: usuario.id,
        status: usuario.status,
      } as UsuarioAtivoSetor;
    })
    .filter(Boolean) as UsuarioAtivoSetor[];

  const usuariosUnicos = Array.from(
    new Map(usuariosNormalizados.map((usuario) => [usuario.id, usuario])).values()
  );

  return usuariosUnicos;
}

async function validateSector(params: {
  empresaId: string;
  setorId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("setores")
    .select("id, empresa_id, status")
    .eq("id", params.setorId)
    .eq("empresa_id", params.empresaId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao validar setor: ${error.message}`);
  }

  if (!data) {
    throw new Error("Setor de destino não encontrado para esta empresa.");
  }

  if (data.status !== "ativo") {
    throw new Error("O setor de destino está inativo.");
  }

  return data;
}

export async function routeConversationToSector({
  conversaId,
  empresaId,
  setorId,
  preferSingleUserAutoAssign = true,
}: RouteConversationToSectorParams) {
  await validateSector({ empresaId, setorId });

  const activeUsers = await getActiveUsersFromSector({
    empresaId,
    setorId,
  });

  const now = new Date().toISOString();

  if (preferSingleUserAutoAssign && activeUsers.length === 1) {
    const onlyUser = activeUsers[0];

    const { data, error } = await supabaseAdmin
      .from("conversas")
      .update({
        setor_id: setorId,
        responsavel_id: onlyUser.id,
        status: "em_atendimento",
        origem_atendimento: "manual",
        bot_ativo: false,
        fluxo_etapa: null,
        menu_aguardando_resposta: false,
        ultima_opcao_escolhida: null,
        tentativas_invalidas: 0,
        ultima_interacao_bot_em: now,
        closed_at: null,
      })
      .eq("id", conversaId)
      .eq("empresa_id", empresaId)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(
        `Erro ao atribuir conversa automaticamente ao único usuário do setor: ${
          error?.message ?? "sem retorno"
        }`
      );
    }

    return {
      mode: "usuario_auto" as const,
      responsavelId: onlyUser.id,
      conversa: data,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("conversas")
    .update({
      setor_id: setorId,
      responsavel_id: null,
      status: "fila",
      bot_ativo: false,
      fluxo_etapa: null,
      menu_aguardando_resposta: false,
      ultima_opcao_escolhida: null,
      tentativas_invalidas: 0,
      ultima_interacao_bot_em: now,
      closed_at: null,
    })
    .eq("id", conversaId)
    .eq("empresa_id", empresaId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `Erro ao direcionar conversa para fila do setor: ${
        error?.message ?? "sem retorno"
      }`
    );
  }

  return {
    mode: "fila_setor" as const,
    responsavelId: null,
    conversa: data,
  };
}

export async function assumeConversation({
  conversaId,
  usuarioId,
  empresaId,
  setorId,
}: AssumeConversationParams) {
  if (!setorId) {
    throw new Error("A conversa não possui setor definido.");
  }

  const { data: usuario, error: usuarioError } = await supabaseAdmin
    .from("usuarios")
    .select("id, empresa_id, status")
    .eq("id", usuarioId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (usuarioError) {
    throw new Error(`Erro ao buscar usuário: ${usuarioError.message}`);
  }

  if (!usuario) {
    throw new Error("Usuário não encontrado.");
  }

  if (usuario.status !== "ativo") {
    throw new Error("Usuário inativo ou bloqueado.");
  }

  const pertenceAoSetor = await usuarioPertenceAoSetor(usuario.id, setorId);

  if (!pertenceAoSetor) {
    throw new Error("O usuário não pertence ao setor da conversa.");
  }

  const { data, error } = await supabaseAdmin
    .from("conversas")
    .update({
      responsavel_id: usuarioId,
      status: "em_atendimento",
      origem_atendimento: "manual",
      bot_ativo: false,
      fluxo_etapa: null,
      menu_aguardando_resposta: false,
      ultima_opcao_escolhida: null,
      tentativas_invalidas: 0,
      closed_at: null,
    })
    .eq("id", conversaId)
    .eq("empresa_id", empresaId)
    .eq("setor_id", setorId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `Erro ao assumir conversa: ${error?.message ?? "sem retorno"}`
    );
  }

  return data;
}

export async function transferConversationByUser({
  conversaId,
  empresaId,
  setorId,
}: TransferConversationByUserParams) {
  return routeConversationToSector({
    conversaId,
    empresaId,
    setorId,
    preferSingleUserAutoAssign: true,
  });
}