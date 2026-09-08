import OpenAI from "openai";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buscarSaldoTokensIa, registrarUsoTokensIa } from "@/lib/ia/tokens";
import { getWhatsAppAccessToken } from "@/lib/whatsapp/access-token";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/send-text-message";

const supabaseAdmin = getSupabaseAdmin();
const MODELO_PADRAO = process.env.OPENAI_AGENT_MODEL?.trim() || "gpt-5.6-luna";
const JANELA_WHATSAPP_MS = 24 * 60 * 60 * 1000;
const MARGEM_JANELA_MS = 60 * 1000;
const MAX_TENTATIVAS = 3;

export type FollowupInatividadeConfig = {
  ativo: boolean;
  tentativas: number;
  intervalos_minutos: number[];
};

export const FOLLOWUP_INATIVIDADE_PADRAO: FollowupInatividadeConfig = {
  ativo: false,
  tentativas: 2,
  intervalos_minutos: [30, 180, 720],
};

function numeroInteiro(valor: unknown, fallback: number, minimo: number, maximo: number) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return fallback;
  return Math.min(maximo, Math.max(minimo, Math.floor(numero)));
}

export function normalizarFollowupInatividade(valor: unknown): FollowupInatividadeConfig {
  const obj = valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
  const tentativas = numeroInteiro(obj.tentativas, FOLLOWUP_INATIVIDADE_PADRAO.tentativas, 1, MAX_TENTATIVAS);
  const recebidos = Array.isArray(obj.intervalos_minutos) ? obj.intervalos_minutos : [];
  const intervalos = FOLLOWUP_INATIVIDADE_PADRAO.intervalos_minutos.map((padrao, indice) =>
    numeroInteiro(recebidos[indice], padrao, 1, 1380)
  );
  return {
    ativo: obj.ativo === true,
    tentativas,
    intervalos_minutos: intervalos,
  };
}

function configDoAgente(agente: { metadata_json?: Record<string, unknown> | null }) {
  const metadata = agente.metadata_json && typeof agente.metadata_json === "object"
    ? agente.metadata_json
    : {};
  return normalizarFollowupInatividade(metadata.followup_inatividade);
}

function dentroDaJanela24h(createdAt: string | null | undefined, referencia = Date.now()) {
  if (!createdAt) return false;
  const criado = new Date(createdAt).getTime();
  if (!Number.isFinite(criado)) return false;
  const idade = referencia - criado;
  return idade >= 0 && idade < JANELA_WHATSAPP_MS - MARGEM_JANELA_MS;
}

async function ultimaMensagemContato(empresaId: string, conversaId: string) {
  const { data, error } = await supabaseAdmin
    .from("mensagens")
    .select("id, created_at")
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .eq("remetente_tipo", "contato")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

async function ultimaMensagemSaida(empresaId: string, conversaId: string) {
  const { data, error } = await supabaseAdmin
    .from("mensagens")
    .select("id, remetente_tipo, metadata_json, created_at")
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .neq("remetente_tipo", "contato")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

export async function cancelarFollowupsPendentesAgenteIa(params: {
  empresaId: string;
  conversaId: string;
  motivo?: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("automacao_agendamentos")
    .select("id, payload_json")
    .eq("empresa_id", params.empresaId)
    .eq("tipo_agendamento", "followup_agente_ia")
    .eq("status", "pendente")
    .contains("payload_json", { conversa_id: params.conversaId });
  if (error) {
    console.error("[AGENTE_IA_FOLLOWUP] Falha ao localizar follow-ups pendentes:", error);
    return 0;
  }
  if (!data?.length) return 0;
  const agora = new Date().toISOString();
  for (const item of data) {
    await supabaseAdmin
      .from("automacao_agendamentos")
      .update({
        status: "cancelado",
        executed_at: agora,
        payload_json: {
          ...(item.payload_json || {}),
          motivo_cancelamento: params.motivo || "followup_substituido",
          cancelado_em: agora,
        },
      })
      .eq("id", item.id)
      .eq("empresa_id", params.empresaId)
      .eq("status", "pendente");
  }
  return data.length;
}

export async function agendarFollowupAgenteIa(params: {
  empresaId: string;
  agenteId: string;
  conversaId: string;
  numeroDestino: string;
  ultimaMensagemContatoId: string;
  proximaAcao?: string | null;
  tentativa?: number;
  referenciaExecucaoId?: string | null;
  cancelarAnteriores?: boolean;
}) {
  const tentativa = numeroInteiro(params.tentativa, 1, 1, MAX_TENTATIVAS);
  const { data: agente, error: agenteError } = await supabaseAdmin
    .from("agentes_ia")
    .select("id, status, metadata_json")
    .eq("empresa_id", params.empresaId)
    .eq("id", params.agenteId)
    .maybeSingle();
  if (agenteError) throw new Error(agenteError.message);
  if (!agente || agente.status !== "ativo") return { agendado: false, motivo: "agente_inativo" };

  const config = configDoAgente(agente);
  if (!config.ativo || tentativa > config.tentativas) {
    return { agendado: false, motivo: "followup_desativado_ou_limite" };
  }

  const ultimaEntrada = await ultimaMensagemContato(params.empresaId, params.conversaId);
  if (!ultimaEntrada || ultimaEntrada.id !== params.ultimaMensagemContatoId) {
    return { agendado: false, motivo: "cliente_ja_respondeu" };
  }
  if (!dentroDaJanela24h(ultimaEntrada.created_at)) {
    return { agendado: false, motivo: "fora_janela_24h" };
  }

  if (params.cancelarAnteriores !== false) {
    await cancelarFollowupsPendentesAgenteIa({
      empresaId: params.empresaId,
      conversaId: params.conversaId,
      motivo: "novo_followup_agendado",
    });
  }

  const intervaloMinutos = config.intervalos_minutos[tentativa - 1] || 30;
  const executarEmMs = Date.now() + intervaloMinutos * 60 * 1000;
  const limiteJanelaMs = new Date(ultimaEntrada.created_at).getTime() + JANELA_WHATSAPP_MS - MARGEM_JANELA_MS;
  if (executarEmMs >= limiteJanelaMs) {
    return { agendado: false, motivo: "proxima_tentativa_fora_janela_24h" };
  }

  const payload = {
    origem: "agente_ia_followup",
    agente_id: params.agenteId,
    conversa_id: params.conversaId,
    numero_destino: params.numeroDestino,
    tentativa,
    ultima_mensagem_contato_id: params.ultimaMensagemContatoId,
    referencia_execucao_id: params.referenciaExecucaoId || null,
    proxima_acao: String(params.proximaAcao || "").slice(0, 500) || null,
    janela_limite_em: new Date(limiteJanelaMs).toISOString(),
  };

  const { data: existente } = await supabaseAdmin
    .from("automacao_agendamentos")
    .select("id")
    .eq("empresa_id", params.empresaId)
    .eq("tipo_agendamento", "followup_agente_ia")
    .in("status", ["pendente", "executando"])
    .contains("payload_json", {
      agente_id: params.agenteId,
      conversa_id: params.conversaId,
      tentativa,
      ultima_mensagem_contato_id: params.ultimaMensagemContatoId,
    })
    .limit(1)
    .maybeSingle();
  if (existente?.id) return { agendado: true, id: existente.id, idempotente: true };

  const { data, error } = await supabaseAdmin
    .from("automacao_agendamentos")
    .insert({
      empresa_id: params.empresaId,
      execucao_id: null,
      fluxo_id: null,
      no_id: null,
      tipo_agendamento: "followup_agente_ia",
      executar_em: new Date(executarEmMs).toISOString(),
      status: "pendente",
      payload_json: payload,
    })
    .select("id, executar_em")
    .single();
  if (error || !data) throw new Error(error?.message || "Não foi possível agendar o follow-up do agente.");
  return { agendado: true, id: data.id, executarEm: data.executar_em };
}

function historicoParaModelo(mensagens: Array<Record<string, unknown>>) {
  return mensagens
    .slice()
    .reverse()
    .filter((item) => String(item.conteudo || "").trim())
    .map((item) => ({
      role: item.remetente_tipo === "contato" ? "user" : "assistant",
      content: String(item.conteudo || "").trim().slice(0, 700),
    }));
}

function textoFollowupSeguro(valor: unknown) {
  return String(valor || "")
    .trim()
    .replace(/^['\"`]+|['\"`]+$/g, "")
    .slice(0, 700);
}

async function enviarFollowup(params: {
  empresaId: string;
  conversaId: string;
  agenteId: string;
  execucaoId: string;
  agendamentoId: string;
  tentativa: number;
  numeroDestino: string;
  texto: string;
}) {
  const { data: conversa } = await supabaseAdmin
    .from("conversas")
    .select("integracao_whatsapp_id")
    .eq("empresa_id", params.empresaId)
    .eq("id", params.conversaId)
    .maybeSingle();
  if (!conversa?.integracao_whatsapp_id) throw new Error("Conversa sem integração WhatsApp.");
  const { data: integracao } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select("id, phone_number_id, config_json, token_ref")
    .eq("empresa_id", params.empresaId)
    .eq("id", conversa.integracao_whatsapp_id)
    .maybeSingle();
  if (!integracao?.phone_number_id) throw new Error("Integração WhatsApp inválida.");
  const accessToken = getWhatsAppAccessToken(integracao);
  if (!accessToken) throw new Error("Token do WhatsApp indisponível.");

  const envio = await sendWhatsAppTextMessage({
    phoneNumberId: integracao.phone_number_id,
    accessToken,
    to: params.numeroDestino,
    body: params.texto,
  });
  const agora = new Date().toISOString();
  const { data: protocolo } = await supabaseAdmin
    .from("conversa_protocolos")
    .select("id")
    .eq("empresa_id", params.empresaId)
    .eq("conversa_id", params.conversaId)
    .eq("ativo", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error: mensagemError } = await supabaseAdmin.from("mensagens").insert({
    empresa_id: params.empresaId,
    conversa_id: params.conversaId,
    conversa_protocolo_id: protocolo?.id || null,
    remetente_tipo: "bot",
    remetente_id: null,
    conteudo: params.texto,
    tipo_mensagem: "texto",
    origem: "automatica",
    status_envio: envio.ok ? "enviada" : "falha",
    mensagem_externa_id: envio.messageId,
    metadata_json: {
      origem: "agente_ia_followup",
      agente_id: params.agenteId,
      agente_execucao_id: params.execucaoId,
      followup_agendamento_id: params.agendamentoId,
      followup_tentativa: params.tentativa,
      meta_status: envio.status,
      meta_error: envio.error,
    },
    created_at: agora,
    updated_at: agora,
  });
  if (mensagemError) console.error("[AGENTE_IA_FOLLOWUP] Falha ao persistir mensagem:", mensagemError);
  if (!envio.ok) throw new Error(envio.error || "Falha ao enviar follow-up do agente.");
  await supabaseAdmin
    .from("conversas")
    .update({ last_message_at: agora, updated_at: agora })
    .eq("empresa_id", params.empresaId)
    .eq("id", params.conversaId);
}

export async function processarFollowupAgenteIa(agendamento: {
  id: string;
  empresa_id: string;
  payload_json?: Record<string, unknown> | null;
}) {
  const payload = agendamento.payload_json || {};
  const agenteId = String(payload.agente_id || "").trim();
  const conversaId = String(payload.conversa_id || "").trim();
  const numeroDestino = String(payload.numero_destino || "").trim();
  const ultimaMensagemContatoId = String(payload.ultima_mensagem_contato_id || "").trim();
  const tentativa = numeroInteiro(payload.tentativa, 1, 1, MAX_TENTATIVAS);
  if (!agenteId || !conversaId || !numeroDestino || !ultimaMensagemContatoId) {
    return { ok: false, cancelado: false, motivo: "payload_followup_invalido" };
  }

  const { data: jaEnviada } = await supabaseAdmin
    .from("mensagens")
    .select("id")
    .eq("empresa_id", agendamento.empresa_id)
    .eq("conversa_id", conversaId)
    .contains("metadata_json", { followup_agendamento_id: agendamento.id })
    .limit(1)
    .maybeSingle();
  if (jaEnviada?.id) return { ok: true, cancelado: false, idempotente: true, motivo: "followup_ja_enviado" };

  const [{ data: agente }, { data: conversa }, ultimaEntrada, ultimaSaida, { data: estadoRow }] = await Promise.all([
    supabaseAdmin
      .from("agentes_ia")
      .select("id, nome, status, modelo, prompt_sistema, tom_voz, instrucoes, max_mensagens_contexto, metadata_json")
      .eq("empresa_id", agendamento.empresa_id)
      .eq("id", agenteId)
      .maybeSingle(),
    supabaseAdmin
      .from("conversas")
      .select("id, status, bot_ativo, aguardando_atendente, responsavel_id, agente_ia_id")
      .eq("empresa_id", agendamento.empresa_id)
      .eq("id", conversaId)
      .maybeSingle(),
    ultimaMensagemContato(agendamento.empresa_id, conversaId),
    ultimaMensagemSaida(agendamento.empresa_id, conversaId),
    supabaseAdmin
      .from("agente_ia_conversa_estados")
      .select("estado_json, resumo")
      .eq("empresa_id", agendamento.empresa_id)
      .eq("agente_id", agenteId)
      .eq("conversa_id", conversaId)
      .maybeSingle(),
  ]);

  if (!agente || agente.status !== "ativo") return { ok: true, cancelado: true, motivo: "agente_inativo" };
  const config = configDoAgente(agente);
  if (!config.ativo || tentativa > config.tentativas) return { ok: true, cancelado: true, motivo: "followup_desativado_ou_limite" };
  if (!conversa || conversa.status !== "bot" || conversa.bot_ativo !== true || conversa.aguardando_atendente === true) {
    return { ok: true, cancelado: true, motivo: "conversa_nao_esta_com_agente" };
  }
  if (conversa.agente_ia_id && String(conversa.agente_ia_id) !== agenteId) {
    return { ok: true, cancelado: true, motivo: "outro_agente_assumiu" };
  }
  if (!ultimaEntrada || ultimaEntrada.id !== ultimaMensagemContatoId) {
    return { ok: true, cancelado: true, motivo: "cliente_ja_respondeu" };
  }
  if (!dentroDaJanela24h(ultimaEntrada.created_at)) {
    return { ok: true, cancelado: true, motivo: "fora_janela_24h" };
  }
  const metadataSaida = (ultimaSaida?.metadata_json || {}) as Record<string, unknown>;
  if (!ultimaSaida || ultimaSaida.remetente_tipo !== "bot" || String(metadataSaida.agente_id || "") !== agenteId) {
    return { ok: true, cancelado: true, motivo: "ultima_saida_nao_e_do_agente" };
  }

  const saldo = await buscarSaldoTokensIa(agendamento.empresa_id);
  if (saldo.limite !== null && Number(saldo.restantes || 0) <= 0) {
    return { ok: true, cancelado: true, motivo: "saldo_tokens_ia_esgotado" };
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return { ok: false, cancelado: false, motivo: "openai_nao_configurada" };
  }

  const limiteContexto = numeroInteiro(agente.max_mensagens_contexto, 6, 4, 20);
  const { data: mensagens } = await supabaseAdmin
    .from("mensagens")
    .select("remetente_tipo, conteudo, created_at")
    .eq("empresa_id", agendamento.empresa_id)
    .eq("conversa_id", conversaId)
    .order("created_at", { ascending: false })
    .limit(limiteContexto);
  const historico = historicoParaModelo((mensagens || []) as Array<Record<string, unknown>>);
  const estado = (estadoRow?.estado_json || {}) as Record<string, unknown>;
  const proximaAcao = String(payload.proxima_acao || estado.proxima_acao || "continuar o atendimento").trim();

  const { data: execucao, error: execucaoError } = await supabaseAdmin
    .from("agente_ia_execucoes")
    .insert({
      empresa_id: agendamento.empresa_id,
      agente_id: agenteId,
      conversa_id: conversaId,
      contato_id: null,
      mensagem_ids: [ultimaMensagemContatoId],
      status: "processando",
      entrada_resumida: `[follow-up de inatividade ${tentativa}] ${proximaAcao}`.slice(0, 4000),
      modelo: String(agente.modelo || MODELO_PADRAO),
      started_at: new Date().toISOString(),
      metadata_json: {
        origem: "followup_inatividade",
        followup_agendamento_id: agendamento.id,
        followup_tentativa: tentativa,
      },
    })
    .select("id")
    .single();
  if (execucaoError || !execucao) throw new Error(execucaoError?.message || "Não foi possível registrar o follow-up.");

  const inicio = Date.now();
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const instructions = [
      `Você é ${agente.nome}, assistente do CRM Prosperity.`,
      String(agente.prompt_sistema || "").trim(),
      agente.tom_voz ? `Características: ${agente.tom_voz}` : "",
      agente.instrucoes ? `Instruções: ${agente.instrucoes}` : "",
      "FOLLOW-UP DE INATIVIDADE:",
      "- O cliente parou de responder e a janela de 24 horas ainda está aberta.",
      "- Escreva UMA única mensagem curta e natural para retomar exatamente o ponto pendente.",
      "- Não repita toda a explicação anterior e não diga que esta é uma mensagem automática ou um follow-up.",
      "- Faça no máximo uma pergunta objetiva que facilite a continuidade.",
      "- Não invente preço, disponibilidade, confirmação, ação executada ou informação que dependa de ferramenta.",
      `- Ponto pendente: ${proximaAcao}`,
      estadoRow?.resumo ? `- Contexto resumido: ${String(estadoRow.resumo).slice(0, 1200)}` : "",
    ].filter(Boolean).join("\n\n");

    const response: any = await openai.responses.create({
      model: String(agente.modelo || MODELO_PADRAO).trim() || MODELO_PADRAO,
      instructions,
      input: historico.length ? historico : [{ role: "user", content: "Retome o atendimento de forma natural." }],
      reasoning: { effort: "none" },
      text: { verbosity: "low" },
    } as any);
    const texto = textoFollowupSeguro(response.output_text);
    if (!texto) throw new Error("A IA não gerou uma mensagem válida para o follow-up.");

    const revalidacaoEntrada = await ultimaMensagemContato(agendamento.empresa_id, conversaId);
    const { data: conversaRevalidada } = await supabaseAdmin
      .from("conversas")
      .select("status, bot_ativo, aguardando_atendente, agente_ia_id")
      .eq("empresa_id", agendamento.empresa_id)
      .eq("id", conversaId)
      .maybeSingle();
    if (
      !revalidacaoEntrada ||
      revalidacaoEntrada.id !== ultimaMensagemContatoId ||
      !dentroDaJanela24h(revalidacaoEntrada.created_at) ||
      !conversaRevalidada ||
      conversaRevalidada.status !== "bot" ||
      conversaRevalidada.bot_ativo !== true ||
      conversaRevalidada.aguardando_atendente === true ||
      (conversaRevalidada.agente_ia_id && String(conversaRevalidada.agente_ia_id) !== agenteId)
    ) {
      await supabaseAdmin
        .from("agente_ia_execucoes")
        .update({
          status: "cancelado",
          resposta: texto,
          latencia_ms: Date.now() - inicio,
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata_json: {
            origem: "followup_inatividade",
            followup_agendamento_id: agendamento.id,
            followup_tentativa: tentativa,
            supersedido_por_nova_atividade: true,
          },
        })
        .eq("id", execucao.id);
      return { ok: true, cancelado: true, motivo: "atividade_detectada_antes_do_envio" };
    }

    await enviarFollowup({
      empresaId: agendamento.empresa_id,
      conversaId,
      agenteId,
      execucaoId: execucao.id,
      agendamentoId: agendamento.id,
      tentativa,
      numeroDestino,
      texto,
    });

    const tokensInput = Number(response.usage?.input_tokens || 0);
    const tokensOutput = Number(response.usage?.output_tokens || 0);
    const tokensTotal = Number(response.usage?.total_tokens || 0);
    if (tokensTotal > 0) {
      await registrarUsoTokensIa({
        empresaId: agendamento.empresa_id,
        origem: "agente_ia_followup",
        modelo: String(agente.modelo || MODELO_PADRAO),
        tokensTotal,
        tokensInput,
        tokensOutput,
        metadata: {
          agente_id: agenteId,
          agente_execucao_id: execucao.id,
          conversa_id: conversaId,
          followup_tentativa: tentativa,
        },
      });
    }

    const finalAgora = new Date().toISOString();
    await supabaseAdmin
      .from("agente_ia_execucoes")
      .update({
        status: "concluido",
        resposta: texto,
        tokens_input: tokensInput,
        tokens_output: tokensOutput,
        tokens_total: tokensTotal,
        latencia_ms: Date.now() - inicio,
        finished_at: finalAgora,
        updated_at: finalAgora,
        metadata_json: {
          origem: "followup_inatividade",
          followup_agendamento_id: agendamento.id,
          followup_tentativa: tentativa,
        },
      })
      .eq("id", execucao.id);

    if (tentativa < config.tentativas) {
      await agendarFollowupAgenteIa({
        empresaId: agendamento.empresa_id,
        agenteId,
        conversaId,
        numeroDestino,
        ultimaMensagemContatoId,
        proximaAcao,
        tentativa: tentativa + 1,
        referenciaExecucaoId: execucao.id,
        cancelarAnteriores: false,
      }).catch((error) =>
        console.error("[AGENTE_IA_FOLLOWUP] Não foi possível agendar a próxima tentativa:", error)
      );
    }

    return { ok: true, cancelado: false, motivo: "followup_enviado", tentativa };
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : String(error);
    await supabaseAdmin
      .from("agente_ia_execucoes")
      .update({
        status: "erro",
        erro: mensagem,
        latencia_ms: Date.now() - inicio,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", execucao.id);
    return { ok: false, cancelado: false, motivo: mensagem };
  }
}
