import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendTemplateStatusEmail } from "@/lib/email/send-template-status-email";
import type {
  ExtractedTemplateCategoryUpdate,
  ExtractedTemplateStatusUpdate,
} from "@/lib/whatsapp/meta";

const supabaseAdmin = getSupabaseAdmin();

type TemplateLocal = {
  id: string;
  empresa_id: string;
  integracao_whatsapp_id: string;
  waba_id: string;
  meta_template_id: string | null;
  nome: string;
  categoria: string;
  idioma: string;
  status: string;
  rejeicao_motivo: string | null;
  resposta_meta: unknown;
};

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function normalizar(valor: unknown) {
  return String(valor || "").trim().toUpperCase();
}

async function buscarTemplateLocal(params: {
  wabaId: string;
  messageTemplateId: string;
  messageTemplateName?: string;
  messageTemplateLanguage?: string;
}) {
  const select =
    "id,empresa_id,integracao_whatsapp_id,waba_id,meta_template_id,nome,categoria,idioma,status,rejeicao_motivo,resposta_meta";

  const { data: porId, error: porIdError } = await supabaseAdmin
    .from("whatsapp_templates")
    .select(select)
    .eq("waba_id", params.wabaId)
    .eq("meta_template_id", params.messageTemplateId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<TemplateLocal>();

  if (porIdError) {
    throw new Error(
      `Erro ao buscar template pelo ID da Meta: ${porIdError.message}`
    );
  }

  if (porId) return porId;

  const nome = String(params.messageTemplateName || "").trim();
  const idioma = String(params.messageTemplateLanguage || "").trim();

  if (!nome || !idioma) return null;

  const { data: porChave, error: porChaveError } = await supabaseAdmin
    .from("whatsapp_templates")
    .select(select)
    .eq("waba_id", params.wabaId)
    .eq("nome", nome)
    .eq("idioma", idioma)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<TemplateLocal>();

  if (porChaveError) {
    throw new Error(
      `Erro ao buscar template pelo nome/idioma: ${porChaveError.message}`
    );
  }

  return porChave || null;
}

function motivoRejeicao(update: ExtractedTemplateStatusUpdate) {
  const rejectionInfo = objeto(update.rawValue.rejection_info);
  const detalhes = String(rejectionInfo.reason || "").trim();
  const recomendacao = String(rejectionInfo.recommendation || "").trim();

  return [update.reason, detalhes, recomendacao]
    .map((item) => String(item || "").trim())
    .filter((item, index, lista) => item && lista.indexOf(item) === index)
    .join(" · ");
}

async function processarAtualizacaoCategoria(
  update: ExtractedTemplateCategoryUpdate
) {
  const template = await buscarTemplateLocal(update);

  if (!template) {
    console.warn("[TEMPLATE_WEBHOOK] Template não encontrado para categoria.", {
      wabaId: update.wabaId,
      metaTemplateId: update.messageTemplateId,
      nome: update.messageTemplateName,
    });
    return { processed: 0, unmatched: 1 };
  }

  const categoriaAtual = normalizar(template.categoria);
  const novaCategoria = normalizar(update.newCategory);
  const respostaMeta = objeto(template.resposta_meta);

  const { error } = await supabaseAdmin
    .from("whatsapp_templates")
    .update({
      categoria: novaCategoria || template.categoria,
      resposta_meta: {
        ...respostaMeta,
        webhook_category_update: update.rawValue,
        webhook_category_updated_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", template.id)
    .eq("empresa_id", template.empresa_id);

  if (error) {
    throw new Error(
      `Erro ao atualizar categoria do template: ${error.message}`
    );
  }

  console.log("[TEMPLATE_WEBHOOK] Categoria atualizada.", {
    templateId: template.id,
    metaTemplateId: update.messageTemplateId,
    de: categoriaAtual || null,
    para: novaCategoria || null,
  });

  return { processed: 1, unmatched: 0 };
}

async function processarAtualizacaoStatus(
  update: ExtractedTemplateStatusUpdate
) {
  const template = await buscarTemplateLocal(update);

  if (!template) {
    console.warn("[TEMPLATE_WEBHOOK] Template não encontrado para status.", {
      wabaId: update.wabaId,
      metaTemplateId: update.messageTemplateId,
      nome: update.messageTemplateName,
      evento: update.event,
    });
    return { processed: 0, unmatched: 1, emailSent: 0 };
  }

  const statusAnterior = normalizar(template.status);
  const novoStatus = normalizar(update.event);
  const categoriaEvento = normalizar(update.category);
  const categoriaFinal = categoriaEvento || normalizar(template.categoria);
  const respostaMeta = objeto(template.resposta_meta);
  const statusAlterou = statusAnterior !== novoStatus;
  const motivo = motivoRejeicao(update);

  const atualizacao: Record<string, unknown> = {
    status: novoStatus,
    categoria: categoriaFinal || template.categoria,
    resposta_meta: {
      ...respostaMeta,
      webhook_status_update: update.rawValue,
      webhook_status_updated_at: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  };

  if (novoStatus === "REJECTED") {
    atualizacao.rejeicao_motivo = motivo || update.reason || null;
  } else if (["APPROVED", "REINSTATED"].includes(novoStatus)) {
    atualizacao.rejeicao_motivo = null;
  }

  const { error } = await supabaseAdmin
    .from("whatsapp_templates")
    .update(atualizacao)
    .eq("id", template.id)
    .eq("empresa_id", template.empresa_id);

  if (error) {
    throw new Error(`Erro ao atualizar status do template: ${error.message}`);
  }

  let emailSent = 0;

  if (statusAlterou) {
    const enviado = await sendTemplateStatusEmail({
      empresaId: template.empresa_id,
      integracaoId: template.integracao_whatsapp_id,
      templateNome: update.messageTemplateName || template.nome,
      status: novoStatus,
      categoria: categoriaFinal || template.categoria,
      idioma: update.messageTemplateLanguage || template.idioma,
      motivo:
        novoStatus === "REJECTED"
          ? motivo || update.reason
          : update.reason && update.reason !== "NONE"
            ? update.reason
            : null,
    });

    emailSent = enviado ? 1 : 0;
  }

  console.log("[TEMPLATE_WEBHOOK] Status atualizado.", {
    templateId: template.id,
    metaTemplateId: update.messageTemplateId,
    de: statusAnterior || null,
    para: novoStatus,
    categoria: categoriaFinal || null,
    statusAlterou,
    emailSent: emailSent === 1,
  });

  return { processed: 1, unmatched: 0, emailSent };
}

export async function processTemplateWebhookUpdates(params: {
  statusUpdates: ExtractedTemplateStatusUpdate[];
  categoryUpdates: ExtractedTemplateCategoryUpdate[];
}) {
  let processed = 0;
  let unmatched = 0;
  let emailsSent = 0;
  let statusUpdates = 0;
  let categoryUpdates = 0;

  // Categoria primeiro: se a Meta enviar categoria + status juntos, o email
  // de status já utiliza a categoria mais recente.
  for (const update of params.categoryUpdates) {
    const resultado = await processarAtualizacaoCategoria(update);
    processed += resultado.processed;
    unmatched += resultado.unmatched;
    categoryUpdates += resultado.processed;
  }

  for (const update of params.statusUpdates) {
    const resultado = await processarAtualizacaoStatus(update);
    processed += resultado.processed;
    unmatched += resultado.unmatched;
    emailsSent += resultado.emailSent;
    statusUpdates += resultado.processed;
  }

  return {
    processed,
    statusUpdates,
    categoryUpdates,
    emailsSent,
    unmatched,
  };
}
