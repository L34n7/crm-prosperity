import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

export type WhatsAppTemplateLocal = {
  id: string;
  empresa_id: string;
  integracao_whatsapp_id: string;
  waba_id: string;
  meta_template_id: string | null;
  nome: string;
  categoria: string;
  idioma: string;
  status: string;
  quality_rating?: string | null;
  rejeicao_motivo?: string | null;
  payload: unknown;
  resposta_meta: unknown;
  created_at: string;
  updated_at: string;
};

type SupabaseLike = SupabaseClient;

type BuscarTemplatePorChaveParams = {
  supabase: SupabaseLike;
  empresaId: string;
  nome: string;
  idioma: string;
};

type SalvarTemplateLocalParams = BuscarTemplatePorChaveParams & {
  integracaoWhatsAppId: string;
  wabaId: string;
  metaTemplateId: string | null;
  categoria: string;
  status: string;
  payload: unknown;
  respostaMeta: unknown;
  usuarioId: string;
};

type ResultadoSalvarTemplateRpc = {
  criado?: boolean;
  template?: WhatsAppTemplateLocal;
};

export async function buscarTemplateWhatsappPorChave({
  supabase,
  empresaId,
  nome,
  idioma,
}: BuscarTemplatePorChaveParams) {
  const { data, error } = await supabase
    .from("whatsapp_templates")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("nome", nome)
    .eq("idioma", idioma)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<WhatsAppTemplateLocal>();

  return {
    template: data ?? null,
    error,
  };
}

function normalizarResultadoSalvarTemplateRpc(
  data: unknown
): ResultadoSalvarTemplateRpc | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const resultado = data as ResultadoSalvarTemplateRpc;

  if (!resultado.template?.id) {
    return null;
  }

  return {
    criado: resultado.criado === true,
    template: resultado.template,
  };
}

export async function salvarTemplateWhatsappLocalIdempotente(
  params: SalvarTemplateLocalParams
): Promise<{
  criado: boolean;
  template: WhatsAppTemplateLocal;
  error: null;
} | {
  criado: false;
  template: null;
  error: PostgrestError | Error;
}> {
  const { data, error } = await params.supabase.rpc(
    "salvar_whatsapp_template_idempotente",
    {
      p_empresa_id: params.empresaId,
      p_integracao_whatsapp_id: params.integracaoWhatsAppId,
      p_waba_id: params.wabaId,
      p_meta_template_id: params.metaTemplateId,
      p_nome: params.nome,
      p_categoria: params.categoria,
      p_idioma: params.idioma,
      p_status: params.status,
      p_payload: params.payload,
      p_resposta_meta: params.respostaMeta,
      p_usuario_id: params.usuarioId,
    }
  );

  if (error) {
    return {
      criado: false,
      template: null,
      error,
    };
  }

  const resultado = normalizarResultadoSalvarTemplateRpc(data);

  if (!resultado?.template) {
    return {
      criado: false,
      template: null,
      error: new Error("Resposta invalida ao salvar template WhatsApp."),
    };
  }

  return {
    criado: resultado.criado === true,
    template: resultado.template,
    error: null,
  };
}
