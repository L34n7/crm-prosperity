import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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
  prioridade: "baixa" | "media" | "alta" | "urgente" | null;
  assunto: string | null;
  started_at: string | null;
  last_message_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  bot_ativo: boolean;
};

type FindOrCreateConversationParams = {
  empresaId: string;
  contatoId: string;
  integracaoWhatsappId: string;
};

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

async function garantirProtocoloAtivo(conversa: WhatsAppConversation) {
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

  const now = new Date().toISOString();
  const protocoloGerado = await gerarProtocolo(conversa.empresa_id);

  const { data, error } = await supabaseAdmin
    .from("conversa_protocolos")
    .insert({
      empresa_id: conversa.empresa_id,
      conversa_id: conversa.id,
      protocolo: protocoloGerado,
      tipo: "abertura",
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
    throw new Error("Erro ao garantir protocolo ativo da conversa: sem retorno do banco");
  }

  return data;
}


async function reabrirConversaEncerrada(
  conversa: WhatsAppConversation,
  integracaoWhatsappId: string
) {
  const supabaseAdmin = getSupabaseAdmin();
  const now = new Date().toISOString();

  const statusInicial = "fila";

  const { data: conversaReaberta, error: updateError } = await supabaseAdmin
    .from("conversas")
    .update({
      integracao_whatsapp_id: integracaoWhatsappId,
      setor_id: null,
      responsavel_id: null,
      status: statusInicial,
      canal: "whatsapp",
      origem_atendimento: "reativacao",
      prioridade: "media",
      assunto: "Atendimento iniciado via WhatsApp",
      started_at: now,
      last_message_at: now,
      closed_at: null,
      bot_ativo: false,
    })
    .eq("id", conversa.id)
    .select("*")
    .single();

  if (updateError || !conversaReaberta) {
    throw new Error(
      `Erro ao reabrir conversa encerrada: ${
        updateError?.message ?? "sem retorno do banco"
      }`
    );
  }

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

  const protocoloGerado = await gerarProtocolo(conversa.empresa_id);

  const { error: insertProtocoloError } = await supabaseAdmin
    .from("conversa_protocolos")
    .insert({
      empresa_id: conversa.empresa_id,
      conversa_id: conversa.id,
      protocolo: protocoloGerado,
      tipo: "reabertura",
      ativo: true,
      started_at: now,
      created_at: now,
      updated_at: now,
    });

  if (insertProtocoloError) {
    throw new Error(
      `Erro ao criar protocolo de reabertura: ${insertProtocoloError.message}`
    );
  }

  return conversaReaberta as WhatsAppConversation;
}

export async function findOrCreateWhatsAppConversation({
  empresaId,
  contatoId,
  integracaoWhatsappId,
}: FindOrCreateConversationParams): Promise<WhatsAppConversation> {
  const supabaseAdmin = getSupabaseAdmin();

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

  const { data: existingConversation, error: findError } = await supabaseAdmin
    .from("conversas")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("contato_id", contatoId)
    .eq("integracao_whatsapp_id", integracaoWhatsappId)
    .eq("canal", "whatsapp")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) {
    throw new Error(
      `Erro ao buscar conversa existente: ${findError.message}`
    );
  }

  if (existingConversation) {
    const conversaExistente = existingConversation as WhatsAppConversation;

    const statusEncerrados = [
      "encerrada",
      "encerrado_manual",
      "encerrado_24h",
      "encerrado_aut",
    ];

    if (statusEncerrados.includes(conversaExistente.status || "")) {
      return await reabrirConversaEncerrada(
        conversaExistente,
        integracaoWhatsappId
      );
    }

    await garantirProtocoloAtivo(conversaExistente);
    return conversaExistente;
  }

  const now = new Date().toISOString();
  const statusInicial = "fila";

  const { data: newConversation, error: insertError } = await supabaseAdmin
    .from("conversas")
    .insert({
      empresa_id: empresaId,
      contato_id: contatoId,
      setor_id: null,
      responsavel_id: null,
      integracao_whatsapp_id: integracaoWhatsappId,
      status: statusInicial,
      canal: "whatsapp",
      origem_atendimento: "entrada_cliente",
      prioridade: "media",
      assunto: "Atendimento iniciado via WhatsApp",
      started_at: now,
      last_message_at: now,
      closed_at: null,
      bot_ativo: false,
    })
    .select("*")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: conversaCriadaPorOutroProcesso, error: buscarError } =
        await supabaseAdmin
          .from("conversas")
          .select("*")
          .eq("empresa_id", empresaId)
          .eq("contato_id", contatoId)
          .eq("integracao_whatsapp_id", integracaoWhatsappId)
          .eq("canal", "whatsapp")
          .in("status", [
            "aberta",
            "bot",
            "fila",
            "em_atendimento",
            "aguardando_cliente",
          ])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

      if (buscarError) {
        throw new Error(
          `Erro ao buscar conversa criada por outro processo: ${buscarError.message}`
        );
      }

      if (conversaCriadaPorOutroProcesso) {
        const conversa = conversaCriadaPorOutroProcesso as WhatsAppConversation;
        await garantirProtocoloAtivo(conversa);
        return conversa;
      }
    }

    throw new Error(
      `Erro ao criar conversa automaticamente: ${insertError.message}`
    );
  }

  if (!newConversation) {
    throw new Error("Erro ao criar conversa automaticamente: sem retorno do banco");
  }

  await garantirProtocoloAtivo(newConversation as WhatsAppConversation);

  return newConversation as WhatsAppConversation;
}