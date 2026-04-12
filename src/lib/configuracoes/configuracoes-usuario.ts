import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

export type ConfiguracaoUsuarioInput = {
  empresa_id: string;
  usuario_id: string;
  permitir_transferir_sem_assumir?: boolean | null;
  permitir_transferir_para_mesmo_setor?: boolean | null;
  limpar_responsavel_ao_transferir?: boolean | null;
  voltar_fila_ao_transferir?: boolean | null;
  pode_transferir?: boolean | null;
  pode_reatribuir?: boolean | null;
  pode_atribuir?: boolean | null;
  pode_assumir?: boolean | null;
  permitir_assumir_conversa_em_fila?: boolean | null;
  permitir_assumir_conversa_sem_responsavel?: boolean | null;
  permitir_assumir_conversa_ja_atribuida?: boolean | null;
  exigir_mesmo_setor_para_reatribuicao?: boolean | null;
};

export async function upsertConfiguracaoUsuario(
  input: ConfiguracaoUsuarioInput
) {
  const { data, error } = await supabaseAdmin
    .from("configuracoes_usuario")
    .upsert(
      [
        {
          empresa_id: input.empresa_id,
          usuario_id: input.usuario_id,
          permitir_transferir_sem_assumir:
            input.permitir_transferir_sem_assumir ?? null,
          permitir_transferir_para_mesmo_setor:
            input.permitir_transferir_para_mesmo_setor ?? null,
          limpar_responsavel_ao_transferir:
            input.limpar_responsavel_ao_transferir ?? null,
          voltar_fila_ao_transferir:
            input.voltar_fila_ao_transferir ?? null,
          pode_transferir: input.pode_transferir ?? null,
          pode_reatribuir: input.pode_reatribuir ?? null,
          pode_atribuir: input.pode_atribuir ?? null,
          pode_assumir: input.pode_assumir ?? null,
          permitir_assumir_conversa_em_fila:
            input.permitir_assumir_conversa_em_fila ?? null,
          permitir_assumir_conversa_sem_responsavel:
            input.permitir_assumir_conversa_sem_responsavel ?? null,
          permitir_assumir_conversa_ja_atribuida:
            input.permitir_assumir_conversa_ja_atribuida ?? null,
          exigir_mesmo_setor_para_reatribuicao:
            input.exigir_mesmo_setor_para_reatribuicao ?? null,
        },
      ],
      {
        onConflict: "usuario_id",
      }
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Erro ao salvar configuração individual do usuário: ${error.message}`
    );
  }

  return data;
}