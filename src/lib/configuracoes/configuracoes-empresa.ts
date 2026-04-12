import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

export type ConfiguracaoEmpresaInput = {
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

export async function upsertConfiguracaoEmpresa(
  input: ConfiguracaoEmpresaInput
) {
  const { data, error } = await supabaseAdmin
    .from("configuracoes_empresa")
    .upsert(
      [
        {
          empresa_id: input.empresa_id,
          permitir_transferir_sem_assumir:
            input.permitir_transferir_sem_assumir,
          permitir_transferir_para_mesmo_setor:
            input.permitir_transferir_para_mesmo_setor,
          limpar_responsavel_ao_transferir:
            input.limpar_responsavel_ao_transferir,
          voltar_fila_ao_transferir: input.voltar_fila_ao_transferir,

          atendente_pode_transferir: input.atendente_pode_transferir,
          supervisor_pode_transferir: input.supervisor_pode_transferir,
          administrador_pode_transferir: input.administrador_pode_transferir,

          atendente_pode_reatribuir: input.atendente_pode_reatribuir,
          supervisor_pode_reatribuir: input.supervisor_pode_reatribuir,
          administrador_pode_reatribuir: input.administrador_pode_reatribuir,

          atendente_pode_atribuir: input.atendente_pode_atribuir,
          supervisor_pode_atribuir: input.supervisor_pode_atribuir,
          administrador_pode_atribuir: input.administrador_pode_atribuir,

          atendente_pode_assumir: input.atendente_pode_assumir,
          supervisor_pode_assumir: input.supervisor_pode_assumir,
          administrador_pode_assumir: input.administrador_pode_assumir,

          permitir_assumir_conversa_em_fila:
            input.permitir_assumir_conversa_em_fila,
          permitir_assumir_conversa_sem_responsavel:
            input.permitir_assumir_conversa_sem_responsavel,
          permitir_assumir_conversa_ja_atribuida:
            input.permitir_assumir_conversa_ja_atribuida,

          exigir_mesmo_setor_para_reatribuicao:
            input.exigir_mesmo_setor_para_reatribuicao,
        },
      ],
      {
        onConflict: "empresa_id",
      }
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Erro ao salvar configuração da empresa: ${error.message}`
    );
  }

  return data;
}