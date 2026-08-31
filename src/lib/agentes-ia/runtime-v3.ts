/* eslint-disable @typescript-eslint/no-explicit-any */

import crypto from "node:crypto";
import OpenAI from "openai";
import { Client as QstashClient } from "@upstash/qstash";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buscarSaldoTokensIa, registrarUsoTokensIa } from "@/lib/ia/tokens";
import {
  dataLocalDeIso,
  filtrarSlotsPorPreferencia,
  formatarSlotAgenda,
  interpretarDataHorarioAgenda,
  listarSlotsDisponiveis,
} from "@/lib/agendas/agenda-service";
import { sincronizarAgendamentoGoogleCalendar } from "@/lib/agendas/google-calendar";
import { resolverAtribuicaoTransferencia } from "@/lib/conversas/resolver-atribuicao-transferencia";
import { getWhatsAppAccessToken } from "@/lib/whatsapp/access-token";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/send-text-message";
import { processAutomationEngine as processAutomationEngineFluxos } from "@/lib/automacoes/process-automation-engine-agenda";
import type { AutomationEngineInput } from "@/lib/automacoes/types";

const supabaseAdmin = getSupabaseAdmin();
const MODELO_PADRAO = process.env.OPENAI_AGENT_MODEL?.trim() || "gpt-5.6-luna";
const MAX_RODADAS_FERRAMENTAS = 3;
const MAX_MENSAGENS_SAIDA = 3;
const MAX_RESULTADOS_CONHECIMENTO = 2;
const MAX_CARACTERES_TRECHO_CONHECIMENTO = 850;
const TIPOS_FERRAMENTAS = [
  "consultar_conhecimento",
  "consultar_agenda",
  "criar_agendamento",
  "remarcar_agendamento",
  "cancelar_agendamento",
  "consultar_contato",
  "transferir_humano",
] as const;
const FERRAMENTAS_AGENDA = new Set<string>([
  "consultar_agenda",
  "criar_agendamento",
  "remarcar_agendamento",
  "cancelar_agendamento",
]);

type TipoFerramenta = (typeof TIPOS_FERRAMENTAS)[number];

type AgenteRow = {
  id: string;
  empresa_id: string;
  nome: string;
  descricao?: string | null;
  status: string;
  modelo?: string | null;
  prompt_sistema?: string | null;
  tom_voz?: string | null;
  instrucoes?: string | null;
  max_mensagens_contexto?: number | null;
  debounce_ms?: number | null;
  fallback_fluxo_id?: string | null;
  integracoes_whatsapp_ids?: string[] | null;
  metadata_json?: Record<string, unknown> | null;
};

type PendenciaRow = {
  id: string;
  empresa_id: string;
  agente_id: string;
  conversa_id: string;
  contato_id?: string | null;
  numero_destino?: string | null;
  mensagem_ids: string[];
  conteudo_agregado: string;
  processar_em: string;
  status: string;
  versao: number;
  tentativas: number;
};

type EstadoConversa = {
  tipo_negocio: string | null;
  dores: string[];
  interesses: string[];
  objecoes: string[];
  estagio: string;
  proxima_acao: string | null;
  fatos_confirmados: string[];
};

type EstadoDelta = {
  tipo_negocio?: string | null;
  estagio?: string | null;
  proxima_acao?: string | null;
  dores?: string[];
  interesses?: string[];
  objecoes?: string[];
  fatos?: string[];
};

type SaidaAgente = {
  mensagens: string[];
  estado: EstadoConversa;
};

type ContextoExecucao = {
  agente: AgenteRow;
  pendencia: PendenciaRow;
  execucaoId: string;
  contato: any;
  conversa: any;
  ferramentasAtivas: Map<TipoFerramenta, Record<string, unknown>>;
  ferramentasExecutadas: Array<Record<string, any>>;
  acaoCriticaExecutada: boolean;
  transferidoHumano: boolean;
  respostaEnviada: boolean;
  respostaDeterministica: string[] | null;
  agendaAutorizada: any | null;
  estadoConversa: EstadoConversa;
  agendamentosAtivos: any[];
};

const ESTADO_VAZIO: EstadoConversa = {
  tipo_negocio: null,
  dores: [],
  interesses: [],
  objecoes: [],
  estagio: "novo",
  proxima_acao: null,
  fatos_confirmados: [],
};

function isTipoFerramenta(valor: string): valor is TipoFerramenta {
  return (TIPOS_FERRAMENTAS as readonly string[]).includes(valor);
}

function agendaIdConfiguradaFerramentas(
  ferramentasAtivas: Map<TipoFerramenta, Record<string, unknown>>
) {
  const ferramentasAgenda = Array.from(ferramentasAtivas.entries()).filter(([tipo]) =>
    FERRAMENTAS_AGENDA.has(tipo)
  );
  if (!ferramentasAgenda.length) return null;

  const ids = ferramentasAgenda.map(([, config]) => String(config?.agenda_id || "").trim());
  if (ids.some((id) => !id)) {
    throw new Error("Ferramentas de agenda ativas sem agenda obrigatória configurada.");
  }
  const unicos = Array.from(new Set(ids));
  if (unicos.length !== 1) {
    throw new Error("As ferramentas de agenda do agente devem usar uma única agenda configurada.");
  }
  return unicos[0];
}

function numeroInteiro(valor: unknown, fallback: number, minimo: number, maximo: number) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return fallback;
  return Math.min(maximo, Math.max(minimo, Math.floor(numero)));
}

function textoCurto(valor: unknown, maximo: number) {
  return String(valor ?? "").trim().replace(/\s+/g, " ").slice(0, maximo);
}

function listaCurta(valor: unknown, maxItens: number, maxChars = 120) {
  if (!Array.isArray(valor)) return [];
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const item of valor) {
    const texto = textoCurto(item, maxChars);
    const chave = texto.toLocaleLowerCase("pt-BR");
    if (!texto || vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(texto);
    if (saida.length >= maxItens) break;
  }
  return saida;
}

function unirListas(base: string[], adicionais: unknown, maxItens: number, maxChars = 120) {
  return listaCurta([...(base || []), ...listaCurta(adicionais, maxItens, maxChars)], maxItens, maxChars);
}

function normalizarEstado(valor: unknown, anterior?: EstadoConversa): EstadoConversa {
  const base = anterior || ESTADO_VAZIO;
  const obj = valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
  const dores = listaCurta(obj.dores, 6);
  const interesses = listaCurta(obj.interesses, 6);
  const fatos = listaCurta(obj.fatos_confirmados, 8, 140);
  return {
    tipo_negocio: textoCurto(obj.tipo_negocio, 120) || base.tipo_negocio || null,
    dores: dores.length ? dores : base.dores,
    interesses: interesses.length ? interesses : base.interesses,
    objecoes: Array.isArray(obj.objecoes) ? listaCurta(obj.objecoes, 5) : base.objecoes,
    estagio: textoCurto(obj.estagio, 80) || base.estagio || "novo",
    proxima_acao: Object.prototype.hasOwnProperty.call(obj, "proxima_acao")
      ? textoCurto(obj.proxima_acao, 160) || null
      : base.proxima_acao,
    fatos_confirmados: fatos.length ? fatos : base.fatos_confirmados,
  };
}

function aplicarDeltaEstado(valor: unknown, anterior: EstadoConversa) {
  const base = normalizarEstado(anterior);
  const delta = valor && typeof valor === "object" ? (valor as EstadoDelta) : {};
  const tipoNegocio = textoCurto(delta.tipo_negocio, 120);
  const estagio = textoCurto(delta.estagio, 80);
  const proximaInformada = delta.proxima_acao !== null && delta.proxima_acao !== undefined;

  return normalizarEstado({
    ...base,
    tipo_negocio: tipoNegocio || base.tipo_negocio,
    dores: unirListas(base.dores, delta.dores, 6),
    interesses: unirListas(base.interesses, delta.interesses, 6),
    objecoes: unirListas(base.objecoes, delta.objecoes, 5),
    estagio: estagio || base.estagio,
    proxima_acao: proximaInformada ? textoCurto(delta.proxima_acao, 160) || null : base.proxima_acao,
    fatos_confirmados: unirListas(base.fatos_confirmados, delta.fatos, 8, 140),
  });
}

function normalizarSaida(valor: unknown, estadoAnterior: EstadoConversa, fallbackTexto = ""): SaidaAgente {
  const obj = valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
  const mensagens = Array.isArray(obj.mensagens)
    ? obj.mensagens
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
        .slice(0, MAX_MENSAGENS_SAIDA)
        .map((item) => item.slice(0, 900))
    : [];
  if (!mensagens.length && fallbackTexto.trim()) mensagens.push(fallbackTexto.trim().slice(0, 900));
  return {
    mensagens,
    estado: aplicarDeltaEstado(obj.memoria_delta, estadoAnterior),
  };
}

function resumoEstruturado(estado: EstadoConversa) {
  return [
    estado.tipo_negocio ? `Negócio: ${estado.tipo_negocio}` : "",
    estado.dores.length ? `Dores: ${estado.dores.join("; ")}` : "",
    estado.interesses.length ? `Interesses: ${estado.interesses.join("; ")}` : "",
    estado.objecoes.length ? `Objeções: ${estado.objecoes.join("; ")}` : "",
    estado.estagio ? `Estágio: ${estado.estagio}` : "",
    estado.proxima_acao ? `Próxima ação: ${estado.proxima_acao}` : "",
    estado.fatos_confirmados.length ? `Fatos confirmados: ${estado.fatos_confirmados.join("; ")}` : "",
  ].filter(Boolean).join(" | ").slice(0, 1800);
}

function ehFatoOperacionalAgenda(valor: string) {
  const texto = String(valor || "").trim();
  if (!texto) return false;
  if (/^Agendamento\b/i.test(texto)) return true;
  return /^Demonstração\b/i.test(texto) && /\b(?:agendad|remarcad|cancelad|às|para|dia)\w*/i.test(texto);
}

function memoriaCompacta(estado: EstadoConversa) {
  const fatos = estado.fatos_confirmados
    .filter((item) => !ehFatoOperacionalAgenda(item))
    .slice(-4);
  return [
    estado.tipo_negocio ? `negócio=${estado.tipo_negocio}` : "",
    estado.estagio ? `estágio=${estado.estagio}` : "",
    estado.proxima_acao ? `próxima=${estado.proxima_acao}` : "",
    estado.interesses.length ? `interesses=${estado.interesses.slice(-4).join("; ")}` : "",
    estado.dores.length ? `dores=${estado.dores.slice(-3).join("; ")}` : "",
    estado.objecoes.length ? `objeções=${estado.objecoes.slice(-2).join("; ")}` : "",
    fatos.length ? `fatos=${fatos.join("; ")}` : "",
  ].filter(Boolean).join(" | ").slice(0, 900);
}

function adicionarFatoOperacional(estado: EstadoConversa, fato: string) {
  const semOperacionalAnterior = estado.fatos_confirmados.filter(
    (item) => !ehFatoOperacionalAgenda(item)
  );
  return [...semOperacionalAnterior, fato].slice(-8);
}

function estadoAposFerramentas(base: EstadoConversa, ferramentas: Array<Record<string, any>>) {
  let estado = normalizarEstado(base);
  for (const ferramenta of ferramentas) {
    const resultado = ferramenta?.resultado;
    if (!resultado?.ok) continue;
    if (ferramenta.nome === "criar_agendamento") {
      const quando = textoCurto(resultado.quando, 120);
      estado = {
        ...estado,
        estagio: "agendamento confirmado",
        proxima_acao: "acompanhar agendamento",
        fatos_confirmados: quando
          ? adicionarFatoOperacional(estado, `Agendamento confirmado: ${quando}`)
          : estado.fatos_confirmados,
      };
    } else if (ferramenta.nome === "remarcar_agendamento") {
      const quando = textoCurto(resultado.quando, 120);
      estado = {
        ...estado,
        estagio: "agendamento remarcado",
        proxima_acao: "acompanhar agendamento",
        fatos_confirmados: quando
          ? adicionarFatoOperacional(estado, `Agendamento remarcado: ${quando}`)
          : estado.fatos_confirmados,
      };
    } else if (ferramenta.nome === "cancelar_agendamento") {
      estado = {
        ...estado,
        estagio: "agendamento cancelado",
        proxima_acao: "definir próximo passo",
        fatos_confirmados: adicionarFatoOperacional(estado, "Agendamento cancelado"),
      };
    }
  }
  return estado;
}

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appUrl() {
  const host =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    "";
  if (!host) return "";
  return (host.startsWith("http") ? host : `https://${host}`).replace(/\/$/, "");
}

function workerUrl() {
  return process.env.QSTASH_AGENTE_IA_WORKER_URL?.trim() || (appUrl() ? `${appUrl()}/api/worker/processar-agente-ia` : "");
}

async function publicarPendenciaQstash(pendenciaId: string, delayMs: number) {
  const token = process.env.QSTASH_TOKEN?.trim();
  const url = workerUrl();
  if (!token || !url) return false;
  try {
    const cliente = new QstashClient({ token });
    await cliente.publishJSON({
      url,
      body: { pendenciaId },
      delay: Math.max(1, Math.ceil(delayMs / 1000)),
      retries: 3,
    });
    return true;
  } catch (error) {
    console.error("[AGENTE_IA] Falha ao publicar pendência no QStash:", error);
    return false;
  }
}

async function reagendarLocalSeNecessario(pendenciaId: string, delayMs: number) {
  const publicou = await publicarPendenciaQstash(pendenciaId, delayMs);
  if (publicou) return;
  await esperar(Math.max(300, Math.min(delayMs, 2500)));
  await processarPendenciaAgenteIa(pendenciaId, { forcar: true });
}

function agentePermiteIntegracao(agente: AgenteRow, integracaoId?: string | null) {
  const ids = Array.isArray(agente.integracoes_whatsapp_ids) ? agente.integracoes_whatsapp_ids.filter(Boolean) : [];
  return ids.length === 0 || (!!integracaoId && ids.includes(integracaoId));
}

function conversaEstaComHumano(conversa: any) {
  if (!conversa) return true;
  if (conversa.aguardando_atendente === true) return true;
  if (conversa.bot_ativo !== true && ["fila", "em_atendimento"].includes(String(conversa.status || ""))) return true;
  return false;
}

async function cancelarFluxosConversacionaisAtivos(empresaId: string, conversaId: string) {
  const { data: execucoes } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .in("status", ["rodando", "aguardando"]);
  const ids = (execucoes || []).map((item: { id: string }) => item.id).filter(Boolean);
  if (!ids.length) return;
  const agora = new Date().toISOString();
  await supabaseAdmin
    .from("automacao_execucoes")
    .update({
      status: "cancelado",
      finished_at: agora,
      updated_at: agora,
      metadata_json: { motivo_cancelamento: "agente_ia_assumiu_conversa", cancelado_em: agora },
    })
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .in("status", ["rodando", "aguardando"]);
  await supabaseAdmin
    .from("automacao_agendamentos")
    .update({ status: "cancelado" })
    .eq("empresa_id", empresaId)
    .in("execucao_id", ids)
    .eq("status", "pendente");
}

export async function interceptarMensagemAgenteIa(input: AutomationEngineInput) {
  const texto = String(input.mensagemTexto || "").trim();
  const mensagemId = String(input.mensagemId || "").trim() || null;
  if (!texto || !mensagemId) return null;

  const { data: conversa, error: conversaError } = await supabaseAdmin
    .from("conversas")
    .select("id, empresa_id, contato_id, status, responsavel_id, bot_ativo, aguardando_atendente, integracao_whatsapp_id")
    .eq("id", input.conversaId)
    .eq("empresa_id", input.empresaId)
    .maybeSingle();
  if (conversaError || !conversa || conversaEstaComHumano(conversa)) return null;

  const integracaoId = input.integracaoWhatsappId || conversa.integracao_whatsapp_id || null;
  const { data: agentes, error: agentesError } = await supabaseAdmin
    .from("agentes_ia")
    .select("*")
    .eq("empresa_id", input.empresaId)
    .eq("status", "ativo")
    .order("created_at", { ascending: true });
  if (agentesError) {
    console.error("[AGENTE_IA] Erro ao buscar agentes ativos:", agentesError);
    return null;
  }

  const agente = (agentes || []).find((item: AgenteRow) => agentePermiteIntegracao(item, integracaoId)) as AgenteRow | undefined;
  if (!agente) return null;

  await cancelarFluxosConversacionaisAtivos(input.empresaId, input.conversaId);
  const agora = new Date().toISOString();
  await supabaseAdmin
    .from("conversas")
    .update({
      status: "bot",
      bot_ativo: true,
      aguardando_atendente: false,
      origem_atendimento: "bot",
      responsavel_id: null,
      closed_at: null,
      updated_at: agora,
    })
    .eq("id", input.conversaId)
    .eq("empresa_id", input.empresaId);

  const debounceMs = numeroInteiro(agente.debounce_ms, 1200, 250, 10000);
  const { data: pendencia, error: pendenciaError } = await supabaseAdmin.rpc("agente_ia_enfileirar_mensagem", {
    p_empresa_id: input.empresaId,
    p_agente_id: agente.id,
    p_conversa_id: input.conversaId,
    p_contato_id: input.contatoId || conversa.contato_id || null,
    p_numero_destino: input.numeroDestino || "",
    p_mensagem_id: mensagemId,
    p_conteudo: texto,
    p_debounce_ms: debounceMs,
  });
  if (pendenciaError || !pendencia) {
    console.error("[AGENTE_IA] Erro ao enfileirar mensagem:", pendenciaError);
    return null;
  }

  const id = (pendencia as PendenciaRow).id;
  const publicou = await publicarPendenciaQstash(id, debounceMs);
  if (!publicou) {
    await esperar(debounceMs + 50);
    await processarPendenciaAgenteIa(id, { forcar: true }).catch((error) =>
      console.error("[AGENTE_IA] Falha no fallback inline:", error)
    );
  }

  return { ok: true, status: "agente_ia_agendado", agenteId: agente.id, pendenciaId: id };
}

async function carregarFerramentas(empresaId: string, agenteId: string) {
  const { data } = await supabaseAdmin
    .from("agente_ia_ferramentas")
    .select("tipo, config_json")
    .eq("empresa_id", empresaId)
    .eq("agente_id", agenteId)
    .eq("ativo", true);
  const mapa = new Map<TipoFerramenta, Record<string, unknown>>();
  for (const item of data || []) {
    const tipo = String(item.tipo || "");
    if (isTipoFerramenta(tipo)) mapa.set(tipo, (item.config_json || {}) as Record<string, unknown>);
  }
  return mapa;
}

function normalizarHoraLocal(valor: unknown) {
  const texto = String(valor || "").trim();
  const match = texto.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hora = Number(match[1]);
  const minuto = Number(match[2] || 0);
  if (hora < 0 || hora > 23 || minuto < 0 || minuto > 59) return null;
  return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}

function formatarAgendamentoAtivo(item: any, timezone: string) {
  const labels = formatarSlotAgenda(item.inicio_at, item.fim_at, timezone);
  return {
    id: item.id,
    titulo: item.titulo || "Agendamento",
    status: item.status,
    data: dataLocalDeIso(item.inicio_at, timezone),
    hora: labels.hora_label,
    label: String(labels.label || "").replace(/\s*\(([^)]+)\)\s*$/, " até $1").trim(),
  };
}

async function buscarAgendamentosAtivos(params: {
  empresaId: string;
  agendaId: string;
  conversaId: string;
  contatoId?: string | null;
}) {
  let query = supabaseAdmin
    .from("agenda_agendamentos")
    .select("id, agenda_id, contato_id, conversa_id, titulo, inicio_at, fim_at, status, metadata_json")
    .eq("empresa_id", params.empresaId)
    .eq("agenda_id", params.agendaId)
    .in("status", ["agendado", "confirmado"])
    .gte("fim_at", new Date().toISOString())
    .order("inicio_at", { ascending: true });

  if (params.contatoId) {
    query = query.or(`conversa_id.eq.${params.conversaId},contato_id.eq.${params.contatoId}`);
  } else {
    query = query.eq("conversa_id", params.conversaId);
  }

  const { data, error } = await query.limit(5);
  if (error) throw new Error(error.message);
  return data || [];
}

function sincronizarEstadoComAgendamentosAtivos(
  estadoBase: EstadoConversa,
  agendamentosAtivos: any[],
  timezone: string
) {
  const estado = normalizarEstado(estadoBase);
  const fatosSemAgenda = estado.fatos_confirmados.filter((item) => !ehFatoOperacionalAgenda(item));
  const fatosAgenda = agendamentosAtivos.slice(0, 3).map((item) => {
    const agendamento = formatarAgendamentoAtivo(item, timezone);
    return `Agendamento ativo: ${agendamento.label}`;
  });
  let estagio = estado.estagio;
  let proximaAcao = estado.proxima_acao;

  if (!agendamentosAtivos.length && /(?:agend|remarc)/i.test(estagio)) {
    estagio = "sem agendamento ativo";
    if (proximaAcao && /(?:agend|demonstra|reuni)/i.test(proximaAcao)) {
      proximaAcao = "definir próximo passo";
    }
  } else if (agendamentosAtivos.length && /cancelad/i.test(estagio)) {
    estagio = "agendamento ativo";
  }

  return {
    ...estado,
    estagio,
    proxima_acao: proximaAcao,
    fatos_confirmados: [...fatosSemAgenda, ...fatosAgenda].slice(-8),
  };
}

function estadoIndicaReagendamento(estado: EstadoConversa) {
  return /reagend|remarc/i.test(`${estado.estagio} ${estado.proxima_acao || ""}`);
}

function mensagemAssistenteTemEstadoOperacionalAntigo(texto: string) {
  return /\b(?:agendad[oa]|remarcad[oa]|marcad[oa]|cancelad[oa])\b/i.test(texto) &&
    /\b(?:\d{1,2}[:h]\d{0,2}|segunda|terça|quarta|quinta|sexta|sábado|domingo|hoje|amanhã)\b/i.test(texto);
}

async function carregarContexto(ctx: ContextoExecucao) {
  const limite = numeroInteiro(ctx.agente.max_mensagens_contexto, 4, 4, 40);
  const [{ data: mensagens }, { data: estado }] = await Promise.all([
    supabaseAdmin
      .from("mensagens")
      .select("id, remetente_tipo, conteudo, tipo_mensagem, created_at")
      .eq("empresa_id", ctx.pendencia.empresa_id)
      .eq("conversa_id", ctx.pendencia.conversa_id)
      .order("created_at", { ascending: false })
      .limit(limite),
    supabaseAdmin
      .from("agente_ia_conversa_estados")
      .select("estado_json")
      .eq("empresa_id", ctx.pendencia.empresa_id)
      .eq("agente_id", ctx.agente.id)
      .eq("conversa_id", ctx.pendencia.conversa_id)
      .maybeSingle(),
  ]);

  const agendaId = agendaIdConfiguradaFerramentas(ctx.ferramentasAtivas);
  let agendas: any[] = [];
  let agendamentosAtivos: any[] = [];
  if (agendaId) {
    const { data: agenda, error: agendaError } = await supabaseAdmin
      .from("calendarios")
      .select("id, nome, timezone, duracao_minutos")
      .eq("empresa_id", ctx.pendencia.empresa_id)
      .eq("id", agendaId)
      .eq("status", "ativo")
      .maybeSingle();
    if (agendaError) throw new Error(agendaError.message);
    if (!agenda) throw new Error("A agenda obrigatória configurada para o agente não está disponível.");
    agendas = [agenda];
    agendamentosAtivos = await buscarAgendamentosAtivos({
      empresaId: ctx.pendencia.empresa_id,
      agendaId,
      conversaId: ctx.pendencia.conversa_id,
      contatoId: ctx.pendencia.contato_id || null,
    });
  }

  const historico = (mensagens || [])
    .reverse()
    .filter((item: any) => String(item.conteudo || "").trim())
    .filter((item: any) => {
      if (item.remetente_tipo === "contato") return true;
      return !mensagemAssistenteTemEstadoOperacionalAntigo(String(item.conteudo || ""));
    })
    .map((item: any) => ({
      role: item.remetente_tipo === "contato" ? "user" : "assistant",
      content: String(item.conteudo || "").slice(0, 500),
    }));

  const timezone = agendas[0]?.timezone || "America/Sao_Paulo";
  const estadoSincronizado = agendaId
    ? sincronizarEstadoComAgendamentosAtivos(normalizarEstado(estado?.estado_json), agendamentosAtivos, timezone)
    : normalizarEstado(estado?.estado_json);

  return { historico, estado: estadoSincronizado, agendas, agendamentosAtivos };
}

function definicoesFerramentas(ativas: Map<TipoFerramenta, Record<string, unknown>>) {
  const defs: any[] = [];
  if (ativas.has("consultar_conhecimento")) {
    defs.push({
      type: "function",
      name: "consultar_conhecimento",
      description: "Busca fatos aprovados na base. Consulta curta.",
      strict: true,
      parameters: { type: "object", properties: { consulta: { type: "string" } }, required: ["consulta"], additionalProperties: false },
    });
  }
  if (ativas.has("consultar_agenda")) {
    defs.push({
      type: "function",
      name: "consultar_agenda",
      description: "Retorna até 12 horários reais e aplica filtros de data/horário da mensagem.",
      strict: true,
      parameters: {
        type: "object",
        properties: { data: { anyOf: [{ type: "string", description: "YYYY-MM-DD" }, { type: "null" }] } },
        required: ["data"], additionalProperties: false,
      },
    });
  }
  if (ativas.has("criar_agendamento")) {
    defs.push({
      type: "function",
      name: "criar_agendamento",
      description: "Cria compromisso na agenda autorizada com data/hora LOCAL confirmadas.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          data: { type: "string", description: "YYYY-MM-DD local" },
          hora: { type: "string", description: "HH:mm local" },
          titulo: { type: "string" },
        },
        required: ["data", "hora", "titulo"], additionalProperties: false,
      },
    });
  }
  if (ativas.has("remarcar_agendamento")) {
    defs.push({
      type: "function",
      name: "remarcar_agendamento",
      description: "Remarca compromisso ativo; backend localiza pelo contato e referência local opcional.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          data: { type: "string", description: "Nova data YYYY-MM-DD" },
          hora: { type: "string", description: "Nova hora HH:mm" },
          referencia_data: { anyOf: [{ type: "string" }, { type: "null" }] },
          referencia_hora: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
        required: ["data", "hora", "referencia_data", "referencia_hora"], additionalProperties: false,
      },
    });
  }
  if (ativas.has("cancelar_agendamento")) {
    defs.push({
      type: "function",
      name: "cancelar_agendamento",
      description: "Cancela compromisso ativo; backend localiza pelo contato e referência local opcional.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          referencia_data: { anyOf: [{ type: "string" }, { type: "null" }] },
          referencia_hora: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
        required: ["referencia_data", "referencia_hora"], additionalProperties: false,
      },
    });
  }
  if (ativas.has("consultar_contato")) {
    defs.push({
      type: "function",
      name: "consultar_contato",
      description: "Consulta dados do contato atual.",
      strict: true,
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    });
  }
  if (ativas.has("transferir_humano")) {
    defs.push({
      type: "function",
      name: "transferir_humano",
      description: "Transfere para humano no destino já configurado.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          mensagem_cliente: { anyOf: [{ type: "string" }, { type: "null" }] },
          motivo_interno: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
        required: ["mensagem_cliente", "motivo_interno"], additionalProperties: false,
      },
    });
  }
  return defs;
}

function normalizarTextoIntencao(valor: unknown) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function consultaConhecimentoAutomatica(mensagem: string) {
  const texto = normalizarTextoIntencao(mensagem);
  if (!texto) return null;
  if (/\b(preco|precos|valor|valores|custa|custar|mensalidade|plano|planos)\b/.test(texto)) {
    return "preço planos usuários";
  }
  if (/\b(paciente|pacientes|prontuario|odontograma|odontologic)\w*/.test(texto)) {
    return "pacientes prontuário odontograma cadastro";
  }
  if (/\b(estoque|erp|pdv|nota fiscal|nfe)\b/.test(texto)) {
    return "estoque ERP gestão";
  }
  if (/\b(google calendar|whatsapp|integracao|integracoes)\b/.test(texto)) {
    return texto.includes("google") ? "agenda Google Calendar integração" : "WhatsApp integrações atendimento";
  }
  if (/\b(tem|possui|oferece)\b.*\b(ia|inteligencia artificial)\b|\bagentes? de ia\b/.test(texto)) {
    return "IA automações agentes";
  }
  if (/\b(como funciona|como que funciona|o que faz|oque faz|quero conhecer o crm|conhecer o crm)\b/.test(texto)) {
    return "visão geral CRM Prosperity";
  }
  if (/\b(funcionalidade|funcionalidades|recurso|recursos)\b/.test(texto)) {
    return textoCurto(mensagem, 120);
  }
  return null;
}

function mensagemEhCurtaDeContinuidade(mensagem: string) {
  const texto = normalizarTextoIntencao(mensagem);
  return /^(sim|nao|quero|quero sim|pode|pode ser|ok|certo|blz|beleza|entendi|me mostra|mostra|manda|vamos|fechado)$/.test(texto);
}

function mensagemTemIntencaoAgenda(mensagem: string, estado: EstadoConversa) {
  const texto = normalizarTextoIntencao(mensagem);
  return /\b(agenda|agendar|marcar|remarcar|reagendar|cancelar|horario|horarios|disponivel|disponibilidade|reuniao|demonstracao|amanha|hoje|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/.test(texto) ||
    /agend|remarc|reagend/i.test(`${estado.estagio} ${estado.proxima_acao || ""}`);
}

function selecionarFerramentasParaModelo(params: {
  ativas: Map<TipoFerramenta, Record<string, unknown>>;
  mensagem: string;
  estado: EstadoConversa;
  agendamentosAtivos: any[];
  preexecutadas: Set<TipoFerramenta>;
}) {
  const { ativas, mensagem, estado, agendamentosAtivos, preexecutadas } = params;
  const selecionadas = new Map<TipoFerramenta, Record<string, unknown>>();
  const texto = normalizarTextoIntencao(mensagem);
  const adicionar = (tipo: TipoFerramenta) => {
    const config = ativas.get(tipo);
    if (config) selecionadas.set(tipo, config);
  };

  const querHumano = /\b(atendente|humano|pessoa|alguem|falar com|transferir)\b/.test(texto);
  const querCancelar = /\b(cancelar|cancela|desmarcar|desmarca)\b/.test(texto);
  const querRemarcar = /\b(remarcar|reagendar|mudar o horario|mudar horario|trocar o dia|trocar horario)\b/.test(texto) || estadoIndicaReagendamento(estado);
  const intencaoAgenda = mensagemTemIntencaoAgenda(mensagem, estado);
  const querContato = /\b(meus dados|meu cadastro|cadastro|meu email|meu e-mail|meu telefone|meu contato)\b/.test(texto);
  const consultaBase = consultaConhecimentoAutomatica(mensagem);
  const perguntaGeral = /\?|\b(como|qual|quais|quanto|tem|possui|oferece|explica|explique)\b/.test(texto);

  if (querHumano) {
    adicionar("transferir_humano");
    return selecionadas;
  }

  if (querContato) adicionar("consultar_contato");

  if (intencaoAgenda) {
    if (!preexecutadas.has("consultar_agenda")) adicionar("consultar_agenda");
    if (querCancelar) {
      adicionar("cancelar_agendamento");
    } else if (querRemarcar) {
      adicionar("remarcar_agendamento");
    } else {
      if (agendamentosAtivos.length) adicionar("remarcar_agendamento");
      adicionar("criar_agendamento");
    }
  }

  if (!preexecutadas.has("consultar_conhecimento") && (consultaBase || (perguntaGeral && !intencaoAgenda))) {
    adicionar("consultar_conhecimento");
  }

  if (ativas.has("transferir_humano")) adicionar("transferir_humano");

  if (selecionadas.size === (ativas.has("transferir_humano") ? 1 : 0) && !mensagemEhCurtaDeContinuidade(mensagem)) {
    adicionar("consultar_conhecimento");
  }

  return selecionadas;
}

async function resolverSlotLocal(params: {
  empresaId: string;
  agendaId: string;
  data: string;
  hora: string;
}) {
  const data = String(params.data || "").trim();
  const hora = normalizarHoraLocal(params.hora);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !hora) {
    return { ok: false as const, error: "Data ou horário local inválido." };
  }

  const { data: agenda, error: agendaError } = await supabaseAdmin
    .from("calendarios")
    .select("id, nome, timezone, duracao_minutos, status")
    .eq("empresa_id", params.empresaId)
    .eq("id", params.agendaId)
    .eq("status", "ativo")
    .maybeSingle();
  if (agendaError) throw new Error(agendaError.message);
  if (!agenda) return { ok: false as const, error: "Agenda não encontrada ou inativa." };

  const timezone = agenda.timezone || "America/Sao_Paulo";
  const resultado = await listarSlotsDisponiveis({
    supabase: supabaseAdmin,
    empresaId: params.empresaId,
    agendaId: params.agendaId,
    data,
    janelaDias: 1,
    limite: 50,
  });
  const slot = resultado.slots.find(
    (item: any) => dataLocalDeIso(item.inicio_at, timezone) === data && String(item.hora_label) === hora
  );
  if (!slot) return { ok: false as const, error: "O horário solicitado não está mais disponível." };
  return { ok: true as const, agenda, slot };
}

function compactarSlots(resultado: any, slotsOverride?: any[]) {
  const timezone = resultado.agenda?.timezone || "America/Sao_Paulo";
  const slots = slotsOverride || resultado.slots || [];
  return slots.map((slot: any, index: number) => ({
    n: index + 1,
    data: dataLocalDeIso(slot.inicio_at, timezone),
    hora: slot.hora_label,
    label: slot.label,
  }));
}

function labelNaturalSlot(slot: any) {
  return String(slot?.label || "")
    .replace(/\s*\(([^)]+)\)\s*$/, " até $1")
    .trim();
}

async function resolverAgendamentoAtivo(params: {
  ctx: ContextoExecucao;
  agendaId: string;
  referenciaData?: unknown;
  referenciaHora?: unknown;
}) {
  const timezone = params.ctx.agendaAutorizada?.timezone || "America/Sao_Paulo";
  const ativos = await buscarAgendamentosAtivos({
    empresaId: params.ctx.pendencia.empresa_id,
    agendaId: params.agendaId,
    conversaId: params.ctx.pendencia.conversa_id,
    contatoId: params.ctx.pendencia.contato_id || null,
  });
  params.ctx.agendamentosAtivos = ativos;

  const referenciaData = String(params.referenciaData || "").trim() || null;
  const referenciaHora = normalizarHoraLocal(params.referenciaHora);
  let candidatos = ativos;
  if (referenciaData) {
    candidatos = candidatos.filter((item) => dataLocalDeIso(item.inicio_at, timezone) === referenciaData);
  }
  if (referenciaHora) {
    candidatos = candidatos.filter((item) => formatarAgendamentoAtivo(item, timezone).hora === referenciaHora);
  }

  const opcoes = (candidatos.length ? candidatos : ativos).map((item) => {
    const agendamento = formatarAgendamentoAtivo(item, timezone);
    return { data: agendamento.data, hora: agendamento.hora, label: agendamento.label, titulo: agendamento.titulo };
  });

  if (!ativos.length) {
    return { ok: false as const, code: "SEM_AGENDAMENTO_ATIVO", error: "Não existe agendamento ativo para este contato na agenda autorizada.", opcoes: [] };
  }
  if (!candidatos.length) {
    return { ok: false as const, code: "REFERENCIA_NAO_ENCONTRADA", error: "Não encontrei um agendamento ativo que corresponda à referência informada.", opcoes };
  }
  if (candidatos.length > 1) {
    return { ok: false as const, code: "MULTIPLOS_AGENDAMENTOS_ATIVOS", error: "Há mais de um agendamento ativo. Pergunte ao cliente qual deseja alterar/cancelar usando data ou horário.", opcoes };
  }
  return { ok: true as const, agendamento: candidatos[0], timezone };
}

async function enviarMensagemAgente(params: {
  empresaId: string; conversaId: string; agenteId: string; execucaoId: string; numeroDestino: string; texto: string;
}) {
  const { data: conversa } = await supabaseAdmin
    .from("conversas").select("integracao_whatsapp_id").eq("empresa_id", params.empresaId).eq("id", params.conversaId).maybeSingle();
  if (!conversa?.integracao_whatsapp_id) throw new Error("Conversa sem integração WhatsApp.");
  const { data: integracao } = await supabaseAdmin
    .from("integracoes_whatsapp").select("id, phone_number_id, config_json, token_ref").eq("empresa_id", params.empresaId).eq("id", conversa.integracao_whatsapp_id).maybeSingle();
  if (!integracao?.phone_number_id) throw new Error("Integração WhatsApp inválida.");
  const accessToken = getWhatsAppAccessToken(integracao);
  if (!accessToken) throw new Error("Token do WhatsApp indisponível.");

  const envio = await sendWhatsAppTextMessage({ phoneNumberId: integracao.phone_number_id, accessToken, to: params.numeroDestino, body: params.texto });
  const agora = new Date().toISOString();
  const { data: protocolo } = await supabaseAdmin
    .from("conversa_protocolos").select("id").eq("empresa_id", params.empresaId).eq("conversa_id", params.conversaId).eq("ativo", true)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

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
      origem: "agente_ia", agente_id: params.agenteId, agente_execucao_id: params.execucaoId,
      meta_status: envio.status, meta_error: envio.error,
    },
    created_at: agora,
    updated_at: agora,
  });
  if (mensagemError) console.error("[AGENTE_IA] Falha ao persistir mensagem enviada:", mensagemError);
  if (!envio.ok) throw new Error(envio.error || "Falha ao enviar resposta do agente.");
  await supabaseAdmin.from("conversas").update({ last_message_at: agora, updated_at: agora }).eq("empresa_id", params.empresaId).eq("id", params.conversaId);
  return envio;
}

async function enviarMensagensAgente(ctx: ContextoExecucao, mensagens: string[]) {
  if (!ctx.pendencia.numero_destino) return;
  const limpas = mensagens.map((m) => m.trim()).filter(Boolean).slice(0, MAX_MENSAGENS_SAIDA);
  for (let indice = 0; indice < limpas.length; indice++) {
    if (indice > 0) {
      const anterior = limpas[indice - 1];
      const delay = Math.min(1350, Math.max(550, 420 + anterior.length * 3));
      await esperar(delay);
    }
    await enviarMensagemAgente({
      empresaId: ctx.pendencia.empresa_id,
      conversaId: ctx.pendencia.conversa_id,
      agenteId: ctx.agente.id,
      execucaoId: ctx.execucaoId,
      numeroDestino: ctx.pendencia.numero_destino,
      texto: limpas[indice],
    });
    ctx.respostaEnviada = true;
  }
}

async function executarFerramenta(nome: TipoFerramenta, args: any, ctx: ContextoExecucao) {
  const empresaId = ctx.pendencia.empresa_id;
  const conversaId = ctx.pendencia.conversa_id;

  if (nome === "consultar_conhecimento") {
    const consulta = textoCurto(args.consulta, 180);
    const { data, error } = await supabaseAdmin.rpc("agente_ia_buscar_conhecimento", {
      p_empresa_id: empresaId,
      p_agente_id: ctx.agente.id,
      p_consulta: consulta,
      p_limite: MAX_RESULTADOS_CONHECIMENTO,
    });
    if (error) throw new Error(error.message);
    const resultados = (data || []).slice(0, MAX_RESULTADOS_CONHECIMENTO).map((item: any) => ({
      titulo: item.titulo,
      categoria: item.categoria,
      trecho: String(item.trecho || "").slice(0, MAX_CARACTERES_TRECHO_CONHECIMENTO),
    }));
    return { ok: true, consulta, resultados };
  }

  if (nome === "consultar_contato") {
    return {
      ok: true,
      contato: ctx.contato ? {
        nome: ctx.contato.nome,
        telefone: ctx.contato.telefone,
        email: ctx.contato.email,
        empresa: ctx.contato.empresa,
        origem: ctx.contato.origem,
        campanha: ctx.contato.campanha,
        status_lead: ctx.contato.status_lead,
        classificacao: ctx.contato.classificacao,
      } : null,
    };
  }

  if (nome === "consultar_agenda") {
    const agendaId = agendaIdConfiguradaFerramentas(ctx.ferramentasAtivas);
    if (!agendaId) return { ok: false, error: "Agenda obrigatória não configurada." };
    const timezone = ctx.agendaAutorizada?.timezone || "America/Sao_Paulo";
    const interpretacao = interpretarDataHorarioAgenda(ctx.pendencia.conteudo_agregado, timezone);
    const dataArg = args.data ? String(args.data).trim() : "";
    const data = /^\d{4}-\d{2}-\d{2}$/.test(dataArg) ? dataArg : interpretacao.data || null;
    const resultado = await listarSlotsDisponiveis({
      supabase: supabaseAdmin,
      empresaId,
      agendaId,
      data,
      janelaDias: data ? 1 : 14,
      limite: interpretacao.preferencia ? 50 : 12,
    });
    const filtrados = filtrarSlotsPorPreferencia(
      resultado.slots,
      interpretacao.preferencia,
      timezone
    ).slice(0, 12);
    return {
      ok: true,
      agenda: resultado.agenda ? {
        nome: resultado.agenda.nome,
        timezone: resultado.agenda.timezone,
      } : null,
      slots: compactarSlots(resultado, filtrados),
    };
  }

  if (nome === "criar_agendamento") {
    const agendaId = agendaIdConfiguradaFerramentas(ctx.ferramentasAtivas);
    if (!agendaId) return { ok: false, error: "Agenda obrigatória não configurada." };

    if (estadoIndicaReagendamento(ctx.estadoConversa)) {
      const ativos = await buscarAgendamentosAtivos({
        empresaId,
        agendaId,
        conversaId,
        contatoId: ctx.pendencia.contato_id || null,
      });
      if (ativos.length) {
        const timezone = ctx.agendaAutorizada?.timezone || "America/Sao_Paulo";
        return {
          ok: false,
          code: "REAGENDAMENTO_EM_ANDAMENTO",
          error: "Existe agendamento ativo e a conversa está em reagendamento. Use remarcar_agendamento em vez de criar outro compromisso.",
          agendamentos_ativos: ativos.map((item) => {
            const agendamento = formatarAgendamentoAtivo(item, timezone);
            return { data: agendamento.data, hora: agendamento.hora, label: agendamento.label };
          }),
        };
      }
    }

    const resolvido = await resolverSlotLocal({
      empresaId,
      agendaId,
      data: String(args.data || ""),
      hora: String(args.hora || ""),
    });
    if (!resolvido.ok) return resolvido;

    const inicioAt = resolvido.slot.inicio_at;
    const fimAt = resolvido.slot.fim_at;
    const { data: existente } = await supabaseAdmin.from("agenda_agendamentos")
      .select("id, titulo, status")
      .eq("empresa_id", empresaId)
      .eq("agenda_id", agendaId)
      .eq("conversa_id", conversaId)
      .eq("inicio_at", inicioAt)
      .eq("fim_at", fimAt)
      .in("status", ["agendado", "confirmado"])
      .maybeSingle();

    const quando = labelNaturalSlot(resolvido.slot);
    if (existente) {
      ctx.acaoCriticaExecutada = true;
      ctx.respostaDeterministica = [`Fechado — esse horário já está agendado para ${quando}.`];
      return { ok: true, idempotente: true, agendamento: existente, quando };
    }

    const agora = new Date().toISOString();
    const { data: criado, error } = await supabaseAdmin.from("agenda_agendamentos").insert({
      empresa_id: empresaId,
      agenda_id: agendaId,
      contato_id: ctx.pendencia.contato_id || null,
      conversa_id: conversaId,
      titulo: String(args.titulo || "Agendamento").trim() || "Agendamento",
      nome_cliente: ctx.contato?.nome || null,
      telefone_cliente: ctx.contato?.telefone || ctx.pendencia.numero_destino || null,
      email_cliente: ctx.contato?.email || null,
      inicio_at: inicioAt,
      fim_at: fimAt,
      status: "agendado",
      origem: "api",
      metadata_json: { origem: "agente_ia", agente_id: ctx.agente.id, agente_execucao_id: ctx.execucaoId },
      created_at: agora,
      updated_at: agora,
    }).select("id, titulo, status").single();
    if (error || !criado) throw new Error(error?.message || "Erro ao criar agendamento.");

    ctx.acaoCriticaExecutada = true;
    ctx.respostaDeterministica = [`Fechado — ficou agendado para ${quando}.`];
    await sincronizarAgendamentoGoogleCalendar({ empresaId, agendaId, agendamentoId: criado.id }).catch((errorSync) =>
      console.error("[AGENTE_IA] Erro ao sincronizar agendamento no Google:", errorSync)
    );
    return { ok: true, agendamento: criado, quando };
  }

  if (nome === "remarcar_agendamento") {
    const agendaId = agendaIdConfiguradaFerramentas(ctx.ferramentasAtivas);
    if (!agendaId) return { ok: false, error: "Agenda obrigatória não configurada." };
    const atualResolvido = await resolverAgendamentoAtivo({
      ctx,
      agendaId,
      referenciaData: args.referencia_data,
      referenciaHora: args.referencia_hora,
    });
    if (!atualResolvido.ok) return atualResolvido;
    const atual = atualResolvido.agendamento;

    const dataNova = String(args.data || "").trim();
    const horaNova = normalizarHoraLocal(args.hora);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataNova) || !horaNova) {
      return { ok: false, error: "Nova data ou horário local inválido." };
    }

    const atualFormatado = formatarAgendamentoAtivo(atual, atualResolvido.timezone);
    if (atualFormatado.data === dataNova && atualFormatado.hora === horaNova) {
      ctx.acaoCriticaExecutada = true;
      ctx.respostaDeterministica = [`Esse agendamento já está nesse horário: ${atualFormatado.label}.`];
      return { ok: true, idempotente: true, agendamento: { id: atual.id, status: atual.status }, quando: atualFormatado.label };
    }

    const resolvido = await resolverSlotLocal({
      empresaId,
      agendaId,
      data: dataNova,
      hora: horaNova,
    });
    if (!resolvido.ok) return resolvido;
    const inicioAt = resolvido.slot.inicio_at;
    const fimAt = resolvido.slot.fim_at;
    const quando = labelNaturalSlot(resolvido.slot);

    const { data: atualizado, error } = await supabaseAdmin.from("agenda_agendamentos").update({
      inicio_at: inicioAt,
      fim_at: fimAt,
      metadata_json: {
        ...(atual.metadata_json || {}),
        origem_ultima_alteracao: "agente_ia",
        agente_id: ctx.agente.id,
      },
      updated_at: new Date().toISOString(),
    }).eq("empresa_id", empresaId).eq("id", atual.id).eq("agenda_id", agendaId)
      .select("id, agenda_id, titulo, status").single();
    if (error || !atualizado) throw new Error(error?.message || "Erro ao remarcar agendamento.");

    ctx.acaoCriticaExecutada = true;
    ctx.respostaDeterministica = [`Pronto — ficou remarcado para ${quando}.`];
    await sincronizarAgendamentoGoogleCalendar({ empresaId, agendaId, agendamentoId: atualizado.id }).catch((errorSync) =>
      console.error("[AGENTE_IA] Erro ao sincronizar remarcação no Google:", errorSync)
    );
    return { ok: true, agendamento: atualizado, quando };
  }

  if (nome === "cancelar_agendamento") {
    const agendaId = agendaIdConfiguradaFerramentas(ctx.ferramentasAtivas);
    if (!agendaId) return { ok: false, error: "Agenda obrigatória não configurada." };
    const atualResolvido = await resolverAgendamentoAtivo({
      ctx,
      agendaId,
      referenciaData: args.referencia_data,
      referenciaHora: args.referencia_hora,
    });
    if (!atualResolvido.ok) return atualResolvido;
    const atual = atualResolvido.agendamento;

    const agora = new Date().toISOString();
    const { error } = await supabaseAdmin.from("agenda_agendamentos")
      .update({ status: "cancelado", cancelado_em: agora, updated_at: agora })
      .eq("empresa_id", empresaId)
      .eq("id", atual.id)
      .eq("agenda_id", agendaId)
      .in("status", ["agendado", "confirmado"]);
    if (error) throw new Error(error.message);

    ctx.acaoCriticaExecutada = true;
    ctx.respostaDeterministica = ["Certo — o agendamento foi cancelado."];
    await sincronizarAgendamentoGoogleCalendar({ empresaId, agendaId, agendamentoId: atual.id, forcar: true }).catch((errorSync) =>
      console.error("[AGENTE_IA] Erro ao sincronizar cancelamento no Google:", errorSync)
    );
    return { ok: true, agendamento_id: atual.id, status: "cancelado" };
  }

  if (nome === "transferir_humano") {
    const { data: conversaAtual, error: conversaAtualError } = await supabaseAdmin
      .from("conversas")
      .select("id, status, setor_id, responsavel_id, bot_ativo, aguardando_atendente")
      .eq("empresa_id", empresaId)
      .eq("id", conversaId)
      .maybeSingle();
    if (conversaAtualError) throw new Error(conversaAtualError.message);
    if (!conversaAtual) return { ok: false, error: "Conversa não encontrada para transferência." };

    if (conversaEstaComHumano(conversaAtual)) {
      ctx.acaoCriticaExecutada = true;
      ctx.transferidoHumano = true;
      return {
        ok: true,
        transferido: true,
        idempotente: true,
        setor_id: conversaAtual.setor_id || null,
        responsavel_id: conversaAtual.responsavel_id || null,
      };
    }

    const config = ctx.ferramentasAtivas.get("transferir_humano") || {};
    const setorConfiguradoId = String(config.setor_id || "").trim() || null;
    let setorConfigurado: { id: string; nome?: string | null } | null = null;
    if (setorConfiguradoId) {
      const { data: setor, error: setorError } = await supabaseAdmin
        .from("setores")
        .select("id, nome")
        .eq("empresa_id", empresaId)
        .eq("id", setorConfiguradoId)
        .maybeSingle();
      if (setorError) throw new Error(setorError.message);
      if (!setor) return { ok: false, error: "O setor configurado para transferência não existe nesta empresa." };
      setorConfigurado = setor;
    }

    const atribuicao = await resolverAtribuicaoTransferencia({
      empresaId,
      setorId: setorConfigurado?.id || null,
      escopoFila: setorConfigurado ? "setor" : "geral",
      estrategia: (config.estrategia_transferencia || "fila_setor") as any,
      atendenteId: config.atendente_id as any,
      incluirAdministradores: config.incluir_administradores as any,
    });

    const agora = new Date().toISOString();
    const { data: conversaTransferida, error: transferenciaError } = await supabaseAdmin
      .from("conversas")
      .update({
        setor_id: atribuicao.setorId,
        escopo_fila: atribuicao.escopoFila,
        status: atribuicao.responsavelId ? "em_atendimento" : "fila",
        responsavel_id: atribuicao.responsavelId,
        bot_ativo: false,
        aguardando_atendente: !atribuicao.responsavelId,
        updated_at: agora,
      })
      .eq("empresa_id", empresaId)
      .eq("id", conversaId)
      .select("id, status, setor_id, responsavel_id, bot_ativo, aguardando_atendente")
      .single();

    if (transferenciaError || !conversaTransferida) {
      return { ok: false, error: transferenciaError?.message || "Não foi possível concluir a transferência." };
    }
    if (conversaTransferida.bot_ativo !== false || !["fila", "em_atendimento"].includes(String(conversaTransferida.status || ""))) {
      return { ok: false, error: "A conversa não confirmou o estado de transferência esperado." };
    }

    ctx.acaoCriticaExecutada = true;
    ctx.transferidoHumano = true;

    const mensagemCliente = textoCurto(
      args.mensagem_cliente || (setorConfigurado?.nome
        ? `Certo, vou te encaminhar para o time de ${setorConfigurado.nome}.`
        : "Certo, vou te encaminhar para um atendente."),
      320
    );
    let mensagemClienteEnviada = false;
    let erroEnvioCliente: string | null = null;
    if (mensagemCliente && ctx.pendencia.numero_destino) {
      try {
        await enviarMensagemAgente({
          empresaId,
          conversaId,
          agenteId: ctx.agente.id,
          execucaoId: ctx.execucaoId,
          numeroDestino: ctx.pendencia.numero_destino,
          texto: mensagemCliente,
        });
        ctx.respostaEnviada = true;
        mensagemClienteEnviada = true;
      } catch (error) {
        erroEnvioCliente = error instanceof Error ? error.message : String(error);
        console.error("[AGENTE_IA] Transferência concluída, mas falhou o aviso ao cliente:", error);
      }
    }

    return {
      ok: true,
      transferido: true,
      idempotente: false,
      setor_id: atribuicao.setorId,
      setor_nome: setorConfigurado?.nome || null,
      responsavel_id: atribuicao.responsavelId,
      fallback_motivo: atribuicao.fallbackMotivo,
      mensagem_cliente_enviada: mensagemClienteEnviada,
      erro_envio_cliente: erroEnvioCliente,
      motivo_interno: textoCurto(args.motivo_interno, 500) || null,
    };
  }

  return { ok: false, error: "Ferramenta não suportada." };
}

function referenciasTemporaisDistintas(mensagem: string) {
  const texto = normalizarTextoIntencao(mensagem);
  const refs = texto.match(/\b(?:hoje|amanha|depois de amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|\d{1,2}\/\d{1,2})\b/g) || [];
  return new Set(refs).size;
}

async function preExecutarConsultasObvias(ctx: ContextoExecucao) {
  const executadas: Array<{ nome: TipoFerramenta; argumentos: any; resultado: any }> = [];
  const mensagem = ctx.pendencia.conteudo_agregado;

  const consultaConhecimento = consultaConhecimentoAutomatica(mensagem);
  if (consultaConhecimento && ctx.ferramentasAtivas.has("consultar_conhecimento")) {
    try {
      const argumentos = { consulta: consultaConhecimento };
      const resultado = await executarFerramenta("consultar_conhecimento", argumentos, ctx);
      if (resultado?.ok && Array.isArray(resultado.resultados) && resultado.resultados.length) {
        const item = { nome: "consultar_conhecimento" as const, argumentos, resultado };
        executadas.push(item);
        ctx.ferramentasExecutadas.push(item);
      }
    } catch (error) {
      console.error("[AGENTE_IA] Pré-consulta de conhecimento falhou:", error);
    }
  }

  if (ctx.ferramentasAtivas.has("consultar_agenda") && ctx.agendaAutorizada) {
    const timezone = ctx.agendaAutorizada.timezone || "America/Sao_Paulo";
    const interpretacao = interpretarDataHorarioAgenda(mensagem, timezone);
    const temIntencaoAgenda = mensagemTemIntencaoAgenda(mensagem, ctx.estadoConversa);
    const referencias = referenciasTemporaisDistintas(mensagem);
    if (temIntencaoAgenda && interpretacao.data && referencias <= 1) {
      try {
        const argumentos = { data: interpretacao.data };
        const resultado = await executarFerramenta("consultar_agenda", argumentos, ctx);
        if (resultado?.ok) {
          const item = { nome: "consultar_agenda" as const, argumentos, resultado };
          executadas.push(item);
          ctx.ferramentasExecutadas.push(item);
        }
      } catch (error) {
        console.error("[AGENTE_IA] Pré-consulta de agenda falhou:", error);
      }
    }
  }

  return executadas;
}

function contextoPreconsultasParaModelo(executadas: Array<{ nome: TipoFerramenta; resultado: any }>) {
  const blocos: string[] = [];
  for (const item of executadas) {
    if (item.nome === "consultar_conhecimento") {
      const resultados = Array.isArray(item.resultado?.resultados) ? item.resultado.resultados : [];
      if (resultados.length) {
        blocos.push(
          `BASE JÁ CONSULTADA:\n${resultados.map((r: any) => `[${r.titulo}] ${r.trecho}`).join("\n")}`
        );
      }
    } else if (item.nome === "consultar_agenda") {
      const slots = Array.isArray(item.resultado?.slots) ? item.resultado.slots : [];
      const agenda = item.resultado?.agenda?.nome || "agenda autorizada";
      const resumoSlots = slots.length
        ? slots.map((s: any) => `${s.data} ${s.hora}`).join(", ")
        : "nenhum horário disponível";
      blocos.push(`AGENDA JÁ CONSULTADA (${agenda}): ${resumoSlots}.`);
    }
  }
  if (!blocos.length) return "";
  return `${blocos.join("\n\n")}\nUse estes dados diretamente e não repita a mesma consulta, salvo se precisar de outra informação.`;
}

async function executarFallbackFluxos(pendencia: PendenciaRow) {
  return processAutomationEngineFluxos({
    empresaId: pendencia.empresa_id,
    conversaId: pendencia.conversa_id,
    contatoId: pendencia.contato_id || "",
    mensagemTexto: pendencia.conteudo_agregado,
    numeroDestino: pendencia.numero_destino || "",
    mensagemId: pendencia.mensagem_ids.at(-1) || null,
  });
}

function dataAtualAgenda(agenda: any) {
  if (!agenda) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: agenda.timezone || "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

function promptDoAgente(
  agente: AgenteRow,
  estado: EstadoConversa,
  agendas: any[],
  agendamentosAtivos: any[]
) {
  const agenda = agendas[0] || null;
  const agendaInfo = agenda
    ? `${agenda.nome}; ${agenda.timezone || "America/Sao_Paulo"}; ${agenda.duracao_minutos || 60}min; hoje=${dataAtualAgenda(agenda)}`
    : "nenhuma";
  const timezone = agenda?.timezone || "America/Sao_Paulo";
  const estadoOperacionalAgenda = agendamentosAtivos.length
    ? agendamentosAtivos
        .slice(0, 3)
        .map((item) => `- ${formatarAgendamentoAtivo(item, timezone).label}`)
        .join("\n")
    : "- nenhum agendamento ativo";

  return [
    `Você é ${agente.nome}, assistente do CRM Prosperity.`,
    agente.prompt_sistema || "",
    agente.tom_voz ? `Características: ${agente.tom_voz}` : "",
    agente.instrucoes ? `Instruções: ${agente.instrucoes}` : "",
    "REGRAS DO RUNTIME:",
    "- PT-BR, WhatsApp natural, 1–3 mensagens curtas e no máximo uma pergunta principal. Continue o contexto sem repetir.",
    "- Memória/histórico dão continuidade, mas agenda ativa só existe se estiver no ESTADO OPERACIONAL abaixo.",
    "- Produto, preço, plano, integração e recurso: use a base consultada/ferramenta e não invente.",
    "- Agenda: use data/hora LOCAL, consulte disponibilidade antes de criar/remarcar e só confirme ação após ok=true.",
    "- Em reagendamento use remarcar_agendamento; não crie outro. Cancelar/remarcar usam o compromisso ativo do backend, sem UUID inventado.",
    "- Transferência usa o destino configurado. Não diga que é humano.",
    `Memória: ${memoriaCompacta(estado) || "sem fatos relevantes"}`,
    "Em memoria_delta envie SOMENTE novidades: null/[] quando não mudou; proxima_acao com string vazia limpa a ação.",
    `Agenda: ${agendaInfo}`,
    "ESTADO OPERACIONAL DA AGENDA:",
    estadoOperacionalAgenda,
  ].filter(Boolean).join("\n\n");
}

const FORMATO_SAIDA = {
  type: "json_schema",
  name: "resposta_agente_whatsapp",
  strict: true,
  schema: {
    type: "object",
    properties: {
      mensagens: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", minLength: 1, maxLength: 900 } },
      memoria_delta: {
        type: "object",
        properties: {
          tipo_negocio: { anyOf: [{ type: "string", maxLength: 120 }, { type: "null" }] },
          estagio: { anyOf: [{ type: "string", maxLength: 80 }, { type: "null" }] },
          proxima_acao: { anyOf: [{ type: "string", maxLength: 160 }, { type: "null" }] },
          dores: { type: "array", maxItems: 2, items: { type: "string", maxLength: 120 } },
          interesses: { type: "array", maxItems: 2, items: { type: "string", maxLength: 120 } },
          objecoes: { type: "array", maxItems: 2, items: { type: "string", maxLength: 120 } },
          fatos: { type: "array", maxItems: 3, items: { type: "string", maxLength: 140 } },
        },
        required: ["tipo_negocio", "estagio", "proxima_acao", "dores", "interesses", "objecoes", "fatos"],
        additionalProperties: false,
      },
    },
    required: ["mensagens", "memoria_delta"],
    additionalProperties: false,
  },
};

async function temNovaVersao(pendencia: PendenciaRow) {
  const { data } = await supabaseAdmin.from("agente_ia_pendencias").select("versao").eq("id", pendencia.id).maybeSingle();
  return Number(data?.versao || 0) > Number(pendencia.versao);
}

async function finalizarPendencia(params: {
  pendencia: PendenciaRow;
  lockToken: string;
  status?: "processado" | "erro" | "cancelado";
  erro?: string | null;
}) {
  const { data, error } = await supabaseAdmin.rpc("agente_ia_finalizar_pendencia", {
    p_pendencia_id: params.pendencia.id,
    p_lock_token: params.lockToken,
    p_versao: params.pendencia.versao,
    p_status: params.status || "processado",
    p_erro: params.erro || null,
  });
  if (error) {
    console.error("[AGENTE_IA] Falha ao finalizar pendência atomicamente:", error);
    return { ok: false, reagendar: false };
  }
  const resultado = (data || {}) as { ok?: boolean; reagendar?: boolean; processar_em?: string };
  if (resultado.reagendar) {
    const delay = resultado.processar_em
      ? Math.max(250, new Date(resultado.processar_em).getTime() - Date.now())
      : 500;
    void reagendarLocalSeNecessario(params.pendencia.id, delay).catch((erro) =>
      console.error("[AGENTE_IA] Falha ao reagendar nova versão:", erro)
    );
  }
  return { ok: resultado.ok === true, reagendar: resultado.reagendar === true };
}

async function garantirNovaTentativaSeIndisponivel(pendenciaId: string) {
  const { data } = await supabaseAdmin
    .from("agente_ia_pendencias")
    .select("id, status, processar_em, locked_at")
    .eq("id", pendenciaId)
    .maybeSingle();
  if (!data) return;
  if (data.status === "pendente") {
    const delay = Math.max(250, new Date(data.processar_em).getTime() - Date.now());
    await publicarPendenciaQstash(pendenciaId, delay);
    return;
  }
  if (data.status === "processando") {
    const idadeLock = data.locked_at ? Date.now() - new Date(data.locked_at).getTime() : 120000;
    const delay = Math.max(1500, 121000 - idadeLock);
    await publicarPendenciaQstash(pendenciaId, delay);
  }
}

export async function processarPendenciaAgenteIa(pendenciaId: string, options: { forcar?: boolean } = {}) {
  const lockToken = crypto.randomUUID();
  const { data: reservada, error: reservaError } = await supabaseAdmin.rpc("agente_ia_reservar_pendencia", {
    p_pendencia_id: pendenciaId,
    p_lock_token: lockToken,
    p_forcar: options.forcar === true,
  });
  if (reservaError) throw new Error(reservaError.message);
  if (!reservada) {
    await garantirNovaTentativaSeIndisponivel(pendenciaId);
    return { ok: true, processado: false, motivo: "pendencia_indisponivel_ou_debounce" };
  }

  const pendencia = reservada as PendenciaRow;
  const inicio = Date.now();
  let execucaoId = "";
  let ctx: ContextoExecucao | null = null;

  try {
    const [{ data: agente }, { data: conversa }, { data: contato }, ferramentasAtivas] = await Promise.all([
      supabaseAdmin.from("agentes_ia").select("*").eq("empresa_id", pendencia.empresa_id).eq("id", pendencia.agente_id).eq("status", "ativo").maybeSingle(),
      supabaseAdmin.from("conversas").select("id, status, responsavel_id, bot_ativo, aguardando_atendente, integracao_whatsapp_id").eq("empresa_id", pendencia.empresa_id).eq("id", pendencia.conversa_id).maybeSingle(),
      pendencia.contato_id
        ? supabaseAdmin.from("contatos").select("id, nome, telefone, email, empresa, origem, campanha, status_lead, classificacao").eq("empresa_id", pendencia.empresa_id).eq("id", pendencia.contato_id).maybeSingle()
        : Promise.resolve({ data: null }),
      carregarFerramentas(pendencia.empresa_id, pendencia.agente_id),
    ]);

    if (!agente) throw new Error("Agente inativo ou removido.");
    if (conversaEstaComHumano(conversa)) {
      await finalizarPendencia({ pendencia, lockToken, status: "cancelado" });
      return { ok: true, processado: false, motivo: "atendimento_humano" };
    }

    agendaIdConfiguradaFerramentas(ferramentasAtivas);

    const { data: execucao, error: execucaoError } = await supabaseAdmin.from("agente_ia_execucoes").insert({
      empresa_id: pendencia.empresa_id,
      agente_id: agente.id,
      conversa_id: pendencia.conversa_id,
      contato_id: pendencia.contato_id || null,
      mensagem_ids: pendencia.mensagem_ids,
      status: "processando",
      entrada_resumida: pendencia.conteudo_agregado.slice(0, 4000),
      modelo: agente.modelo || MODELO_PADRAO,
      started_at: new Date().toISOString(),
    }).select("id").single();
    if (execucaoError || !execucao) throw new Error(execucaoError?.message || "Não foi possível abrir execução do agente.");
    execucaoId = execucao.id;

    ctx = {
      agente: agente as AgenteRow,
      pendencia,
      execucaoId,
      contato,
      conversa,
      ferramentasAtivas,
      ferramentasExecutadas: [],
      acaoCriticaExecutada: false,
      transferidoHumano: false,
      respostaEnviada: false,
      respostaDeterministica: null,
      agendaAutorizada: null,
      estadoConversa: ESTADO_VAZIO,
      agendamentosAtivos: [],
    };

    const saldo = await buscarSaldoTokensIa(pendencia.empresa_id);
    if (saldo.limite !== null && Number(saldo.restantes || 0) <= 0) {
      await executarFallbackFluxos(pendencia);
      await supabaseAdmin.from("agente_ia_execucoes").update({
        status: "fallback",
        erro: "saldo_tokens_ia_esgotado",
        finished_at: new Date().toISOString(),
        latencia_ms: Date.now() - inicio,
        updated_at: new Date().toISOString(),
      }).eq("id", execucaoId);
      await finalizarPendencia({ pendencia, lockToken, status: "processado" });
      return { ok: true, processado: true, fallback: true, motivo: "saldo_tokens_ia_esgotado" };
    }

    if (!process.env.OPENAI_API_KEY?.trim()) throw new Error("OPENAI_API_KEY não configurada.");
    const contexto = await carregarContexto(ctx);
    ctx.agendaAutorizada = contexto.agendas[0] || null;
    ctx.estadoConversa = contexto.estado;
    ctx.agendamentosAtivos = contexto.agendamentosAtivos;

    const preconsultas = await preExecutarConsultasObvias(ctx);
    const preexecutadas = new Set<TipoFerramenta>(preconsultas.map((item) => item.nome));
    const ferramentasParaModelo = selecionarFerramentasParaModelo({
      ativas: ferramentasAtivas,
      mensagem: pendencia.conteudo_agregado,
      estado: contexto.estado,
      agendamentosAtivos: contexto.agendamentosAtivos,
      preexecutadas,
    });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const modelo = String(agente.modelo || MODELO_PADRAO).trim() || MODELO_PADRAO;
    const tools = definicoesFerramentas(ferramentasParaModelo);
    const inputIa: any[] = contexto.historico.length
      ? [...contexto.historico]
      : [{ role: "user", content: pendencia.conteudo_agregado }];
    const contextoPreconsultado = contextoPreconsultasParaModelo(preconsultas);
    if (contextoPreconsultado) {
      inputIa.push({ role: "developer", content: contextoPreconsultado });
    }
    const instructions = promptDoAgente(
      agente as AgenteRow,
      contexto.estado,
      contexto.agendas,
      contexto.agendamentosAtivos
    );
    let tokensInput = 0;
    let tokensOutput = 0;
    let tokensTotal = 0;
    let tokensCached = 0;
    let tokensCacheWrite = 0;
    let saidaFinal: SaidaAgente = { mensagens: [], estado: contexto.estado };

    for (let rodada = 0; rodada < MAX_RODADAS_FERRAMENTAS; rodada++) {
      const cacheOptions = modelo.startsWith("gpt-5.6")
        ? {
            prompt_cache_key: `agente-ia:${agente.id}:${modelo}`,
            prompt_cache_options: { mode: "implicit", ttl: "30m" },
          }
        : {};
      const response: any = await openai.responses.create({
        model: modelo,
        instructions,
        input: inputIa,
        tools,
        parallel_tool_calls: false,
        reasoning: { effort: "none" },
        text: { verbosity: "low", format: FORMATO_SAIDA },
        ...cacheOptions,
      } as any);
      tokensInput += Number(response.usage?.input_tokens || 0);
      tokensOutput += Number(response.usage?.output_tokens || 0);
      tokensTotal += Number(response.usage?.total_tokens || 0);
      tokensCached += Number(response.usage?.input_tokens_details?.cached_tokens || 0);
      tokensCacheWrite += Number(response.usage?.input_tokens_details?.cache_write_tokens || 0);

      const chamadas = (response.output || []).filter((item: any) => item.type === "function_call");
      inputIa.push(...(response.output || []));
      if (!chamadas.length) {
        const texto = String(response.output_text || "").trim();
        try {
          saidaFinal = normalizarSaida(JSON.parse(texto), contexto.estado);
        } catch {
          saidaFinal = normalizarSaida(null, contexto.estado, texto);
        }
        break;
      }

      for (const chamada of chamadas) {
        const nome = String(chamada.name || "");
        if (!isTipoFerramenta(nome) || !ferramentasAtivas.has(nome)) {
          inputIa.push({
            type: "function_call_output",
            call_id: chamada.call_id,
            output: JSON.stringify({ ok: false, error: "Ferramenta não habilitada." }),
          });
          continue;
        }
        let args: any = {};
        try { args = JSON.parse(chamada.arguments || "{}"); } catch { args = {}; }
        let resultado: any;
        try {
          resultado = await executarFerramenta(nome, args, ctx);
        } catch (error) {
          resultado = { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
        ctx.ferramentasExecutadas.push({ nome, argumentos: args, resultado });
        inputIa.push({
          type: "function_call_output",
          call_id: chamada.call_id,
          output: JSON.stringify(resultado),
        });
      }

      if (ctx.transferidoHumano || ctx.respostaDeterministica?.length) break;
    }

    if (ctx.respostaDeterministica?.length) {
      saidaFinal = {
        mensagens: ctx.respostaDeterministica,
        estado: estadoAposFerramentas(contexto.estado, ctx.ferramentasExecutadas),
      };
    }

    const agendaIdFinal = agendaIdConfiguradaFerramentas(ctx.ferramentasAtivas);
    if (agendaIdFinal && ctx.agendaAutorizada) {
      const houveMutacaoAgenda = ctx.ferramentasExecutadas.some((item) =>
        ["criar_agendamento", "remarcar_agendamento", "cancelar_agendamento"].includes(String(item.nome || "")) &&
        item.resultado?.ok === true
      );
      const agendamentosAtivosFinais = houveMutacaoAgenda
        ? await buscarAgendamentosAtivos({
            empresaId: pendencia.empresa_id,
            agendaId: agendaIdFinal,
            conversaId: pendencia.conversa_id,
            contatoId: pendencia.contato_id || null,
          })
        : ctx.agendamentosAtivos;
      ctx.agendamentosAtivos = agendamentosAtivosFinais;
      saidaFinal.estado = sincronizarEstadoComAgendamentosAtivos(
        saidaFinal.estado,
        agendamentosAtivosFinais,
        ctx.agendaAutorizada.timezone || "America/Sao_Paulo"
      );
    }

    if (tokensTotal > 0) {
      await registrarUsoTokensIa({
        empresaId: pendencia.empresa_id,
        origem: "agente_ia_chat",
        modelo,
        tokensTotal,
        tokensInput,
        tokensOutput,
        metadata: {
          agente_id: agente.id,
          agente_execucao_id: execucaoId,
          conversa_id: pendencia.conversa_id,
          cached_tokens: tokensCached,
          cache_write_tokens: tokensCacheWrite,
          preconsultas_backend: Array.from(preexecutadas),
          ferramentas_modelo: Array.from(ferramentasParaModelo.keys()),
        },
      });
    }

    if (await temNovaVersao(pendencia)) {
      await supabaseAdmin.from("agente_ia_execucoes").update({
        status: ctx.acaoCriticaExecutada ? "concluido" : "cancelado",
        resposta: saidaFinal.mensagens.join("\n\n") || null,
        ferramentas_json: ctx.ferramentasExecutadas,
        tokens_input: tokensInput,
        tokens_output: tokensOutput,
        tokens_total: tokensTotal,
        latencia_ms: Date.now() - inicio,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata_json: {
          supersedido_por_novas_mensagens: true,
          acao_critica_executada: ctx.acaoCriticaExecutada,
          cached_tokens: tokensCached,
          cache_write_tokens: tokensCacheWrite,
          preconsultas_backend: Array.from(preexecutadas),
          ferramentas_modelo: Array.from(ferramentasParaModelo.keys()),
        },
      }).eq("id", execucaoId);
      await finalizarPendencia({ pendencia, lockToken, status: "processado" });
      return { ok: true, processado: true, supersedido: true };
    }

    if (!ctx.transferidoHumano) {
      if (!saidaFinal.mensagens.length) {
        saidaFinal.mensagens = [
          ctx.acaoCriticaExecutada
            ? "Pronto, essa etapa foi concluída."
            : "Me conta um pouco mais para eu te ajudar por aqui.",
        ];
      }
      await enviarMensagensAgente(ctx, saidaFinal.mensagens);
    }

    const resumoNovo = resumoEstruturado(saidaFinal.estado);
    await supabaseAdmin.from("agente_ia_conversa_estados").upsert({
      empresa_id: pendencia.empresa_id,
      agente_id: agente.id,
      conversa_id: pendencia.conversa_id,
      resumo: resumoNovo,
      estado_json: {
        ...saidaFinal.estado,
        ultima_acao_critica: ctx.acaoCriticaExecutada,
        transferido_humano: ctx.transferidoHumano,
      },
      ultima_mensagem_id: pendencia.mensagem_ids.at(-1) || null,
      ultima_interacao_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "agente_id,conversa_id" });

    const finalAgora = new Date().toISOString();
    await supabaseAdmin.from("agente_ia_execucoes").update({
      status: "concluido",
      resposta: saidaFinal.mensagens.join("\n\n") || null,
      ferramentas_json: ctx.ferramentasExecutadas,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      tokens_total: tokensTotal,
      latencia_ms: Date.now() - inicio,
      finished_at: finalAgora,
      updated_at: finalAgora,
      metadata_json: {
        quantidade_mensagens_saida: saidaFinal.mensagens.length,
        estado_estruturado: saidaFinal.estado,
        cached_tokens: tokensCached,
        cache_write_tokens: tokensCacheWrite,
        resposta_deterministica_pos_ferramenta: Boolean(ctx.respostaDeterministica?.length),
        agendamentos_ativos_confirmados: ctx.agendamentosAtivos.length,
        preconsultas_backend: Array.from(preexecutadas),
        ferramentas_modelo: Array.from(ferramentasParaModelo.keys()),
      },
    }).eq("id", execucaoId);
    await finalizarPendencia({ pendencia, lockToken, status: "processado" });

    return {
      ok: true,
      processado: true,
      agenteId: agente.id,
      execucaoId,
      transferidoHumano: ctx.transferidoHumano,
      mensagens: saidaFinal.mensagens.length,
    };
  } catch (error) {
    const mensagemErro = error instanceof Error ? error.message : String(error);
    console.error("[AGENTE_IA] Erro ao processar pendência:", { pendenciaId, erro: mensagemErro });
    const podeFallback = !ctx?.acaoCriticaExecutada && !ctx?.respostaEnviada;
    if (podeFallback) {
      try {
        await executarFallbackFluxos(pendencia);
      } catch (fallbackError) {
        console.error("[AGENTE_IA] Fallback para fluxos falhou:", fallbackError);
      }
    } else if (
      ctx?.acaoCriticaExecutada &&
      !ctx.transferidoHumano &&
      !ctx.respostaEnviada &&
      pendencia.numero_destino &&
      execucaoId
    ) {
      try {
        await enviarMensagemAgente({
          empresaId: pendencia.empresa_id,
          conversaId: pendencia.conversa_id,
          agenteId: pendencia.agente_id,
          execucaoId,
          numeroDestino: pendencia.numero_destino,
          texto: "A operação foi processada, mas tive uma instabilidade para concluir a resposta. Se precisar, me chama aqui.",
        });
      } catch {}
    }

    const agora = new Date().toISOString();
    if (execucaoId) {
      await supabaseAdmin.from("agente_ia_execucoes").update({
        status: podeFallback ? "fallback" : "erro",
        erro: mensagemErro,
        ferramentas_json: ctx?.ferramentasExecutadas || [],
        latencia_ms: Date.now() - inicio,
        finished_at: agora,
        updated_at: agora,
      }).eq("id", execucaoId);
    }
    await finalizarPendencia({
      pendencia,
      lockToken,
      status: podeFallback ? "processado" : "erro",
      erro: mensagemErro,
    });
    return { ok: podeFallback, processado: true, fallback: podeFallback, error: mensagemErro };
  }
}
