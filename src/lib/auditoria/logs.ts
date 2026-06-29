import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

export type CategoriaAuditoria =
  | "permissoes"
  | "usuarios"
  | "conversas"
  | "contatos"
  | "disparos"
  | "fluxos"
  | "setores"
  | "perfis"
  | "sistema";

export type RegistrarLogAuditoriaInput = {
  empresa_id: string;
  categoria?: CategoriaAuditoria;
  entidade:
    | "setor"
    | "perfil"
    | "usuario"
    | "permissao"
    | "politica_empresa"
    | "conversa"
    | "contato"
    | "disparo"
    | "fluxo"
    | "integracao_whatsapp";
  entidade_id: string;
  acao: string;
  descricao?: string | null;
  usuario_id?: string | null;
  usuario_nome?: string | null;
  usuario_email?: string | null;
  antes?: Record<string, unknown> | unknown[] | null;
  depois?: Record<string, unknown> | unknown[] | null;
  detalhes?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  user_agent?: string | null;
};

export function getRequestAuditMetadata(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip =
    forwardedFor?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;

  return {
    ip,
    user_agent: request.headers.get("user-agent") || null,
  };
}

export async function registrarLogAuditoria(
  input: RegistrarLogAuditoriaInput
) {
  const detalhes = {
    ...(input.detalhes ?? {}),
    ...(input.usuario_email ? { usuario_email: input.usuario_email } : {}),
  };

  const { error } = await supabaseAdmin.from("logs_auditoria").insert([
    {
      empresa_id: input.empresa_id,
      categoria: input.categoria ?? input.entidade,
      entidade: input.entidade,
      entidade_id: input.entidade_id,
      acao: input.acao,
      descricao: input.descricao ?? null,
      usuario_id: input.usuario_id ?? null,
      usuario_nome: input.usuario_nome ?? null,
      detalhes,
      antes: input.antes ?? null,
      depois: input.depois ?? null,
      metadata: input.metadata ?? null,
      ip: input.ip ?? null,
      user_agent: input.user_agent ?? null,
    },
  ]);

  if (error) {
    throw new Error(`Erro ao registrar log de auditoria: ${error.message}`);
  }
}

export async function registrarLogAuditoriaSeguro(
  input: RegistrarLogAuditoriaInput
) {
  try {
    await registrarLogAuditoria(input);
  } catch (error) {
    console.error("[AUDITORIA] Falha ao registrar log:", error);
  }
}
