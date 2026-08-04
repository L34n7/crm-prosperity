/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { podeVisualizarDisparos } from "@/lib/whatsapp/disparo-permissoes";

function traduzirErroMetaWhatsApp(
  codigo?: number | string | null,
  erroTecnico?: string | null
) {
  const code = Number(codigo || 0);
  switch (code) {
    case 131031:
      return "A conta WhatsApp Business foi bloqueada ou desativada pela Meta.";
    case 131042:
      return "A conta WhatsApp Business possui pendências financeiras na Meta.";
    case 131026:
      return "O número do destinatário está inválido ou indisponível no WhatsApp.";
    case 470:
      return "A janela de atendimento de 24 horas foi encerrada.";
    case 368:
      return "A conta WhatsApp está temporariamente bloqueada pela Meta.";
    default:
      return erroTecnico || "Falha ao enviar mensagem pelo WhatsApp.";
  }
}

function one<T = any>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function tipoLabel(tipo: string) {
  if (tipo === "confirmacao") return "Confirmação do agendamento";
  if (tipo === "lembrete") return "Lembrete do agendamento";
  if (tipo === "aviso_responsavel") return "Aviso ao responsável";
  if (tipo === "pos_atendimento") return "Pós-atendimento";
  if (tipo === "lembrete_individual") return "Lembrete adicional do agendamento"; // CRM_AGENDA_INDIVIDUAL_REMINDER_POST_FLOW_V1
  return "Automação da agenda";
}

function canalLabel(canal: string) {
  if (canal === "whatsapp") return "WhatsApp";
  if (canal === "email") return "E-mail";
  if (canal === "sistema") return "Notificação no sistema";
  if (canal === "fluxo") return "Fluxo";
  return canal;
}

function statusAgenda(status: string) {
  if (status === "processando") return "executando";
  if (status === "concluido") return "executado";
  return status;
}

function dataPt(value?: string | null) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function destinoAgenda(canal: string, agendamento: any, responsavel: any) {
  if (canal === "whatsapp") return agendamento?.telefone_cliente || "";
  if (canal === "email") return agendamento?.email_cliente || responsavel?.email || "";
  if (canal === "sistema") return responsavel?.nome || "Responsável da agenda";
  return agendamento?.nome_cliente || "Contato do agendamento";
}

// CRM_DISPAROS_DESTINO_NORMALIZADO_V1
function destinoDetalhadoAgenda(canal: string, agendamento: any, responsavel: any, fluxo: any) {
  const valor = destinoAgenda(canal, agendamento, responsavel) || "-";
  if (canal === "email") {
    return { tipo: "email", rotulo: "E-mail", valor };
  }
  if (canal === "sistema") {
    return { tipo: "responsavel", rotulo: "Responsável", valor };
  }
  if (canal === "fluxo") {
    return {
      tipo: "fluxo",
      rotulo: fluxo?.nome ? "Fluxo de destino" : "Contato",
      valor: fluxo?.nome || valor,
    };
  }
  return { tipo: "whatsapp", rotulo: "WhatsApp", valor };
}

function conteudoAgenda(tipo: string, canal: string, agendamento: any, agenda: any) {
  const nome = agendamento?.nome_cliente || "Cliente";
  const titulo = agendamento?.titulo || agenda?.nome || "Agendamento";
  const horario = dataPt(agendamento?.inicio_at);
  if (tipo === "confirmacao") {
    return `${nome}, confirme o compromisso “${titulo}” agendado para ${horario}.`;
  }
  if (tipo === "lembrete") {
    return `${nome}, este é um lembrete do compromisso “${titulo}” em ${horario}.`;
  }
  if (tipo === "aviso_responsavel") {
    return `O compromisso “${titulo}” de ${nome} está agendado para ${horario}.`;
  }
  if (canal === "fluxo") {
    return `Início automático do fluxo de pós-atendimento de “${titulo}”.`;
  }
  return `${tipoLabel(tipo)} · ${titulo}`;
}

export async function GET(request: NextRequest) {
  try {
    const resultado = await getUsuarioContexto();
    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const { usuario } = resultado;
    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }
    if (!podeVisualizarDisparos(usuario)) {
      return NextResponse.json(
        { ok: false, error: "Voce nao tem permissao para visualizar disparos." },
        { status: 403 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "todos";
    const busca = String(searchParams.get("busca") || "").trim().toLowerCase();

    const [fluxosResult, agendaResult] = await Promise.all([
      supabase
        .from("automacao_agendamentos")
        .select(`
          id, empresa_id, execucao_id, fluxo_id, no_id, tipo_agendamento,
          executar_em, status, payload_json, created_at, executed_at,
          automacao_fluxos (id, nome),
          automacao_nos (id, titulo, tipo_no)
        `)
        .eq("empresa_id", usuario.empresa_id)
        .eq("tipo_agendamento", "disparo_template")
        .order("executar_em", { ascending: false }),
      supabase
        .from("agenda_automacao_execucoes")
        .select(`
          id, empresa_id, agenda_id, agendamento_id, agenda_lembrete_id, regra_id, tipo, canal,
          executar_em, status, payload_json, resultado_json, created_at,
          executado_em, mensagem_externa_id, erro, cancelado_manualmente,
          cancelado_em,
          agenda_calendarios!agenda_automacao_execucoes_agenda_id_fkey (
            id, nome, timezone
          ),
          agenda_agendamentos!agenda_automacao_execucoes_agendamento_id_fkey (
            id, titulo, nome_cliente, telefone_cliente, email_cliente,
            inicio_at, fim_at, status, contato_id, conversa_id,
            responsavel_id, local
          ),
          agenda_automacao_regras!agenda_automacao_execucoes_regra_id_fkey (
            id, whatsapp_template_id, fluxo_id, integracao_whatsapp_id,
            configuracao_json
          )
        `)
        .eq("empresa_id", usuario.empresa_id)
        .order("executar_em", { ascending: false }),
    ]);

    if (fluxosResult.error) {
      throw new Error(`Erro ao buscar disparos dos fluxos: ${fluxosResult.error.message}`);
    }
    if (agendaResult.error) {
      throw new Error(`Erro ao buscar disparos da agenda: ${agendaResult.error.message}`);
    }

    const disparosFluxo = fluxosResult.data || [];
    const execucoesAgenda = agendaResult.data || [];

    const templateIds = Array.from(
      new Set([
        ...disparosFluxo
          .map((item: any) => String(item.payload_json?.template_id || "").trim())
          .filter(Boolean),
        ...execucoesAgenda
          .map((item: any) =>
            String((item.payload_json || {}).whatsapp_template_id || one(item.agenda_automacao_regras)?.whatsapp_template_id || "").trim()
          )
          .filter(Boolean),
      ])
    );
    const responsavelIds = Array.from(
      new Set(
        execucoesAgenda
          .map((item: any) => String(one(item.agenda_agendamentos)?.responsavel_id || ""))
          .filter(Boolean)
      )
    );
    const flowIds = Array.from(
      new Set(
        execucoesAgenda
          .map((item: any) => String(one(item.agenda_automacao_regras)?.fluxo_id || ""))
          .filter(Boolean)
      )
    );
    const messageIds = Array.from(
      new Set([
        ...disparosFluxo
          .map((item: any) =>
            String(item.payload_json?.resultado_envio?.message_id || "").trim()
          )
          .filter(Boolean),
        ...execucoesAgenda
          .map((item: any) => String(item.mensagem_externa_id || "").trim())
          .filter(Boolean),
      ])
    );

    const [templatesResult, responsaveisResult, flowsResult, mensagensResult] =
      await Promise.all([
        templateIds.length
          ? supabase
              .from("whatsapp_templates")
              .select("id, nome, idioma, payload")
              .eq("empresa_id", usuario.empresa_id)
              .in("id", templateIds)
          : Promise.resolve({ data: [], error: null }),
        responsavelIds.length
          ? supabase
              .from("usuarios")
              .select("id, nome, email")
              .eq("empresa_id", usuario.empresa_id)
              .in("id", responsavelIds)
          : Promise.resolve({ data: [], error: null }),
        flowIds.length
          ? supabase
              .from("automacao_fluxos")
              .select("id, nome")
              .eq("empresa_id", usuario.empresa_id)
              .in("id", flowIds)
          : Promise.resolve({ data: [], error: null }),
        messageIds.length
          ? supabase
              .from("mensagens")
              .select("id, status_envio, mensagem_externa_id, metadata_json")
              .eq("empresa_id", usuario.empresa_id)
              .in("mensagem_externa_id", messageIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

    const templates = new Map(
      (templatesResult.data || []).map((item: any) => [String(item.id), item])
    );
    const responsaveis = new Map(
      (responsaveisResult.data || []).map((item: any) => [String(item.id), item])
    );
    const flows = new Map(
      (flowsResult.data || []).map((item: any) => [String(item.id), item])
    );
    const mensagens = new Map(
      (mensagensResult.data || []).map((item: any) => [
        String(item.mensagem_externa_id),
        item,
      ])
    );

    const normalizadosFluxo = disparosFluxo.map((item: any) => {
      const payload = item.payload_json || {};
      const template = templates.get(String(payload.template_id || ""));
      const messageId = String(payload.resultado_envio?.message_id || "").trim();
      const mensagem: any = messageId ? mensagens.get(messageId) : null;
      const metadataMensagem = mensagem?.metadata_json || {};
      const whatsappStatus = metadataMensagem?.whatsapp_status || {};
      const rawStatus = whatsappStatus?.raw_status || {};
      const erroMeta = rawStatus?.errors?.[0] || null;
      const codigoErroMeta = erroMeta?.code || null;
      const erroTecnico =
        whatsappStatus?.error_message || erroMeta?.message || erroMeta?.title || null;
      const statusEnvio = mensagem?.status_envio || null;
      const envioStatus =
        statusEnvio === "falha"
          ? "falha"
          : statusEnvio === "entregue" || statusEnvio === "lida"
          ? "sucesso"
          : statusEnvio === "enviada" || item.status === "executado"
          ? "sucesso"
          : item.status === "executando"
          ? "processando"
          : null;

      return {
        ...item,
        origem_disparo: "fluxo",
        payload_json: {
          ...payload,
          origem_disparo: "fluxo",
          template_nome: payload.template_nome || template?.nome || null,
          template_idioma: payload.template_idioma || template?.idioma || null,
          template_payload: payload.template_payload || template?.payload || null,
          destino_tipo: "whatsapp",
          destino_rotulo: "WhatsApp",
          destino_valor: payload.numero_destino || "-",
          grupo_id: payload.agendamento_id
            ? "agendamento:" + payload.agendamento_id
            : "disparo:" + item.id,
        },
        envio_status: envioStatus,
        envio_label:
          envioStatus === "falha"
            ? "Falhou"
            : envioStatus === "sucesso"
            ? "Enviado"
            : envioStatus === "processando"
            ? "Em processamento"
            : "Ainda não enviado",
        envio_message_id: messageId || null,
        envio_erro_codigo_meta: codigoErroMeta,
        envio_erro_tecnico: erroTecnico,
        envio_erro_amigavel:
          envioStatus === "falha"
            ? traduzirErroMetaWhatsApp(codigoErroMeta, erroTecnico)
            : null,
      };
    });

    const normalizadosAgenda = execucoesAgenda.map((item: any) => {
      const agenda = one(item.agenda_calendarios) || {};
      const agendamento = one(item.agenda_agendamentos) || {};
      const regra = one(item.agenda_automacao_regras) || {};
      const individualPayload = item.payload_json || {};
      const template = templates.get(String(individualPayload.whatsapp_template_id || regra.whatsapp_template_id || ""));
      const responsavel = responsaveis.get(String(agendamento.responsavel_id || ""));
      const fluxo = flows.get(String(regra.fluxo_id || ""));
      const messageId = String(item.mensagem_externa_id || "").trim();
      const mensagem: any = messageId ? mensagens.get(messageId) : null;
      const mappedStatus = statusAgenda(item.status);
      const envioStatus =
        item.status === "erro" || mensagem?.status_envio === "falha"
          ? "falha"
          : item.status === "concluido"
          ? "sucesso"
          : item.status === "processando"
          ? "processando"
          : null;
      const title = template?.nome || `${tipoLabel(item.tipo)} · ${canalLabel(item.canal)}`;
      const recipient = individualPayload.destinatario && typeof individualPayload.destinatario === "object" ? individualPayload.destinatario : null;
      const destination = recipient ? (item.canal === "email" ? recipient.email : item.canal === "whatsapp" ? recipient.telefone : recipient.nome) : destinoAgenda(item.canal, agendamento, responsavel);
      const destinationMeta = destinoDetalhadoAgenda(
        item.canal,
        agendamento,
        responsavel,
        fluxo
      );
      const content = conteudoAgenda(item.tipo, item.canal, agendamento, agenda);

      return {
        id: item.id,
        empresa_id: item.empresa_id,
        execucao_id: null,
        fluxo_id: regra.fluxo_id || null,
        no_id: regra.id || null,
        tipo_agendamento: "agenda_automacao",
        executar_em: item.executar_em,
        status: mappedStatus,
        created_at: item.created_at,
        executed_at: item.executado_em,
        origem_disparo: "agenda",
        automacao_fluxos: {
          id: agenda.id || item.agenda_id,
          nome: `Agenda: ${agenda.nome || "Sem nome"}`,
        },
        automacao_nos: {
          id: regra.id || item.id,
          titulo: `${tipoLabel(item.tipo)} · ${canalLabel(item.canal)}`,
          tipo_no: "agenda_automacao",
        },
        payload_json: {
          ...(item.payload_json || {}),
          origem_disparo: item.tipo === "lembrete_individual" ? "lembrete_individual" : "agenda",
          agenda_automacao_execucao_id: item.id,
          agenda_lembrete_id: item.agenda_lembrete_id || individualPayload.agenda_lembrete_id || null,
          agenda_id: item.agenda_id,
          agenda_nome: agenda.nome || null,
          calendario_nome: agenda.nome || null,
          agenda_timezone: agenda.timezone || null,
          agendamento_id: item.agendamento_id,
          grupo_id: "agendamento:" + item.agendamento_id,
          agendamento_titulo: agendamento.titulo || null,
          agendamento_inicio_at: agendamento.inicio_at || null,
          agendamento_fim_at: agendamento.fim_at || null,
          agendamento_status: agendamento.status || null,
          agendamento_local: agendamento.local || null,
          contato_nome: agendamento.nome_cliente || null,
          responsavel_nome: responsavel?.nome || null,
          conversa_id: agendamento.conversa_id || null,
          numero_destino: destination || "-",
          destino_tipo: destinationMeta.tipo,
          destino_rotulo: destinationMeta.rotulo,
          destino_valor: destinationMeta.valor,
          tipo_label: tipoLabel(item.tipo),
          template_id: template?.id || null,
          template_nome: title,
          template_idioma: template?.idioma || null,
          template_payload: template?.payload || null,
          conteudo_renderizado: content,
          canal_agenda: item.canal,
          tipo_agenda: item.tipo,
          fluxo_pos_atendimento: fluxo?.nome || null,
          cancelado_manualmente: item.cancelado_manualmente === true,
          cancelado_em: item.cancelado_em || null,
        },
        envio_status: envioStatus,
        envio_label:
          envioStatus === "falha"
            ? "Falhou"
            : envioStatus === "processando"
            ? "Em processamento"
            : envioStatus === "sucesso"
            ? item.canal === "email"
              ? "E-mail enviado"
              : item.canal === "sistema"
              ? "Notificação criada"
              : item.canal === "fluxo"
              ? "Fluxo iniciado"
              : "Enviado"
            : "Ainda não executado",
        envio_message_id: messageId || null,
        envio_erro_codigo_meta: null,
        envio_erro_tecnico: item.erro || null,
        envio_erro_amigavel: item.erro || null,
      };
    });

    let disparos = [...normalizadosFluxo, ...normalizadosAgenda];
    if (status !== "todos") {
      disparos = disparos.filter((item: any) => item.status === status);
    }
    if (busca) {
      disparos = disparos.filter((item: any) => {
        const payload = item.payload_json || {};
        return [
          payload.template_nome,
          payload.numero_destino,
          payload.contato_nome,
          payload.agenda_nome,
          payload.agendamento_titulo,
          payload.destino_valor,
          payload.responsavel_nome,
          payload.agendamento_local,
          item.automacao_fluxos?.nome,
          item.automacao_nos?.titulo,
        ].some((value) => String(value || "").toLowerCase().includes(busca));
      });
    }

    const prioridadeStatus = (item: any) => {
      if (item.status === "erro") return 0;
      if (item.status === "executando") return 1;
      if (item.status === "pendente") return 2;
      return 3;
    };

    disparos.sort((a: any, b: any) => {
      const prioridadeA = prioridadeStatus(a);
      const prioridadeB = prioridadeStatus(b);
      if (prioridadeA !== prioridadeB) return prioridadeA - prioridadeB;

      if (prioridadeA < 3) {
        return new Date(a.executar_em).getTime() - new Date(b.executar_em).getTime();
      }

      const referenciaA = a.executed_at || a.executar_em || a.created_at;
      const referenciaB = b.executed_at || b.executar_em || b.created_at;
      return new Date(referenciaB).getTime() - new Date(referenciaA).getTime();
    });

    // CRM_DISPAROS_PROGRAMADOS_DESC_V2
    disparos.sort((a: any, b: any) => {
      const dataB = new Date(b.executar_em || b.created_at || 0).getTime();
      const dataA = new Date(a.executar_em || a.created_at || 0).getTime();
      return dataB - dataA;
    });

    return NextResponse.json({ ok: true, disparos });
  } catch (error: any) {
    console.error("[DISPAROS AGENDADOS] Erro geral:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro ao buscar disparos agendados." },
      { status: 500 }
    );
  }
}
