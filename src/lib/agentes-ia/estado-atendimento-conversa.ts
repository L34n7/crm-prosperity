import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

type ConversaAtendimento = {
  id?: string | null;
  status?: string | null;
  responsavel_id?: string | null;
  bot_ativo?: boolean | null;
  aguardando_atendente?: boolean | null;
};

export function conversaEstaComHumano(conversa: ConversaAtendimento | null) {
  if (!conversa) return true;
  if (conversa.aguardando_atendente === true) return true;
  if (String(conversa.status || "") === "em_atendimento") return true;
  if (String(conversa.responsavel_id || "").trim()) return true;
  return false;
}

async function protocoloAtivoDaConversa(empresaId: string, conversaId: string) {
  const { data, error } = await supabaseAdmin
    .from("conversa_protocolos")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .eq("ativo", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.id || null;
}

export async function marcarConversaComoAtendimentoAgente(params: {
  empresaId: string;
  conversaId: string;
  agenteId: string;
  protocoloId?: string | null;
}) {
  const agora = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("conversas")
    .update({
      status: "bot",
      bot_ativo: true,
      aguardando_atendente: false,
      origem_atendimento: "bot",
      responsavel_id: null,
      agente_ia_id: params.agenteId,
      agente_ia_protocolo_id: params.protocoloId || null,
      agente_ia_fallback_ativo: false,
      closed_at: null,
      updated_at: agora,
    })
    .eq("id", params.conversaId)
    .eq("empresa_id", params.empresaId);

  if (error) throw new Error(error.message);
}

export async function assumirConversaParaPendenciaAgenteIa(pendenciaId: string) {
  const { data: pendencia, error: pendenciaError } = await supabaseAdmin
    .from("agente_ia_pendencias")
    .select("id, empresa_id, agente_id, conversa_id, status")
    .eq("id", pendenciaId)
    .maybeSingle();

  if (pendenciaError) throw new Error(pendenciaError.message);
  if (!pendencia) {
    return { assumiu: false, motivo: "pendencia_nao_encontrada" } as const;
  }

  if (["processado", "erro", "cancelado"].includes(String(pendencia.status || ""))) {
    return { assumiu: false, motivo: "pendencia_finalizada" } as const;
  }

  const { data: conversa, error: conversaError } = await supabaseAdmin
    .from("conversas")
    .select("id, status, responsavel_id, bot_ativo, aguardando_atendente")
    .eq("empresa_id", pendencia.empresa_id)
    .eq("id", pendencia.conversa_id)
    .maybeSingle();

  if (conversaError) throw new Error(conversaError.message);
  if (!conversa) {
    return { assumiu: false, motivo: "conversa_nao_encontrada" } as const;
  }

  if (conversaEstaComHumano(conversa)) {
    return { assumiu: false, motivo: "atendimento_humano" } as const;
  }

  if (conversa.bot_ativo === true || String(conversa.status || "") === "bot") {
    return { assumiu: false, motivo: "conversa_ja_com_bot" } as const;
  }

  if (String(conversa.status || "") !== "fila") {
    return { assumiu: false, motivo: "estado_nao_elegivel" } as const;
  }

  const protocoloId = await protocoloAtivoDaConversa(
    pendencia.empresa_id,
    pendencia.conversa_id
  );
  const agora = new Date().toISOString();
  const { data: conversaAssumida, error: assumirError } = await supabaseAdmin
    .from("conversas")
    .update({
      status: "bot",
      bot_ativo: true,
      aguardando_atendente: false,
      origem_atendimento: "bot",
      responsavel_id: null,
      agente_ia_id: pendencia.agente_id,
      agente_ia_protocolo_id: protocoloId,
      agente_ia_fallback_ativo: false,
      closed_at: null,
      updated_at: agora,
    })
    .eq("empresa_id", pendencia.empresa_id)
    .eq("id", pendencia.conversa_id)
    .eq("status", "fila")
    .eq("bot_ativo", false)
    .eq("aguardando_atendente", false)
    .is("responsavel_id", null)
    .select("id")
    .maybeSingle();

  if (assumirError) throw new Error(assumirError.message);

  if (!conversaAssumida) {
    return { assumiu: false, motivo: "estado_alterado_durante_assuncao" } as const;
  }

  return { assumiu: true, motivo: "agente_assumiu_conversa" } as const;
}
