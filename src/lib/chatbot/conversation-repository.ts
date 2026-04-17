import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ConversaAutomacaoEstado } from "@/lib/chatbot/types";

type FindOrCreateConversationParams = {
  empresaId: string;
  contatoId: string;
  integracaoWhatsappId: string | null;
};

type ConversaRow = ConversaAutomacaoEstado & {
  contato_id?: string;
  integracao_whatsapp_id?: string | null;
  created_at?: string;
  updated_at?: string;
  started_at?: string | null;
  closed_at?: string | null;
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

async function buscarAutomacaoAtiva(
  empresaId: string,
  integracaoWhatsappId: string | null
) {
  if (!integracaoWhatsappId) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("whatsapp_automacoes")
    .select("id, ativa, setor_padrao_id, criado_em")
    .eq("empresa_id", empresaId)
    .eq("integracao_whatsapp_id", integracaoWhatsappId)
    .eq("ativa", true)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar automação ativa: ${error.message}`);
  }

  return data;
}

async function existeProtocoloAtivo(conversaId: string) {
  const { data, error } = await supabaseAdmin
    .from("conversa_protocolos")
    .select("id")
    .eq("conversa_id", conversaId)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao verificar protocolo ativo: ${error.message}`);
  }

  return !!data;
}

async function criarProtocolo(params: {
  empresaId: string;
  conversaId: string;
  tipo: "abertura" | "reabertura";
  startedAt?: string | null;
}) {
  const protocoloGerado = await gerarProtocolo(params.empresaId);
  const now = params.startedAt || new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("conversa_protocolos")
    .insert({
      empresa_id: params.empresaId,
      conversa_id: params.conversaId,
      protocolo: protocoloGerado,
      tipo: params.tipo,
      ativo: true,
      started_at: now,
      created_at: now,
      updated_at: now,
    });

  if (error) {
    throw new Error(`Erro ao criar protocolo: ${error.message}`);
  }
}

async function fecharProtocolosAtivos(conversaId: string, dataFechamento: string) {
  const { error } = await supabaseAdmin
    .from("conversa_protocolos")
    .update({
      ativo: false,
      closed_at: dataFechamento,
      updated_at: dataFechamento,
    })
    .eq("conversa_id", conversaId)
    .eq("ativo", true);

  if (error) {
    throw new Error(`Erro ao fechar protocolos ativos: ${error.message}`);
  }
}

async function reabrirConversaEncerrada(
  conversa: ConversaRow,
  integracaoWhatsappId: string | null
): Promise<ConversaRow> {
  const now = new Date().toISOString();

  const automacaoAtiva = await buscarAutomacaoAtiva(
    conversa.empresa_id,
    integracaoWhatsappId
  );

  const statusInicial = automacaoAtiva ? "bot" : "fila";

  const { data, error } = await supabaseAdmin
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

  if (error || !data) {
    throw new Error(
      `Erro ao reabrir conversa encerrada: ${
        error?.message ?? "sem retorno do banco"
      }`
    );
  }

  await fecharProtocolosAtivos(conversa.id, now);
  await criarProtocolo({
    empresaId: conversa.empresa_id,
    conversaId: conversa.id,
    tipo: "reabertura",
    startedAt: now,
  });

  return data as ConversaRow;
}

export async function findConversationByContato(params: {
  empresaId: string;
  contatoId: string;
}): Promise<ConversaRow | null> {
  const { data, error } = await supabaseAdmin
    .from("conversas")
    .select("*")
    .eq("empresa_id", params.empresaId)
    .eq("contato_id", params.contatoId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar conversa: ${error.message}`);
  }

  return data as ConversaRow | null;
}

export async function findOrCreateConversation(
  params: FindOrCreateConversationParams
): Promise<{ conversa: ConversaRow; isNovaConversa: boolean }> {
  const conversaExistente = await findConversationByContato({
    empresaId: params.empresaId,
    contatoId: params.contatoId,
  });

  if (!conversaExistente) {
    throw new Error(
      "Conversa não encontrada. Toda criação deve ser feita pelo webhook principal."
    );
  }

  return {
    conversa: conversaExistente,
    isNovaConversa: false,
  };
}

export async function updateConversationAutomationState(params: {
  conversaId: string;
  updates: Partial<ConversaAutomacaoEstado> & {
    status?: "aberta" | "bot" | "fila" | "em_atendimento" | "aguardando_cliente" | "encerrada" | null;
    setor_id?: string | null;
    responsavel_id?: string | null;
  };
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from("conversas")
    .update(params.updates)
    .eq("id", params.conversaId);

  if (error) {
    throw new Error(`Erro ao atualizar conversa: ${error.message}`);
  }
}