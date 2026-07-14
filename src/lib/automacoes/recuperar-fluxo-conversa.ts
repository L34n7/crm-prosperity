import { processAutomationEngine } from "@/lib/automacoes/process-automation-engine";
import { avaliarElegibilidadeRecuperacaoFluxo } from "@/lib/automacoes/recuperacao-fluxo-policy";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

type MensagemAutomacaoTipo = "texto" | "imagem" | "documento" | "audio" | "video";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecordField(
  source: Record<string, unknown>,
  key: string
): Record<string, unknown> | null {
  const value = source[key];
  return isRecord(value) ? value : null;
}

function getStringField(source: Record<string, unknown> | null, key: string) {
  if (!source) return null;
  const value = source[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function tipoMensagemParaAutomacao(
  tipoMensagem: string | null | undefined
): MensagemAutomacaoTipo {
  if (tipoMensagem === "imagem") return "imagem";
  if (tipoMensagem === "documento") return "documento";
  if (tipoMensagem === "audio") return "audio";
  if (tipoMensagem === "video") return "video";
  return "texto";
}

function extrairMediaId(metadata: Record<string, unknown>) {
  return (
    getStringField(metadata, "media_id") ||
    getStringField(getRecordField(metadata, "image"), "id") ||
    getStringField(getRecordField(metadata, "document"), "id") ||
    getStringField(getRecordField(metadata, "audio"), "id") ||
    getStringField(getRecordField(metadata, "video"), "id")
  );
}

function extrairMimeType(metadata: Record<string, unknown>) {
  return (
    getStringField(metadata, "mime_type") ||
    getStringField(getRecordField(metadata, "image"), "mime_type") ||
    getStringField(getRecordField(metadata, "document"), "mime_type") ||
    getStringField(getRecordField(metadata, "audio"), "mime_type") ||
    getStringField(getRecordField(metadata, "video"), "mime_type")
  );
}

function extrairArquivoNome(metadata: Record<string, unknown>) {
  return (
    getStringField(metadata, "filename") ||
    getStringField(getRecordField(metadata, "document"), "filename")
  );
}

export async function recuperarFluxoConversaPorUltimaMensagem(params: {
  conversaId: string;
  origem: string;
}) {
  const { data: conversa, error: conversaError } = await supabaseAdmin
    .from("conversas")
    .select(
      "id, empresa_id, contato_id, status, bot_ativo, aguardando_atendente, last_inbound_message_at"
    )
    .eq("id", params.conversaId)
    .maybeSingle();

  if (conversaError) {
    throw new Error(`Erro ao buscar conversa: ${conversaError.message}`);
  }

  if (!conversa) {
    return {
      ok: false as const,
      iniciado: false,
      conversaId: params.conversaId,
      empresaId: null,
      motivo: "conversa_nao_encontrada",
    };
  }

  const [
    { data: mensagem, error: mensagemError },
    { data: execucaoAtiva, error: execucaoError },
    { data: contato, error: contatoError },
  ] = await Promise.all([
    supabaseAdmin
      .from("mensagens")
      .select("id, conteudo, tipo_mensagem, metadata_json, created_at")
      .eq("empresa_id", conversa.empresa_id)
      .eq("conversa_id", conversa.id)
      .eq("remetente_tipo", "contato")
      .eq("origem", "recebida")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("automacao_execucoes")
      .select("id, status")
      .eq("empresa_id", conversa.empresa_id)
      .eq("conversa_id", conversa.id)
      .in("status", ["rodando", "aguardando", "pausado"])
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("contatos")
      .select("id, telefone")
      .eq("empresa_id", conversa.empresa_id)
      .eq("id", conversa.contato_id)
      .maybeSingle(),
  ]);

  if (mensagemError) {
    throw new Error(
      `Erro ao buscar última mensagem da conversa: ${mensagemError.message}`
    );
  }

  if (execucaoError) {
    throw new Error(
      `Erro ao verificar execução ativa: ${execucaoError.message}`
    );
  }

  if (contatoError) {
    throw new Error(`Erro ao buscar contato: ${contatoError.message}`);
  }

  if (!mensagem) {
    return {
      ok: false as const,
      iniciado: false,
      conversaId: conversa.id,
      empresaId: conversa.empresa_id,
      motivo: "mensagem_recebida_nao_encontrada",
    };
  }

  if (!contato?.telefone) {
    return {
      ok: false as const,
      iniciado: false,
      conversaId: conversa.id,
      empresaId: conversa.empresa_id,
      motivo: "contato_sem_telefone",
    };
  }

  const metadataAtual = isRecord(mensagem.metadata_json)
    ? mensagem.metadata_json
    : {};
  const elegibilidade = avaliarElegibilidadeRecuperacaoFluxo({
    conversaStatus: conversa.status,
    aguardandoAtendente: conversa.aguardando_atendente,
    mensagemRecebidaEm: mensagem.created_at,
    automacaoProcessada: metadataAtual.automacao_processada === true,
    possuiExecucaoAtiva: !!execucaoAtiva,
  });

  if (!elegibilidade.elegivel) {
    return {
      ok: false as const,
      iniciado: false,
      conversaId: conversa.id,
      empresaId: conversa.empresa_id,
      mensagemId: mensagem.id,
      motivo: elegibilidade.motivo,
    };
  }

  const mensagemRecebidaEmMs = new Date(mensagem.created_at).getTime();
  const ultimaEntradaAtualMs = conversa.last_inbound_message_at
    ? new Date(conversa.last_inbound_message_at).getTime()
    : Number.NaN;

  if (
    !Number.isFinite(ultimaEntradaAtualMs) ||
    mensagemRecebidaEmMs > ultimaEntradaAtualMs
  ) {
    let atualizarUltimaEntrada = supabaseAdmin
      .from("conversas")
      .update({
        last_inbound_message_at: mensagem.created_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversa.id)
      .eq("empresa_id", conversa.empresa_id);

    atualizarUltimaEntrada = Number.isFinite(ultimaEntradaAtualMs)
      ? atualizarUltimaEntrada.lt(
          "last_inbound_message_at",
          mensagem.created_at
        )
      : atualizarUltimaEntrada.is("last_inbound_message_at", null);

    const { error: atualizarUltimaEntradaError } =
      await atualizarUltimaEntrada;

    if (atualizarUltimaEntradaError) {
      throw new Error(
        `Erro ao corrigir última entrada da conversa: ${atualizarUltimaEntradaError.message}`
      );
    }
  }

  const mediaId = extrairMediaId(metadataAtual);
  const mimeType = extrairMimeType(metadataAtual);
  const arquivoNome = extrairArquivoNome(metadataAtual);
  const mensagemTexto =
    String(mensagem.conteudo || "").trim() ||
    arquivoNome ||
    "mensagem_recebida";
  const automationResultRaw = await processAutomationEngine({
    empresaId: conversa.empresa_id,
    conversaId: conversa.id,
    contatoId: conversa.contato_id,
    mensagemTexto,
    numeroDestino: contato.telefone,
    mensagemTipo: tipoMensagemParaAutomacao(mensagem.tipo_mensagem),
    mediaId,
    mimeType,
    arquivoNome,
    mensagemId: mensagem.id,
  });
  const automationResult: Record<string, unknown> = isRecord(
    automationResultRaw
  )
    ? automationResultRaw
    : {};
  const automationStatus = getStringField(automationResult, "status");
  const automationExecucaoId = getStringField(automationResult, "execucaoId");
  const automationFluxoId = getStringField(automationResult, "fluxoId");
  const automationError = getStringField(automationResult, "error");
  const agora = new Date().toISOString();
  const automacaoProcessada = automationResult.ok === true;

  const { error: mensagemUpdateError } = await supabaseAdmin
    .from("mensagens")
    .update({
      automacao_execucao_id: automationExecucaoId,
      metadata_json: {
        ...metadataAtual,
        ...(automacaoProcessada
          ? {
              automacao_processada: true,
              automacao_processada_em: agora,
            }
          : {}),
        automacao_resultado: automationResult,
        automacao_recuperacao_cross_empresa: true,
        automacao_recuperacao_origem: params.origem,
        automacao_recuperacao_tentada_em: agora,
      },
    })
    .eq("id", mensagem.id)
    .eq("empresa_id", conversa.empresa_id);

  if (mensagemUpdateError) {
    console.error(
      "[RECUPERACAO FLUXO] Erro ao registrar resultado na mensagem:",
      mensagemUpdateError
    );
  }

  return {
    ok: automationResult.ok === true,
    iniciado: automationStatus === "execucao_criada",
    conversaId: conversa.id,
    empresaId: conversa.empresa_id,
    mensagemId: mensagem.id,
    motivo:
      automationStatus === "execucao_criada"
        ? null
        : automationStatus || "automacao_nao_iniciada",
    automationStatus,
    automationExecucaoId,
    automationFluxoId,
    automationError,
  };
}
