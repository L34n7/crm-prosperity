import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { normalizarTelefoneBrasilParaWhatsApp } from "@/lib/contatos/normalizar-telefone";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  extrairSegredoWebhook,
  LIMITE_WEBHOOK_IMOVEIS_BYTES,
  normalizarWebhookImovel,
  sanitizarPayloadSemMidia,
  segredoWebhookValido,
  type ImovelWebhookNormalizado,
} from "@/lib/imoveis/webhook";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

export const runtime = "nodejs";

const supabase = getSupabaseAdmin();
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonObject = Record<string, unknown>;

type IntegracaoWebhook = {
  id: string;
  empresa_id: string;
  nome: string;
  canal_codigo: string;
  token_hash: string;
  status: "ativo" | "inativo";
};

type DisponibilidadeOrigem =
  | "disponivel"
  | "indisponivel"
  | "desconhecido";

type ArquivadoPor = "origem" | "usuario" | null;

type ImovelExternoExistente = Record<string, unknown> & {
  id: string;
  status: string;
  status_origem?: string | null;
  disponibilidade_origem?: DisponibilidadeOrigem | null;
  arquivado_por?: ArquivadoPor;
  snapshot_hash?: string | null;
  atualizado_origem_em?: string | null;
};

type EventoWebhook = {
  id: string;
  status: "recebido" | "processado" | "ignorado" | "erro";
  recebido_em: string;
};

type EventoNormalizadoBase = {
  eventId: string;
  eventType: string;
  externalId: string | null;
};

type ResultadoUpsert = {
  imovel: ImovelExternoExistente;
  resultado: "created" | "updated" | "unchanged" | "ignored_stale";
};

type ResultadoDelete = {
  imovel: ImovelExternoExistente | null;
  resultado: "archived" | "unchanged" | "ignored_stale" | "not_found";
};

type LeadWebhookNormalizado = {
  eventId: string;
  eventType: string;
  occurredAt: string | null;
  externalId: string;
  propertyExternalId: string | null;
  propertyCodigo: string | null;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  mensagem: string | null;
  arquivar: boolean;
};

type LeadPortalExistente = Record<string, unknown> & {
  id: string;
  status: string;
  external_id: string | null;
  imovel_externo_id: string | null;
  imovel_external_id: string | null;
};

type ResultadoLead = {
  lead: LeadPortalExistente;
  imovelExterno: ImovelExternoExistente | null;
  resultado: "created" | "updated" | "unchanged" | "archived";
};

function jsonErro(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

function normalizarIntegracaoId(valor: string) {
  const integracaoId = valor.trim();
  return UUID_REGEX.test(integracaoId) ? integracaoId : null;
}

function objetoJson(valor: unknown): JsonObject | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    return null;
  }
  return valor as JsonObject;
}

function textoCurto(valor: unknown, limite = 300) {
  if (
    typeof valor !== "string" &&
    typeof valor !== "number" &&
    typeof valor !== "boolean"
  ) {
    return null;
  }

  const resultado = String(valor).trim();
  return resultado ? resultado.slice(0, limite) : null;
}

function primeiroTextoDireto(
  registro: JsonObject | null,
  chaves: string[],
  limite = 300
) {
  if (!registro) return null;

  for (const chave of chaves) {
    const valor = textoCurto(registro[chave], limite);
    if (valor) return valor;
  }

  return null;
}

function normalizarMarcador(valor: unknown) {
  return String(valor ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizarData(valor: unknown) {
  const entrada = textoCurto(valor, 100);
  if (!entrada) return null;
  const data = new Date(entrada);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

function hashTexto(valor: string) {
  return createHash("sha256").update(valor).digest("hex");
}

function extrairTipoEvento(payloadDesconhecido: unknown) {
  const envelope = objetoJson(payloadDesconhecido);
  return normalizarMarcador(
    primeiroTextoDireto(
      envelope,
      ["event_type", "eventType", "evento", "event", "action", "acao", "topic"],
      200
    ) ?? ""
  );
}

function ehEventoLead(payloadDesconhecido: unknown) {
  const envelope = objetoJson(payloadDesconhecido);
  const data = objetoJson(envelope?.data);
  const eventType = extrairTipoEvento(payloadDesconhecido);

  return (
    eventType.startsWith("lead.") ||
    eventType.startsWith("lead_") ||
    Boolean(objetoJson(envelope?.lead) ?? objetoJson(data?.lead))
  );
}

function extrairMetadadosEventoRejeitado(
  payloadDesconhecido: unknown,
  payloadBruto: string,
  eventTypePadrao: string
) {
  const envelope = objetoJson(payloadDesconhecido);
  const data = objetoJson(envelope?.data);
  const imovel =
    objetoJson(envelope?.property) ??
    objetoJson(envelope?.imovel) ??
    objetoJson(envelope?.listing) ??
    objetoJson(envelope?.anuncio) ??
    objetoJson(data?.property) ??
    objetoJson(data?.imovel) ??
    objetoJson(data?.listing) ??
    objetoJson(data?.anuncio) ??
    data;

  const eventIdInformado = primeiroTextoDireto(envelope, [
    "event_id",
    "eventId",
    "evento_id",
    "notification_id",
    "webhook_id",
  ]);
  const eventType =
    primeiroTextoDireto(
      envelope,
      ["event_type", "eventType", "evento", "event", "action", "acao", "topic"],
      200
    ) ?? eventTypePadrao;
  const externalId = primeiroTextoDireto(imovel, [
    "external_id",
    "externalId",
    "listing_id",
    "property_id",
    "imovel_id",
    "id",
    "codigo",
    "code",
  ]);
  const hashBase = payloadBruto || JSON.stringify(payloadDesconhecido ?? null);
  const hash = hashTexto(hashBase);
  const prefixo = eventIdInformado
    ? `${eventIdInformado.replace(/\s+/g, "_").slice(0, 120)}_`
    : "";

  return {
    eventId: `rejected_${prefixo}${hash.slice(0, 32)}`,
    eventType,
    externalId,
    hash,
  };
}

function payloadRejeitadoParaPersistencia(
  payloadDesconhecido: unknown,
  payloadBruto: string,
  hash: string
): JsonObject {
  const objeto = objetoJson(payloadDesconhecido);
  if (objeto) {
    return sanitizarPayloadSemMidia(objeto);
  }

  if (payloadDesconhecido !== undefined && payloadDesconhecido !== null) {
    return {
      _payload_recebido: payloadDesconhecido,
      _payload_sha256: hash,
    };
  }

  return {
    _raw_body_preview: payloadBruto.slice(0, 100_000),
    _raw_body_bytes: Buffer.byteLength(payloadBruto, "utf8"),
    _raw_body_sha256: hash,
  };
}

async function registrarEventoRejeitadoSeguro(params: {
  integracao: IntegracaoWebhook;
  payloadDesconhecido: unknown;
  payloadBruto: string;
  mensagem: string;
  httpStatus: number;
  eventTypePadrao: string;
}) {
  try {
    const metadata = extrairMetadadosEventoRejeitado(
      params.payloadDesconhecido,
      params.payloadBruto,
      params.eventTypePadrao
    );
    const agora = new Date().toISOString();
    const payload = payloadRejeitadoParaPersistencia(
      params.payloadDesconhecido,
      params.payloadBruto,
      metadata.hash
    );

    const { error } = await supabase
      .from("imobiliario_webhook_eventos")
      .upsert(
        {
          empresa_id: params.integracao.empresa_id,
          integracao_id: params.integracao.id,
          event_id: metadata.eventId,
          event_type: metadata.eventType,
          external_id: metadata.externalId,
          status: "erro",
          payload,
          erro: `HTTP ${params.httpStatus}: ${params.mensagem}`.slice(0, 5000),
          recebido_em: agora,
          processado_em: agora,
        },
        { onConflict: "integracao_id,event_id" }
      );

    if (error) throw new Error(error.message);

    const { error: integracaoError } = await supabase
      .from("imobiliario_integracoes_webhook")
      .update({ ultimo_evento_em: agora })
      .eq("id", params.integracao.id);

    if (integracaoError) {
      console.error(
        "[WEBHOOK IMOVEIS] Falha ao atualizar ultimo evento apos rejeicao:",
        integracaoError
      );
    }
  } catch (error) {
    console.error(
      "[WEBHOOK IMOVEIS] Falha ao persistir payload rejeitado:",
      error
    );
  }
}

function normalizarWebhookLead(
  payloadDesconhecido: unknown,
  payloadBruto: string
): LeadWebhookNormalizado {
  const envelope = objetoJson(payloadDesconhecido);
  if (!envelope) {
    throw new Error("O corpo do webhook deve ser um objeto JSON.");
  }

  const data = objetoJson(envelope.data);
  const lead = objetoJson(envelope.lead) ?? objetoJson(data?.lead);
  if (!lead) {
    throw new Error("O objeto lead e obrigatorio para eventos de lead.");
  }

  const property =
    objetoJson(envelope.property) ??
    objetoJson(envelope.imovel) ??
    objetoJson(data?.property) ??
    objetoJson(data?.imovel);

  const eventType = extrairTipoEvento(envelope) || "lead.upsert";
  const leadExternalId = primeiroTextoDireto(lead, [
    "external_id",
    "externalId",
    "lead_id",
    "leadId",
    "id",
  ]);

  if (!leadExternalId) {
    throw new Error("O identificador externo do lead e obrigatorio.");
  }

  const propertyExternalId = primeiroTextoDireto(property, [
    "external_id",
    "externalId",
    "listing_id",
    "property_id",
    "imovel_id",
    "id",
  ]);
  const propertyCodigo = primeiroTextoDireto(property, [
    "codigo",
    "code",
    "reference",
    "referencia",
  ]);
  const nome = primeiroTextoDireto(lead, ["nome", "name", "full_name"], 500);
  const email = primeiroTextoDireto(lead, ["email", "e_mail"], 500)?.toLowerCase() ?? null;
  const telefoneOriginal = primeiroTextoDireto(
    lead,
    ["telefone", "phone", "celular", "mobile", "whatsapp"],
    100
  );
  const telefone = telefoneOriginal
    ? normalizarTelefoneBrasilParaWhatsApp(telefoneOriginal) || telefoneOriginal
    : null;
  const mensagem = primeiroTextoDireto(
    lead,
    ["mensagem", "message", "observacao", "notes"],
    20_000
  );

  if (!nome && !email && !telefone) {
    throw new Error("O lead precisa informar nome, email ou telefone.");
  }

  const eventIdInformado = primeiroTextoDireto(envelope, [
    "event_id",
    "eventId",
    "evento_id",
    "notification_id",
    "webhook_id",
  ]);
  const hash = hashTexto(payloadBruto || JSON.stringify(payloadDesconhecido));
  const eventId =
    eventIdInformado ??
    `lead_${eventType.replace(/[^a-z0-9_.-]/gi, "_")}_${leadExternalId.slice(0, 80)}_${hash.slice(0, 20)}`;
  const occurredAt = normalizarData(
    envelope.occurred_at ??
      envelope.occurredAt ??
      envelope.timestamp ??
      envelope.updated_at ??
      lead.updated_at ??
      lead.created_at
  );
  const marcador = normalizarMarcador(eventType);

  return {
    eventId,
    eventType,
    occurredAt,
    externalId: leadExternalId,
    propertyExternalId,
    propertyCodigo,
    nome,
    email,
    telefone,
    mensagem,
    arquivar:
      marcador.includes("deleted") ||
      marcador.includes("removed") ||
      marcador.includes("archived") ||
      marcador.includes("excluido") ||
      marcador.includes("removido"),
  };
}

function valorExistente(
  novoValor: unknown,
  existente: Record<string, unknown> | null,
  campo: string
) {
  if (novoValor !== null && novoValor !== undefined) return novoValor;
  return existente?.[campo] ?? null;
}

function numeroExistente(
  novoValor: number | null,
  existente: Record<string, unknown> | null,
  campo: string
) {
  const valor = valorExistente(novoValor, existente, campo);
  if (valor === null || valor === undefined || valor === "") return null;
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : null;
}

function coordenadaValida(valor: number | null, minimo: number, maximo: number) {
  return valor !== null && valor >= minimo && valor <= maximo ? valor : null;
}

function normalizarDisponibilidadeOrigem(
  statusOrigem: unknown
): DisponibilidadeOrigem {
  const status = normalizarMarcador(statusOrigem);

  if (
    ["disponivel", "ativo", "active", "available", "publicado", "published"].includes(
      status
    )
  ) {
    return "disponivel";
  }

  if (
    [
      "indisponivel",
      "inativo",
      "inactive",
      "unavailable",
      "vendido",
      "sold",
      "alugado",
      "rented",
      "locado",
      "removed",
      "removido",
      "arquivado",
      "archived",
      "excluido",
      "deleted",
      "off_market",
    ].includes(status)
  ) {
    return "indisponivel";
  }

  return "desconhecido";
}

function eventoMaisAntigo(
  occurredAt: string | null,
  existente: ImovelExternoExistente | null
) {
  const atual = String(existente?.atualizado_origem_em ?? "").trim();
  if (!occurredAt || !atual) return false;

  const recebido = Date.parse(occurredAt);
  const armazenado = Date.parse(atual);
  return (
    Number.isFinite(recebido) &&
    Number.isFinite(armazenado) &&
    recebido < armazenado
  );
}

function canonicalizarSnapshot(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonicalizarSnapshot);

  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>)
        .sort(([chaveA], [chaveB]) => chaveA.localeCompare(chaveB))
        .map(([chave, item]) => [chave, canonicalizarSnapshot(item)])
    );
  }

  return valor;
}

function calcularSnapshotHash(dados: Record<string, unknown>) {
  return hashTexto(JSON.stringify(canonicalizarSnapshot(dados)));
}

function estadoInternoAposOrigem(
  existente: ImovelExternoExistente | null,
  disponibilidade: DisponibilidadeOrigem
) {
  const statusAtual = String(existente?.status ?? "novo").trim() || "novo";
  const arquivadoPor =
    existente?.arquivado_por === "origem" ||
    existente?.arquivado_por === "usuario"
      ? existente.arquivado_por
      : null;

  if (disponibilidade === "indisponivel") {
    return {
      status: "arquivado",
      arquivadoPor:
        statusAtual === "arquivado" ? arquivadoPor : ("origem" as const),
    };
  }

  if (
    disponibilidade === "disponivel" &&
    statusAtual === "arquivado" &&
    arquivadoPor === "origem"
  ) {
    return { status: "novo", arquivadoPor: null };
  }

  return { status: statusAtual, arquivadoPor };
}

async function buscarIntegracao(integracaoId: string) {
  const { data, error } = await supabase
    .from("imobiliario_integracoes_webhook")
    .select("id, empresa_id, nome, canal_codigo, token_hash, status")
    .eq("id", integracaoId)
    .eq("status", "ativo")
    .maybeSingle<IntegracaoWebhook>();

  if (error) throw new Error(`Erro ao buscar integracao: ${error.message}`);
  return data;
}

async function registrarEvento(params: {
  integracao: IntegracaoWebhook;
  normalizado: EventoNormalizadoBase;
  payload: JsonObject;
}) {
  const { data, error } = await supabase
    .from("imobiliario_webhook_eventos")
    .insert({
      empresa_id: params.integracao.empresa_id,
      integracao_id: params.integracao.id,
      event_id: params.normalizado.eventId,
      event_type: params.normalizado.eventType,
      external_id: params.normalizado.externalId,
      status: "recebido",
      payload: params.payload,
    })
    .select("id, status, recebido_em")
    .single<EventoWebhook>();

  if (error?.code === "23505") {
    const { data: existente, error: buscaError } = await supabase
      .from("imobiliario_webhook_eventos")
      .select("id, status, recebido_em")
      .eq("integracao_id", params.integracao.id)
      .eq("event_id", params.normalizado.eventId)
      .maybeSingle<EventoWebhook>();

    if (buscaError || !existente) {
      throw new Error(
        `Erro ao buscar evento repetido: ${
          buscaError?.message ?? "evento nao encontrado"
        }`
      );
    }

    const recebidoEm = new Date(existente.recebido_em).getTime();
    const recebimentoExpirado =
      Number.isFinite(recebidoEm) && Date.now() - recebidoEm > 5 * 60_000;
    const deveReprocessar =
      existente.status === "erro" ||
      (existente.status === "recebido" && recebimentoExpirado);

    if (!deveReprocessar) {
      return { duplicado: true as const, evento: null };
    }

    const agora = new Date().toISOString();
    const { data: retomado, error: retomadaError } = await supabase
      .from("imobiliario_webhook_eventos")
      .update({
        event_type: params.normalizado.eventType,
        external_id: params.normalizado.externalId,
        status: "recebido",
        payload: params.payload,
        erro: null,
        recebido_em: agora,
        processado_em: null,
      })
      .eq("id", existente.id)
      .eq("status", existente.status)
      .eq("recebido_em", existente.recebido_em)
      .select("id, status, recebido_em")
      .maybeSingle<EventoWebhook>();

    if (retomadaError) {
      throw new Error(`Erro ao retomar evento: ${retomadaError.message}`);
    }

    if (!retomado) return { duplicado: true as const, evento: null };
    return { duplicado: false as const, evento: retomado };
  }

  if (error || !data) {
    throw new Error(
      `Erro ao registrar evento: ${error?.message ?? "evento nao salvo"}`
    );
  }

  return { duplicado: false as const, evento: data };
}

async function atualizarEvento(
  eventoId: string,
  status: "processado" | "ignorado" | "erro",
  erro?: string | null
) {
  const { error } = await supabase
    .from("imobiliario_webhook_eventos")
    .update({
      status,
      erro: erro?.slice(0, 5000) ?? null,
      processado_em: new Date().toISOString(),
    })
    .eq("id", eventoId);

  if (error) {
    console.error("[WEBHOOK IMOVEIS] Falha ao atualizar evento:", error);
  }
}

async function atualizarUltimoEventoIntegracao(integracaoId: string) {
  const { error } = await supabase
    .from("imobiliario_integracoes_webhook")
    .update({ ultimo_evento_em: new Date().toISOString() })
    .eq("id", integracaoId);

  if (error) {
    console.error("[WEBHOOK IMOVEIS] Falha ao atualizar ultimo evento:", error);
  }
}

async function buscarImovelExterno(
  integracao: IntegracaoWebhook,
  externalId: string
) {
  const { data, error } = await supabase
    .from("imoveis_externos")
    .select("*")
    .eq("integracao_id", integracao.id)
    .eq("external_id", externalId)
    .maybeSingle<ImovelExternoExistente>();

  if (error) throw new Error(`Erro ao buscar imovel externo: ${error.message}`);
  return data;
}

async function vincularLeadsPendentesAoImovel(
  integracao: IntegracaoWebhook,
  imovel: ImovelExternoExistente,
  propertyExternalId: string
) {
  const { error } = await supabase
    .from("imovel_leads_portal")
    .update({ imovel_externo_id: imovel.id })
    .eq("empresa_id", integracao.empresa_id)
    .eq("integracao_id", integracao.id)
    .eq("imovel_external_id", propertyExternalId)
    .is("imovel_externo_id", null);

  if (error) {
    console.error("[WEBHOOK IMOVEIS] Falha ao vincular leads pendentes:", error);
  }
}

async function arquivarImovelExterno(params: {
  integracao: IntegracaoWebhook;
  normalizado: ImovelWebhookNormalizado;
  payload: JsonObject;
}): Promise<ResultadoDelete> {
  const existente = await buscarImovelExterno(
    params.integracao,
    params.normalizado.externalId
  );

  if (!existente) return { imovel: null, resultado: "not_found" };
  if (eventoMaisAntigo(params.normalizado.occurredAt, existente)) {
    return { imovel: existente, resultado: "ignored_stale" };
  }

  const statusOrigem =
    params.normalizado.imovel.statusOrigem ?? "removido_na_origem";
  const snapshotHash = calcularSnapshotHash({
    external_id: params.normalizado.externalId,
    status_origem: statusOrigem,
    disponibilidade_origem: "indisponivel",
  });
  const arquivadoPor: ArquivadoPor =
    existente.status === "arquivado"
      ? existente.arquivado_por === "origem" ||
        existente.arquivado_por === "usuario"
        ? existente.arquivado_por
        : null
      : "origem";

  if (
    existente.snapshot_hash === snapshotHash &&
    existente.status === "arquivado" &&
    existente.disponibilidade_origem === "indisponivel"
  ) {
    return { imovel: existente, resultado: "unchanged" };
  }

  const { data, error } = await supabase
    .from("imoveis_externos")
    .update({
      status: "arquivado",
      status_origem: statusOrigem,
      disponibilidade_origem: "indisponivel",
      arquivado_por: arquivadoPor,
      snapshot_hash: snapshotHash,
      payload: params.payload,
      atualizado_origem_em:
        params.normalizado.occurredAt ??
        existente.atualizado_origem_em ??
        null,
      recebido_em: new Date().toISOString(),
    })
    .eq("integracao_id", params.integracao.id)
    .eq("id", existente.id)
    .select("*")
    .single<ImovelExternoExistente>();

  if (error) throw new Error(`Erro ao arquivar imovel externo: ${error.message}`);
  return { imovel: data, resultado: "archived" };
}

async function salvarImovelExterno(params: {
  integracao: IntegracaoWebhook;
  normalizado: ImovelWebhookNormalizado;
  payload: JsonObject;
}): Promise<ResultadoUpsert> {
  const { integracao, normalizado, payload } = params;
  const imovel = normalizado.imovel;
  const existente = await buscarImovelExterno(integracao, normalizado.externalId);

  if (eventoMaisAntigo(normalizado.occurredAt, existente)) {
    return {
      imovel: existente as ImovelExternoExistente,
      resultado: "ignored_stale",
    };
  }

  const imagemUrls =
    imovel.imagemUrls.length > 0
      ? imovel.imagemUrls
      : Array.isArray(existente?.imagem_urls)
        ? (existente.imagem_urls as string[])
        : [];
  const statusOrigem = valorExistente(
    imovel.statusOrigem,
    existente,
    "status_origem"
  );
  const disponibilidadeOrigem = normalizarDisponibilidadeOrigem(statusOrigem);
  const estadoInterno = estadoInternoAposOrigem(existente, disponibilidadeOrigem);

  const dadosOrigem = {
    empresa_id: integracao.empresa_id,
    integracao_id: integracao.id,
    canal_codigo: integracao.canal_codigo,
    canal_nome: integracao.nome,
    external_id: normalizado.externalId,
    external_url: valorExistente(imovel.externalUrl, existente, "external_url"),
    codigo: valorExistente(imovel.codigo, existente, "codigo"),
    titulo: valorExistente(imovel.titulo, existente, "titulo"),
    tipo: valorExistente(imovel.tipo, existente, "tipo"),
    finalidade: valorExistente(imovel.finalidade, existente, "finalidade"),
    status_origem: statusOrigem,
    disponibilidade_origem: disponibilidadeOrigem,
    valor: numeroExistente(imovel.valor, existente, "valor"),
    valor_venda: numeroExistente(imovel.valorVenda, existente, "valor_venda"),
    valor_locacao: numeroExistente(
      imovel.valorLocacao,
      existente,
      "valor_locacao"
    ),
    valor_condominio: numeroExistente(
      imovel.valorCondominio,
      existente,
      "valor_condominio"
    ),
    valor_iptu: numeroExistente(imovel.valorIptu, existente, "valor_iptu"),
    cep: valorExistente(imovel.cep, existente, "cep"),
    logradouro: valorExistente(imovel.logradouro, existente, "logradouro"),
    numero: valorExistente(imovel.numero, existente, "numero"),
    complemento: valorExistente(imovel.complemento, existente, "complemento"),
    bairro: valorExistente(imovel.bairro, existente, "bairro"),
    cidade: valorExistente(imovel.cidade, existente, "cidade"),
    estado: valorExistente(imovel.estado, existente, "estado"),
    quartos: numeroExistente(imovel.quartos, existente, "quartos"),
    suites: numeroExistente(imovel.suites, existente, "suites"),
    banheiros: numeroExistente(imovel.banheiros, existente, "banheiros"),
    vagas: numeroExistente(imovel.vagas, existente, "vagas"),
    area_m2: numeroExistente(imovel.areaM2, existente, "area_m2"),
    area_util_m2: numeroExistente(imovel.areaUtilM2, existente, "area_util_m2"),
    area_total_m2: numeroExistente(
      imovel.areaTotalM2,
      existente,
      "area_total_m2"
    ),
    area_terreno_m2: numeroExistente(
      imovel.areaTerrenoM2,
      existente,
      "area_terreno_m2"
    ),
    latitude: numeroExistente(
      coordenadaValida(imovel.latitude, -90, 90),
      existente,
      "latitude"
    ),
    longitude: numeroExistente(
      coordenadaValida(imovel.longitude, -180, 180),
      existente,
      "longitude"
    ),
    descricao: valorExistente(imovel.descricao, existente, "descricao"),
    caracteristicas:
      Object.keys(imovel.caracteristicas).length > 0
        ? imovel.caracteristicas
        : (existente?.caracteristicas ?? {}),
    imagem_url:
      imovel.imagemUrl || String(existente?.imagem_url ?? "").trim() || null,
    imagem_urls: imagemUrls,
  };

  const snapshotHash = calcularSnapshotHash(dadosOrigem);
  const dados = {
    ...dadosOrigem,
    status: estadoInterno.status,
    arquivado_por: estadoInterno.arquivadoPor,
    snapshot_hash: snapshotHash,
    payload,
    atualizado_origem_em:
      normalizado.occurredAt ?? existente?.atualizado_origem_em ?? null,
    recebido_em: new Date().toISOString(),
  };

  if (
    existente &&
    existente.snapshot_hash === snapshotHash &&
    existente.status === estadoInterno.status &&
    (existente.arquivado_por ?? null) === estadoInterno.arquivadoPor
  ) {
    await vincularLeadsPendentesAoImovel(
      integracao,
      existente,
      normalizado.externalId
    );
    return { imovel: existente, resultado: "unchanged" };
  }

  if (existente) {
    const { data, error } = await supabase
      .from("imoveis_externos")
      .update(dados)
      .eq("integracao_id", integracao.id)
      .eq("id", existente.id)
      .select("*")
      .single<ImovelExternoExistente>();

    if (error) throw new Error(`Erro ao atualizar imovel externo: ${error.message}`);
    await vincularLeadsPendentesAoImovel(integracao, data, normalizado.externalId);
    return { imovel: data, resultado: "updated" };
  }

  const { data, error } = await supabase
    .from("imoveis_externos")
    .insert(dados)
    .select("*")
    .single<ImovelExternoExistente>();

  if (error?.code === "23505") {
    const concorrente = await buscarImovelExterno(integracao, normalizado.externalId);

    if (concorrente) {
      if (eventoMaisAntigo(normalizado.occurredAt, concorrente)) {
        return { imovel: concorrente, resultado: "ignored_stale" };
      }

      const { data: atualizado, error: updateError } = await supabase
        .from("imoveis_externos")
        .update(dados)
        .eq("integracao_id", integracao.id)
        .eq("id", concorrente.id)
        .select("*")
        .single<ImovelExternoExistente>();

      if (updateError) {
        throw new Error(
          `Erro ao atualizar imovel concorrente: ${updateError.message}`
        );
      }

      await vincularLeadsPendentesAoImovel(
        integracao,
        atualizado,
        normalizado.externalId
      );
      return { imovel: atualizado, resultado: "updated" };
    }
  }

  if (error) throw new Error(`Erro ao criar imovel externo: ${error.message}`);
  await vincularLeadsPendentesAoImovel(integracao, data, normalizado.externalId);
  return { imovel: data, resultado: "created" };
}

function textoPersistido(valor: unknown) {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  return texto || null;
}

function normalizarEmailPersistido(valor: unknown) {
  return textoPersistido(valor)?.toLowerCase() ?? null;
}

async function buscarLeadPortal(
  integracao: IntegracaoWebhook,
  externalId: string
) {
  const { data, error } = await supabase
    .from("imovel_leads_portal")
    .select("*")
    .eq("integracao_id", integracao.id)
    .eq("external_id", externalId)
    .maybeSingle<LeadPortalExistente>();

  if (error) throw new Error(`Erro ao buscar lead imobiliario: ${error.message}`);
  return data;
}

async function salvarLeadPortal(params: {
  integracao: IntegracaoWebhook;
  normalizado: LeadWebhookNormalizado;
  payload: JsonObject;
}): Promise<ResultadoLead> {
  const { integracao, normalizado, payload } = params;
  const existente = await buscarLeadPortal(integracao, normalizado.externalId);
  const propertyExternalId =
    normalizado.propertyExternalId ??
    textoPersistido(existente?.imovel_external_id) ??
    null;
  const imovelExterno = propertyExternalId
    ? await buscarImovelExterno(integracao, propertyExternalId)
    : null;
  const imovelExternoId =
    imovelExterno?.id ??
    (normalizado.propertyExternalId
      ? null
      : (existente?.imovel_externo_id ?? null));
  const statusAtual = textoPersistido(existente?.status) ?? "novo";
  const status = normalizado.arquivar ? "arquivado" : statusAtual;
  const nome = textoPersistido(normalizado.nome) ?? textoPersistido(existente?.nome);
  const email =
    normalizarEmailPersistido(normalizado.email) ??
    normalizarEmailPersistido(existente?.email);
  const telefone =
    textoPersistido(normalizado.telefone) ?? textoPersistido(existente?.telefone);
  const mensagem =
    textoPersistido(normalizado.mensagem) ?? textoPersistido(existente?.mensagem);

  const dadosComparaveis = {
    integracao_id: integracao.id,
    external_id: normalizado.externalId,
    imovel_externo_id: imovelExternoId,
    imovel_external_id: propertyExternalId,
    canal_codigo: integracao.canal_codigo,
    canal_nome: integracao.nome,
    nome,
    email,
    telefone,
    mensagem,
    status,
  };

  if (existente) {
    const semMudanca = Object.entries(dadosComparaveis).every(
      ([campo, valor]) => (existente[campo] ?? null) === (valor ?? null)
    );

    if (semMudanca) {
      return {
        lead: existente,
        imovelExterno,
        resultado: normalizado.arquivar ? "archived" : "unchanged",
      };
    }

    const { data, error } = await supabase
      .from("imovel_leads_portal")
      .update({
        ...dadosComparaveis,
        origem_payload: payload,
        recebido_em: new Date().toISOString(),
      })
      .eq("id", existente.id)
      .eq("empresa_id", integracao.empresa_id)
      .select("*")
      .single<LeadPortalExistente>();

    if (error) throw new Error(`Erro ao atualizar lead imobiliario: ${error.message}`);

    return {
      lead: data,
      imovelExterno,
      resultado: normalizado.arquivar ? "archived" : "updated",
    };
  }

  const dadosInsert = {
    empresa_id: integracao.empresa_id,
    imovel_id: null,
    publicacao_id: null,
    integracao_id: integracao.id,
    external_id: normalizado.externalId,
    imovel_externo_id: imovelExternoId,
    imovel_external_id: propertyExternalId,
    canal_codigo: integracao.canal_codigo,
    canal_nome: integracao.nome,
    nome: nome ?? "Lead sem nome",
    email,
    telefone,
    mensagem,
    status: normalizado.arquivar ? "arquivado" : "novo",
    origem_payload: payload,
    recebido_em: new Date().toISOString(),
    created_by: null,
  };

  const { data, error } = await supabase
    .from("imovel_leads_portal")
    .insert(dadosInsert)
    .select("*")
    .single<LeadPortalExistente>();

  if (error?.code === "23505") {
    const concorrente = await buscarLeadPortal(integracao, normalizado.externalId);
    if (concorrente) {
      const { data: atualizado, error: updateError } = await supabase
        .from("imovel_leads_portal")
        .update({
          ...dadosComparaveis,
          origem_payload: payload,
          recebido_em: new Date().toISOString(),
        })
        .eq("id", concorrente.id)
        .eq("empresa_id", integracao.empresa_id)
        .select("*")
        .single<LeadPortalExistente>();

      if (updateError) {
        throw new Error(`Erro ao atualizar lead concorrente: ${updateError.message}`);
      }

      return {
        lead: atualizado,
        imovelExterno,
        resultado: normalizado.arquivar ? "archived" : "updated",
      };
    }
  }

  if (error) throw new Error(`Erro ao criar lead imobiliario: ${error.message}`);

  return {
    lead: data,
    imovelExterno,
    resultado: normalizado.arquivar ? "archived" : "created",
  };
}

async function processarEventoLead(params: {
  request: Request;
  integracao: IntegracaoWebhook;
  payloadDesconhecido: unknown;
  payloadBruto: string;
}) {
  const { request, integracao, payloadDesconhecido, payloadBruto } = params;
  let normalizado: LeadWebhookNormalizado;

  try {
    normalizado = normalizarWebhookLead(payloadDesconhecido, payloadBruto);
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "Payload de lead invalido.";

    await registrarEventoRejeitadoSeguro({
      integracao,
      payloadDesconhecido,
      payloadBruto,
      mensagem,
      httpStatus: 422,
      eventTypePadrao: "lead.rejected",
    });

    return jsonErro(mensagem, 422);
  }

  const payloadObjeto = payloadDesconhecido as JsonObject;
  const payload = sanitizarPayloadSemMidia(payloadObjeto);
  const registroEvento = await registrarEvento({
    integracao,
    normalizado: {
      eventId: normalizado.eventId,
      eventType: normalizado.eventType,
      externalId: normalizado.propertyExternalId ?? normalizado.externalId,
    },
    payload,
  });

  if (registroEvento.duplicado) {
    return NextResponse.json({
      ok: true,
      duplicated: true,
      event_id: normalizado.eventId,
      lead_external_id: normalizado.externalId,
      property_external_id: normalizado.propertyExternalId,
    });
  }

  const evento = registroEvento.evento;

  try {
    const resultado = await salvarLeadPortal({ integracao, normalizado, payload });
    const statusEvento = resultado.resultado === "unchanged" ? "ignorado" : "processado";

    await Promise.all([
      atualizarEvento(evento.id, statusEvento),
      atualizarUltimoEventoIntegracao(integracao.id),
    ]);

    if (resultado.resultado !== "unchanged") {
      const auditMeta = getRequestAuditMetadata(request);
      await registrarLogAuditoriaSeguro({
        empresa_id: integracao.empresa_id,
        categoria: "imobiliario",
        entidade: "imovel_lead_portal",
        entidade_id: resultado.lead.id,
        acao:
          resultado.resultado === "created"
            ? "lead_portal_recebido_webhook"
            : resultado.resultado === "archived"
              ? "lead_portal_arquivado_webhook"
              : "lead_portal_atualizado_webhook",
        descricao: `${integracao.nome}: ${normalizado.eventType}`,
        metadata: {
          integracao_id: integracao.id,
          event_id: normalizado.eventId,
          lead_external_id: normalizado.externalId,
          property_external_id: normalizado.propertyExternalId,
          imovel_externo_id: resultado.imovelExterno?.id ?? null,
          resultado: resultado.resultado,
        },
        ip: auditMeta.ip,
        user_agent: auditMeta.user_agent,
      });
    }

    return NextResponse.json({
      ok: true,
      duplicated: false,
      action: normalizado.arquivar ? "lead_archived" : "lead_upserted",
      processing_result: resultado.resultado,
      event_id: normalizado.eventId,
      lead_external_id: normalizado.externalId,
      property_external_id: normalizado.propertyExternalId,
      lead_id: resultado.lead.id,
      imovel_externo_id: resultado.imovelExterno?.id ?? null,
      property_linked: Boolean(resultado.imovelExterno?.id),
    });
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "Erro ao processar lead.";
    await atualizarEvento(evento.id, "erro", mensagem);
    throw error;
  }
}

async function processarEventoImovel(params: {
  request: Request;
  integracao: IntegracaoWebhook;
  payloadDesconhecido: unknown;
  payloadBruto: string;
}) {
  const { request, integracao, payloadDesconhecido, payloadBruto } = params;
  let normalizado: ImovelWebhookNormalizado;

  try {
    normalizado = normalizarWebhookImovel(payloadDesconhecido, payloadBruto);
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Payload invalido.";

    await registrarEventoRejeitadoSeguro({
      integracao,
      payloadDesconhecido,
      payloadBruto,
      mensagem,
      httpStatus: 422,
      eventTypePadrao: "payload.rejected",
    });

    return jsonErro(mensagem, 422);
  }

  const payloadObjeto = payloadDesconhecido as JsonObject;
  const payload = sanitizarPayloadSemMidia(payloadObjeto);
  const registroEvento = await registrarEvento({
    integracao,
    normalizado: {
      eventId: normalizado.eventId,
      eventType: normalizado.eventType,
      externalId: normalizado.externalId,
    },
    payload,
  });

  if (registroEvento.duplicado) {
    return NextResponse.json({
      ok: true,
      duplicated: true,
      event_id: normalizado.eventId,
      external_id: normalizado.externalId,
    });
  }

  const evento = registroEvento.evento;

  try {
    let imovelExterno: ImovelExternoExistente | null = null;
    let statusEvento: "processado" | "ignorado" = "processado";
    let resultadoProcessamento:
      | ResultadoUpsert["resultado"]
      | ResultadoDelete["resultado"] = "updated";
    let deveAuditar = false;

    if (normalizado.action === "delete") {
      const resultado = await arquivarImovelExterno({
        integracao,
        normalizado,
        payload,
      });
      imovelExterno = resultado.imovel;
      resultadoProcessamento = resultado.resultado;
      statusEvento = resultado.resultado === "archived" ? "processado" : "ignorado";
      deveAuditar = resultado.resultado === "archived";
    } else {
      const resultado = await salvarImovelExterno({ integracao, normalizado, payload });
      imovelExterno = resultado.imovel;
      resultadoProcessamento = resultado.resultado;
      statusEvento =
        resultado.resultado === "created" || resultado.resultado === "updated"
          ? "processado"
          : "ignorado";
      deveAuditar =
        resultado.resultado === "created" || resultado.resultado === "updated";
    }

    await Promise.all([
      atualizarEvento(evento.id, statusEvento),
      atualizarUltimoEventoIntegracao(integracao.id),
    ]);

    if (imovelExterno && deveAuditar) {
      const auditMeta = getRequestAuditMetadata(request);
      await registrarLogAuditoriaSeguro({
        empresa_id: integracao.empresa_id,
        categoria: "imobiliario",
        entidade: "imovel_externo",
        entidade_id: imovelExterno.id,
        acao:
          normalizado.action === "delete"
            ? "imovel_externo_arquivado_webhook"
            : "imovel_externo_recebido_webhook",
        descricao: `${integracao.nome}: ${normalizado.eventType}`,
        metadata: {
          integracao_id: integracao.id,
          event_id: normalizado.eventId,
          external_id: normalizado.externalId,
          resultado: resultadoProcessamento,
        },
        ip: auditMeta.ip,
        user_agent: auditMeta.user_agent,
      });
    }

    return NextResponse.json({
      ok: true,
      duplicated: false,
      action:
        normalizado.action === "delete"
          ? resultadoProcessamento === "archived"
            ? "archived"
            : "ignored"
          : "upserted",
      processing_result: resultadoProcessamento,
      event_id: normalizado.eventId,
      external_id: normalizado.externalId,
      imovel_externo_id: imovelExterno?.id ?? null,
      images_received_as_urls: normalizado.imovel.imagemUrls.length,
    });
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "Erro ao processar evento.";
    await atualizarEvento(evento.id, "erro", mensagem);
    throw error;
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Webhook imobiliario disponivel. Envie eventos de imoveis ou leads por POST.",
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ integracaoId: string }> }
) {
  const { integracaoId } = await context.params;
  const integracaoIdValido = normalizarIntegracaoId(integracaoId);

  if (!integracaoIdValido) {
    return jsonErro(
      "URL do webhook invalida. Use somente o ID da integracao na URL e envie o segredo no cabecalho Authorization: Bearer ou X-Webhook-Token.",
      400
    );
  }

  try {
    const integracao = await buscarIntegracao(integracaoIdValido);
    if (!integracao) return jsonErro("Credenciais invalidas.", 401);

    const segredo = extrairSegredoWebhook(request.headers);
    if (!segredo || !segredoWebhookValido(segredo, integracao.token_hash)) {
      return jsonErro("Credenciais invalidas.", 401);
    }

    const contentType = request.headers.get("content-type") ?? "";
    const contentLength = Number(request.headers.get("content-length") ?? 0);

    if (
      Number.isFinite(contentLength) &&
      contentLength > LIMITE_WEBHOOK_IMOVEIS_BYTES
    ) {
      const mensagem = "Payload excede o limite de 1 MB.";
      const metadata = {
        _request_rejected: true,
        content_type: contentType || null,
        content_length: contentLength,
        captured_at: new Date().toISOString(),
      };

      await registrarEventoRejeitadoSeguro({
        integracao,
        payloadDesconhecido: metadata,
        payloadBruto: JSON.stringify(metadata),
        mensagem,
        httpStatus: 413,
        eventTypePadrao: "payload.too_large",
      });
      return jsonErro(mensagem, 413);
    }

    const payloadBruto = await request.text();
    const payloadBytes = Buffer.byteLength(payloadBruto, "utf8");

    if (payloadBytes > LIMITE_WEBHOOK_IMOVEIS_BYTES) {
      const mensagem = "Payload excede o limite de 1 MB.";
      const metadata = {
        _request_rejected: true,
        content_type: contentType || null,
        content_length: contentLength || null,
        actual_body_bytes: payloadBytes,
        body_sha256: hashTexto(payloadBruto),
        body_preview: payloadBruto.slice(0, 100_000),
      };

      await registrarEventoRejeitadoSeguro({
        integracao,
        payloadDesconhecido: metadata,
        payloadBruto,
        mensagem,
        httpStatus: 413,
        eventTypePadrao: "payload.too_large",
      });
      return jsonErro(mensagem, 413);
    }

    let payloadDesconhecido: unknown;
    let jsonValido = true;

    try {
      payloadDesconhecido = JSON.parse(payloadBruto);
    } catch {
      jsonValido = false;
      payloadDesconhecido = undefined;
    }

    if (!contentType.toLowerCase().includes("application/json")) {
      const mensagem = "Use Content-Type application/json.";
      await registrarEventoRejeitadoSeguro({
        integracao,
        payloadDesconhecido,
        payloadBruto,
        mensagem,
        httpStatus: 415,
        eventTypePadrao: "payload.invalid_content_type",
      });
      return jsonErro(mensagem, 415);
    }

    if (!jsonValido) {
      const mensagem = "JSON invalido.";
      await registrarEventoRejeitadoSeguro({
        integracao,
        payloadDesconhecido,
        payloadBruto,
        mensagem,
        httpStatus: 400,
        eventTypePadrao: "payload.invalid_json",
      });
      return jsonErro(mensagem, 400);
    }

    if (ehEventoLead(payloadDesconhecido)) {
      return await processarEventoLead({
        request,
        integracao,
        payloadDesconhecido,
        payloadBruto,
      });
    }

    return await processarEventoImovel({
      request,
      integracao,
      payloadDesconhecido,
      payloadBruto,
    });
  } catch (error) {
    console.error("[WEBHOOK IMOVEIS]", error);
    return jsonErro("Erro interno ao processar o webhook.", 500);
  }
}
