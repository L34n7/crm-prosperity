import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  aplicarBloqueioOperacionalWhatsappMeta,
  statusWhatsappMetaBloqueado,
  WHATSAPP_META_BLOCK_DESCRIPTION,
} from "@/lib/whatsapp/meta-block";
import { notificarCampanhaDisparoPausada } from "@/lib/whatsapp/disparo-alertas";

type UpdateMessageStatusParams = {
  mensagemExternaId: string;
  status: "enviada" | "entregue" | "lida" | "falha";
  timestamp?: string | null;
  metadata?: Record<string, unknown> | null;
};

type MensagemStatusRow = {
  id: string;
  empresa_id?: string | null;
  conversa_id?: string | null;
  status_envio?: string | null;
  metadata_json?: Record<string, unknown> | null;
};

type ContextoIntegracao = {
  empresaId: string;
  integracaoId: string;
};

type CampanhaPausadaRow = {
  id?: string | null;
  usuario_id?: string | null;
};

const ERRO_META_CONTA_BLOQUEADA = 131031;
const supabaseAdmin = getSupabaseAdmin();

const ORDEM_STATUS: Record<string, number> = {
  pendente: 0,
  enviada: 1,
  entregue: 2,
  lida: 3,
  falha: 99,
};

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function primeiroErroMeta(metadata?: Record<string, unknown> | null) {
  const rawStatus = objeto(objeto(metadata).raw_status);
  const errors = Array.isArray(rawStatus.errors) ? rawStatus.errors : [];
  return objeto(errors[0]);
}

function extrairCodigoErroMeta(metadata?: Record<string, unknown> | null) {
  const codigo = Number(primeiroErroMeta(metadata).code);
  return Number.isFinite(codigo) ? codigo : null;
}

function extrairDetalheErroMeta(metadata?: Record<string, unknown> | null) {
  const erro = primeiroErroMeta(metadata);
  const errorData = objeto(erro.error_data);

  return (
    String(errorData.details || erro.message || erro.title || "").trim() ||
    "Business Account locked"
  );
}

async function resolverContextoIntegracao(
  mensagemExternaId: string,
  mensagem?: MensagemStatusRow | null
): Promise<ContextoIntegracao | null> {
  const empresaMensagem = String(mensagem?.empresa_id || "").trim();
  const conversaId = String(mensagem?.conversa_id || "").trim();

  if (conversaId) {
    const { data: conversa, error } = await supabaseAdmin
      .from("conversas")
      .select("empresa_id, integracao_whatsapp_id")
      .eq("id", conversaId)
      .maybeSingle();

    if (error) {
      console.warn(
        "[WHATSAPP META BLOCK] Erro ao localizar integração pela conversa:",
        error
      );
    }

    const empresaId = String(conversa?.empresa_id || empresaMensagem).trim();
    const integracaoId = String(
      conversa?.integracao_whatsapp_id || ""
    ).trim();

    if (empresaId && integracaoId) {
      return { empresaId, integracaoId };
    }
  }

  for (const tabela of [
    "whatsapp_disparos_logs",
    "whatsapp_disparo_itens",
  ] as const) {
    const { data, error } = await supabaseAdmin
      .from(tabela)
      .select("empresa_id, integracao_whatsapp_id")
      .eq("message_id", mensagemExternaId)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn(
        `[WHATSAPP META BLOCK] Erro ao localizar integração em ${tabela}:`,
        error
      );
      continue;
    }

    const empresaId = String(data?.empresa_id || empresaMensagem).trim();
    const integracaoId = String(data?.integracao_whatsapp_id || "").trim();

    if (empresaId && integracaoId) {
      return { empresaId, integracaoId };
    }
  }

  return null;
}

async function pausarCampanhasDaIntegracao(params: {
  empresaId: string;
  integracaoId: string;
  motivo: string;
}) {
  const agora = new Date().toISOString();
  const { data: campanhas, error } = await supabaseAdmin
    .from("whatsapp_disparo_campanhas")
    .update({
      status: "pausada_por_conta_bloqueada",
      pausa_motivo: params.motivo,
      erro: params.motivo,
      paused_at: agora,
      updated_at: agora,
      metadata_json: {
        erro_codigo_meta: ERRO_META_CONTA_BLOQUEADA,
        pausa_automatica: true,
        origem_pausa: "webhook_status_meta",
      },
    })
    .eq("empresa_id", params.empresaId)
    .eq("integracao_whatsapp_id", params.integracaoId)
    .in("status", ["pendente", "enviando"])
    .select("id, usuario_id");

  if (error) {
    console.warn(
      "[WHATSAPP META BLOCK] Erro ao pausar campanhas da integração:",
      error
    );
    return 0;
  }

  const campanhasPausadas = (campanhas || []) as CampanhaPausadaRow[];
  const campanhaIds = campanhasPausadas
    .map((campanha) => String(campanha.id || "").trim())
    .filter(Boolean);

  if (campanhaIds.length === 0) {
    return 0;
  }

  const { error: itensError } = await supabaseAdmin
    .from("whatsapp_disparo_itens")
    .update({
      status: "cancelado",
      erro: params.motivo,
      locked_at: null,
      processed_at: agora,
      updated_at: agora,
      metadata_json: {
        motivo_cancelamento: "conta_whatsapp_meta_bloqueada",
        erro_codigo_meta: ERRO_META_CONTA_BLOQUEADA,
      },
    })
    .in("campanha_id", campanhaIds)
    .in("status", ["pendente", "processando"]);

  if (itensError) {
    console.warn(
      "[WHATSAPP META BLOCK] Erro ao cancelar itens das campanhas:",
      itensError
    );
  }

  for (const campanha of campanhasPausadas) {
    const campanhaId = String(campanha.id || "").trim();
    if (!campanhaId) continue;

    const { error: resumoError } = await supabaseAdmin.rpc(
      "recalcular_whatsapp_disparo_campanha",
      { p_campanha_id: campanhaId }
    );

    if (resumoError) {
      console.warn(
        "[WHATSAPP META BLOCK] Erro ao recalcular campanha pausada:",
        { campanhaId, erro: resumoError }
      );
    }

    const { error: agendamentoError } = await supabaseAdmin.rpc(
      "sincronizar_automacao_agendamentos_campanha",
      { p_campanha_id: campanhaId }
    );

    if (agendamentoError && agendamentoError.code !== "PGRST202") {
      console.warn(
        "[WHATSAPP META BLOCK] Erro ao sincronizar agendamento da campanha:",
        { campanhaId, erro: agendamentoError }
      );
    }

    try {
      await notificarCampanhaDisparoPausada({
        empresaId: params.empresaId,
        campanhaId,
        integracaoWhatsappId: params.integracaoId,
        usuarioId: campanha.usuario_id || null,
        statusPausa: "pausada_por_conta_bloqueada",
        motivo: params.motivo,
        erroCodigoMeta: ERRO_META_CONTA_BLOQUEADA,
      });
    } catch (notificationError) {
      console.warn(
        "[WHATSAPP META BLOCK] Erro ao notificar campanha pausada:",
        { campanhaId, erro: notificationError }
      );
    }
  }

  return campanhaIds.length;
}

async function tratarErroMetaContaBloqueada(params: {
  mensagemExternaId: string;
  mensagem?: MensagemStatusRow | null;
  metadata?: Record<string, unknown> | null;
}) {
  if (extrairCodigoErroMeta(params.metadata) !== ERRO_META_CONTA_BLOQUEADA) {
    return;
  }

  const contexto = await resolverContextoIntegracao(
    params.mensagemExternaId,
    params.mensagem
  );

  if (!contexto) {
    console.error(
      "[WHATSAPP META BLOCK] Erro 131031 recebido, mas a integração não foi localizada:",
      { mensagemExternaId: params.mensagemExternaId }
    );
    return;
  }

  const { data: integracao, error } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select(
      "id, empresa_id, phone_number_id, status, phone_number_status, quality_rating, meta_messaging_limit_tier, meta_messaging_limit, meta_account_mode, meta_saude_raw_json"
    )
    .eq("id", contexto.integracaoId)
    .eq("empresa_id", contexto.empresaId)
    .maybeSingle();

  if (error || !integracao) {
    console.error(
      "[WHATSAPP META BLOCK] Erro ao carregar integração para o bloqueio:",
      error || contexto
    );
    return;
  }

  const agora = new Date().toISOString();
  const detalhe = extrairDetalheErroMeta(params.metadata);
  const motivo = `${WHATSAPP_META_BLOCK_DESCRIPTION} Código Meta: 131031.`;
  const jaEstavaBloqueada =
    statusWhatsappMetaBloqueado(integracao.status) ||
    statusWhatsappMetaBloqueado(integracao.phone_number_status);
  const rawStatus = objeto(objeto(params.metadata).raw_status);
  const rawSaudeAnterior = objeto(integracao.meta_saude_raw_json);
  const rawBloqueio = {
    ...rawSaudeAnterior,
    ultimo_bloqueio_meta: {
      codigo: ERRO_META_CONTA_BLOQUEADA,
      detalhe,
      mensagem_externa_id: params.mensagemExternaId,
      recebido_em: agora,
      origem: "webhook_status_meta",
      raw_status: rawStatus,
    },
  };

  const { error: updateError } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .update({
      status: "erro",
      phone_number_status: "BANNED",
      onboarding_erro: motivo,
      meta_saude_ultima_verificacao_em: agora,
      meta_saude_raw_json: rawBloqueio,
      updated_at: agora,
    })
    .eq("id", contexto.integracaoId)
    .eq("empresa_id", contexto.empresaId);

  if (updateError) {
    console.error(
      "[WHATSAPP META BLOCK] Erro ao marcar integração como bloqueada:",
      updateError
    );
    return;
  }

  if (!jaEstavaBloqueada) {
    const { error: historicoError } = await supabaseAdmin
      .from("whatsapp_meta_saude_historico")
      .insert({
        empresa_id: contexto.empresaId,
        integracao_whatsapp_id: contexto.integracaoId,
        phone_number_id: integracao.phone_number_id || null,
        phone_number_status: "BANNED",
        quality_rating: integracao.quality_rating || null,
        messaging_limit_tier: integracao.meta_messaging_limit_tier || null,
        messaging_limit: integracao.meta_messaging_limit || null,
        account_mode: integracao.meta_account_mode || null,
        raw_json: rawBloqueio,
        created_at: agora,
      });

    if (historicoError) {
      console.warn(
        "[WHATSAPP META BLOCK] Erro ao registrar histórico do bloqueio:",
        historicoError
      );
    }
  }

  const resultadoOperacional = await aplicarBloqueioOperacionalWhatsappMeta({
    empresaId: contexto.empresaId,
    integracaoId: contexto.integracaoId,
    motivo,
  });

  const campanhasPausadas = await pausarCampanhasDaIntegracao({
    empresaId: contexto.empresaId,
    integracaoId: contexto.integracaoId,
    motivo,
  });

  console.error("[WHATSAPP META BLOCK] Conta bloqueada pela Meta:", {
    codigo: ERRO_META_CONTA_BLOQUEADA,
    detalhe,
    empresaId: contexto.empresaId,
    integracaoId: contexto.integracaoId,
    mensagemExternaId: params.mensagemExternaId,
    jaEstavaBloqueada,
    campanhasPausadas,
    ...resultadoOperacional,
  });
}

export async function updateWhatsAppMessageStatus({
  mensagemExternaId,
  status,
  timestamp = null,
  metadata = null,
}: UpdateMessageStatusParams) {
  if (!mensagemExternaId) {
    throw new Error("mensagemExternaId é obrigatório");
  }

  const codigoErroMeta = extrairCodigoErroMeta(metadata);
  const { data: mensagemAtual, error: findError } = await supabaseAdmin
    .from("mensagens")
    .select("id, empresa_id, conversa_id, status_envio, metadata_json")
    .eq("mensagem_externa_id", mensagemExternaId)
    .limit(1)
    .maybeSingle();

  if (findError) {
    throw new Error(`Erro ao localizar mensagem: ${findError.message}`);
  }

  if (!mensagemAtual) {
    if (status === "falha" && codigoErroMeta === ERRO_META_CONTA_BLOQUEADA) {
      try {
        await tratarErroMetaContaBloqueada({
          mensagemExternaId,
          metadata,
        });
      } catch (blockError) {
        console.error(
          "[WHATSAPP META BLOCK] Falha inesperada na tratativa do erro 131031:",
          blockError
        );
      }
    }

    return {
      updated: false,
      found: false,
      reason: "Mensagem não encontrada pelo mensagem_externa_id",
    };
  }

  const statusAtual = mensagemAtual.status_envio || "pendente";
  const ordemAtual = ORDEM_STATUS[statusAtual] ?? 0;
  const ordemNova = ORDEM_STATUS[status] ?? 0;
  const deveAtualizar = status === "falha" || ordemNova >= ordemAtual;

  if (!deveAtualizar) {
    return {
      updated: false,
      found: true,
      reason: "Status recebido é anterior ao status atual",
      messageId: mensagemAtual.id,
    };
  }

  const metadataAtual: Record<string, unknown> = objeto(
    mensagemAtual.metadata_json
  );
  const whatsappStatusAnterior = objeto(metadataAtual.whatsapp_status);
  const metadataFinal = {
    ...metadataAtual,
    whatsapp_status: {
      ...whatsappStatusAnterior,
      ultimo_status: status,
      atualizado_em_webhook: new Date().toISOString(),
      timestamp_evento_whatsapp: timestamp,
      codigo_erro_meta: codigoErroMeta,
      ...(metadata ?? {}),
    },
  };

  const { error: updateError } = await supabaseAdmin
    .from("mensagens")
    .update({
      status_envio: status,
      metadata_json: metadataFinal,
      updated_at: new Date().toISOString(),
    })
    .eq("id", mensagemAtual.id);

  if (updateError) {
    throw new Error(`Erro ao atualizar status da mensagem: ${updateError.message}`);
  }

  if (status === "falha" && codigoErroMeta === ERRO_META_CONTA_BLOQUEADA) {
    try {
      await tratarErroMetaContaBloqueada({
        mensagemExternaId,
        mensagem: mensagemAtual,
        metadata,
      });
    } catch (blockError) {
      console.error(
        "[WHATSAPP META BLOCK] Falha inesperada na tratativa do erro 131031:",
        blockError
      );
    }
  }

  return {
    updated: true,
    found: true,
    messageId: mensagemAtual.id,
    status,
  };
}
