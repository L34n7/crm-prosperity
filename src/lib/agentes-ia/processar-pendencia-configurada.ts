import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buscarSaldoTokensIa } from "@/lib/ia/tokens";
import { processarCapturaPendenteAgente } from "./captura-contato";
import { executarContingenciaAgente } from "./fallback";
import { detectarAutomacaoExterna, type ResultadoDeteccaoAutomacaoExterna } from "./protecao-automacao-externa";
import { processarPendenciaAgenteIa as processarPendenciaAgenteIaBase } from "./runtime-v3";
import { processarPendenciaNegocio } from "./runtime-negocio";

const supabaseAdmin = getSupabaseAdmin();

type PendenciaRow = {
  id: string;
  empresa_id: string;
  agente_id: string;
  conversa_id: string;
  contato_id?: string | null;
  numero_destino?: string | null;
  mensagem_ids: string[];
  conteudo_agregado: string;
  processar_em?: string | null;
  status?: string | null;
  versao: number;
};

function conversaComHumano(conversa: {
  status?: string | null;
  bot_ativo?: boolean | null;
  aguardando_atendente?: boolean | null;
} | null) {
  if (!conversa) return false;
  if (conversa.aguardando_atendente === true) return true;
  return (
    conversa.bot_ativo !== true &&
    ["fila", "em_atendimento"].includes(String(conversa.status || ""))
  );
}

async function processarSemTokens(
  pendenciaId: string,
  options: { forcar?: boolean }
) {
  const lockToken = crypto.randomUUID();
  const { data: reservada, error: reservaError } = await supabaseAdmin.rpc(
    "agente_ia_reservar_pendencia",
    {
      p_pendencia_id: pendenciaId,
      p_lock_token: lockToken,
      p_forcar: options.forcar === true,
    }
  );
  if (reservaError) throw new Error(reservaError.message);
  if (!reservada) {
    return {
      ok: true,
      processado: false,
      motivo: "pendencia_indisponivel_ou_debounce",
    };
  }

  const pendencia = reservada as PendenciaRow;
  const inicio = Date.now();
  const { data: agente, error: agenteError } = await supabaseAdmin
    .from("agentes_ia")
    .select("id, empresa_id, status, fallback_tipo, fallback_fluxo_id, fallback_transferencia_json")
    .eq("empresa_id", pendencia.empresa_id)
    .eq("id", pendencia.agente_id)
    .eq("status", "ativo")
    .maybeSingle();

  if (agenteError || !agente) {
    await supabaseAdmin.rpc("agente_ia_finalizar_pendencia", {
      p_pendencia_id: pendencia.id,
      p_lock_token: lockToken,
      p_versao: pendencia.versao,
      p_status: "cancelado",
      p_erro: "agente_inativo_ou_removido",
    });
    return { ok: true, processado: false, motivo: "agente_inativo_ou_removido" };
  }

  const agora = new Date().toISOString();
  const { data: execucao, error: execucaoError } = await supabaseAdmin
    .from("agente_ia_execucoes")
    .insert({
      empresa_id: pendencia.empresa_id,
      agente_id: agente.id,
      conversa_id: pendencia.conversa_id,
      contato_id: pendencia.contato_id || null,
      mensagem_ids: pendencia.mensagem_ids,
      status: "processando",
      entrada_resumida: pendencia.conteudo_agregado.slice(0, 4000),
      modelo: "contingencia_sem_ia",
      started_at: agora,
      metadata_json: { motivo: "saldo_tokens_ia_esgotado" },
    })
    .select("id")
    .single();
  if (execucaoError || !execucao) {
    throw new Error(execucaoError?.message || "Não foi possível registrar a contingência do agente.");
  }

  let resultado: Awaited<ReturnType<typeof executarContingenciaAgente>>;
  try {
    resultado = await executarContingenciaAgente(agente, pendencia);
  } catch (error) {
    resultado = {
      ok: false,
      tipo: String(agente.fallback_tipo || "nenhum"),
      executado: false,
      motivo: "erro_contingencia",
      error: error instanceof Error ? error.message : String(error),
    } as Awaited<ReturnType<typeof executarContingenciaAgente>>;
  }

  const finalAgora = new Date().toISOString();
  await supabaseAdmin
    .from("agente_ia_execucoes")
    .update({
      status: "fallback",
      erro:
        resultado.ok === true
          ? resultado.tipo === "nenhum"
            ? "saldo_tokens_ia_esgotado_sem_contingencia"
            : "saldo_tokens_ia_esgotado"
          : `saldo_tokens_ia_esgotado_contingencia_falhou: ${String((resultado as { error?: string }).error || "erro")}`,
      latencia_ms: Date.now() - inicio,
      finished_at: finalAgora,
      updated_at: finalAgora,
      metadata_json: {
        motivo: "saldo_tokens_ia_esgotado",
        contingencia: resultado,
      },
    })
    .eq("id", execucao.id);

  await supabaseAdmin.rpc("agente_ia_finalizar_pendencia", {
    p_pendencia_id: pendencia.id,
    p_lock_token: lockToken,
    p_versao: pendencia.versao,
    p_status: "processado",
    p_erro: resultado.ok === true ? null : String((resultado as { error?: string }).error || "erro_contingencia"),
  });

  return {
    ok: resultado.ok === true,
    processado: true,
    fallback: true,
    motivo: "saldo_tokens_ia_esgotado",
    contingencia: resultado,
  };
}

function configTransferenciaAutomatica(
  ferramenta: { config_json?: Record<string, unknown> | null } | null,
  fallback: Record<string, unknown> | null | undefined
) {
  const configFerramenta = ferramenta?.config_json || {};
  const setorId = String(configFerramenta.setor_id || "").trim() || null;
  if (ferramenta) {
    return {
      escopo_fila: setorId ? "setor" : "geral",
      setor_id: setorId,
      estrategia_transferencia: configFerramenta.estrategia_transferencia || "fila_setor",
      atendente_id: configFerramenta.atendente_id || null,
      incluir_administradores_distribuicao:
        configFerramenta.incluir_administradores === true,
      mensagem: "",
    };
  }

  const configFallback = fallback || {};
  return {
    ...configFallback,
    escopo_fila:
      String(configFallback.escopo_fila || "").trim() === "setor" &&
      String(configFallback.setor_id || "").trim()
        ? "setor"
        : "geral",
    mensagem: "",
  };
}

async function transferirParaFilaGeralComoProtecao(pendencia: PendenciaRow) {
  const agora = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("conversas")
    .update({
      setor_id: null,
      escopo_fila: "geral",
      status: "fila",
      responsavel_id: null,
      bot_ativo: false,
      aguardando_atendente: true,
      agente_ia_id: null,
      agente_ia_fallback_ativo: false,
      updated_at: agora,
    })
    .eq("empresa_id", pendencia.empresa_id)
    .eq("id", pendencia.conversa_id);
  if (error) throw new Error(error.message);
  return {
    ok: true,
    tipo: "transferir_humano",
    setorId: null,
    responsavelId: null,
    estrategiaAplicada: "fila_setor",
    fallbackMotivo: "protecao_automacao_externa_fila_geral",
  };
}

async function processarAutomacaoExterna(
  pendenciaId: string,
  options: { forcar?: boolean },
  deteccao: ResultadoDeteccaoAutomacaoExterna
) {
  const lockToken = crypto.randomUUID();
  const { data: reservada, error: reservaError } = await supabaseAdmin.rpc(
    "agente_ia_reservar_pendencia",
    {
      p_pendencia_id: pendenciaId,
      p_lock_token: lockToken,
      p_forcar: options.forcar === true,
    }
  );
  if (reservaError) throw new Error(reservaError.message);
  if (!reservada) {
    return processarPendenciaAgenteIaBase(pendenciaId, options);
  }

  const pendencia = reservada as PendenciaRow;
  const inicio = Date.now();
  const [
    { data: agente, error: agenteError },
    { data: ferramentaTransferencia },
    { data: conversaAtual },
  ] = await Promise.all([
    supabaseAdmin
      .from("agentes_ia")
      .select("id, empresa_id, status, fallback_transferencia_json")
      .eq("empresa_id", pendencia.empresa_id)
      .eq("id", pendencia.agente_id)
      .eq("status", "ativo")
      .maybeSingle(),
    supabaseAdmin
      .from("agente_ia_ferramentas")
      .select("config_json")
      .eq("empresa_id", pendencia.empresa_id)
      .eq("agente_id", pendencia.agente_id)
      .eq("tipo", "transferir_humano")
      .eq("ativo", true)
      .maybeSingle(),
    supabaseAdmin
      .from("conversas")
      .select("id, status, bot_ativo, aguardando_atendente, responsavel_id")
      .eq("empresa_id", pendencia.empresa_id)
      .eq("id", pendencia.conversa_id)
      .maybeSingle(),
  ]);

  if (conversaComHumano(conversaAtual)) {
    await supabaseAdmin.rpc("agente_ia_finalizar_pendencia", {
      p_pendencia_id: pendencia.id,
      p_lock_token: lockToken,
      p_versao: pendencia.versao,
      p_status: "cancelado",
      p_erro: "atendimento_humano",
    });
    return { ok: true, processado: false, motivo: "atendimento_humano" };
  }

  if (agenteError || !agente) {
    await supabaseAdmin.rpc("agente_ia_finalizar_pendencia", {
      p_pendencia_id: pendencia.id,
      p_lock_token: lockToken,
      p_versao: pendencia.versao,
      p_status: "cancelado",
      p_erro: "agente_inativo_ou_removido",
    });
    return { ok: true, processado: false, motivo: "agente_inativo_ou_removido" };
  }

  const agora = new Date().toISOString();
  const { data: execucao, error: execucaoError } = await supabaseAdmin
    .from("agente_ia_execucoes")
    .insert({
      empresa_id: pendencia.empresa_id,
      agente_id: agente.id,
      conversa_id: pendencia.conversa_id,
      contato_id: pendencia.contato_id || null,
      mensagem_ids: pendencia.mensagem_ids,
      status: "processando",
      entrada_resumida: pendencia.conteudo_agregado.slice(0, 4000),
      modelo: "protecao_automacao_externa",
      started_at: agora,
      metadata_json: {
        motivo: "possivel_automacao_externa",
        deteccao,
      },
    })
    .select("id")
    .single();
  if (execucaoError || !execucao) {
    throw new Error(
      execucaoError?.message ||
        "Não foi possível registrar a proteção contra automação externa."
    );
  }

  const config = configTransferenciaAutomatica(
    ferramentaTransferencia as { config_json?: Record<string, unknown> | null } | null,
    (agente.fallback_transferencia_json || {}) as Record<string, unknown>
  );

  let transferencia: Record<string, unknown>;
  try {
    transferencia = (await executarContingenciaAgente(
      {
        id: agente.id,
        empresa_id: agente.empresa_id,
        fallback_tipo: "transferir_humano",
        fallback_transferencia_json: config,
      },
      pendencia
    )) as unknown as Record<string, unknown>;
  } catch (error) {
    console.error(
      "[AGENTE_IA] Transferência da proteção anti-loop falhou; usando fila geral:",
      error
    );
    transferencia = await transferirParaFilaGeralComoProtecao(pendencia);
  }

  await supabaseAdmin
    .from("conversas")
    .update({ agente_ia_fallback_ativo: false, updated_at: new Date().toISOString() })
    .eq("empresa_id", pendencia.empresa_id)
    .eq("id", pendencia.conversa_id);

  const finalAgora = new Date().toISOString();
  await supabaseAdmin
    .from("agente_ia_execucoes")
    .update({
      status: "concluido",
      resposta: null,
      ferramentas_json: [
        {
          nome: "transferir_humano_automatico",
          argumentos: { motivo: "possivel_automacao_externa" },
          resultado: transferencia,
        },
      ],
      tokens_input: 0,
      tokens_output: 0,
      tokens_total: 0,
      latencia_ms: Date.now() - inicio,
      finished_at: finalAgora,
      updated_at: finalAgora,
      metadata_json: {
        motivo: "possivel_automacao_externa",
        deteccao,
        transferencia,
      },
    })
    .eq("id", execucao.id);

  await supabaseAdmin.rpc("agente_ia_finalizar_pendencia", {
    p_pendencia_id: pendencia.id,
    p_lock_token: lockToken,
    p_versao: pendencia.versao,
    p_status: "processado",
    p_erro: null,
  });

  return {
    ok: true,
    processado: true,
    transferidoHumano: true,
    motivo: "possivel_automacao_externa",
    deteccao,
    transferencia,
  };
}

export async function processarPendenciaAgenteIa(
  pendenciaId: string,
  options: { forcar?: boolean } = {}
) {
  const { data: pendencia, error } = await supabaseAdmin
    .from("agente_ia_pendencias")
    .select(
      "id, empresa_id, agente_id, conversa_id, conteudo_agregado, processar_em, status"
    )
    .eq("id", pendenciaId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!pendencia)
    return { ok: true, processado: false, motivo: "pendencia_nao_encontrada" };

  if (["processado", "erro", "cancelado"].includes(String(pendencia.status || ""))) {
    return { ok: true, processado: false, motivo: "pendencia_finalizada" };
  }

  try {
    const captura = await processarCapturaPendenteAgente(pendenciaId);
    if (captura.capturado) {
      console.info("[AGENTE_IA] Informação capturada e salva nos detalhes do contato", {
        pendenciaId,
        tipo: "tipo" in captura ? captura.tipo : undefined,
        registroId: "registroId" in captura ? captura.registroId : undefined,
      });
    }
  } catch (capturaError) {
    console.error(
      "[AGENTE_IA] Falha ao persistir captura do contato; atendimento seguirá normalmente:",
      capturaError
    );
  }

  const deteccao = await detectarAutomacaoExterna({
    empresaId: pendencia.empresa_id,
    conversaId: pendencia.conversa_id,
    conteudoAgregado: pendencia.conteudo_agregado,
  });
  if (deteccao.detectado) {
    return processarAutomacaoExterna(pendenciaId, options, deteccao);
  }

  const saldo = await buscarSaldoTokensIa(pendencia.empresa_id);
  if (saldo.limite !== null && Number(saldo.restantes || 0) <= 0) {
    return processarSemTokens(pendenciaId, options);
  }

  const negocio = await processarPendenciaNegocio(pendenciaId, options);
  if (negocio.tratado) {
    return (
      negocio.resultado || {
        ok: true,
        processado: true,
        runtime: "negocio",
      }
    );
  }

  return processarPendenciaAgenteIaBase(pendenciaId, options);
}
