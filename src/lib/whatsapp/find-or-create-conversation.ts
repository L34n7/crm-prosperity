import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { FluxoEtapa } from "@/lib/chatbot/types";

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
  fluxo_etapa: FluxoEtapa;
  menu_aguardando_resposta: boolean;
  ultima_opcao_escolhida: string | null;
  tentativas_invalidas: number;
  ultima_interacao_bot_em: string | null;
  automacao_id: string | null;
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
  const supabaseAdmin = getSupabaseAdmin();
  const hoje = new Date();
  const dataBase = formatarDataProtocolo(hoje);
  const prefixo = `ATD-${dataBase}-`;

  const { data, error } = await supabaseAdmin
    .from("conversa_protocolos")
    .select("protocolo")
    .eq("empresa_id", empresaId)
    .like("protocolo", `${prefixo}%`)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Erro ao gerar protocolo: ${error.message}`);
  }

  const ultimoProtocolo = data?.[0]?.protocolo || null;

  let sequencial = 1;

  if (ultimoProtocolo) {
    const ultimaParte = ultimoProtocolo.split("-").pop() || "0";
    const ultimoNumero = Number(ultimaParte);

    if (!Number.isNaN(ultimoNumero)) {
      sequencial = ultimoNumero + 1;
    }
  }

  return `${prefixo}${String(sequencial).padStart(6, "0")}`;
}

async function garantirProtocoloAtivo(conversa: WhatsAppConversation) {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: protocoloAtivo, error: protocoloError } = await supabaseAdmin
    .from("conversa_protocolos")
    .select("id")
    .eq("conversa_id", conversa.id)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();

  if (protocoloError) {
    throw new Error(
      `Erro ao verificar protocolo ativo da conversa: ${protocoloError.message}`
    );
  }

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

  if (error || !data) {
    throw new Error(
      `Erro ao garantir protocolo ativo da conversa: ${
        error?.message ?? "sem retorno do banco"
      }`
    );
  }

  return data;
}

async function buscarAutomacaoAtiva(
  empresaId: string,
  integracaoWhatsappId: string
) {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from("whatsapp_automacoes")
    .select("id, ativa, setor_padrao_id, criado_em")
    .eq("empresa_id", empresaId)
    .eq("integracao_whatsapp_id", integracaoWhatsappId)
    .eq("ativa", true)
    .order("criado_em", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar automação ativa: ${error.message}`);
  }

  return data;
}

async function reabrirConversaEncerrada(
  conversa: WhatsAppConversation,
  integracaoWhatsappId: string
) {
  const supabaseAdmin = getSupabaseAdmin();
  const now = new Date().toISOString();

  const automacaoAtiva = await buscarAutomacaoAtiva(
    conversa.empresa_id,
    integracaoWhatsappId
  );

  const statusInicial = automacaoAtiva ? "bot" : "fila";

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

      bot_ativo: !!automacaoAtiva,
      fluxo_etapa: null,
      menu_aguardando_resposta: false,
      ultima_opcao_escolhida: null,
      tentativas_invalidas: 0,
      ultima_interacao_bot_em: null,
      automacao_id: automacaoAtiva?.id ?? null,
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

    if (conversaExistente.status === "encerrada") {
      return await reabrirConversaEncerrada(
        conversaExistente,
        integracaoWhatsappId
      );
    }

    await garantirProtocoloAtivo(conversaExistente);
    return conversaExistente;
  }

  const now = new Date().toISOString();
  const automacaoAtiva = await buscarAutomacaoAtiva(
    empresaId,
    integracaoWhatsappId
  );
  const statusInicial = automacaoAtiva ? "bot" : "fila";

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

      bot_ativo: !!automacaoAtiva,
      fluxo_etapa: null,
      menu_aguardando_resposta: false,
      ultima_opcao_escolhida: null,
      tentativas_invalidas: 0,
      ultima_interacao_bot_em: null,
      automacao_id: automacaoAtiva?.id ?? null,
    })
    .select("*")
    .single();

  if (insertError || !newConversation) {
    throw new Error(
      `Erro ao criar conversa automaticamente: ${
        insertError?.message ?? "sem retorno do banco"
      }`
    );
  }

  const protocoloGerado = await gerarProtocolo(empresaId);

  const { error: insertProtocoloError } = await supabaseAdmin
    .from("conversa_protocolos")
    .insert({
      empresa_id: empresaId,
      conversa_id: newConversation.id,
      protocolo: protocoloGerado,
      tipo: "abertura",
      ativo: true,
      started_at: now,
      created_at: now,
      updated_at: now,
    });

  if (insertProtocoloError) {
    throw new Error(
      `Conversa criada, mas houve erro ao criar protocolo: ${insertProtocoloError.message}`
    );
  }

  return newConversation as WhatsAppConversation;
}