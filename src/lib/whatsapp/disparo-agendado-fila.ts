import { createHash } from "node:crypto";
import { normalizarTelefoneBrasilParaWhatsApp } from "@/lib/contatos/normalizar-telefone";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  normalizarTelefoneItemDisparo,
  obterFlowControlKeyDisparo,
  publicarItensDisparoQstash,
} from "@/lib/whatsapp/disparo-fila";
import {
  reservarLimiteMeta,
  type IntegracaoMetaLimite,
} from "@/lib/whatsapp/meta-limites";
import {
  statusWhatsappMetaBloqueado,
  WHATSAPP_META_BLOCK_DESCRIPTION,
} from "@/lib/whatsapp/meta-block";
import type { TemplatePayloadDisparo } from "@/lib/whatsapp/send-template-disparo";

type JsonObject = Record<string, unknown>;

type AgendamentoDisparo = {
  id: string;
  empresa_id: string;
  execucao_id: string | null;
  executar_em: string;
  status: string;
  payload_json: JsonObject | null;
  created_at: string;
};

type ItemPublicacao = {
  id: string;
  campanha_id: string;
  integracao_whatsapp_id: string;
};

type ErroSupabase = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

const supabaseAdmin = getSupabaseAdmin();
const STATUS_CAMPANHA_ATIVA = ["pendente", "enviando"];

function objeto(valor: unknown): JsonObject {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as JsonObject)
    : {};
}

function somenteDigitos(valor: unknown) {
  return String(valor || "").replace(/\D/g, "");
}

function normalizarTelefoneComparacao(valor: unknown) {
  const digitos = somenteDigitos(valor);
  if (!digitos) return "";
  return somenteDigitos(
    normalizarTelefoneBrasilParaWhatsApp(digitos) || digitos
  );
}

function textoPayload(
  agendamento: AgendamentoDisparo,
  chave: string
) {
  return String(objeto(agendamento.payload_json)[chave] || "").trim();
}

function chaveBaseAgendamento(agendamento: AgendamentoDisparo) {
  const payload = objeto(agendamento.payload_json);
  const grupoExplicito = String(
    payload.agendamento_grupo_id || payload.disparo_agendado_grupo_id || ""
  ).trim();

  if (grupoExplicito) {
    return `${agendamento.empresa_id}|grupo:${grupoExplicito}`;
  }

  const origem = String(payload.origem || "agendado").trim();
  const referenciaCriacao = agendamento.execucao_id
    ? `execucao:${agendamento.execucao_id}`
    : `criacao:${agendamento.created_at}`;

  return [
    agendamento.empresa_id,
    String(payload.integracao_whatsapp_id || "").trim(),
    String(payload.template_id || "").trim(),
    agendamento.executar_em,
    origem,
    referenciaCriacao,
  ].join("|");
}

function chaveCampanhaAgendada(chaveBase: string) {
  return `agendado-${createHash("sha256")
    .update(chaveBase)
    .digest("hex")
    .slice(0, 40)}`;
}

function formatarDataHora(dataIso: string) {
  const data = new Date(dataIso);

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(data)
    .replace(",", "");
}

function nomeCampanhaAgendada(params: {
  executarEm: string;
  total: number;
  nomeInformado?: string | null;
}) {
  const unidade = params.total === 1 ? "contato" : "contatos";
  const base =
    String(params.nomeInformado || "").replace(/\s+/g, " ").trim() ||
    "Disparo agendado";

  return `${base} - ${formatarDataHora(params.executarEm)} - ${params.total} ${unidade}`.slice(
    0,
    180
  );
}

function erroContemRestricao(error: unknown, restricao: string) {
  const erro = (error || {}) as ErroSupabase;
  const texto = `${erro.message || ""} ${erro.details || ""} ${
    erro.hint || ""
  }`;
  return erro.code === "23505" && texto.includes(restricao);
}

async function cancelarReservas(reservaIds: string[], motivo: string) {
  const ids = Array.from(new Set(reservaIds.filter(Boolean)));
  if (ids.length === 0) return;

  const { error } = await supabaseAdmin
    .from("whatsapp_meta_conversas_iniciadas")
    .update({
      status: "cancelado",
      updated_at: new Date().toISOString(),
      metadata_json: {
        motivo_cancelamento: motivo,
      },
    })
    .in("id", ids)
    .eq("status", "reservado");

  if (error) {
    console.warn(
      "[DISPARO AGENDADO FILA] Erro ao cancelar reservas Meta:",
      error
    );
  }
}

async function sincronizarAgendamentosCampanha(campanhaId: string) {
  const { error } = await supabaseAdmin.rpc(
    "sincronizar_automacao_agendamentos_campanha",
    {
      p_campanha_id: campanhaId,
    }
  );

  if (error) {
    throw new Error(
      `Erro ao vincular agendamentos a campanha: ${error.message}`
    );
  }
}

async function falharAgendamentos(ids: string[], erro: string) {
  if (ids.length === 0) return;

  const { error } = await supabaseAdmin.rpc(
    "falhar_automacao_agendamentos_disparo",
    {
      p_agendamento_ids: ids,
      p_erro: erro,
    }
  );

  if (error) {
    console.error(
      "[DISPARO AGENDADO FILA] Erro ao registrar falha dos agendamentos:",
      error
    );
  }
}

async function validarAgendamentoOrigemAtivo(
  agendamento: AgendamentoDisparo
) {
  const payload = objeto(agendamento.payload_json);

  if (payload.origem !== "lembrete_agendamento") {
    return { ok: true as const };
  }

  const agendaAgendamentoId = String(
    payload.agenda_agendamento_id || ""
  ).trim();

  if (!agendaAgendamentoId) {
    return {
      ok: false as const,
      motivo: "lembrete_sem_agendamento_id",
    };
  }

  const { data, error } = await supabaseAdmin
    .from("agenda_agendamentos")
    .select("id, status, inicio_at")
    .eq("id", agendaAgendamentoId)
    .eq("empresa_id", agendamento.empresa_id)
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false as const,
      motivo: "agendamento_nao_encontrado",
    };
  }

  if (!["agendado", "confirmado"].includes(String(data.status || ""))) {
    return {
      ok: false as const,
      motivo: "agendamento_nao_esta_ativo",
    };
  }

  const inicioPayload = payload.agenda_inicio_at
    ? new Date(String(payload.agenda_inicio_at)).getTime()
    : null;
  const inicioAtual = data.inicio_at
    ? new Date(String(data.inicio_at)).getTime()
    : null;

  if (
    inicioPayload &&
    inicioAtual &&
    Number.isFinite(inicioPayload) &&
    Number.isFinite(inicioAtual) &&
    inicioPayload !== inicioAtual
  ) {
    return {
      ok: false as const,
      motivo: "agendamento_foi_remarcado",
    };
  }

  return { ok: true as const };
}

async function cancelarAgendamentoInvalido(
  agendamento: AgendamentoDisparo,
  motivo: string
) {
  const { error } = await supabaseAdmin
    .from("automacao_agendamentos")
    .update({
      status: "cancelado",
      executed_at: new Date().toISOString(),
      payload_json: {
        ...objeto(agendamento.payload_json),
        motivo_cancelamento: motivo,
      },
    })
    .eq("id", agendamento.id)
    .eq("empresa_id", agendamento.empresa_id)
    .eq("status", "pendente");

  if (error) {
    throw new Error(`Erro ao cancelar lembrete invalido: ${error.message}`);
  }
}

async function buscarCampanhaAtiva(params: {
  empresaId: string;
  integracaoWhatsappId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_disparo_campanhas")
    .select(
      "id, agendamento_chave, status, limite_meta, limite_meta_usados, limite_meta_restantes, limite_meta_reserva_ids"
    )
    .eq("empresa_id", params.empresaId)
    .eq("integracao_whatsapp_id", params.integracaoWhatsappId)
    .in("status", STATUS_CAMPANHA_ATIVA)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao verificar campanha ativa: ${error.message}`);
  }

  return data || null;
}

async function buscarTelefonesQueConsomemLimite(params: {
  empresaId: string;
  integracaoWhatsappId: string;
  categoria: string | null;
  telefones: string[];
}) {
  const telefones = Array.from(
    new Set(
      params.telefones
        .map(normalizarTelefoneComparacao)
        .filter((telefone) => telefone.length >= 10)
    )
  );

  if (
    telefones.length === 0 ||
    String(params.categoria || "").toLowerCase() !== "utility"
  ) {
    return telefones;
  }

  const inicioJanela = new Date(
    Date.now() - 24 * 60 * 60 * 1000
  ).toISOString();
  const { data, error } = await supabaseAdmin
    .from("conversas")
    .select(
      `
        last_inbound_message_at,
        contatos:contato_id (
          telefone
        )
      `
    )
    .eq("empresa_id", params.empresaId)
    .eq("integracao_whatsapp_id", params.integracaoWhatsappId)
    .gte("last_inbound_message_at", inicioJanela);

  if (error) {
    throw new Error(`Erro ao validar janela de atendimento: ${error.message}`);
  }

  const dentroDaJanela = new Set<string>();

  for (const conversa of data || []) {
    const contato = Array.isArray(conversa.contatos)
      ? conversa.contatos[0]
      : conversa.contatos;
    const telefone = normalizarTelefoneComparacao(contato?.telefone);

    if (telefone) dentroDaJanela.add(telefone);
  }

  return telefones.filter((telefone) => !dentroDaJanela.has(telefone));
}

async function inserirItens(params: {
  campanhaId: string;
  empresaId: string;
  integracaoWhatsappId: string;
  templateId: string;
  usuarioId: string | null;
  agendamentos: AgendamentoDisparo[];
  telefonesQueConsomemLimite: Set<string>;
}) {
  const payload = params.agendamentos.map((agendamento, index) => {
    const dados = objeto(agendamento.payload_json);
    const numero = somenteDigitos(dados.numero_destino);
    const telefoneNormalizado = normalizarTelefoneItemDisparo(numero);
    const variaveis = Array.isArray(dados.variaveis)
      ? dados.variaveis.map((item) => String(item || ""))
      : [];

    return {
      campanha_id: params.campanhaId,
      empresa_id: params.empresaId,
      integracao_whatsapp_id: params.integracaoWhatsappId,
      template_id: params.templateId,
      usuario_id: params.usuarioId,
      automacao_agendamento_id: agendamento.id,
      contato_id: String(dados.contato_id || "").trim() || null,
      conversa_id: String(dados.conversa_id || "").trim() || null,
      numero,
      telefone_normalizado: telefoneNormalizado,
      nome_contato: String(dados.contato_nome || "").trim() || null,
      variaveis,
      status: "pendente",
      consome_limite_meta: params.telefonesQueConsomemLimite.has(
        normalizarTelefoneComparacao(numero)
      ),
      metadata_json: {
        ordem: index + 1,
        origem: "/api/cron/disparos_agendados",
        tipo: "disparo_template_agendado_fila",
        automacao_agendamento_id: agendamento.id,
        automacao_execucao_id: agendamento.execucao_id,
      },
    };
  });

  for (let inicio = 0; inicio < payload.length; inicio += 500) {
    const lote = payload.slice(inicio, inicio + 500);
    const { error } = await supabaseAdmin
      .from("whatsapp_disparo_itens")
      .upsert(lote, {
        onConflict: "automacao_agendamento_id",
        ignoreDuplicates: true,
      });

    if (error) {
      throw new Error(`Erro ao criar itens agendados: ${error.message}`);
    }
  }

  const itens: ItemPublicacao[] = [];

  for (let inicio = 0; inicio < params.agendamentos.length; inicio += 500) {
    const ids = params.agendamentos
      .slice(inicio, inicio + 500)
      .map((item) => item.id);
    const { data, error } = await supabaseAdmin
      .from("whatsapp_disparo_itens")
      .select("id, campanha_id, integracao_whatsapp_id")
      .eq("campanha_id", params.campanhaId)
      .in("automacao_agendamento_id", ids);

    if (error) {
      throw new Error(`Erro ao buscar itens agendados: ${error.message}`);
    }

    itens.push(...((data || []) as ItemPublicacao[]));
  }

  return itens;
}

async function enfileirarGrupo(agendamentos: AgendamentoDisparo[]) {
  const primeiro = agendamentos[0];
  const payload = objeto(primeiro.payload_json);
  const empresaId = primeiro.empresa_id;
  const integracaoWhatsappId = String(
    payload.integracao_whatsapp_id || ""
  ).trim();
  const templateId = String(payload.template_id || "").trim();
  const usuarioId =
    String(payload.usuario_id || payload.criado_por_usuario_id || "").trim() ||
    null;
  const chave = chaveCampanhaAgendada(chaveBaseAgendamento(primeiro));

  if (!integracaoWhatsappId || !templateId) {
    throw new Error(
      "Agendamento sem integracao WhatsApp ou template configurado."
    );
  }

  const campanhaAtiva = await buscarCampanhaAtiva({
    empresaId,
    integracaoWhatsappId,
  });

  if (campanhaAtiva && campanhaAtiva.agendamento_chave !== chave) {
    return {
      status: "adiado_integracao_ocupada" as const,
      campanhaId: campanhaAtiva.id,
      total: agendamentos.length,
    };
  }

  const campanhaExistente =
    campanhaAtiva?.agendamento_chave === chave ? campanhaAtiva : null;

  const [{ data: template, error: templateError }, { data: integracao, error: integracaoError }] =
    await Promise.all([
      supabaseAdmin
        .from("whatsapp_templates")
        .select(
          "id, empresa_id, integracao_whatsapp_id, nome, idioma, categoria, status, payload"
        )
        .eq("id", templateId)
        .eq("empresa_id", empresaId)
        .maybeSingle(),
      supabaseAdmin
        .from("integracoes_whatsapp")
        .select(
          "id, empresa_id, status, phone_number_status, onboarding_erro, phone_number_id, meta_messaging_limit, meta_messaging_limit_tier, meta_account_mode, quality_rating, config_json"
        )
        .eq("id", integracaoWhatsappId)
        .eq("empresa_id", empresaId)
        .maybeSingle(),
    ]);

  if (templateError || !template) {
    throw new Error(
      `Template agendado nao encontrado: ${templateError?.message || templateId}`
    );
  }

  if (String(template.status || "").toUpperCase() !== "APPROVED") {
    throw new Error("O template agendado nao esta aprovado.");
  }

  if (template.integracao_whatsapp_id !== integracaoWhatsappId) {
    throw new Error("O template agendado nao pertence a integracao informada.");
  }

  if (integracaoError || !integracao) {
    throw new Error(
      `Integracao agendada nao encontrada: ${
        integracaoError?.message || integracaoWhatsappId
      }`
    );
  }

  if (
    statusWhatsappMetaBloqueado(integracao.status) ||
    statusWhatsappMetaBloqueado(integracao.phone_number_status)
  ) {
    throw new Error(
      integracao.onboarding_erro || WHATSAPP_META_BLOCK_DESCRIPTION
    );
  }

  const telefones = agendamentos.map((agendamento) =>
    textoPayload(agendamento, "numero_destino")
  );
  const telefonesQueConsomem = await buscarTelefonesQueConsomemLimite({
    empresaId,
    integracaoWhatsappId,
    categoria: template.categoria || null,
    telefones,
  });
  let reservaIds = (campanhaExistente?.limite_meta_reserva_ids || []) as string[];
  let limite = Number(campanhaExistente?.limite_meta || 0);
  let usados = Number(campanhaExistente?.limite_meta_usados || 0);
  let restantes = Number(campanhaExistente?.limite_meta_restantes || 0);
  let campanha: { id: string; status: string | null } | null =
    campanhaExistente
      ? {
          id: campanhaExistente.id,
          status: campanhaExistente.status,
        }
      : null;
  let campanhaCriadaAgora = false;

  if (!campanha) {
    const reserva = await reservarLimiteMeta({
      empresaId,
      integracao: integracao as IntegracaoMetaLimite,
      telefones: telefonesQueConsomem,
      origem: "disparo_template_agendado_fila",
      templateId: template.id,
      templateNome: template.nome,
      usuarioId,
      metadataJson: {
        agendamento_chave: chave,
        executar_em: primeiro.executar_em,
        total_agendamentos: agendamentos.length,
        modelo_processamento: "fila_qstash",
      },
    });

    if (!reserva.ok) {
      return {
        status: "adiado_limite_meta" as const,
        campanhaId: null,
        total: agendamentos.length,
        limite: reserva.limite,
        restantes: reserva.restantes,
      };
    }

    reservaIds = reserva.reservaIds;
    limite = reserva.limite;
    usados = reserva.usados;
    restantes = reserva.restantes;

    const { data: campanhaCriada, error: campanhaError } = await supabaseAdmin
      .from("whatsapp_disparo_campanhas")
      .insert({
        empresa_id: empresaId,
        nome: nomeCampanhaAgendada({
          executarEm: primeiro.executar_em,
          total: agendamentos.length,
          nomeInformado: String(payload.nome_campanha || "").trim() || null,
        }),
        agendamento_chave: chave,
        integracao_whatsapp_id: integracaoWhatsappId,
        template_id: template.id,
        usuario_id: usuarioId,
        origem: "agendado",
        status: "pendente",
        template_nome: template.nome,
        template_idioma: template.idioma || null,
        template_categoria: template.categoria || null,
        total_itens: agendamentos.length,
        total_pendentes: agendamentos.length,
        limite_meta: limite,
        limite_meta_usados: usados,
        limite_meta_restantes: restantes,
        limite_meta_reserva_ids: reservaIds,
        processamento_modo: "qstash",
        qstash_flow_control_key: obterFlowControlKeyDisparo(
          integracaoWhatsappId
        ),
        metadata_json: {
          agendamento_chave: chave,
          executar_em: primeiro.executar_em,
          total_consumem_limite_meta: telefonesQueConsomem.length,
          template_payload:
            (template.payload || null) as TemplatePayloadDisparo | null,
        },
      })
      .select("id, status")
      .single();

    if (campanhaError || !campanhaCriada) {
      await cancelarReservas(
        reservaIds,
        "campanha agendada nao criada"
      );

      if (
        erroContemRestricao(
          campanhaError,
          "whatsapp_disparo_campanhas_integracao_ativa_uidx"
        ) ||
        erroContemRestricao(
          campanhaError,
          "whatsapp_disparo_campanhas_agendamento_chave_uidx"
        )
      ) {
        return {
          status: "ja_enfileirado_ou_integracao_ocupada" as const,
          campanhaId: null,
          total: agendamentos.length,
        };
      }

      throw new Error(
        `Erro ao criar campanha agendada: ${
          campanhaError?.message || "erro desconhecido"
        }`
      );
    }

    campanha = campanhaCriada;
    campanhaCriadaAgora = true;
  }

  try {
    const itens = await inserirItens({
      campanhaId: campanha.id,
      empresaId,
      integracaoWhatsappId,
      templateId: template.id,
      usuarioId,
      agendamentos,
      telefonesQueConsomemLimite: new Set(telefonesQueConsomem),
    });

    if (itens.length !== agendamentos.length) {
      throw new Error(
        `Foram criados ${itens.length} de ${agendamentos.length} itens agendados.`
      );
    }

    await sincronizarAgendamentosCampanha(campanha.id);

    const publicacao = await publicarItensDisparoQstash({
      campanhaId: campanha.id,
      integracaoWhatsappId,
      itens,
    });

    return {
      status: publicacao.ok
        ? ("enfileirado_qstash" as const)
        : ("enfileirado_cron_fallback" as const),
      campanhaId: campanha.id,
      total: agendamentos.length,
      publicados: publicacao.publicados,
      erroQstash: publicacao.erro,
    };
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "Erro ao criar itens agendados.";

    if (campanhaCriadaAgora) {
      await cancelarReservas(
        reservaIds,
        "itens da campanha agendada nao criados"
      );
    }

    await supabaseAdmin
      .from("whatsapp_disparo_campanhas")
      .update({
        status: "erro",
        erro: mensagem,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campanha.id);

    throw error;
  }
}

export async function enfileirarDisparosAgendadosVencidos(params?: {
  limite?: number;
}) {
  const limite = Math.min(Math.max(Number(params?.limite || 1000), 1), 2000);
  const agora = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("automacao_agendamentos")
    .select(
      "id, empresa_id, execucao_id, executar_em, status, payload_json, created_at"
    )
    .eq("status", "pendente")
    .eq("tipo_agendamento", "disparo_template")
    .lte("executar_em", agora)
    .order("executar_em", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limite);

  if (error) {
    throw new Error(`Erro ao buscar disparos agendados: ${error.message}`);
  }

  const grupos = new Map<string, AgendamentoDisparo[]>();
  let cancelados = 0;

  for (const registro of (data || []) as AgendamentoDisparo[]) {
    const validade = await validarAgendamentoOrigemAtivo(registro);

    if (!validade.ok) {
      await cancelarAgendamentoInvalido(registro, validade.motivo);
      cancelados += 1;
      continue;
    }

    const chave = chaveBaseAgendamento(registro);
    const grupo = grupos.get(chave) || [];
    grupo.push(registro);
    grupos.set(chave, grupo);
  }

  const resultados: Array<Record<string, unknown>> = [];
  let enfileirados = 0;
  let adiados = 0;
  let erros = 0;

  for (const agendamentos of grupos.values()) {
    try {
      const resultado = await enfileirarGrupo(agendamentos);
      resultados.push(resultado);

      if (String(resultado.status).startsWith("enfileirado")) {
        enfileirados += resultado.total;
      } else {
        adiados += resultado.total;
      }
    } catch (errorGrupo) {
      const mensagem =
        errorGrupo instanceof Error
          ? errorGrupo.message
          : "Erro ao enfileirar disparos agendados.";
      const ids = agendamentos.map((item) => item.id);

      console.error("[DISPARO AGENDADO FILA] Grupo com erro:", {
        ids,
        erro: mensagem,
      });

      await falharAgendamentos(ids, mensagem);
      erros += ids.length;
      resultados.push({
        status: "erro",
        total: ids.length,
        erro: mensagem,
      });
    }
  }

  return {
    encontrados: data?.length || 0,
    grupos: grupos.size,
    enfileirados,
    adiados,
    erros,
    cancelados,
    resultados,
  };
}
