/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { podeVisualizarDisparos } from "@/lib/whatsapp/disparo-permissoes";
import { normalizarTimezoneEmpresa } from "@/lib/datetime/timezone";

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
  if (tipo === "lembrete_individual") return "Lembrete adicional do agendamento";
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

function statusRotina(status: string) {
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

function destinoAgenda(
  canal: string,
  tipo: string,
  agendamento: any,
  contato: any,
  responsavel: any
) {
  if (canal === "whatsapp") return agendamento?.telefone_cliente || contato?.telefone || "";
  if (canal === "email") {
    if (tipo === "aviso_responsavel") return responsavel?.email || "";
    return agendamento?.email_cliente || contato?.email || "";
  }
  if (canal === "sistema") return responsavel?.nome || "Responsável da agenda";
  return agendamento?.nome_cliente || contato?.nome || "Contato do agendamento";
}

function destinoDetalhadoAgenda(
  canal: string,
  tipo: string,
  agendamento: any,
  contato: any,
  responsavel: any,
  fluxo: any
) {
  const destino = destinoAgenda(canal, tipo, agendamento, contato, responsavel);
  if (canal === "email") {
    return {
      tipo: "email",
      rotulo: "E-mail",
      valor:
        destino ||
        (tipo === "aviso_responsavel"
          ? "Responsável sem e-mail cadastrado"
          : "Cliente sem e-mail cadastrado"),
    };
  }
  const valor = destino || "-";
  if (canal === "sistema") return { tipo: "responsavel", rotulo: "Responsável", valor };
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
  if (tipo === "confirmacao") return `${nome}, confirme o compromisso “${titulo}” agendado para ${horario}.`;
  if (tipo === "lembrete") return `${nome}, este é um lembrete do compromisso “${titulo}” em ${horario}.`;
  if (tipo === "aviso_responsavel") return `O compromisso “${titulo}” de ${nome} está agendado para ${horario}.`;
  if (canal === "fluxo") return `Início automático do fluxo de pós-atendimento de “${titulo}”.`;
  return `${tipoLabel(tipo)} · ${titulo}`;
}

function valorContexto(contexto: any, chaves: string[], fallback = "") {
  for (const chave of chaves) {
    const valor = contexto?.[chave];
    if (valor !== null && valor !== undefined && String(valor).trim()) return String(valor);
  }
  return fallback;
}

const IDS_POR_LOTE_DISPAROS_AGENDADOS = 100;

async function buscarMensagensDisparosEmLotes(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  empresaId: string;
  messageIds: string[];
}) {
  const ids = Array.from(
    new Set(
      params.messageIds
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );

  if (!ids.length) {
    return { data: [] as any[], error: null as any };
  }

  const lotes: string[][] = [];
  for (let inicio = 0; inicio < ids.length; inicio += IDS_POR_LOTE_DISPAROS_AGENDADOS) {
    lotes.push(ids.slice(inicio, inicio + IDS_POR_LOTE_DISPAROS_AGENDADOS));
  }

  const resultados = await Promise.all(
    lotes.map((lote) =>
      params.supabase
        .from("mensagens")
        .select("id, status_envio, mensagem_externa_id, metadata_json")
        .eq("empresa_id", params.empresaId)
        .in("mensagem_externa_id", lote)
    )
  );

  const erro = resultados.find((item) => item.error)?.error || null;

  if (erro) {
    return { data: [] as any[], error: erro };
  }

  return {
    data: resultados.flatMap((item) => item.data || []),
    error: null as any,
  };
}

export async function GET(request: NextRequest) {
  try {
    const resultado = await getUsuarioContexto();
    if (!resultado.ok) {
      return NextResponse.json({ ok: false, error: resultado.error }, { status: resultado.status });
    }

    const { usuario } = resultado;
    if (!usuario.empresa_id) {
      return NextResponse.json({ ok: false, error: "Usuário sem empresa vinculada." }, { status: 400 });
    }
    if (!podeVisualizarDisparos(usuario)) {
      return NextResponse.json({ ok: false, error: "Voce nao tem permissao para visualizar disparos." }, { status: 403 });
    }

    const supabase = getSupabaseAdmin();

    const { data: empresaTimezone, error: empresaTimezoneError } = await supabase
      .from("empresas")
      .select("timezone")
      .eq("id", usuario.empresa_id)
      .maybeSingle();

    if (empresaTimezoneError) {
      console.warn(
        "[DISPAROS AGENDADOS] Falha ao buscar timezone da empresa:",
        empresaTimezoneError.message
      );
    }

    const timezoneEmpresa = normalizarTimezoneEmpresa(
      empresaTimezone?.timezone
    );

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "todos";
    const busca = String(searchParams.get("busca") || "").trim().toLowerCase();
    const grupoManualId = String(searchParams.get("grupo_manual_id") || "").trim();

    if (grupoManualId) {
      const { data: itensGrupo, error: itensGrupoError } = await supabase
        .from("automacao_agendamentos")
        .select(
          "id, empresa_id, execucao_id, fluxo_id, no_id, tipo_agendamento, executar_em, status, payload_json, created_at, executed_at"
        )
        .eq("empresa_id", usuario.empresa_id)
        .eq("tipo_agendamento", "disparo_template")
        .eq("payload_json->>origem", "manual_agendado")
        .eq("payload_json->>agendamento_grupo_id", grupoManualId)
        .order("executar_em", { ascending: false });

      if (itensGrupoError) {
        throw new Error(
          `Erro ao buscar contatos do disparo agendado: ${itensGrupoError.message}`
        );
      }

      return NextResponse.json({
        ok: true,
        timezone_empresa: timezoneEmpresa,
        disparos: itensGrupo || [],
      });
    }

    const [resumosManuaisResult, fluxosResult, agendaResult, rotinasResult] = await Promise.all([
      supabase.rpc("listar_disparos_agendados_manuais_resumo", {
        p_empresa_id: usuario.empresa_id,
      }),
      supabase
        .from("automacao_agendamentos")
        .select(`
          id, empresa_id, execucao_id, fluxo_id, no_id, tipo_agendamento,
          executar_em, status, payload_json, created_at, executed_at,
          automacao_fluxos (id, nome),
          automacao_nos (id, titulo, tipo_no)
        `)
        .eq("empresa_id", usuario.empresa_id)
        .in("tipo_agendamento", ["disparo_template", "mensagem_manual"])
        .neq("payload_json->>origem", "manual_agendado")
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
      supabase
        .from("rotina_automacao_jobs")
        .select(`
          id, empresa_id, automacao_id, execucao_id, acao_id, ordem, titulo, canal,
          executar_em, status, contexto_json, resultado_json, erro, created_at,
          executado_em, cancelado_em, cancelamento_solicitado_em,
          rotina_automacoes!rotina_automacao_jobs_automacao_id_fkey (id, nome),
          rotina_automacao_acoes!rotina_automacao_jobs_acao_id_fkey (id, tipo_acao, configuracao_json)
        `)
        .eq("empresa_id", usuario.empresa_id)
        .in("canal", ["whatsapp", "email"])
        .order("executar_em", { ascending: false }),
    ]);

    if (resumosManuaisResult.error) throw new Error(`Erro ao resumir campanhas agendadas: ${resumosManuaisResult.error.message}`);
    if (fluxosResult.error) throw new Error(`Erro ao buscar disparos dos fluxos: ${fluxosResult.error.message}`);
    if (agendaResult.error) throw new Error(`Erro ao buscar disparos da agenda: ${agendaResult.error.message}`);
    if (rotinasResult.error) throw new Error(`Erro ao buscar disparos das automações: ${rotinasResult.error.message}`);

    const resumosManuais = resumosManuaisResult.data || [];
    const disparosFluxo = fluxosResult.data || [];
    const execucoesAgenda = agendaResult.data || [];
    const jobsRotina = rotinasResult.data || [];

    const templateIds = Array.from(
      new Set([
        ...disparosFluxo
          .map((item: any) => String(item.payload_json?.template_id || "").trim())
          .filter(Boolean),
        ...execucoesAgenda
          .map((item: any) => String((item.payload_json || {}).whatsapp_template_id || one(item.agenda_automacao_regras)?.whatsapp_template_id || "").trim())
          .filter(Boolean),
        ...jobsRotina
          .map((item: any) => {
            const contexto = item.contexto_json || {};
            const acao = one(item.rotina_automacao_acoes) || {};
            return String(contexto.template_id || acao.configuracao_json?.template_id || "").trim();
          })
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
    const contatoIds = Array.from(
      new Set(
        execucoesAgenda
          .map((item: any) => String(one(item.agenda_agendamentos)?.contato_id || ""))
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
          .map((item: any) => String(item.payload_json?.resultado_envio?.message_id || "").trim())
          .filter(Boolean),
        ...execucoesAgenda
          .map((item: any) => String(item.mensagem_externa_id || "").trim())
          .filter(Boolean),
      ])
    );

    const [templatesResult, responsaveisResult, contatosResult, flowsResult, mensagensResult] = await Promise.all([
      templateIds.length
        ? supabase.from("whatsapp_templates").select("id, nome, idioma, payload").eq("empresa_id", usuario.empresa_id).in("id", templateIds)
        : Promise.resolve({ data: [], error: null }),
      responsavelIds.length
        ? supabase.from("usuarios").select("id, nome, email").eq("empresa_id", usuario.empresa_id).in("id", responsavelIds)
        : Promise.resolve({ data: [], error: null }),
      contatoIds.length
        ? supabase.from("contatos").select("id, nome, telefone, email").eq("empresa_id", usuario.empresa_id).in("id", contatoIds)
        : Promise.resolve({ data: [], error: null }),
      flowIds.length
        ? supabase.from("automacao_fluxos").select("id, nome").eq("empresa_id", usuario.empresa_id).in("id", flowIds)
        : Promise.resolve({ data: [], error: null }),
      buscarMensagensDisparosEmLotes({
        supabase,
        empresaId: usuario.empresa_id,
        messageIds,
      }),
    ]);

    const enriquecimentoError =
      templatesResult.error ||
      responsaveisResult.error ||
      contatosResult.error ||
      flowsResult.error ||
      mensagensResult.error;
    if (enriquecimentoError) throw new Error(enriquecimentoError.message);

    const templates = new Map((templatesResult.data || []).map((item: any) => [String(item.id), item]));
    const responsaveis = new Map((responsaveisResult.data || []).map((item: any) => [String(item.id), item]));
    const contatos = new Map((contatosResult.data || []).map((item: any) => [String(item.id), item]));
    const flows = new Map((flowsResult.data || []).map((item: any) => [String(item.id), item]));
    const mensagens = new Map((mensagensResult.data || []).map((item: any) => [String(item.mensagem_externa_id), item]));

    const normalizadosFluxo = disparosFluxo.map((item: any) => {
      const payload = item.payload_json || {};
      const origemDisparo = item.tipo_agendamento === "mensagem_manual" ? "conversa" : "fluxo";
      const template = templates.get(String(payload.template_id || ""));
      const messageId = String(payload.resultado_envio?.message_id || "").trim();
      const mensagem: any = messageId ? mensagens.get(messageId) : null;
      const metadataMensagem = mensagem?.metadata_json || {};
      const whatsappStatus = metadataMensagem?.whatsapp_status || {};
      const rawStatus = whatsappStatus?.raw_status || {};
      const erroMeta = rawStatus?.errors?.[0] || null;
      const codigoErroMeta = erroMeta?.code || null;
      const erroTecnico = whatsappStatus?.error_message || erroMeta?.message || erroMeta?.title || String(payload.erro || "").trim() || null;
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
        origem_disparo: origemDisparo,
        payload_json: {
          ...payload,
          origem_disparo: origemDisparo,
          template_nome: payload.template_nome || template?.nome || null,
          template_idioma: payload.template_idioma || template?.idioma || null,
          template_payload: payload.template_payload || template?.payload || null,
          destino_tipo: "whatsapp",
          destino_rotulo: "WhatsApp",
          destino_valor: payload.numero_destino || "-",
          grupo_id: payload.agendamento_id ? "agendamento:" + payload.agendamento_id : "disparo:" + item.id,
        },
        envio_status: envioStatus,
        envio_label: envioStatus === "falha" ? "Falhou" : envioStatus === "sucesso" ? "Enviado" : envioStatus === "processando" ? "Em processamento" : "Ainda não enviado",
        envio_message_id: messageId || null,
        envio_erro_codigo_meta: codigoErroMeta,
        envio_erro_tecnico: erroTecnico,
        envio_erro_amigavel: envioStatus === "falha" ? traduzirErroMetaWhatsApp(codigoErroMeta, erroTecnico) : null,
      };
    });

    const normalizadosAgenda = execucoesAgenda.map((item: any) => {
      const agenda = one(item.agenda_calendarios) || {};
      const agendamento = one(item.agenda_agendamentos) || {};
      const regra = one(item.agenda_automacao_regras) || {};
      const individualPayload = item.payload_json || {};
      const template = templates.get(String(individualPayload.whatsapp_template_id || regra.whatsapp_template_id || ""));
      const responsavel = responsaveis.get(String(agendamento.responsavel_id || ""));
      const contato = contatos.get(String(agendamento.contato_id || ""));
      const fluxo = flows.get(String(regra.fluxo_id || ""));
      const messageId = String(item.mensagem_externa_id || "").trim();
      const mensagem: any = messageId ? mensagens.get(messageId) : null;
      const mappedStatus = statusAgenda(item.status);
      const envioStatus = item.status === "erro" || mensagem?.status_envio === "falha" ? "falha" : item.status === "concluido" ? "sucesso" : item.status === "processando" ? "processando" : null;
      const title = template?.nome || `${tipoLabel(item.tipo)} · ${canalLabel(item.canal)}`;
      const recipient = individualPayload.destinatario && typeof individualPayload.destinatario === "object" ? individualPayload.destinatario : null;
      const destination = recipient
        ? item.canal === "email"
          ? recipient.email
          : item.canal === "whatsapp"
            ? recipient.telefone
            : recipient.nome
        : destinoAgenda(item.canal, item.tipo, agendamento, contato, responsavel);
      const destinationMeta = recipient
        ? {
            tipo: item.canal,
            rotulo: canalLabel(item.canal),
            valor:
              destination ||
              (item.canal === "email"
                ? "Destinatário sem e-mail cadastrado"
                : "-"),
          }
        : destinoDetalhadoAgenda(
            item.canal,
            item.tipo,
            agendamento,
            contato,
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
        automacao_fluxos: { id: agenda.id || item.agenda_id, nome: `Agenda: ${agenda.nome || "Sem nome"}` },
        automacao_nos: { id: regra.id || item.id, titulo: `${tipoLabel(item.tipo)} · ${canalLabel(item.canal)}`, tipo_no: "agenda_automacao" },
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
        envio_label: envioStatus === "falha" ? "Falhou" : envioStatus === "processando" ? "Em processamento" : envioStatus === "sucesso" ? item.canal === "email" ? "E-mail enviado" : item.canal === "sistema" ? "Notificação criada" : item.canal === "fluxo" ? "Fluxo iniciado" : "Enviado" : "Ainda não executado",
        envio_message_id: messageId || null,
        envio_erro_codigo_meta: null,
        envio_erro_tecnico: item.erro || null,
        envio_erro_amigavel: item.erro || null,
      };
    });

    const normalizadosRotina = jobsRotina.map((item: any) => {
      const automacao = one(item.rotina_automacoes) || {};
      const acao = one(item.rotina_automacao_acoes) || {};
      const contexto = item.contexto_json || {};
      const resultadoJob = item.resultado_json || {};
      const templateId = String(contexto.template_id || acao.configuracao_json?.template_id || "");
      const template = templateId ? templates.get(templateId) : null;
      const canal = item.canal === "email" ? "email" : "whatsapp";
      const destino = valorContexto(
        contexto,
        canal === "email"
          ? ["destino_valor", "email", "email_cliente", "contato_email"]
          : ["destino_valor", "numero_destino", "telefone", "telefone_cliente", "contato_telefone"],
        "-",
      );
      const contatoNome = valorContexto(contexto, ["contato_nome", "nome_cliente", "paciente_nome", "cliente_nome"], "Contato não informado");
      const titulo = item.titulo || template?.nome || (canal === "email" ? "E-mail da automação" : "WhatsApp da automação");
      const mappedStatus = statusRotina(item.status);
      const envioStatus = item.status === "erro" ? "falha" : item.status === "concluido" ? "sucesso" : item.status === "processando" ? "processando" : null;
      const grupoId = item.execucao_id || item.id;

      return {
        id: item.id,
        empresa_id: item.empresa_id,
        execucao_id: item.execucao_id,
        fluxo_id: null,
        no_id: item.acao_id,
        tipo_agendamento: "rotina_automacao",
        executar_em: item.executar_em,
        status: mappedStatus,
        created_at: item.created_at,
        executed_at: item.executado_em,
        origem_disparo: "automacao",
        automacao_fluxos: { id: item.automacao_id, nome: automacao.nome || "Automação" },
        automacao_nos: { id: item.acao_id || item.id, titulo, tipo_no: acao.tipo_acao || "rotina_automacao" },
        payload_json: {
          ...contexto,
          origem_disparo: "automacao",
          automacao_id: item.automacao_id,
          rotina_execucao_id: item.execucao_id,
          rotina_job_id: item.id,
          grupo_id: `automacao:${grupoId}`,
          agendamento_id: grupoId,
          agendamento_titulo: automacao.nome || "Automação",
          agenda_nome: "Automação",
          calendario_nome: automacao.nome || "Automação",
          contato_nome: contatoNome,
          numero_destino: destino,
          destino_tipo: canal,
          destino_rotulo: canal === "email" ? "E-mail" : "WhatsApp",
          destino_valor: destino,
          tipo_label: titulo,
          template_id: template?.id || templateId || null,
          template_nome: template?.nome || titulo,
          template_idioma: template?.idioma || null,
          template_payload: template?.payload || null,
          conteudo_renderizado: valorContexto(contexto, ["conteudo_renderizado", "mensagem", "corpo", "texto"], ""),
          canal_agenda: canal,
          cancelado_em: item.cancelado_em || null,
          cancelamento_solicitado_em: item.cancelamento_solicitado_em || null,
          resultado_execucao: resultadoJob,
        },
        envio_status: envioStatus,
        envio_label: envioStatus === "falha" ? "Falhou" : envioStatus === "processando" ? "Em processamento" : envioStatus === "sucesso" ? (canal === "email" ? "E-mail enviado" : "Enviado") : "Ainda não executado",
        envio_message_id: valorContexto(resultadoJob, ["message_id", "mensagem_externa_id"], "") || null,
        envio_erro_codigo_meta: null,
        envio_erro_tecnico: item.erro || null,
        envio_erro_amigavel: item.erro || null,
      };
    });

    const resumosManuaisNormalizados = resumosManuais.map((item: any) => ({
      id: item.representative_id,
      empresa_id: usuario.empresa_id,
      execucao_id: null,
      fluxo_id: null,
      no_id: null,
      tipo_agendamento: "disparo_template",
      executar_em: item.executar_em,
      status: item.status_geral,
      created_at: item.created_at,
      executed_at: null,
      origem_disparo: "manual",
      automacao_fluxos: null,
      automacao_nos: null,
      payload_json: {
        origem: "manual_agendado",
        origem_disparo: "manual",
        agendamento_grupo_id: item.grupo_id,
        nome_campanha: item.nome_campanha,
        template_id: item.template_id,
        template_nome: item.template_nome,
        template_idioma: item.template_idioma,
        template_categoria: item.template_categoria,
        integracao_whatsapp_id: item.integracao_whatsapp_id,
        integracao_nome: item.integracao_nome,
        canal_agenda: "whatsapp",
        resumo_grupo: {
          total: Number(item.total || 0),
          pendentes: Number(item.pendentes || 0),
          executando: Number(item.executando || 0),
          executados: Number(item.executados || 0),
          cancelados: Number(item.cancelados || 0),
          erros: Number(item.erros || 0),
        },
      },
      envio_status: null,
      envio_label: null,
      envio_message_id: null,
      envio_erro_codigo_meta: null,
      envio_erro_tecnico: null,
      envio_erro_amigavel: null,
    }));

    let disparos = [
      ...resumosManuaisNormalizados,
      ...normalizadosFluxo,
      ...normalizadosAgenda,
      ...normalizadosRotina,
    ];
    if (status !== "todos") disparos = disparos.filter((item: any) => item.status === status);
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

    disparos.sort((a: any, b: any) => {
      const dataB = new Date(b.executar_em || b.created_at || 0).getTime();
      const dataA = new Date(a.executar_em || a.created_at || 0).getTime();
      return dataB - dataA;
    });

    return NextResponse.json({
      ok: true,
      timezone_empresa: timezoneEmpresa,
      disparos,
    });
  } catch (error: any) {
    console.error("[DISPAROS AGENDADOS] Erro geral:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro ao buscar disparos agendados." },
      { status: 500 }
    );
  }
}
