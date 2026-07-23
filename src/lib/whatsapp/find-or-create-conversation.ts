import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isConversaHistoricoImportado } from "@/lib/conversas/historico-importado";

export type WhatsAppConversation = {
  id: string;
  empresa_id: string;
  contato_id: string;
  setor_id: string | null;
  responsavel_id: string | null;
  integracao_whatsapp_id: string | null;
  status:
    | "aberta"
    | "bot"
    | "fila"
    | "em_atendimento"
    | "aguardando_cliente"
    | "encerrada"
    | "encerrado_manual"
    | "encerrado_24h"
    | "encerrado_aut"
    | null;
  canal: string | null;
  origem_atendimento: string | null;
  historico_importado?: boolean | null;
  prioridade: "baixa" | "media" | "alta" | "urgente" | null;
  assunto: string | null;
  started_at: string | null;
  last_message_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  bot_ativo: boolean;
  aguardando_atendente: boolean;
};

type FindOrCreateConversationParams = {
  empresaId: string;
  contatoId: string;
  integracaoWhatsappId: string;
};

type TipoProtocolo = "abertura" | "reabertura";

const STATUS_ENCERRADOS = new Set([
  "encerrada",
  "encerrado_manual",
  "encerrado_24h",
  "encerrado_aut",
]);

function formatarDataProtocolo(data: Date) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");

  return `${ano}${mes}${dia}`;
}

async function gerarProtocolo(empresaId: string) {
  const hoje = new Date();
  const dataBase = formatarDataProtocolo(hoje);

  return `ATD-${dataBase}-${randomUUID()}`;
}

async function buscarConversaOperacional(params: FindOrCreateConversationParams) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("conversas")
    .select("*")
    .eq("empresa_id", params.empresaId)
    .eq("contato_id", params.contatoId)
    .eq("integracao_whatsapp_id", params.integracaoWhatsappId)
    .eq("canal", "whatsapp")
    .or(
      "origem_atendimento.is.null,origem_atendimento.neq.historico_coexistence"
    )
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar conversa existente: ${error.message}`);
  }

  return (data as WhatsAppConversation | null) || null;
}

async function buscarConversaHistorica(params: FindOrCreateConversationParams) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("conversas")
    .select("*")
    .eq("empresa_id", params.empresaId)
    .eq("contato_id", params.contatoId)
    .eq("integracao_whatsapp_id", params.integracaoWhatsappId)
    .eq("canal", "whatsapp")
    .eq("origem_atendimento", "historico_coexistence")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Erro ao buscar conversa histórica existente: ${error.message}`
    );
  }

  return (data as WhatsAppConversation | null) || null;
}

async function garantirProtocoloAtivo(
  conversa: WhatsAppConversation,
  tipo: TipoProtocolo = "abertura",
  startedAt?: string
) {
  const supabaseAdmin = getSupabaseAdmin();

  async function buscarProtocoloAtivo() {
    const { data, error } = await supabaseAdmin
      .from("conversa_protocolos")
      .select("id")
      .eq("empresa_id", conversa.empresa_id)
      .eq("conversa_id", conversa.id)
      .eq("ativo", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Erro ao verificar protocolo ativo da conversa: ${error.message}`
      );
    }

    return data;
  }

  const protocoloAtivo = await buscarProtocoloAtivo();

  if (protocoloAtivo) {
    return protocoloAtivo;
  }

  const now = startedAt || new Date().toISOString();
  const protocoloGerado = await gerarProtocolo(conversa.empresa_id);

  const { data, error } = await supabaseAdmin
    .from("conversa_protocolos")
    .insert({
      empresa_id: conversa.empresa_id,
      conversa_id: conversa.id,
      protocolo: protocoloGerado,
      tipo,
      ativo: true,
      started_at: now,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const protocoloCriadoPorOutroProcesso = await buscarProtocoloAtivo();

      if (protocoloCriadoPorOutroProcesso) {
        return protocoloCriadoPorOutroProcesso;
      }
    }

    throw new Error(
      `Erro ao garantir protocolo ativo da conversa: ${error.message}`
    );
  }

  if (!data) {
    throw new Error(
      "Erro ao garantir protocolo ativo da conversa: sem retorno do banco"
    );
  }

  return data;
}

async function reabrirConversaEncerrada(
  conversa: WhatsAppConversation,
  integracaoWhatsappId: string
) {
  const supabaseAdmin = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: conversaReaberta, error: updateError } = await supabaseAdmin
    .from("conversas")
    .update({
      integracao_whatsapp_id: integracaoWhatsappId,
      setor_id: null,
      responsavel_id: null,
      status: "fila",
      canal: "whatsapp",
      origem_atendimento: "reativacao",
      prioridade: "media",
      assunto: "Atendimento iniciado via WhatsApp",
      started_at: now,
      last_message_at: now,
      closed_at: null,
      bot_ativo: false,
      aguardando_atendente: false,
    })
    .eq("id", conversa.id)
    .select("*")
    .single();

  if (updateError || !conversaReaberta) {
    if (updateError?.code === "23505") {
      const conversaCriadaPorOutroProcesso = await buscarConversaOperacional({
        empresaId: conversa.empresa_id,
        contatoId: conversa.contato_id,
        integracaoWhatsappId,
      });

      if (conversaCriadaPorOutroProcesso) {
        await garantirProtocoloAtivo(conversaCriadaPorOutroProcesso);
        return conversaCriadaPorOutroProcesso;
      }
    }

    throw new Error(
      `Erro ao reabrir conversa encerrada: ${
        updateError?.message ?? "sem retorno do banco"
      }`
    );
  }

  const conversaAtualizada = conversaReaberta as WhatsAppConversation;

  const { error: fecharProtocolosError } = await supabaseAdmin
    .from("conversa_protocolos")
    .update({
      ativo: false,
      updated_at: now,
    })
    .eq("conversa_id", conversa.id)
    .eq("ativo", true);

  if (fecharProtocolosError) {
    throw new Error(
      `Erro ao fechar protocolos antigos da conversa: ${fecharProtocolosError.message}`
    );
  }

  await garantirProtocoloAtivo(conversaAtualizada, "reabertura", now);

  return conversaAtualizada;
}

export async function findOrCreateWhatsAppConversation({
  empresaId,
  contatoId,
  integracaoWhatsappId,
}: FindOrCreateConversationParams): Promise<WhatsAppConversation> {
  if (!empresaId) {
    throw new Error("empresaId é obrigatório para localizar/criar conversa");
  }

  if (!contatoId) {
    throw new Error("contatoId é obrigatório para localizar/criar conversa");
  }

  if (!integracaoWhatsappId) {
    throw new Error(
      "integracaoWhatsappId é obrigatório para localizar/criar conversa"
    );
  }

  const params = { empresaId, contatoId, integracaoWhatsappId };
  const existingConversation = await buscarConversaOperacional(params);

  if (
    existingConversation &&
    !isConversaHistoricoImportado(existingConversation)
  ) {
    if (STATUS_ENCERRADOS.has(existingConversation.status || "")) {
      return await reabrirConversaEncerrada(
        existingConversation,
        integracaoWhatsappId
      );
    }

    await garantirProtocoloAtivo(existingConversation);
    return existingConversation;
  }

  const historicalConversation = await buscarConversaHistorica(params);

  if (historicalConversation) {
    return await reabrirConversaEncerrada(
      historicalConversation,
      integracaoWhatsappId
    );
  }

  const supabaseAdmin = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: newConversation, error: insertError } = await supabaseAdmin
    .from("conversas")
    .insert({
      empresa_id: empresaId,
      contato_id: contatoId,
      setor_id: null,
      responsavel_id: null,
      integracao_whatsapp_id: integracaoWhatsappId,
      status: "fila",
      canal: "whatsapp",
      origem_atendimento: "entrada_cliente",
      prioridade: "media",
      assunto: "Atendimento iniciado via WhatsApp",
      started_at: now,
      last_message_at: now,
      closed_at: null,
      bot_ativo: false,
      aguardando_atendente: false,
    })
    .select("*")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const conversaCriadaPorOutroProcesso =
        await buscarConversaOperacional(params);

      if (conversaCriadaPorOutroProcesso) {
        await garantirProtocoloAtivo(conversaCriadaPorOutroProcesso);
        return conversaCriadaPorOutroProcesso;
      }
    }

    throw new Error(
      `Erro ao criar conversa automaticamente: ${insertError.message}`
    );
  }

  if (!newConversation) {
    throw new Error(
      "Erro ao criar conversa automaticamente: sem retorno do banco"
    );
  }

  const conversaCriada = newConversation as WhatsAppConversation;
  await garantirProtocoloAtivo(conversaCriada);

  return conversaCriada;
}
