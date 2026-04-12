import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

export type RegistrarLogAuditoriaInput = {
  empresa_id: string;
  entidade: "setor" | "perfil";
  entidade_id: string;
  acao: "criado" | "atualizado";
  usuario_id?: string | null;
  usuario_nome?: string | null;
  detalhes?: Record<string, unknown> | null;
};

export async function registrarLogAuditoria(
  input: RegistrarLogAuditoriaInput
) {
  const { error } = await supabaseAdmin.from("logs_auditoria").insert([
    {
      empresa_id: input.empresa_id,
      entidade: input.entidade,
      entidade_id: input.entidade_id,
      acao: input.acao,
      usuario_id: input.usuario_id ?? null,
      usuario_nome: input.usuario_nome ?? null,
      detalhes: input.detalhes ?? null,
    },
  ]);

  if (error) {
    throw new Error(`Erro ao registrar log de auditoria: ${error.message}`);
  }
}