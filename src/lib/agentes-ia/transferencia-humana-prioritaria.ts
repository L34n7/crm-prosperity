import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolverAtribuicaoTransferencia } from "@/lib/conversas/resolver-atribuicao-transferencia";
import { cancelarFollowupsPendentesAgenteIa } from "./followup-inatividade";
import { enviarMensagemContingencia } from "./fallback";
import { validarReservaAgenteIa } from "./validar-reserva";
import {
  identificarPedidoTransferenciaHumana,
  reconhecerReiteracaoDirecao,
  reiteracaoCurtaDirecao,
  type PedidoTransferenciaHumana,
} from "./intencao-transferencia-humana";

const supabaseAdmin = getSupabaseAdmin();
const JANELA_REITERACAO_MS = 30 * 60 * 1000;

type PendenciaEntrada = {
  id: string;
  empresa_id: string;
  agente_id: string;
  conversa_id: string;
  contato_id?: string | null;
  numero_destino?: string | null;
  mensagem_ids?: string[] | null;
  conteudo_agregado?: string | null;
  status?: string | null;
  versao?: number | null;
};

type MensagemEntrada = {
  id: string;
  conteudo: string | null;
  tipo_mensagem?: string | null;
  created_at: string;
};

async function identificarSolicitacaoPendente(
  pendencia: PendenciaEntrada
): Promise<PedidoTransferenciaHumana | null> {
  const agregado = String(pendencia.conteudo_agregado || "").trim();
  const linhas = agregado.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  const possivel = linhas.some(
    (texto) => identificarPedidoTransferenciaHumana(texto) || reiteracaoCurtaDirecao(texto)
  ) || identificarPedidoTransferenciaHumana(agregado);
  // O agregado é uma prévia e pode vir vazio ou incompleto. Se existem IDs da
  // mensagem, conferir as mensagens originais ANTES de entregar o turno ao modelo.
  const ids = [...new Set((pendencia.mensagem_ids || []).filter(Boolean))];
  if (!possivel && !ids.length) return null;

  // Mensagens do bot ou de outra conversa NUNCA são origem para a solicitação.
  let entradas: MensagemEntrada[] = [];
  if (ids.length) {
    const { data, error } = await supabaseAdmin
      .from("mensagens")
      .select("id, conteudo, tipo_mensagem, created_at")
      .eq("empresa_id", pendencia.empresa_id)
      .eq("conversa_id", pendencia.conversa_id)
      .eq("remetente_tipo", "contato")
      .in("id", ids.slice(0, 30));
    if (error) {
      console.error("[AGENTE_IA] Falha ao validar mensagens do pedido humano:", error);
      throw new Error("Falha ao validar pedido de atendimento humano; não continuar com resposta da IA.");
    }
    entradas = (data || []) as MensagemEntrada[];
  } else if (possivel) {
    // Sem IDs na pendência, validar na própria conversa a origem da solicitação.
    const { data, error } = await supabaseAdmin.from("mensagens")
      .select("id, conteudo, tipo_mensagem, created_at")
      .eq("empresa_id", pendencia.empresa_id)
      .eq("conversa_id", pendencia.conversa_id)
      .eq("remetente_tipo", "contato")
      .order("created_at", { ascending: false })
      .limit(15);
    if (error) throw new Error("Falha ao confirmar remetente do pedido humano.");
    entradas = (data || []) as MensagemEntrada[];
  }
  // Nunca inferir um pedido de transferência a partir de texto agregado não validado.
  if (!entradas.length) return null;

  const textos = entradas.map((m) => String(m.conteudo || ""));
  // O áudio é do contato, mas a transcrição pode estar só no conteúdo agregado.
  if (entradas.some((m) => m.tipo_mensagem === "audio")) textos.push(agregado);
  const pedido = textos
    .flatMap((texto) => [texto, ...texto.split(/\n+/)])
    .map(identificarPedidoTransferenciaHumana).find(Boolean);
  if (pedido) return pedido || null;

  // "CEO!!!" isolado só repete pedido real do MESMO contato e recente.
  const curto = textos.find(reiteracaoCurtaDirecao);
  if (!curto) return null;
  const { data: anteriores, error } = await supabaseAdmin
    .from("mensagens")
    .select("id, conteudo, created_at")
    .eq("empresa_id", pendencia.empresa_id)
    .eq("conversa_id", pendencia.conversa_id)
    .eq("remetente_tipo", "contato")
    .gte("created_at", new Date(Date.now() - JANELA_REITERACAO_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(15);
  if (error) {
    console.error("[AGENTE_IA] Falha ao conferir contexto de reiteracao humana:", error);
    throw new Error("Falha ao confirmar pedido reiterado de atendimento humano.");
  }
  const idsAtuais = new Set(ids);
  const historico = ((anteriores || []) as MensagemEntrada[])
    .filter((m) => !idsAtuais.has(m.id))
    .map((m) => String(m.conteudo || ""));
  return reconhecerReiteracaoDirecao(curto, historico);
}

async function finalizar(pendencia: PendenciaEntrada, lockToken: string, status: "processado" | "cancelado", erro: string | null = null) {
  const { error } = await supabaseAdmin.rpc("agente_ia_finalizar_pendencia", {
    p_pendencia_id: pendencia.id,
    p_lock_token: lockToken,
    p_versao: pendencia.versao,
    p_status: status,
    p_erro: erro,
  });
  if (error) console.error("[AGENTE_IA] Falha ao finalizar transferência prioritária:", error);
}

/**
 * Intercepta pedidos explícitos antes das políticas de horário/agenda, runtime de negócio,
 * proteção anti-loop ou geração pelo LLM. Não transfere mensagens de outros remetentes.
 */
export async function processarPedidoHumanoPrioritario(
  pendenciaId: string,
  pendenciaPrevia: PendenciaEntrada | null,
  options: { forcar?: boolean }
): Promise<{ tratado: boolean; resultado?: Record<string, unknown> }> {
  const inicio = Date.now();
  if (!pendenciaPrevia || !["pendente", "processando"].includes(String(pendenciaPrevia.status || ""))) {
    return { tratado: false };
  }
  const pedido = await identificarSolicitacaoPendente(pendenciaPrevia);
  if (!pedido) return { tratado: false };

  const token = crypto.randomUUID();
  const { data: reservado, error: reservaError } = await supabaseAdmin.rpc("agente_ia_reservar_pendencia", {
    p_pendencia_id: pendenciaId,
    p_lock_token: token,
    p_forcar: options.forcar === true,
  });
  if (reservaError) throw new Error(reservaError.message);
  if (!reservado || !validarReservaAgenteIa(reservado)) {
    return { tratado: true, resultado: { ok: true, processado: false, motivo: "pendencia_indisponivel_ou_debounce" } };
  }

  const pendencia = reservado as PendenciaEntrada;
  // A reserva pode ter recebido uma nova versão entre a pré-consulta e o lock.
  if (pendencia.versao !== pendenciaPrevia.versao) {
    await finalizar(pendencia, token, "processado");
    return { tratado: true, resultado: { ok: true, processado: false, motivo: "nova_versao_revalidar_transferencia" } };
  }

  const [
    { data: agente },
    { data: conversa, error: conversaError },
    { data: ferramenta },
  ] = await Promise.all([
    supabaseAdmin.from("agentes_ia").select("id").eq("id", pendencia.agente_id).eq("empresa_id", pendencia.empresa_id).eq("status", "ativo").maybeSingle(),
    supabaseAdmin.from("conversas").select("id,status,bot_ativo,aguardando_atendente,responsavel_id").eq("empresa_id", pendencia.empresa_id).eq("id", pendencia.conversa_id).maybeSingle(),
    supabaseAdmin.from("agente_ia_ferramentas").select("config_json").eq("empresa_id", pendencia.empresa_id).eq("agente_id", pendencia.agente_id).eq("tipo", "transferir_humano").eq("ativo", true).maybeSingle(),
  ]);

  if (conversaError) throw new Error(conversaError.message);
  if (!agente || !conversa) {
    await finalizar(pendencia, token, "cancelado", "agente_inativo_ou_conversa_inexistente");
    return { tratado: true, resultado: { ok: true, processado: false, motivo: "agente_inativo_ou_conversa_inexistente" } };
  }
  if (conversa.aguardando_atendente || conversa.responsavel_id || conversa.status === "em_atendimento") {
    await finalizar(pendencia, token, "cancelado", "atendimento_humano_ja_ativo");
    return { tratado: true, resultado: { ok: true, processado: false, motivo: "atendimento_humano_ja_ativo" } };
  }

  const config = (ferramenta?.config_json || {}) as Record<string, unknown>;
  let setorId = String(config.setor_id || "").trim() || null;
  if (setorId) {
    const { data: setor, error } = await supabaseAdmin.from("setores")
      .select("id").eq("empresa_id", pendencia.empresa_id).eq("id", setorId).maybeSingle();
    if (error || !setor) setorId = null;
  }

  // Se o agente não configurar setor ou distribuição, usar fila geral.
  let atribuicao;
  try {
    atribuicao = await resolverAtribuicaoTransferencia({
      empresaId: pendencia.empresa_id,
      setorId,
      escopoFila: setorId ? "setor" : "geral",
      estrategia: config.estrategia_transferencia || "fila_setor",
      atendenteId: config.atendente_id,
      incluirAdministradores: config.incluir_administradores,
    });
  } catch (error) {
    console.error("[AGENTE_IA] Destino preferencial indisponível; usando fila geral:", error);
    atribuicao = await resolverAtribuicaoTransferencia({ empresaId: pendencia.empresa_id, escopoFila: "geral" });
  }

  const agora = new Date().toISOString();
  // Atualização condicional: jamais retirar uma conversa já assumida pelo humano.
  const { data: transferida, error: atualizarErro } = await supabaseAdmin
    .from("conversas")
    .update({
      setor_id: atribuicao.setorId,
      escopo_fila: atribuicao.escopoFila,
      status: atribuicao.responsavelId ? "em_atendimento" : "fila",
      responsavel_id: atribuicao.responsavelId,
      bot_ativo: false,
      aguardando_atendente: !atribuicao.responsavelId,
      agente_ia_id: null,
      agente_ia_fallback_ativo: false,
      updated_at: agora,
    })
    .eq("empresa_id", pendencia.empresa_id)
    .eq("id", pendencia.conversa_id)
    .in("status", ["bot", "fila"])
    .eq("aguardando_atendente", false)
    .is("responsavel_id", null)
    .select("id,status,bot_ativo,aguardando_atendente")
    .maybeSingle();
  if (atualizarErro) throw new Error(atualizarErro.message);
  if (!transferida || transferida.bot_ativo !== false ||
    !["fila", "em_atendimento"].includes(transferida.status)) {
    await finalizar(pendencia, token, "cancelado", "transferencia_ja_processada_ou_estado_alterado");
    return { tratado: true, resultado: { ok: true, processado: false, motivo: "transferencia_ja_processada_ou_estado_alterado" } };
  }

  // O estado em fila/desativado já impede novos follow-ups; cancelar os antigos por higiene.
  await cancelarFollowupsPendentesAgenteIa({
    empresaId: pendencia.empresa_id,
    conversaId: pendencia.conversa_id,
    motivo: "pedido_explicito_atendimento_humano",
  }).catch((error) => console.error("[AGENTE_IA] Falha ao limpar follow-ups após transferência:", error));

  const aviso = pedido.destino === "direcao"
    ? "Entendido! Encaminhei seu atendimento à equipe e registrei que você deseja falar com a direção. Eles verificarão a disponibilidade do responsável."
    : "Entendido! Encaminhei seu atendimento para nossa equipe. Um atendente dará continuidade à conversa.";
  let avisoEnviado = false;
  let erroAviso: string | null = null;
  if (pendencia.numero_destino) {
    try {
      const envio = await enviarMensagemContingencia({
        empresaId: pendencia.empresa_id,
        conversaId: pendencia.conversa_id,
        agenteId: pendencia.agente_id,
        numeroDestino: pendencia.numero_destino,
        texto: aviso,
      });
      avisoEnviado = envio.ok === true && !("ignorada" in envio && envio.ignorada === true);
    } catch (error) {
      erroAviso = error instanceof Error ? error.message : String(error);
      console.error("[AGENTE_IA] Fila humana ativada, mas aviso falhou:", error);
    }
  }

  // Auditoria: a transferência é executada sem chamar modelo nem consumir tokens.
  const fim = new Date().toISOString();
  const { error: auditoriaErro } = await supabaseAdmin.from("agente_ia_execucoes").insert({
    empresa_id: pendencia.empresa_id,
    agente_id: pendencia.agente_id,
    conversa_id: pendencia.conversa_id,
    contato_id: pendencia.contato_id || null,
    mensagem_ids: pendencia.mensagem_ids || [],
    status: "concluido",
    modelo: "transferencia_humana_backend",
    entrada_resumida: String(pendencia.conteudo_agregado || "").slice(0, 4000),
    resposta: avisoEnviado ? aviso : null,
    ferramentas_json: [{
      nome: "transferir_humano_automatico",
      argumentos: { motivo: "pedido_explicito", destino: pedido.destino },
      resultado: { ok: true, setorId: atribuicao.setorId, responsavelId: atribuicao.responsavelId, estrategiaAplicada: atribuicao.estrategiaAplicada },
    }],
    tokens_input: 0,
    tokens_output: 0,
    tokens_total: 0,
    latencia_ms: Date.now() - inicio,
    started_at: agora,
    finished_at: fim,
    metadata_json: { motivo: "pedido_explicito_atendimento_humano", intencao: pedido, aviso_enviado: avisoEnviado, erro_aviso: erroAviso },
  });
  if (auditoriaErro) console.error("[AGENTE_IA] Falha ao registrar auditoria da transferência:", auditoriaErro);
  await finalizar(pendencia, token, "processado");
  return {
    tratado: true,
    resultado: { ok: true, processado: true, transferidoHumano: true, runtime: "transferencia_humana_backend", avisoEnviado },
  };
}
