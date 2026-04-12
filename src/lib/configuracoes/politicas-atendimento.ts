import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { UsuarioContexto } from "@/lib/auth/get-usuario-contexto";

const supabaseAdmin = getSupabaseAdmin();

type ConfiguracaoEmpresaRow = {
  empresa_id: string;

  permitir_transferir_sem_assumir: boolean;
  permitir_transferir_para_mesmo_setor: boolean;
  limpar_responsavel_ao_transferir: boolean;
  voltar_fila_ao_transferir: boolean;

  atendente_pode_transferir: boolean;
  supervisor_pode_transferir: boolean;
  administrador_pode_transferir: boolean;

  atendente_pode_reatribuir: boolean;
  supervisor_pode_reatribuir: boolean;
  administrador_pode_reatribuir: boolean;

  atendente_pode_atribuir: boolean;
  supervisor_pode_atribuir: boolean;
  administrador_pode_atribuir: boolean;

  atendente_pode_assumir: boolean;
  supervisor_pode_assumir: boolean;
  administrador_pode_assumir: boolean;

  permitir_assumir_conversa_em_fila: boolean;
  permitir_assumir_conversa_sem_responsavel: boolean;
  permitir_assumir_conversa_ja_atribuida: boolean;

  exigir_mesmo_setor_para_reatribuicao: boolean;
};

type ConfiguracaoUsuarioRow = {
  empresa_id: string;
  usuario_id: string;

  permitir_transferir_sem_assumir: boolean | null;
  permitir_transferir_para_mesmo_setor: boolean | null;
  limpar_responsavel_ao_transferir: boolean | null;
  voltar_fila_ao_transferir: boolean | null;

  pode_transferir: boolean | null;
  pode_reatribuir: boolean | null;
  pode_atribuir: boolean | null;
  pode_assumir: boolean | null;

  permitir_assumir_conversa_em_fila: boolean | null;
  permitir_assumir_conversa_sem_responsavel: boolean | null;
  permitir_assumir_conversa_ja_atribuida: boolean | null;

  exigir_mesmo_setor_para_reatribuicao: boolean | null;
};

export type PoliticaAtendimento = {
  permitir_transferir_sem_assumir: boolean;
  permitir_transferir_para_mesmo_setor: boolean;
  limpar_responsavel_ao_transferir: boolean;
  voltar_fila_ao_transferir: boolean;

  pode_transferir: boolean;
  pode_reatribuir: boolean;
  pode_atribuir: boolean;
  pode_assumir: boolean;

  permitir_assumir_conversa_em_fila: boolean;
  permitir_assumir_conversa_sem_responsavel: boolean;
  permitir_assumir_conversa_ja_atribuida: boolean;

  exigir_mesmo_setor_para_reatribuicao: boolean;
};

function resolverBooleanOverride(
  valorUsuario: boolean | null | undefined,
  valorEmpresa: boolean
): boolean {
  return typeof valorUsuario === "boolean" ? valorUsuario : valorEmpresa;
}

function nomePerfilPrincipal(usuario: UsuarioContexto): string {
  return (usuario.perfil_dinamico_principal?.nome ?? "").trim().toLowerCase();
}

function resolverPodeTransferirPorPerfil(
  usuario: UsuarioContexto,
  configEmpresa: ConfiguracaoEmpresaRow
): boolean {
  const perfil = nomePerfilPrincipal(usuario);

  if (perfil === "administrador") {
    return configEmpresa.administrador_pode_transferir;
  }

  if (perfil === "supervisor") {
    return configEmpresa.supervisor_pode_transferir;
  }

  return configEmpresa.atendente_pode_transferir;
}

function resolverPodeReatribuirPorPerfil(
  usuario: UsuarioContexto,
  configEmpresa: ConfiguracaoEmpresaRow
): boolean {
  const perfil = nomePerfilPrincipal(usuario);

  if (perfil === "administrador") {
    return configEmpresa.administrador_pode_reatribuir;
  }

  if (perfil === "supervisor") {
    return configEmpresa.supervisor_pode_reatribuir;
  }

  return configEmpresa.atendente_pode_reatribuir;
}

function resolverPodeAtribuirPorPerfil(
  usuario: UsuarioContexto,
  configEmpresa: ConfiguracaoEmpresaRow
): boolean {
  const perfil = nomePerfilPrincipal(usuario);

  if (perfil === "administrador") {
    return configEmpresa.administrador_pode_atribuir;
  }

  if (perfil === "supervisor") {
    return configEmpresa.supervisor_pode_atribuir;
  }

  return configEmpresa.atendente_pode_atribuir;
}

function resolverPodeAssumirPorPerfil(
  usuario: UsuarioContexto,
  configEmpresa: ConfiguracaoEmpresaRow
): boolean {
  const perfil = nomePerfilPrincipal(usuario);

  if (perfil === "administrador") {
    return configEmpresa.administrador_pode_assumir;
  }

  if (perfil === "supervisor") {
    return configEmpresa.supervisor_pode_assumir;
  }

  return configEmpresa.atendente_pode_assumir;
}

async function buscarConfiguracaoEmpresa(
  empresaId: string
): Promise<ConfiguracaoEmpresaRow> {
  const { data, error } = await supabaseAdmin
    .from("configuracoes_empresa")
    .select(`
      empresa_id,
      permitir_transferir_sem_assumir,
      permitir_transferir_para_mesmo_setor,
      limpar_responsavel_ao_transferir,
      voltar_fila_ao_transferir,
      atendente_pode_transferir,
      supervisor_pode_transferir,
      administrador_pode_transferir,
      atendente_pode_reatribuir,
      supervisor_pode_reatribuir,
      administrador_pode_reatribuir,
      atendente_pode_atribuir,
      supervisor_pode_atribuir,
      administrador_pode_atribuir,
      atendente_pode_assumir,
      supervisor_pode_assumir,
      administrador_pode_assumir,
      permitir_assumir_conversa_em_fila,
      permitir_assumir_conversa_sem_responsavel,
      permitir_assumir_conversa_ja_atribuida,
      exigir_mesmo_setor_para_reatribuicao
    `)
    .eq("empresa_id", empresaId)
    .maybeSingle<ConfiguracaoEmpresaRow>();

  if (error) {
    throw new Error(
      `Erro ao buscar configurações da empresa: ${error.message}`
    );
  }

  if (data) {
    return data;
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("configuracoes_empresa")
    .insert([
      {
        empresa_id: empresaId,
        permitir_transferir_sem_assumir: true,
        permitir_transferir_para_mesmo_setor: false,
        limpar_responsavel_ao_transferir: true,
        voltar_fila_ao_transferir: true,
        atendente_pode_transferir: true,
        supervisor_pode_transferir: true,
        administrador_pode_transferir: true,
        atendente_pode_reatribuir: false,
        supervisor_pode_reatribuir: true,
        administrador_pode_reatribuir: true,
        atendente_pode_atribuir: false,
        supervisor_pode_atribuir: true,
        administrador_pode_atribuir: true,
        atendente_pode_assumir: true,
        supervisor_pode_assumir: true,
        administrador_pode_assumir: true,
        permitir_assumir_conversa_em_fila: true,
        permitir_assumir_conversa_sem_responsavel: true,
        permitir_assumir_conversa_ja_atribuida: false,
        exigir_mesmo_setor_para_reatribuicao: true,
      },
    ])
    .select(`
      empresa_id,
      permitir_transferir_sem_assumir,
      permitir_transferir_para_mesmo_setor,
      limpar_responsavel_ao_transferir,
      voltar_fila_ao_transferir,
      atendente_pode_transferir,
      supervisor_pode_transferir,
      administrador_pode_transferir,
      atendente_pode_reatribuir,
      supervisor_pode_reatribuir,
      administrador_pode_reatribuir,
      atendente_pode_atribuir,
      supervisor_pode_atribuir,
      administrador_pode_atribuir,
      atendente_pode_assumir,
      supervisor_pode_assumir,
      administrador_pode_assumir,
      permitir_assumir_conversa_em_fila,
      permitir_assumir_conversa_sem_responsavel,
      permitir_assumir_conversa_ja_atribuida,
      exigir_mesmo_setor_para_reatribuicao
    `)
    .single<ConfiguracaoEmpresaRow>();

  if (insertError) {
    throw new Error(
      `Erro ao criar configurações padrão da empresa: ${insertError.message}`
    );
  }

  return inserted;
}

async function buscarConfiguracaoUsuario(
  empresaId: string,
  usuarioId: string
): Promise<ConfiguracaoUsuarioRow | null> {
  const { data, error } = await supabaseAdmin
    .from("configuracoes_usuario")
    .select(`
      empresa_id,
      usuario_id,
      permitir_transferir_sem_assumir,
      permitir_transferir_para_mesmo_setor,
      limpar_responsavel_ao_transferir,
      voltar_fila_ao_transferir,
      pode_transferir,
      pode_reatribuir,
      pode_atribuir,
      pode_assumir,
      permitir_assumir_conversa_em_fila,
      permitir_assumir_conversa_sem_responsavel,
      permitir_assumir_conversa_ja_atribuida,
      exigir_mesmo_setor_para_reatribuicao
    `)
    .eq("empresa_id", empresaId)
    .eq("usuario_id", usuarioId)
    .maybeSingle<ConfiguracaoUsuarioRow>();

  if (error) {
    throw new Error(
      `Erro ao buscar configurações do usuário: ${error.message}`
    );
  }

  return data ?? null;
}

export async function getPoliticaAtendimentoDoUsuario(
  usuario: UsuarioContexto
): Promise<PoliticaAtendimento> {
  if (!usuario.empresa_id) {
    throw new Error("Usuário sem empresa vinculada");
  }

  const [configEmpresa, configUsuario] = await Promise.all([
    buscarConfiguracaoEmpresa(usuario.empresa_id),
    buscarConfiguracaoUsuario(usuario.empresa_id, usuario.id),
  ]);

  const podeTransferirBase = resolverPodeTransferirPorPerfil(
    usuario,
    configEmpresa
  );

  const podeReatribuirBase = resolverPodeReatribuirPorPerfil(
    usuario,
    configEmpresa
  );

  const podeAtribuirBase = resolverPodeAtribuirPorPerfil(
    usuario,
    configEmpresa
  );

  const podeAssumirBase = resolverPodeAssumirPorPerfil(
    usuario,
    configEmpresa
  );

  return {
    permitir_transferir_sem_assumir: resolverBooleanOverride(
      configUsuario?.permitir_transferir_sem_assumir,
      configEmpresa.permitir_transferir_sem_assumir
    ),
    permitir_transferir_para_mesmo_setor: resolverBooleanOverride(
      configUsuario?.permitir_transferir_para_mesmo_setor,
      configEmpresa.permitir_transferir_para_mesmo_setor
    ),
    limpar_responsavel_ao_transferir: resolverBooleanOverride(
      configUsuario?.limpar_responsavel_ao_transferir,
      configEmpresa.limpar_responsavel_ao_transferir
    ),
    voltar_fila_ao_transferir: resolverBooleanOverride(
      configUsuario?.voltar_fila_ao_transferir,
      configEmpresa.voltar_fila_ao_transferir
    ),
    pode_transferir: resolverBooleanOverride(
      configUsuario?.pode_transferir,
      podeTransferirBase
    ),
    pode_reatribuir: resolverBooleanOverride(
      configUsuario?.pode_reatribuir,
      podeReatribuirBase
    ),
    pode_atribuir: resolverBooleanOverride(
      configUsuario?.pode_atribuir,
      podeAtribuirBase
    ),
    pode_assumir: resolverBooleanOverride(
      configUsuario?.pode_assumir,
      podeAssumirBase
    ),
    permitir_assumir_conversa_em_fila: resolverBooleanOverride(
      configUsuario?.permitir_assumir_conversa_em_fila,
      configEmpresa.permitir_assumir_conversa_em_fila
    ),
    permitir_assumir_conversa_sem_responsavel: resolverBooleanOverride(
      configUsuario?.permitir_assumir_conversa_sem_responsavel,
      configEmpresa.permitir_assumir_conversa_sem_responsavel
    ),
    permitir_assumir_conversa_ja_atribuida: resolverBooleanOverride(
      configUsuario?.permitir_assumir_conversa_ja_atribuida,
      configEmpresa.permitir_assumir_conversa_ja_atribuida
    ),
    exigir_mesmo_setor_para_reatribuicao: resolverBooleanOverride(
      configUsuario?.exigir_mesmo_setor_para_reatribuicao,
      configEmpresa.exigir_mesmo_setor_para_reatribuicao
    ),
  };
}