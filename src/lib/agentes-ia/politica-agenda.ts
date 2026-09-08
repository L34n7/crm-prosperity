/* eslint-disable @typescript-eslint/no-explicit-any */

import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buscarSaldoTokensIa } from "@/lib/ia/tokens";
import {
  dataLocalDeIso,
  filtrarSlotsPorPreferencia,
  formatarSlotAgenda,
  interpretarDataHorarioAgenda,
  listarSlotsDisponiveis,
} from "@/lib/agendas/agenda-service";
import { sincronizarAgendamentoGoogleCalendar } from "@/lib/agendas/google-calendar";
import { getWhatsAppAccessToken } from "@/lib/whatsapp/access-token";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/send-text-message";
import { detectarAutomacaoExterna } from "./protecao-automacao-externa";
import {
  agendarFollowupAgenteIa,
  cancelarFollowupsPendentesAgenteIa,
} from "./followup-inatividade";

const db = getSupabaseAdmin();

type Pendencia = {
  id: string;
  empresa_id: string;
  agente_id: string;
  conversa_id: string;
  contato_id?: string | null;
  numero_destino?: string | null;
  mensagem_ids: string[];
  conteudo_agregado: string;
  status?: string | null;
  versao: number;
};

type ConfirmacaoAgendamento = {
  agenda_id: string;
  data: string;
  hora: string;
  remarcacao: boolean;
  agendamento_id?: string | null;
};

type Estado = {
  estagio?: string | null;
  proxima_acao?: string | null;
  confirmacao_agendamento?: ConfirmacaoAgendamento | null;
  [key: string]: unknown;
};

type Slot = {
  data: string;
  hora: string;
  label?: string | null;
};

type DecisaoConfirmacao = "confirmar" | "recusar" | "indefinida";

type Ctx = {
  pendencia: Pendencia;
  lockToken: string;
  agenda: any;
  agendaId: string;
  estado: Estado;
  ativos: any[];
  slot: Slot | null;
  remarcacao: boolean;
  execucaoId: string;
  confirmacaoPendente: ConfirmacaoAgendamento | null;
  decisaoConfirmacao: DecisaoConfirmacao;
  referenciaTemporal: boolean;
};

function norm(valor: unknown) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function pedidoRemarca(valor: string) {
  return /\b(remarcar|remarca|remarcacao|reagendar|reagenda|reagendamento|mudar (?:o )?horario|trocar (?:o )?(?:dia|horario))\b/.test(
    norm(valor)
  );
}

function decisaoConfirmacao(valor: string): DecisaoConfirmacao {
  const texto = norm(valor).replace(/[?!.,;:]+$/g, "").trim();

  if (
    /^(sim|confirmo|confirmar|pode confirmar|pode sim|pode|ok|certo|fechado|isso|isso mesmo|confirmado|confirmada|esta certo|ta certo)$/.test(
      texto
    )
  ) {
    return "confirmar";
  }

  if (
    /^(nao|nao confirmo|nao pode|cancela|cancelar|deixa|deixa pra la|outro|outro horario|outro dia)$/.test(
      texto
    ) ||
    /\b(quero|prefiro|pode ser)\b.{0,20}\b(outro|outra)\b/.test(texto) ||
    /\b(mudar|trocar|alterar)\b.{0,25}\b(dia|horario|hora)\b/.test(texto)
  ) {
    return "recusar";
  }

  return "indefinida";
}

function estadoRemarca(estado: Estado) {
  const estagio = norm(estado.estagio);
  const proximaAcao = norm(estado.proxima_acao);

  if (/\b(remarcado|remarcada|reagendado|reagendada)\b/.test(estagio) && !/^aguardar\b/.test(proximaAcao)) {
    return false;
  }

  return (
    /\b(remarcacao|reagendamento) (?:em andamento|sem agendamento ativo)\b/.test(estagio) ||
    /\baguardando confirmacao de (?:remarcacao|reagendamento)\b/.test(estagio) ||
    (/^aguardar\b/.test(proximaAcao) && /\b(remarc|reagend)\w*/.test(proximaAcao))
  );
}

function agendaEmCurso(estado: Estado) {
  if (estado.confirmacao_agendamento) return true;

  const estagio = norm(estado.estagio);
  const proximaAcao = norm(estado.proxima_acao);

  if (
    /\b(agendamento confirmado|agendamento remarcado|agendamento cancelado|remarcacao concluida|reagendamento concluido)\b/.test(
      estagio
    ) &&
    !/^aguardar\b/.test(proximaAcao)
  ) {
    return false;
  }

  return (
    /\b(agendamento|remarcacao|reagendamento) em andamento\b/.test(estagio) ||
    /\b(remarcacao|reagendamento) sem agendamento ativo\b/.test(estagio) ||
    /\baguardando confirmacao de (?:agendamento|remarcacao|reagendamento)\b/.test(estagio) ||
    (/^aguardar\b/.test(proximaAcao) &&
      /\b(escolha|preferencia|dia|periodo|horario|hora|confirmacao)\b/.test(proximaAcao))
  );
}

function hora(valor: unknown) {
  const match = String(valor || "")
    .trim()
    .match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return null;

  const horas = Number(match[1]);
  const minutos = Number(match[2] || 0);
  if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) return null;

  return `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}`;
}

function horaMensagem(valor: string) {
  const texto = norm(valor);
  let match = texto.match(/(?:^|\s)(\d{1,2}):(\d{2})(?=$|\s|[?!.,;])/);
  if (match) return hora(`${match[1]}:${match[2]}`);

  match = texto.match(/(?:^|\s)(\d{1,2})\s*h\s*(\d{2})?(?=$|\s|[?!.,;])/);
  if (match) return hora(`${match[1]}:${match[2] || "00"}`);

  match = texto.match(/(?:^|\s)(\d{1,2})\s*(?:hr|hrs|hora|horas)(?=$|\s|[?!.,;])/);
  if (match) return hora(match[1]);

  return /^\d{1,2}$/.test(texto) ? hora(texto) : null;
}

function ordinal(valor: string) {
  const texto = norm(valor).replace(/[?!.,;]+$/g, "");
  if (/^(?:o )?primeiro$/.test(texto)) return 0;
  if (/^(?:o )?segundo$/.test(texto)) return 1;
  if (/^(?:o )?terceiro$/.test(texto)) return 2;
  return null;
}

function tituloAgenda(valor: unknown) {
  return String(valor || "").replace(/^agenda\s+/i, "").trim() || "Agendamento";
}

function label(slot: any, timezone: string) {
  if (slot?.label) {
    return String(slot.label).replace(/\s*\(([^)]+)\)\s*$/, " até $1").trim();
  }

  if (slot?.inicio_at) {
    return String(formatarSlotAgenda(slot.inicio_at, slot.fim_at, timezone).label || "")
      .replace(/\s*\(([^)]+)\)\s*$/, " até $1")
      .trim();
  }

  return `${slot?.data || ""} às ${slot?.hora || ""}`.trim();
}

function resumoDiaHora(slot: Slot) {
  const [ano, mes, dia] = slot.data.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
  const diaSemana = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    timeZone: "UTC",
  }).format(data);

  return `${diaSemana}, ${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}, às ${slot.hora}`;
}

function confirmacaoDoEstado(estado: Estado, agendaId: string) {
  const confirmacao = estado.confirmacao_agendamento;
  if (!confirmacao || typeof confirmacao !== "object") return null;
  if (String(confirmacao.agenda_id || "") !== agendaId) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(confirmacao.data || ""))) return null;

  const horario = hora(confirmacao.hora);
  if (!horario) return null;

  return {
    agenda_id: agendaId,
    data: String(confirmacao.data),
    hora: horario,
    remarcacao: confirmacao.remarcacao === true,
    agendamento_id: String(confirmacao.agendamento_id || "").trim() || null,
  } satisfies ConfirmacaoAgendamento;
}

function limparConfirmacao(estado: Estado): Estado {
  return {
    ...estado,
    confirmacao_agendamento: null,
  };
}

function mesmoSlot(a: Slot, b: Slot) {
  return a.data === b.data && a.hora === b.hora;
}

async function configAgenda(empresaId: string, agenteId: string) {
  const { data, error } = await db
    .from("agente_ia_ferramentas")
    .select("tipo, config_json")
    .eq("empresa_id", empresaId)
    .eq("agente_id", agenteId)
    .eq("ativo", true)
    .in("tipo", ["consultar_agenda", "criar_agendamento", "remarcar_agendamento"]);
  if (error) throw new Error(error.message);

  const mapa = new Map((data || []).map((item: any) => [String(item.tipo), item.config_json || {}]));
  if (!mapa.has("consultar_agenda") || !mapa.has("criar_agendamento")) return null;

  const ids = Array.from(
    new Set(
      Array.from(mapa.values())
        .map((config: any) => String(config?.agenda_id || "").trim())
        .filter(Boolean)
    )
  );
  if (ids.length !== 1) return null;

  const agendaId = ids[0];
  const { data: agenda, error: agendaError } = await db
    .from("calendarios")
    .select("id, nome, timezone, duracao_minutos, status")
    .eq("empresa_id", empresaId)
    .eq("id", agendaId)
    .eq("status", "ativo")
    .maybeSingle();
  if (agendaError) throw new Error(agendaError.message);
  if (!agenda) return null;

  return {
    agendaId,
    agenda,
    podeRemarcar: mapa.has("remarcar_agendamento"),
  };
}

async function estadoAtual(pendencia: Pendencia) {
  const { data } = await db
    .from("agente_ia_conversa_estados")
    .select("estado_json")
    .eq("empresa_id", pendencia.empresa_id)
    .eq("agente_id", pendencia.agente_id)
    .eq("conversa_id", pendencia.conversa_id)
    .maybeSingle();

  return (data?.estado_json || {}) as Estado;
}

async function ativos(pendencia: Pendencia, agendaId: string) {
  let query = db
    .from("agenda_agendamentos")
    .select("id, agenda_id, contato_id, conversa_id, titulo, inicio_at, fim_at, status, metadata_json")
    .eq("empresa_id", pendencia.empresa_id)
    .eq("agenda_id", agendaId)
    .in("status", ["agendado", "confirmado"])
    .gte("fim_at", new Date().toISOString())
    .order("inicio_at", { ascending: true });

  query = pendencia.contato_id
    ? query.or(`conversa_id.eq.${pendencia.conversa_id},contato_id.eq.${pendencia.contato_id}`)
    : query.eq("conversa_id", pendencia.conversa_id);

  const { data, error } = await query.limit(5);
  if (error) throw new Error(error.message);
  return data || [];
}

async function slotsRecentes(pendencia: Pendencia) {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("agente_ia_execucoes")
    .select("ferramentas_json, finished_at")
    .eq("empresa_id", pendencia.empresa_id)
    .eq("agente_id", pendencia.agente_id)
    .eq("conversa_id", pendencia.conversa_id)
    .in("status", ["concluido", "fallback"])
    .gte("finished_at", desde)
    .order("finished_at", { ascending: false })
    .limit(6);
  if (error) throw new Error(error.message);

  for (const execucao of data || []) {
    const ferramentas = Array.isArray(execucao.ferramentas_json) ? execucao.ferramentas_json : [];
    for (const ferramenta of [...ferramentas].reverse()) {
      if (ferramenta?.nome !== "consultar_agenda" || ferramenta?.resultado?.ok !== true) continue;

      const slots = Array.isArray(ferramenta.resultado?.slots) ? ferramenta.resultado.slots : [];
      if (!slots.length) continue;

      return slots
        .map((item: any) => ({
          data: String(item.data || ""),
          hora: hora(item.hora),
          label: item.label || null,
        }))
        .filter((item: any) => /^\d{4}-\d{2}-\d{2}$/.test(item.data) && item.hora) as Slot[];
    }
  }

  return [];
}

async function slotEscolhido(
  pendencia: Pendencia,
  agenda: any,
  agendaId: string,
  recentes: Slot[]
) {
  const timezone = agenda.timezone || "America/Sao_Paulo";
  const interpretacao = interpretarDataHorarioAgenda(pendencia.conteudo_agregado, timezone);
  const indice = ordinal(pendencia.conteudo_agregado);

  if (indice !== null && recentes[indice]) return recentes[indice];

  const horario = horaMensagem(pendencia.conteudo_agregado);
  if (!horario) return null;

  let candidatos = recentes.filter((item) => item.hora === horario);
  if (interpretacao.data) candidatos = candidatos.filter((item) => item.data === interpretacao.data);
  if (candidatos.length === 1) return candidatos[0];
  if (!interpretacao.data) return null;

  const resultado = await listarSlotsDisponiveis({
    supabase: db,
    empresaId: pendencia.empresa_id,
    agendaId,
    data: interpretacao.data,
    janelaDias: 1,
    limite: 50,
  });

  const slot = (resultado.slots || []).find(
    (item: any) =>
      dataLocalDeIso(item.inicio_at, timezone) === interpretacao.data &&
      String(item.hora_label) === horario
  );

  return slot
    ? {
        data: interpretacao.data,
        hora: horario,
        label: slot.label,
      }
    : null;
}

async function opcoes(pendencia: Pendencia, agenda: any, agendaId: string) {
  const timezone = agenda.timezone || "America/Sao_Paulo";
  const interpretacao = interpretarDataHorarioAgenda(pendencia.conteudo_agregado, timezone);
  if (!interpretacao.data) return { data: null, slots: [] as Slot[] };

  const resultado = await listarSlotsDisponiveis({
    supabase: db,
    empresaId: pendencia.empresa_id,
    agendaId,
    data: interpretacao.data,
    janelaDias: 1,
    limite: interpretacao.preferencia ? 50 : 12,
  });

  const slots = filtrarSlotsPorPreferencia(
    resultado.slots || [],
    interpretacao.preferencia,
    timezone
  )
    .slice(0, 3)
    .map((item: any) => ({
      data: dataLocalDeIso(item.inicio_at, timezone),
      hora: String(item.hora_label),
      label: item.label,
    }));

  return { data: interpretacao.data, slots };
}

function humano(conversa: any) {
  return (
    !conversa ||
    conversa.aguardando_atendente === true ||
    (conversa.bot_ativo !== true && String(conversa.status || "") === "em_atendimento") ||
    (conversa.bot_ativo !== true &&
      String(conversa.status || "") === "fila" &&
      Boolean(conversa.responsavel_id))
  );
}

async function garantirAutomacaoAtiva(ctx: Ctx) {
  const { data: conversa, error } = await db
    .from("conversas")
    .select("id, status, responsavel_id, bot_ativo, aguardando_atendente, integracao_whatsapp_id")
    .eq("empresa_id", ctx.pendencia.empresa_id)
    .eq("id", ctx.pendencia.conversa_id)
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (humano(conversa) || conversa?.bot_ativo !== true || conversa?.status !== "bot") {
    throw new Error("ATENDIMENTO_HUMANO_ASSUMIU");
  }

  return conversa;
}

async function abrir(pendencia: Pendencia) {
  const agora = new Date().toISOString();
  const { data, error } = await db
    .from("agente_ia_execucoes")
    .insert({
      empresa_id: pendencia.empresa_id,
      agente_id: pendencia.agente_id,
      conversa_id: pendencia.conversa_id,
      contato_id: pendencia.contato_id || null,
      mensagem_ids: pendencia.mensagem_ids,
      status: "processando",
      entrada_resumida: pendencia.conteudo_agregado.slice(0, 4000),
      modelo: "politica_agenda",
      started_at: agora,
      metadata_json: { politica_agenda: true },
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Não foi possível abrir execução da política de agenda.");
  }

  return data.id as string;
}

async function fimPend(
  ctx: Ctx,
  status: "processado" | "cancelado" | "erro",
  erro?: string | null
) {
  await db.rpc("agente_ia_finalizar_pendencia", {
    p_pendencia_id: ctx.pendencia.id,
    p_lock_token: ctx.lockToken,
    p_versao: ctx.pendencia.versao,
    p_status: status,
    p_erro: erro || null,
  });
}

async function salvarEstado(ctx: Ctx, estado: Estado) {
  const agora = new Date().toISOString();
  const resumo = [
    estado.estagio ? `Estágio: ${estado.estagio}` : "",
    estado.proxima_acao ? `Próxima ação: ${estado.proxima_acao}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  await db.from("agente_ia_conversa_estados").upsert(
    {
      empresa_id: ctx.pendencia.empresa_id,
      agente_id: ctx.pendencia.agente_id,
      conversa_id: ctx.pendencia.conversa_id,
      resumo,
      estado_json: estado,
      ultima_mensagem_id: ctx.pendencia.mensagem_ids.at(-1) || null,
      ultima_interacao_at: agora,
      updated_at: agora,
    },
    { onConflict: "agente_id,conversa_id" }
  );
}

async function enviar(ctx: Ctx, texto: string) {
  const conversa = await garantirAutomacaoAtiva(ctx);
  if (!conversa.integracao_whatsapp_id || !ctx.pendencia.numero_destino) {
    throw new Error("Conversa sem integração ou destino.");
  }

  const { data: integracao, error } = await db
    .from("integracoes_whatsapp")
    .select("id, phone_number_id, config_json, token_ref")
    .eq("empresa_id", ctx.pendencia.empresa_id)
    .eq("id", conversa.integracao_whatsapp_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!integracao?.phone_number_id) throw new Error("Integração WhatsApp inválida.");

  const accessToken = getWhatsAppAccessToken(integracao);
  if (!accessToken) throw new Error("Token do WhatsApp indisponível.");

  const envio = await sendWhatsAppTextMessage({
    phoneNumberId: integracao.phone_number_id,
    accessToken,
    to: ctx.pendencia.numero_destino,
    body: texto,
  });

  const agora = new Date().toISOString();
  const { data: protocolo } = await db
    .from("conversa_protocolos")
    .select("id")
    .eq("empresa_id", ctx.pendencia.empresa_id)
    .eq("conversa_id", ctx.pendencia.conversa_id)
    .eq("ativo", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await db.from("mensagens").insert({
    empresa_id: ctx.pendencia.empresa_id,
    conversa_id: ctx.pendencia.conversa_id,
    conversa_protocolo_id: protocolo?.id || null,
    remetente_tipo: "bot",
    conteudo: texto,
    tipo_mensagem: "texto",
    origem: "automatica",
    status_envio: envio.ok ? "enviada" : "falha",
    mensagem_externa_id: envio.messageId,
    metadata_json: {
      origem: "agente_ia",
      agente_id: ctx.pendencia.agente_id,
      agente_execucao_id: ctx.execucaoId,
      politica_agenda: true,
      meta_status: envio.status,
      meta_error: envio.error,
    },
    created_at: agora,
    updated_at: agora,
  });

  if (!envio.ok) throw new Error(envio.error || "Falha ao enviar resposta.");

  await db
    .from("conversas")
    .update({ last_message_at: agora, updated_at: agora })
    .eq("empresa_id", ctx.pendencia.empresa_id)
    .eq("id", ctx.pendencia.conversa_id);
}

async function revalidar(ctx: Ctx, slotEscolhido: Slot) {
  const timezone = ctx.agenda.timezone || "America/Sao_Paulo";
  const resultado = await listarSlotsDisponiveis({
    supabase: db,
    empresaId: ctx.pendencia.empresa_id,
    agendaId: ctx.agendaId,
    data: slotEscolhido.data,
    janelaDias: 1,
    limite: 50,
  });

  return (resultado.slots || []).find(
    (item: any) =>
      dataLocalDeIso(item.inicio_at, timezone) === slotEscolhido.data &&
      String(item.hora_label) === slotEscolhido.hora
  ) || null;
}

async function criar(ctx: Ctx, slotEscolhido: Slot) {
  await garantirAutomacaoAtiva(ctx);

  const slot = await revalidar(ctx, slotEscolhido);
  if (!slot) return { ok: false };

  await garantirAutomacaoAtiva(ctx);

  const agora = new Date().toISOString();
  const titulo = tituloAgenda(ctx.agenda.nome);
  const { data: contato } = ctx.pendencia.contato_id
    ? await db
        .from("contatos")
        .select("nome, telefone, email")
        .eq("empresa_id", ctx.pendencia.empresa_id)
        .eq("id", ctx.pendencia.contato_id)
        .maybeSingle()
    : ({ data: null } as any);

  const { data: existente } = await db
    .from("agenda_agendamentos")
    .select("id, titulo, status")
    .eq("empresa_id", ctx.pendencia.empresa_id)
    .eq("agenda_id", ctx.agendaId)
    .eq("conversa_id", ctx.pendencia.conversa_id)
    .eq("inicio_at", slot.inicio_at)
    .eq("fim_at", slot.fim_at)
    .in("status", ["agendado", "confirmado"])
    .maybeSingle();

  if (existente) {
    return {
      ok: true,
      idempotente: true,
      agendamento: existente,
      quando: label(slot, ctx.agenda.timezone || "America/Sao_Paulo"),
    };
  }

  const { data: agendamento, error } = await db
    .from("agenda_agendamentos")
    .insert({
      empresa_id: ctx.pendencia.empresa_id,
      agenda_id: ctx.agendaId,
      contato_id: ctx.pendencia.contato_id || null,
      conversa_id: ctx.pendencia.conversa_id,
      titulo,
      nome_cliente: contato?.nome || null,
      telefone_cliente: contato?.telefone || ctx.pendencia.numero_destino || null,
      email_cliente: contato?.email || null,
      inicio_at: slot.inicio_at,
      fim_at: slot.fim_at,
      status: "agendado",
      origem: "api",
      metadata_json: {
        origem: "agente_ia",
        agente_id: ctx.pendencia.agente_id,
        agente_execucao_id: ctx.execucaoId,
        remarcacao_sem_agendamento_ativo: ctx.remarcacao,
        confirmado_pelo_cliente: true,
      },
      created_at: agora,
      updated_at: agora,
    })
    .select("id, titulo, status")
    .single();

  if (error || !agendamento) throw new Error(error?.message || "Erro ao criar agendamento.");

  await sincronizarAgendamentoGoogleCalendar({
    empresaId: ctx.pendencia.empresa_id,
    agendaId: ctx.agendaId,
    agendamentoId: agendamento.id,
  }).catch((syncError) => console.error("[AGENTE_IA] Erro ao sincronizar agendamento:", syncError));

  return {
    ok: true,
    agendamento,
    quando: label(slot, ctx.agenda.timezone || "America/Sao_Paulo"),
  };
}

async function remarcar(ctx: Ctx, agendamentoAtual: any, slotEscolhido: Slot) {
  await garantirAutomacaoAtiva(ctx);

  const timezone = ctx.agenda.timezone || "America/Sao_Paulo";
  const atualFormatado = formatarSlotAgenda(
    agendamentoAtual.inicio_at,
    agendamentoAtual.fim_at,
    timezone
  );

  if (
    dataLocalDeIso(agendamentoAtual.inicio_at, timezone) === slotEscolhido.data &&
    String(atualFormatado.hora_label) === slotEscolhido.hora
  ) {
    return {
      ok: true,
      idempotente: true,
      quando: label(agendamentoAtual, timezone),
    };
  }

  const slot = await revalidar(ctx, slotEscolhido);
  if (!slot) return { ok: false };

  await garantirAutomacaoAtiva(ctx);

  const { data: atualizado, error } = await db
    .from("agenda_agendamentos")
    .update({
      inicio_at: slot.inicio_at,
      fim_at: slot.fim_at,
      metadata_json: {
        ...(agendamentoAtual.metadata_json || {}),
        origem_ultima_alteracao: "agente_ia",
        agente_id: ctx.pendencia.agente_id,
        agente_execucao_id: ctx.execucaoId,
        confirmado_pelo_cliente: true,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("empresa_id", ctx.pendencia.empresa_id)
    .eq("agenda_id", ctx.agendaId)
    .eq("id", agendamentoAtual.id)
    .in("status", ["agendado", "confirmado"])
    .select("id, titulo, status")
    .single();

  if (error || !atualizado) throw new Error(error?.message || "Erro ao remarcar agendamento.");

  await sincronizarAgendamentoGoogleCalendar({
    empresaId: ctx.pendencia.empresa_id,
    agendaId: ctx.agendaId,
    agendamentoId: atualizado.id,
  }).catch((syncError) => console.error("[AGENTE_IA] Erro ao sincronizar remarcação:", syncError));

  return {
    ok: true,
    agendamento: atualizado,
    quando: label(slot, timezone),
  };
}

async function concluir(
  ctx: Ctx,
  resposta: string,
  ferramenta: string,
  resultado: any,
  estado: Estado
) {
  const agora = new Date().toISOString();
  await db
    .from("agente_ia_execucoes")
    .update({
      status: "concluido",
      resposta,
      ferramentas_json: [{ nome: ferramenta, argumentos: {}, resultado }],
      tokens_input: 0,
      tokens_output: 0,
      tokens_total: 0,
      finished_at: agora,
      updated_at: agora,
      metadata_json: {
        politica_agenda: true,
        estado_estruturado: estado,
        resposta_deterministica_pos_ferramenta: true,
      },
    })
    .eq("id", ctx.execucaoId);
}

async function prepararConfirmacao(ctx: Ctx, slotEscolhido: Slot) {
  const slotValido = await revalidar(ctx, slotEscolhido);

  if (!slotValido) {
    const estado = {
      ...limparConfirmacao(ctx.estado),
      estagio: ctx.remarcacao ? "remarcação em andamento" : "agendamento em andamento",
      proxima_acao: "aguardar nova escolha de horário",
    };
    return {
      resposta: "Esse horário não está mais disponível. Me diga outro horário que fique bom para você.",
      ferramenta: "consultar_agenda",
      resultado: { ok: false, code: "HORARIO_INDISPONIVEL" },
      estado,
    };
  }

  const confirmacao: ConfirmacaoAgendamento = {
    agenda_id: ctx.agendaId,
    data: slotEscolhido.data,
    hora: slotEscolhido.hora,
    remarcacao: ctx.remarcacao,
    agendamento_id:
      ctx.remarcacao && ctx.ativos.length === 1 ? String(ctx.ativos[0].id) : null,
  };

  const estado: Estado = {
    ...ctx.estado,
    confirmacao_agendamento: confirmacao,
    estagio: ctx.remarcacao
      ? "aguardando confirmação de remarcação"
      : "aguardando confirmação de agendamento",
    proxima_acao: "aguardar confirmação do cliente",
  };

  const diaHora = resumoDiaHora(slotEscolhido);
  const resposta = ctx.remarcacao
    ? `Só confirmando a remarcação: ${diaHora}. Posso confirmar?`
    : `Só confirmando o agendamento: ${diaHora}. Posso confirmar?`;

  return {
    resposta,
    ferramenta: "revisar_agendamento",
    resultado: {
      ok: true,
      aguardando_confirmacao: true,
      data: slotEscolhido.data,
      hora: slotEscolhido.hora,
      remarcacao: ctx.remarcacao,
    },
    estado,
  };
}

async function respostaParaNovaPreferencia(ctx: Ctx) {
  const resultadoOpcoes = await opcoes(ctx.pendencia, ctx.agenda, ctx.agendaId);
  const base = limparConfirmacao(ctx.estado);

  if (resultadoOpcoes.slots.length) {
    const horarios = resultadoOpcoes.slots.map((item) => item.hora.replace(/^0/, "")).join(", ");
    return {
      resposta: ctx.remarcacao
        ? `Sem problema. Para esse dia tenho ${horarios}. Qual horário fica melhor para você?`
        : `Sem problema. Para esse dia tenho ${horarios}. Qual horário fica melhor para você?`,
      ferramenta: "consultar_agenda",
      resultado: { ok: true, slots: resultadoOpcoes.slots, data: resultadoOpcoes.data },
      estado: {
        ...base,
        estagio: ctx.remarcacao
          ? ctx.ativos.length
            ? "remarcação em andamento"
            : "remarcação sem agendamento ativo"
          : "agendamento em andamento",
        proxima_acao: "aguardar escolha de horário",
      } as Estado,
    };
  }

  if (resultadoOpcoes.data) {
    return {
      resposta: "Não encontrei horário disponível nesse dia. Qual outro dia ou período fica melhor para você?",
      ferramenta: "consultar_agenda",
      resultado: { ok: true, slots: [], data: resultadoOpcoes.data },
      estado: {
        ...base,
        estagio: ctx.remarcacao
          ? ctx.ativos.length
            ? "remarcação em andamento"
            : "remarcação sem agendamento ativo"
          : "agendamento em andamento",
        proxima_acao: "aguardar outra preferência de dia ou período",
      } as Estado,
    };
  }

  return {
    resposta: "Sem problema. Qual outro dia ou horário fica melhor para você?",
    ferramenta: "revisar_agendamento",
    resultado: { ok: true, confirmacao_recusada: true },
    estado: {
      ...base,
      estagio: ctx.remarcacao
        ? ctx.ativos.length
          ? "remarcação em andamento"
          : "remarcação sem agendamento ativo"
        : "agendamento em andamento",
      proxima_acao: "aguardar nova preferência de dia ou horário",
    } as Estado,
  };
}

async function executarConfirmacao(ctx: Ctx, confirmacao: ConfirmacaoAgendamento) {
  const slot: Slot = {
    data: confirmacao.data,
    hora: confirmacao.hora,
  };

  if (confirmacao.remarcacao) {
    const alvo = confirmacao.agendamento_id
      ? ctx.ativos.find((item) => String(item.id) === confirmacao.agendamento_id)
      : ctx.ativos.length === 1
        ? ctx.ativos[0]
        : null;

    if (ctx.ativos.length > 1 && !alvo) {
      return {
        resposta: "Encontrei mais de um agendamento ativo. Qual deles você quer remarcar? Me diga a data ou o horário atual.",
        ferramenta: "remarcar_agendamento",
        resultado: { ok: false, code: "MULTIPLOS_AGENDAMENTOS_ATIVOS" },
        estado: {
          ...limparConfirmacao(ctx.estado),
          estagio: "remarcação em andamento",
          proxima_acao: "identificar qual agendamento ativo deve ser remarcado",
        } as Estado,
      };
    }

    if (alvo) {
      const resultado = await remarcar(ctx, alvo, slot);
      return {
        resposta: resultado.ok
          ? `Pronto — ficou remarcado para ${resultado.quando}.`
          : "Esse horário não está mais disponível. Me diga outro horário que fique bom para você.",
        ferramenta: "remarcar_agendamento",
        resultado,
        estado: {
          ...limparConfirmacao(ctx.estado),
          estagio: resultado.ok ? "agendamento remarcado" : "remarcação em andamento",
          proxima_acao: resultado.ok ? "acompanhar agendamento" : "aguardar nova escolha de horário",
        } as Estado,
      };
    }
  }

  const resultado = await criar(ctx, slot);
  return {
    resposta: resultado.ok
      ? `Fechado — ficou agendado para ${resultado.quando}.`
      : "Esse horário não está mais disponível. Me diga outro horário que fique bom para você.",
    ferramenta: "criar_agendamento",
    resultado,
    estado: {
      ...limparConfirmacao(ctx.estado),
      estagio: resultado.ok
        ? "agendamento confirmado"
        : confirmacao.remarcacao
          ? "remarcação sem agendamento ativo"
          : "agendamento em andamento",
      proxima_acao: resultado.ok ? "acompanhar agendamento" : "aguardar nova escolha de horário",
    } as Estado,
  };
}

async function executar(ctx: Ctx) {
  try {
    await garantirAutomacaoAtiva(ctx);

    let resposta = "";
    let ferramenta = "politica_agenda";
    let resultado: any = { ok: true };
    let estado: Estado = { ...ctx.estado };

    if (ctx.confirmacaoPendente) {
      const pendenteSlot: Slot = {
        data: ctx.confirmacaoPendente.data,
        hora: ctx.confirmacaoPendente.hora,
      };

      if (ctx.decisaoConfirmacao === "confirmar") {
        const conclusao = await executarConfirmacao(ctx, ctx.confirmacaoPendente);
        resposta = conclusao.resposta;
        ferramenta = conclusao.ferramenta;
        resultado = conclusao.resultado;
        estado = conclusao.estado;
      } else if (ctx.slot && !mesmoSlot(ctx.slot, pendenteSlot)) {
        const novaConfirmacao = await prepararConfirmacao(ctx, ctx.slot);
        resposta = novaConfirmacao.resposta;
        ferramenta = novaConfirmacao.ferramenta;
        resultado = novaConfirmacao.resultado;
        estado = novaConfirmacao.estado;
      } else if (ctx.decisaoConfirmacao === "recusar" || ctx.referenciaTemporal) {
        const novaPreferencia = await respostaParaNovaPreferencia(ctx);
        resposta = novaPreferencia.resposta;
        ferramenta = novaPreferencia.ferramenta;
        resultado = novaPreferencia.resultado;
        estado = novaPreferencia.estado;
      } else {
        const diaHora = resumoDiaHora(pendenteSlot);
        resposta = ctx.confirmacaoPendente.remarcacao
          ? `Antes de remarcar, preciso da sua confirmação: ${diaHora}. Posso confirmar?`
          : `Antes de criar o agendamento, preciso da sua confirmação: ${diaHora}. Posso confirmar?`;
        ferramenta = "revisar_agendamento";
        resultado = {
          ok: true,
          aguardando_confirmacao: true,
          data: pendenteSlot.data,
          hora: pendenteSlot.hora,
        };
        estado = ctx.estado;
      }
    } else if (ctx.slot) {
      if (ctx.remarcacao && ctx.ativos.length > 1) {
        resposta = "Encontrei mais de um agendamento ativo. Qual deles você quer remarcar? Me diga a data ou o horário atual.";
        estado = {
          ...limparConfirmacao(ctx.estado),
          estagio: "remarcação em andamento",
          proxima_acao: "identificar qual agendamento ativo deve ser remarcado",
        };
      } else {
        const revisao = await prepararConfirmacao(ctx, ctx.slot);
        resposta = revisao.resposta;
        ferramenta = revisao.ferramenta;
        resultado = revisao.resultado;
        estado = revisao.estado;
      }
    } else {
      const resultadoOpcoes = await opcoes(ctx.pendencia, ctx.agenda, ctx.agendaId);

      if (resultadoOpcoes.slots.length) {
        const horarios = resultadoOpcoes.slots
          .map((item) => item.hora.replace(/^0/, ""))
          .join(", ");
        resposta = ctx.remarcacao
          ? `Claro! Para esse dia tenho ${horarios}. Qual horário fica melhor para você?`
          : `Tenho ${horarios} disponíveis. Qual horário fica melhor para você?`;
        ferramenta = "consultar_agenda";
        resultado = {
          ok: true,
          slots: resultadoOpcoes.slots,
          data: resultadoOpcoes.data,
        };
        estado = {
          ...limparConfirmacao(ctx.estado),
          estagio: ctx.remarcacao
            ? ctx.ativos.length
              ? "remarcação em andamento"
              : "remarcação sem agendamento ativo"
            : "agendamento em andamento",
          proxima_acao: "aguardar escolha de horário",
        };
      } else if (resultadoOpcoes.data) {
        resposta = "Não encontrei horário disponível nesse dia. Qual outro dia ou período fica melhor para você?";
        ferramenta = "consultar_agenda";
        resultado = { ok: true, slots: [], data: resultadoOpcoes.data };
        estado = {
          ...limparConfirmacao(ctx.estado),
          estagio: ctx.remarcacao
            ? ctx.ativos.length
              ? "remarcação em andamento"
              : "remarcação sem agendamento ativo"
            : "agendamento em andamento",
          proxima_acao: "aguardar outra preferência de dia ou período",
        };
      } else {
        resposta = ctx.remarcacao
          ? "Claro! Qual dia ou período fica melhor para o novo horário?"
          : "Qual dia ou período fica melhor para o agendamento?";
        resultado = { ok: true, aguardando_preferencia: true };
        estado = {
          ...limparConfirmacao(ctx.estado),
          estagio: ctx.remarcacao
            ? ctx.ativos.length
              ? "remarcação em andamento"
              : "remarcação sem agendamento ativo"
            : "agendamento em andamento",
          proxima_acao: "aguardar preferência de dia ou período",
        };
      }
    }

    await salvarEstado(ctx, estado);
    await enviar(ctx, resposta);
    await concluir(ctx, resposta, ferramenta, resultado, estado);

    const ultimaMensagemContatoId = ctx.pendencia.mensagem_ids.at(-1) || "";
    if (
      resposta.includes("?") &&
      estado.proxima_acao &&
      ultimaMensagemContatoId &&
      ctx.pendencia.numero_destino
    ) {
      await agendarFollowupAgenteIa({
        empresaId: ctx.pendencia.empresa_id,
        agenteId: ctx.pendencia.agente_id,
        conversaId: ctx.pendencia.conversa_id,
        numeroDestino: ctx.pendencia.numero_destino,
        ultimaMensagemContatoId,
        proximaAcao: String(estado.proxima_acao),
        tentativa: 1,
        referenciaExecucaoId: ctx.execucaoId,
        cancelarAnteriores: true,
      }).catch((error) => console.error("[AGENTE_IA] Erro ao agendar follow-up:", error));
    } else {
      await cancelarFollowupsPendentesAgenteIa({
        empresaId: ctx.pendencia.empresa_id,
        conversaId: ctx.pendencia.conversa_id,
        motivo: "politica_agenda_sem_espera",
      }).catch((error) => console.error("[AGENTE_IA] Erro ao cancelar follow-up:", error));
    }

    await fimPend(ctx, "processado");
    return {
      ok: true,
      processado: true,
      runtime: "politica_agenda",
      execucaoId: ctx.execucaoId,
      ferramenta,
    };
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : String(error);
    const humanoAssumiu = mensagem === "ATENDIMENTO_HUMANO_ASSUMIU";

    await db
      .from("agente_ia_execucoes")
      .update({
        status: humanoAssumiu ? "cancelado" : "erro",
        erro: humanoAssumiu ? "atendimento_humano" : mensagem,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", ctx.execucaoId);

    await fimPend(
      ctx,
      humanoAssumiu ? "cancelado" : "erro",
      humanoAssumiu ? "atendimento_humano" : mensagem
    );

    if (humanoAssumiu) {
      return { ok: true, processado: false, motivo: "atendimento_humano" };
    }

    throw error;
  }
}

export async function processarPoliticaAgendaPendencia(
  pendenciaId: string,
  options: { forcar?: boolean } = {}
): Promise<{ tratado: boolean; resultado?: any }> {
  const { data: pendenciaRaw, error } = await db
    .from("agente_ia_pendencias")
    .select(
      "id, empresa_id, agente_id, conversa_id, contato_id, numero_destino, mensagem_ids, conteudo_agregado, status, versao"
    )
    .eq("id", pendenciaId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (
    !pendenciaRaw ||
    ["processado", "erro", "cancelado"].includes(String(pendenciaRaw.status || ""))
  ) {
    return { tratado: false };
  }

  const pendencia = pendenciaRaw as Pendencia;
  const configuracao = await configAgenda(pendencia.empresa_id, pendencia.agente_id);
  if (!configuracao) return { tratado: false };

  const estado = await estadoAtual(pendencia);
  const confirmacaoPendente = confirmacaoDoEstado(estado, configuracao.agendaId);
  const remarcacaoExplicita = pedidoRemarca(pendencia.conteudo_agregado);
  const remarcacao =
    remarcacaoExplicita || confirmacaoPendente?.remarcacao === true || estadoRemarca(estado);
  const emCurso = agendaEmCurso(estado);
  const recentes = await slotsRecentes(pendencia);
  const slot = await slotEscolhido(
    pendencia,
    configuracao.agenda,
    configuracao.agendaId,
    recentes
  );
  const interpretacao = interpretarDataHorarioAgenda(
    pendencia.conteudo_agregado,
    configuracao.agenda.timezone || "America/Sao_Paulo"
  );
  const referenciaTemporal = Boolean(
    interpretacao.data ||
      interpretacao.preferencia ||
      horaMensagem(pendencia.conteudo_agregado) ||
      ordinal(pendencia.conteudo_agregado) !== null
  );
  const decisao = decisaoConfirmacao(pendencia.conteudo_agregado);

  if (
    !confirmacaoPendente &&
    !remarcacaoExplicita &&
    !(remarcacao && referenciaTemporal) &&
    !(emCurso && slot)
  ) {
    return { tratado: false };
  }

  const [saldo, deteccao, agendamentosAtivos, agente] = await Promise.all([
    buscarSaldoTokensIa(pendencia.empresa_id),
    detectarAutomacaoExterna({
      empresaId: pendencia.empresa_id,
      conversaId: pendencia.conversa_id,
      conteudoAgregado: pendencia.conteudo_agregado,
    }),
    ativos(pendencia, configuracao.agendaId),
    db
      .from("agentes_ia")
      .select("id")
      .eq("empresa_id", pendencia.empresa_id)
      .eq("id", pendencia.agente_id)
      .eq("status", "ativo")
      .maybeSingle(),
  ]);

  if (
    !agente.data ||
    deteccao.detectado ||
    (saldo.limite !== null && Number(saldo.restantes || 0) <= 0) ||
    (remarcacao && agendamentosAtivos.length > 0 && !configuracao.podeRemarcar)
  ) {
    return { tratado: false };
  }

  const lockToken = crypto.randomUUID();
  const { data: reservada, error: reservaError } = await db.rpc(
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
      tratado: true,
      resultado: {
        ok: true,
        processado: false,
        motivo: "pendencia_indisponivel_ou_debounce",
      },
    };
  }

  const pendenciaReservada = reservada as Pendencia;
  const execucaoId = await abrir(pendenciaReservada);
  const ctx: Ctx = {
    pendencia: pendenciaReservada,
    lockToken,
    agenda: configuracao.agenda,
    agendaId: configuracao.agendaId,
    estado,
    ativos: agendamentosAtivos,
    slot,
    remarcacao,
    execucaoId,
    confirmacaoPendente,
    decisaoConfirmacao: decisao,
    referenciaTemporal,
  };

  return {
    tratado: true,
    resultado: await executar(ctx),
  };
}
