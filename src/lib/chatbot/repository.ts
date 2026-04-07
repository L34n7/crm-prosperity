import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  AutomacaoCompleta,
  WhatsAppAutomacao,
  WhatsAppAutomacaoOpcao,
  WhatsAppAutomacaoPalavraChave,
} from "@/lib/chatbot/types";

export async function getActiveWhatsAppAutomation(params: {
  empresaId: string;
  integracaoWhatsappId?: string | null;
}): Promise<AutomacaoCompleta | null> {
  const { empresaId, integracaoWhatsappId } = params;

  let automacao: WhatsAppAutomacao | null = null;

  if (integracaoWhatsappId) {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_automacoes")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("integracao_whatsapp_id", integracaoWhatsappId)
      .eq("ativa", true)
      .order("criado_em", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Erro ao buscar automação ativa por integração: ${error.message}`
      );
    }

    automacao = data;
  }

  if (!automacao) {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_automacoes")
      .select("*")
      .eq("empresa_id", empresaId)
      .is("integracao_whatsapp_id", null)
      .eq("ativa", true)
      .order("criado_em", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Erro ao buscar automação ativa por empresa: ${error.message}`
      );
    }

    automacao = data;
  }

  if (!automacao) {
    return null;
  }

  const [opcoesResult, palavrasResult] = await Promise.all([
    supabaseAdmin
      .from("whatsapp_automacao_opcoes")
      .select("*")
      .eq("automacao_id", automacao.id)
      .eq("ativa", true)
      .order("ordem", { ascending: true }),

    supabaseAdmin
      .from("whatsapp_automacao_palavras_chave")
      .select("*")
      .eq("automacao_id", automacao.id)
      .eq("ativa", true)
      .order("palavra_chave", { ascending: true }),
  ]);

  if (opcoesResult.error) {
    throw new Error(
      `Erro ao buscar opções da automação: ${opcoesResult.error.message}`
    );
  }

  if (palavrasResult.error) {
    throw new Error(
      `Erro ao buscar palavras-chave da automação: ${palavrasResult.error.message}`
    );
  }

  return {
    automacao,
    opcoes: (opcoesResult.data ?? []) as WhatsAppAutomacaoOpcao[],
    palavrasChave:
      (palavrasResult.data ?? []) as WhatsAppAutomacaoPalavraChave[],
  };
}