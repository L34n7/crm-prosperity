/* eslint-disable @typescript-eslint/no-explicit-any */

import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_API_URL = "https://www.googleapis.com";
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.events.freebusy",
  "https://www.googleapis.com/auth/userinfo.email",
];
const CANAL_TTL_SEGUNDOS = 604800;
const RENOVAR_CANAL_ANTES_MS = 36 * 60 * 60 * 1000;
const TOLERANCIA_CONFLITO_MS = 2000; // CRM_GOOGLE_CANCEL_DELETE_PRIORITY_V1
const DESCRICAO_INICIO = "Descrição do compromisso:\n";
const LINK_CRM_INICIO = "\n\nAbrir no CRM: ";

type GoogleIntegracao = {
  id: string;
  empresa_id: string;
  agenda_id: string;
  google_email: string | null;
  google_calendar_id: string;
  refresh_token_encrypted: string;
  sync_ativo: boolean;
  ultima_sincronizacao_em: string | null;
  sync_token?: string | null;
  channel_id?: string | null;
  channel_resource_id?: string | null;
  channel_token_hash?: string | null;
  channel_expiration_at?: string | null;
  channel_created_at?: string | null;
  ultimo_webhook_em?: string | null;
  ultima_sincronizacao_incremental_em?: string | null;
  ultimo_message_number?: number | null;
  sync_status?: string | null;
  ultimo_erro?: string | null;
};

type GoogleVinculo = {
  id: string;
  empresa_id: string;
  agenda_id: string;
  agendamento_id: string;
  integracao_id: string;
  google_event_id: string;
  google_html_link?: string | null;
  google_etag?: string | null;
  google_updated_at?: string | null;
  crm_updated_at_snapshot?: string | null;
  google_updated_at_snapshot?: string | null;
  ultima_origem?: string | null;
  conflito_status?: string | null;
  conflito_detalhes?: Record<string, unknown> | null;
  last_synced_hash?: string | null;
};

type Agendamento = Record<string, any> & {
  id: string;
  empresa_id: string;
  agenda_id: string;
  titulo: string;
  inicio_at: string;
  fim_at: string;
  status: string;
  updated_at: string;
  timezone?: string | null;
  imovel_vinculado?: ImovelGoogle | null;
};

type ImovelGoogle = {
  titulo: string;
  codigo: string;
  tipo: string;
  finalidade: string;
  valor: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  href: string;
};

class GoogleCalendarHttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public payload: any = null
  ) {
    super(message);
    this.name = "GoogleCalendarHttpError";
  }
}

function configGoogle() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error("Integração com Google Calendar ainda não configurada no servidor.");
  }

  return { clientId, clientSecret };
}

function appUrl() {
  return String(
    process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function googleCalendarRedirectUri() {
  return `${appUrl()}/api/integracoes/google-calendar/callback`;
}

function googleCalendarWebhookUrl() {
  return `${appUrl()}/api/webhooks/google-calendar`;
}

function chaveCriptografia() {
  const segredo =
    process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!segredo) {
    throw new Error("Chave de criptografia do Google Calendar não configurada.");
  }

  return crypto.createHash("sha256").update(segredo).digest();
}

function criptografar(valor: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", chaveCriptografia(), iv);
  const encrypted = Buffer.concat([cipher.update(valor, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv, tag, encrypted].map((item) => item.toString("base64url")).join(".");
}

function descriptografar(valor: string) {
  const [ivRaw, tagRaw, encryptedRaw] = valor.split(".");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    chaveCriptografia(),
    Buffer.from(ivRaw, "base64url")
  );

  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function assinaturaState(payload: string) {
  return crypto
    .createHmac("sha256", chaveCriptografia())
    .update(payload)
    .digest("base64url");
}

function hashSeguro(valor: string) {
  return crypto.createHash("sha256").update(valor).digest("base64url");
}

function compararHash(valor: string, hashEsperado: string) {
  const atual = Buffer.from(hashSeguro(valor));
  const esperado = Buffer.from(hashEsperado);

  return atual.length === esperado.length && crypto.timingSafeEqual(atual, esperado);
}

function timestamp(valor?: string | null) {
  const numero = valor ? new Date(valor).getTime() : 0;
  return Number.isFinite(numero) ? numero : 0;
}

function crmLink(agendaId: string, agendamentoId: string) {
  const url = new URL("/agendas", appUrl());
  url.searchParams.set("agenda", agendaId);
  url.searchParams.set("agendamento", agendamentoId);
  return url.toString();
}

function hashAgendamento(agendamento: Agendamento) {
  return hashSeguro(
    JSON.stringify({
      titulo: agendamento.titulo || "",
      inicio_at: agendamento.inicio_at,
      fim_at: agendamento.fim_at,
      local: agendamento.local || "",
      link_reuniao: agendamento.link_reuniao || "",
      observacoes: agendamento.observacoes || "",
      nome_cliente: agendamento.nome_cliente || "",
      telefone_cliente: agendamento.telefone_cliente || "",
      email_cliente: agendamento.email_cliente || "",
      status: agendamento.status,
      imovel_vinculado: agendamento.imovel_vinculado || null,
    })
  );
}

function confirmacaoAutomatica(agendamento: Agendamento) {
  const confirmacao = agendamento.metadata_json?.confirmacao_whatsapp;
  const respondidoEm = String(confirmacao?.respondido_em || "").trim();

  if (agendamento.status !== "confirmado" || !respondidoEm) return null;

  return {
    respondidoEm,
    nome: String(agendamento.nome_cliente || "Contato").trim() || "Contato",
  };
}

function tituloGoogle(agendamento: Agendamento) {
  const titulo = String(agendamento.titulo || "Agendamento").trim();
  if (!confirmacaoAutomatica(agendamento) || /\s-\sconfirmado$/i.test(titulo)) {
    return titulo;
  }
  return `${titulo} - Confirmado`;
}

function removerSufixoConfirmado(titulo: string) {
  return titulo.replace(/\s-\sconfirmado$/i, "").trim();
}

function descricaoConfirmacao(agendamento: Agendamento) {
  const confirmacao = confirmacaoAutomatica(agendamento);
  if (!confirmacao) return "";

  const data = new Date(confirmacao.respondidoEm);
  const dataFormatada = Number.isNaN(data.getTime())
    ? confirmacao.respondidoEm
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: agendamento.timezone || "America/Sao_Paulo",
      }).format(data);

  return `${confirmacao.nome} confirmou o agendamento. ${dataFormatada}`;
}

function enderecoImovel(imovel?: ImovelGoogle | null) {
  if (!imovel) return "";
  return [
    [imovel.logradouro, imovel.numero].filter(Boolean).join(", "),
    imovel.complemento,
    imovel.bairro,
    [imovel.cidade, imovel.estado].filter(Boolean).join(" - "),
    imovel.cep ? `CEP ${imovel.cep}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function detalhesImovelGoogle(imovel?: ImovelGoogle | null) {
  if (!imovel) return "";
  const endereco = enderecoImovel(imovel);
  const valor = Number(imovel.valor);
  return [
    "Imóvel vinculado:",
    imovel.titulo,
    imovel.codigo && `Código: ${imovel.codigo}`,
    imovel.tipo && `Tipo: ${imovel.tipo}`,
    imovel.finalidade && `Finalidade: ${imovel.finalidade}`,
    endereco && `Endereço: ${endereco}`,
    Number.isFinite(valor) && valor > 0
      ? `Valor: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor)}`
      : "",
    imovel.href && `Abrir imóvel no CRM: ${new URL(imovel.href, appUrl()).toString()}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function descricaoGoogle(agendamento: Agendamento) {
  const dadosCliente = [
    agendamento.nome_cliente && `Cliente: ${agendamento.nome_cliente}`,
    agendamento.telefone_cliente && `Telefone: ${agendamento.telefone_cliente}`,
    agendamento.email_cliente && `E-mail: ${agendamento.email_cliente}`,
    agendamento.link_reuniao && `Link da reunião: ${agendamento.link_reuniao}`,
  ].filter(Boolean);

  return [
    dadosCliente.join("\n"),
    descricaoConfirmacao(agendamento),
    detalhesImovelGoogle(agendamento.imovel_vinculado),
    `${DESCRICAO_INICIO}${agendamento.observacoes || ""}`,
    `${LINK_CRM_INICIO}${crmLink(agendamento.agenda_id, agendamento.id)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function extrairObservacoesGoogle(descricao?: string | null) {
  const texto = String(descricao || "");
  const inicio = texto.indexOf(DESCRICAO_INICIO);

  if (inicio < 0) return undefined;

  const conteudoInicio = inicio + DESCRICAO_INICIO.length;
  const fim = texto.indexOf(LINK_CRM_INICIO, conteudoInicio);

  return texto.slice(conteudoInicio, fim >= 0 ? fim : undefined).trim();
}

function payloadEventoGoogle(agendamento: Agendamento) {
  const confirmadoPeloContato = Boolean(confirmacaoAutomatica(agendamento));
  return {
    summary: tituloGoogle(agendamento),
    description: descricaoGoogle(agendamento),
    location: enderecoImovel(agendamento.imovel_vinculado) || agendamento.local || undefined,
    start: { dateTime: agendamento.inicio_at },
    end: { dateTime: agendamento.fim_at },
    source: {
      title: "CRM Prosperity",
      url: crmLink(agendamento.agenda_id, agendamento.id),
    },
    extendedProperties: {
      private: {
        crm_agendamento_id: agendamento.id,
        crm_agenda_id: agendamento.agenda_id,
        crm_empresa_id: agendamento.empresa_id,
        crm_confirmacao_automatica: confirmadoPeloContato ? "true" : "false",
      },
    },
  };
}

export function criarStateGoogleCalendar(params: {
  agendaId: string;
  empresaId: string;
  usuarioId: string;
}) {
  const payload = Buffer.from(
    JSON.stringify({
      ...params,
      nonce: crypto.randomBytes(12).toString("hex"),
      exp: Date.now() + 10 * 60_000,
    })
  ).toString("base64url");

  return `${payload}.${assinaturaState(payload)}`;
}

export function validarStateGoogleCalendar(state: string) {
  const [payload, assinatura] = String(state || "").split(".");
  const assinaturaEsperada = payload ? assinaturaState(payload) : "";

  if (
    !payload ||
    !assinatura ||
    assinatura.length !== assinaturaEsperada.length ||
    !crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(assinaturaEsperada))
  ) {
    throw new Error("Estado OAuth inválido.");
  }

  const dados = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

  if (!dados.agendaId || !dados.empresaId || !dados.usuarioId || dados.exp < Date.now()) {
    throw new Error("Estado OAuth expirado.");
  }

  return dados as {
    agendaId: string;
    empresaId: string;
    usuarioId: string;
  };
}

export function criarUrlAutorizacaoGoogleCalendar(state: string) {
  const { clientId } = configGoogle();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleCalendarRedirectUri(),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: GOOGLE_SCOPES.join(" "),
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params}`;
}

async function trocarToken(body: URLSearchParams) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await response.json();

  if (!response.ok) {
    const clientId = String(body.get("client_id") || "");
    const clientSecret = String(body.get("client_secret") || "");

    console.error("[GOOGLE_CALENDAR] Google recusou a troca de token:", {
      error: json.error || null,
      error_description: json.error_description || null,
      client_id_suffix: clientId.slice(-18),
      client_secret_length: clientSecret.length,
      redirect_uri: body.get("redirect_uri") || null,
      grant_type: body.get("grant_type") || null,
    });

    throw new Error(json.error_description || "Google recusou a autenticação.");
  }

  return json;
}

async function obterIntegracao(
  empresaId: string,
  agendaId: string,
  apenasAtiva = true
) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("agenda_google_integracoes")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("agenda_id", agendaId);

  if (apenasAtiva) query = query.eq("sync_ativo", true);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`Erro ao consultar integração Google: ${error.message}`);
  }

  return (data || null) as GoogleIntegracao | null;
}

async function accessToken(integracao: GoogleIntegracao) {
  const { clientId, clientSecret } = configGoogle();
  const tokens = await trocarToken(
    new URLSearchParams({
      refresh_token: descriptografar(integracao.refresh_token_encrypted),
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    })
  );

  return String(tokens.access_token);
}

async function googleFetch(
  integracao: GoogleIntegracao,
  path: string,
  init: RequestInit = {}
) {
  const token = await accessToken(integracao);
  const response = await fetch(`${GOOGLE_API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    throw new GoogleCalendarHttpError(
      response.status,
      json.error?.message || "Erro ao sincronizar com Google Calendar.",
      json
    );
  }

  return response.status === 204 ? null : response.json();
}

async function atualizarStatusIntegracao(
  integracao: GoogleIntegracao,
  valores: Record<string, unknown>
) {
  await getSupabaseAdmin()
    .from("agenda_google_integracoes")
    .update({
      ...valores,
      updated_at: new Date().toISOString(),
    })
    .eq("id", integracao.id);
}

async function pararCanal(integracao: GoogleIntegracao) {
  if (!integracao.channel_id || !integracao.channel_resource_id) return;

  try {
    await googleFetch(integracao, "/calendar/v3/channels/stop", {
      method: "POST",
      body: JSON.stringify({
        id: integracao.channel_id,
        resourceId: integracao.channel_resource_id,
      }),
    });
  } catch (error) {
    if (
      error instanceof GoogleCalendarHttpError &&
      [404, 410].includes(error.status)
    ) {
      return;
    }

    console.warn("[GOOGLE_CALENDAR] Não foi possível encerrar o canal anterior:", error);
  }
}

export async function concluirOAuthGoogleCalendar(params: {
  code: string;
  agendaId: string;
  empresaId: string;
  usuarioId: string;
}) {
  if (!params.code) {
    throw new Error("Google não retornou o código de autorização.");
  }

  const { clientId, clientSecret } = configGoogle();
  const tokens = await trocarToken(
    new URLSearchParams({
      code: params.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: googleCalendarRedirectUri(),
      grant_type: "authorization_code",
    })
  );

  if (!tokens.refresh_token) {
    throw new Error("Google não retornou acesso offline. Vincule a conta novamente.");
  }

  const perfilResponse = await fetch(`${GOOGLE_API_URL}/oauth2/v2/userinfo`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const perfil = perfilResponse.ok ? await perfilResponse.json() : {};
  const supabase = getSupabaseAdmin();
  const { data: agenda } = await supabase
    .from("calendarios")
    .select("id")
    .eq("id", params.agendaId)
    .eq("empresa_id", params.empresaId)
    .maybeSingle();

  if (!agenda) {
    throw new Error("Agenda não encontrada para concluir a integração.");
  }

  const anterior = await obterIntegracao(params.empresaId, params.agendaId, false);
  if (anterior) await pararCanal(anterior);

  const { error } = await supabase.from("agenda_google_integracoes").upsert(
    {
      empresa_id: params.empresaId,
      agenda_id: params.agendaId,
      conectado_por: params.usuarioId,
      google_email: perfil.email || null,
      google_calendar_id: "primary",
      refresh_token_encrypted: criptografar(tokens.refresh_token),
      sync_ativo: true,
      conectado_em: new Date().toISOString(),
      ultima_sincronizacao_em: null,
      sync_token: null,
      channel_id: null,
      channel_resource_id: null,
      channel_token_hash: null,
      channel_expiration_at: null,
      channel_created_at: null,
      ultimo_webhook_em: null,
      ultimo_message_number: null,
      sync_status: "sincronizando",
      ultimo_erro: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "agenda_id" }
  );

  if (error) throw new Error(`Erro ao salvar integração: ${error.message}`);
}

async function buscarAgendamento(empresaId: string, agendamentoId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("agenda_agendamentos")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("id", agendamentoId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar agendamento: ${error.message}`);
  }

  if (!data) return null;

  const { data: agenda } = await supabase
    .from("agenda_calendarios")
    .select("timezone")
    .eq("empresa_id", empresaId)
    .eq("id", data.agenda_id)
    .maybeSingle();

  const { data: vinculo } = await supabase
    .from("agenda_vinculos")
    .select("titulo,entidade_id,dados_json")
    .eq("empresa_id", empresaId)
    .eq("agendamento_id", agendamentoId)
    .eq("entidade_tipo", "imovel")
    .order("principal", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let imovelVinculado: ImovelGoogle | null = null;
  if (vinculo) {
    const snapshot = (vinculo.dados_json || {}) as Record<string, string>;
    const catalogoId = snapshot.catalogo_id || "";
    const { data: catalogo } = catalogoId
      ? await supabase
          .from("catalogo_imoveis_global")
          .select("origem_tipo,origem_id,titulo,codigo,tipo,finalidade,valor,bairro,cidade,estado")
          .eq("empresa_id", empresaId)
          .eq("catalogo_id", catalogoId)
          .maybeSingle()
      : { data: null };
    const origemTipo = String(catalogo?.origem_tipo || snapshot.origem_tipo || "crm");
    const origemId = String(catalogo?.origem_id || vinculo.entidade_id || "");
    const { data: endereco } = origemId
      ? await supabase
          .from(origemTipo === "externo" ? "imoveis_externos" : "imoveis")
          .select("cep,logradouro,numero,complemento")
          .eq("empresa_id", empresaId)
          .eq("id", origemId)
          .maybeSingle()
      : { data: null };

    imovelVinculado = {
      titulo: String(catalogo?.titulo || vinculo.titulo || "Imóvel"),
      codigo: String(catalogo?.codigo || snapshot.codigo || ""),
      tipo: String(catalogo?.tipo || snapshot.tipo || ""),
      finalidade: String(catalogo?.finalidade || snapshot.finalidade || ""),
      valor: String(catalogo?.valor || snapshot.valor || ""),
      cep: String(endereco?.cep || snapshot.cep || ""),
      logradouro: String(endereco?.logradouro || snapshot.logradouro || ""),
      numero: String(endereco?.numero || snapshot.numero || ""),
      complemento: String(endereco?.complemento || snapshot.complemento || ""),
      bairro: String(catalogo?.bairro || snapshot.bairro || ""),
      cidade: String(catalogo?.cidade || snapshot.cidade || ""),
      estado: String(catalogo?.estado || snapshot.estado || ""),
      href: String(catalogoId ? `/imoveis?imovel=${encodeURIComponent(catalogoId)}` : snapshot.href || ""),
    };
  }

  return {
    ...(data as Agendamento),
    timezone: agenda?.timezone || "America/Sao_Paulo",
    imovel_vinculado: imovelVinculado,
  };
}

async function buscarVinculoPorAgendamento(agendamentoId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("agenda_google_eventos")
    .select("*")
    .eq("agendamento_id", agendamentoId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar vínculo Google: ${error.message}`);
  }

  return (data || null) as GoogleVinculo | null;
}

async function buscarVinculoEvento(
  integracao: GoogleIntegracao,
  evento: any
) {
  const supabase = getSupabaseAdmin();
  const crmAgendamentoId =
    evento?.extendedProperties?.private?.crm_agendamento_id || null;

  if (crmAgendamentoId) {
    const { data } = await supabase
      .from("agenda_google_eventos")
      .select("*")
      .eq("integracao_id", integracao.id)
      .eq("agendamento_id", crmAgendamentoId)
      .maybeSingle();

    if (data) return data as GoogleVinculo;
  }

  const { data } = await supabase
    .from("agenda_google_eventos")
    .select("*")
    .eq("integracao_id", integracao.id)
    .eq("google_event_id", evento.id)
    .maybeSingle();

  return (data || null) as GoogleVinculo | null;
}

async function salvarVinculo(params: {
  integracao: GoogleIntegracao;
  agendamento: Agendamento;
  evento: any;
  origem: "crm" | "google";
  conflitoStatus?: string;
  conflitoDetalhes?: Record<string, unknown> | null;
}) {
  const agora = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("agenda_google_eventos")
    .upsert(
      {
        empresa_id: params.agendamento.empresa_id,
        agenda_id: params.agendamento.agenda_id,
        agendamento_id: params.agendamento.id,
        integracao_id: params.integracao.id,
        google_event_id: params.evento.id,
        google_html_link: params.evento.htmlLink || null,
        google_etag: params.evento.etag || null,
        google_updated_at: params.evento.updated || null,
        crm_updated_at_snapshot: params.agendamento.updated_at || agora,
        google_updated_at_snapshot: params.evento.updated || agora,
        ultima_origem: params.origem,
        conflito_status: params.conflitoStatus || "sem_conflito",
        conflito_detalhes: params.conflitoDetalhes || null,
        last_synced_hash: hashAgendamento(params.agendamento),
        updated_at: agora,
      },
      { onConflict: "agendamento_id" }
    );

  if (error) {
    throw new Error(`Erro ao salvar vínculo do Google: ${error.message}`);
  }
}

async function aplicarEventoGoogleNoCrm(params: {
  integracao: GoogleIntegracao;
  agendamento: Agendamento;
  vinculo: GoogleVinculo;
  evento: any;
  conflitoStatus?: string;
  conflitoDetalhes?: Record<string, unknown> | null;
}) {
  const inicioAt = params.evento.start?.dateTime;
  const fimAt = params.evento.end?.dateTime;

  if (!inicioAt || !fimAt) {
    return;
  }

  const observacoes = extrairObservacoesGoogle(params.evento.description);
  const agora = new Date().toISOString();
  const confirmacaoGerenciadaPeloCrm =
    params.evento?.extendedProperties?.private?.crm_confirmacao_automatica ===
    "true";
  const metadata = {
    ...(params.agendamento.metadata_json || {}),
    google_calendar: {
      event_id: params.evento.id,
      html_link: params.evento.htmlLink || null,
      atualizado_em: params.evento.updated || agora,
      origem: "google",
    },
  };
  const atualizacao: Record<string, unknown> = {
    titulo: confirmacaoGerenciadaPeloCrm
      ? removerSufixoConfirmado(
          params.evento.summary || params.agendamento.titulo || "Agendamento"
        )
      : params.evento.summary || params.agendamento.titulo || "Agendamento",
    inicio_at: inicioAt,
    fim_at: fimAt,
    local: params.evento.location || null,
    link_reuniao:
      params.evento.hangoutLink ||
      params.evento.conferenceData?.entryPoints?.find(
        (item: any) => item.entryPointType === "video"
      )?.uri ||
      params.agendamento.link_reuniao ||
      null,
    metadata_json: metadata,
    updated_at: agora,
  };

  if (observacoes !== undefined) atualizacao.observacoes = observacoes;

  const { data: atualizado, error } = await getSupabaseAdmin()
    .from("agenda_agendamentos")
    .update(atualizacao)
    .eq("empresa_id", params.agendamento.empresa_id)
    .eq("id", params.agendamento.id)
    .select("*")
    .single();

  if (error || !atualizado) {
    throw new Error(`Erro ao aplicar alteração do Google no CRM: ${error?.message}`);
  }

  await salvarVinculo({
    integracao: params.integracao,
    agendamento: atualizado as Agendamento,
    evento: params.evento,
    origem: "google",
    conflitoStatus: params.conflitoStatus,
    conflitoDetalhes: params.conflitoDetalhes,
  });
}

async function excluirEventoGoogle(
  integracao: GoogleIntegracao,
  googleEventId: string
) {
  const calendarId = encodeURIComponent(integracao.google_calendar_id);

  try {
    await googleFetch(
      integracao,
      `/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(googleEventId)}`,
      { method: "DELETE" }
    );
  } catch (error) {
    if (
      error instanceof GoogleCalendarHttpError &&
      [404, 410].includes(error.status)
    ) {
      return;
    }

    throw error;
  }
}

async function marcarEventoGoogleComoExcluido(params: {
  agendamento: Agendamento;
  vinculo: GoogleVinculo;
  origem: "crm" | "google";
  googleUpdatedAt?: string | null;
}) {
  const agora = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("agenda_google_eventos")
    .update({
      google_html_link: null,
      google_etag: null,
      google_updated_at: params.googleUpdatedAt || agora,
      crm_updated_at_snapshot: params.agendamento.updated_at || agora,
      google_updated_at_snapshot: params.googleUpdatedAt || agora,
      ultima_origem: params.origem,
      conflito_status: "sem_conflito",
      conflito_detalhes: null,
      last_synced_hash: hashAgendamento(params.agendamento),
      sync_status: "excluido",
      updated_at: agora,
    })
    .eq("id", params.vinculo.id);

  if (error) {
    throw new Error(`Erro ao registrar exclusão do evento Google: ${error.message}`);
  }
}

async function criarEventoGoogle(
  integracao: GoogleIntegracao,
  agendamento: Agendamento
) {
  const calendarId = encodeURIComponent(integracao.google_calendar_id);
  return googleFetch(
    integracao,
    `/calendar/v3/calendars/${calendarId}/events`,
    {
      method: "POST",
      body: JSON.stringify(payloadEventoGoogle(agendamento)),
    }
  );
}

async function atualizarEventoGoogle(
  integracao: GoogleIntegracao,
  agendamento: Agendamento,
  vinculo: GoogleVinculo,
  forcar = false
) {
  const calendarId = encodeURIComponent(integracao.google_calendar_id);
  return googleFetch(
    integracao,
    `/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(vinculo.google_event_id)}`,
    {
      method: "PATCH",
      headers:
        !forcar && vinculo.google_etag
          ? { "If-Match": vinculo.google_etag }
          : undefined,
      body: JSON.stringify({
        ...payloadEventoGoogle(agendamento),
        recurrence: [],
      }),
    }
  );
}

async function registrarConflito(
  vinculo: GoogleVinculo,
  status: string,
  detalhes: Record<string, unknown>
) {
  await getSupabaseAdmin()
    .from("agenda_google_eventos")
    .update({
      conflito_status: status,
      conflito_detalhes: detalhes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", vinculo.id);
}

async function resolverPrecondicaoFalha(params: {
  integracao: GoogleIntegracao;
  agendamento: Agendamento;
  vinculo: GoogleVinculo;
}) {
  const calendarId = encodeURIComponent(params.integracao.google_calendar_id);
  const remoto = await googleFetch(
    params.integracao,
    `/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(params.vinculo.google_event_id)}`
  );
  const detalhes = {
    motivo: "etag_divergente",
    crm_updated_at: params.agendamento.updated_at,
    google_updated_at: remoto?.updated || null,
    detectado_em: new Date().toISOString(),
  };

  if (
    timestamp(remoto?.updated) >
    timestamp(params.agendamento.updated_at) + TOLERANCIA_CONFLITO_MS
  ) {
    await aplicarEventoGoogleNoCrm({
      integracao: params.integracao,
      agendamento: params.agendamento,
      vinculo: params.vinculo,
      evento: remoto,
      conflitoStatus: "resolvido_google",
      conflitoDetalhes: detalhes,
    });
    return null;
  }

  const atualizado = await atualizarEventoGoogle(
    params.integracao,
    params.agendamento,
    params.vinculo,
    true
  );
  await salvarVinculo({
    integracao: params.integracao,
    agendamento: params.agendamento,
    evento: atualizado,
    origem: "crm",
    conflitoStatus: "resolvido_crm",
    conflitoDetalhes: detalhes,
  });
  return atualizado;
}

export async function sincronizarAgendamentoGoogleCalendar(params: {
  empresaId: string;
  agendamentoId: string;
  agendaId?: string;
  forcar?: boolean;
}) {
  const supabase = getSupabaseAdmin();
  const agendamento = await buscarAgendamento(
    params.empresaId,
    params.agendamentoId
  );
  const vinculo = await buscarVinculoPorAgendamento(params.agendamentoId);
  const agendaId = agendamento?.agenda_id || params.agendaId || vinculo?.agenda_id;

  if (!agendaId) return;

  const integracao = await obterIntegracao(params.empresaId, agendaId);
  if (!integracao) {
    await supabase
      .from("agenda_google_sync_fila")
      .delete()
      .eq("agendamento_id", params.agendamentoId);
    return;
  }

  if (!agendamento) {
    if (vinculo?.google_event_id) {
      await excluirEventoGoogle(integracao, vinculo.google_event_id);
      await supabase.from("agenda_google_eventos").delete().eq("id", vinculo.id);
    }
    await supabase
      .from("agenda_google_sync_fila")
      .delete()
      .eq("agendamento_id", params.agendamentoId);
    return;
  }

  // Cancelamentos precisam ser processados antes da otimização por hash.
  // Assim, um vínculo sincronizado nunca impede a exclusão do evento remoto.
  if (agendamento.status === "cancelado") {
    if (vinculo?.google_event_id) {
      await excluirEventoGoogle(integracao, vinculo.google_event_id);
      await marcarEventoGoogleComoExcluido({
        agendamento,
        vinculo,
        origem: "crm",
      });
    }
    await supabase
      .from("agenda_google_sync_fila")
      .delete()
      .eq("agendamento_id", agendamento.id);
    return;
  }

  if (
    vinculo?.google_event_id &&
    !params.forcar &&
    vinculo.last_synced_hash === hashAgendamento(agendamento) &&
    timestamp(vinculo.crm_updated_at_snapshot) + TOLERANCIA_CONFLITO_MS >=
      timestamp(agendamento.updated_at)
  ) {
    await supabase
      .from("agenda_google_sync_fila")
      .delete()
      .eq("agendamento_id", agendamento.id);
    return;
  }

  let evento: any;

  if (vinculo?.google_event_id) {
    try {
      evento = await atualizarEventoGoogle(
        integracao,
        agendamento,
        vinculo,
        Boolean(params.forcar)
      );
    } catch (error) {
      if (
        error instanceof GoogleCalendarHttpError &&
        [404, 410].includes(error.status)
      ) {
        evento = await criarEventoGoogle(integracao, agendamento);
      } else if (
        error instanceof GoogleCalendarHttpError &&
        error.status === 412
      ) {
        evento = await resolverPrecondicaoFalha({
          integracao,
          agendamento,
          vinculo,
        });
        if (!evento) return;
      } else {
        throw error;
      }
    }
  } else {
    evento = await criarEventoGoogle(integracao, agendamento);
  }

  await salvarVinculo({
    integracao,
    agendamento,
    evento,
    origem: "crm",
  });
  await supabase
    .from("agenda_google_sync_fila")
    .delete()
    .eq("agendamento_id", agendamento.id);
}

async function cancelarAgendamentoPorGoogle(params: {
  integracao: GoogleIntegracao;
  agendamento: Agendamento;
  vinculo: GoogleVinculo;
  evento: any;
  conflitoStatus?: string;
  conflitoDetalhes?: Record<string, unknown> | null;
}) {
  const agora = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("agenda_agendamentos")
    .update({
      status: "cancelado",
      cancelado_em: agora,
      metadata_json: {
        ...(params.agendamento.metadata_json || {}),
        google_calendar: {
          event_id: params.evento.id,
          removido_em: params.evento.updated || agora,
          origem: "google",
        },
      },
      updated_at: agora,
    })
    .eq("empresa_id", params.agendamento.empresa_id)
    .eq("id", params.agendamento.id);

  if (error) {
    throw new Error(`Erro ao cancelar agendamento removido no Google: ${error.message}`);
  }

  await getSupabaseAdmin()
    .from("agenda_google_eventos")
    .update({
      google_html_link: null,
      google_etag: params.evento.etag || null,
      google_updated_at: params.evento.updated || agora,
      crm_updated_at_snapshot: agora,
      google_updated_at_snapshot: params.evento.updated || agora,
      ultima_origem: "google",
      conflito_status: params.conflitoStatus || "sem_conflito",
      conflito_detalhes: params.conflitoDetalhes || null,
      last_synced_hash: null,
      updated_at: agora,
    })
    .eq("id", params.vinculo.id);
}

async function processarEventoGoogle(
  integracao: GoogleIntegracao,
  evento: any
) {
  const crmAgendamentoId =
    evento?.extendedProperties?.private?.crm_agendamento_id || null;

  if (crmAgendamentoId) {
    const vinculoCanonico = await buscarVinculoPorAgendamento(crmAgendamentoId);
    if (
      vinculoCanonico?.google_event_id &&
      vinculoCanonico.google_event_id !== evento.id
    ) {
      console.warn("[GOOGLE_CALENDAR] Evento duplicado com identificador CRM ignorado:", {
        agenda_id: integracao.agenda_id,
        agendamento_id: crmAgendamentoId,
        google_event_id: evento.id,
        google_event_id_canonico: vinculoCanonico.google_event_id,
      });
      return { cancelado: null, conflito: null };
    }
  }

  let vinculo = await buscarVinculoEvento(integracao, evento);

  if (!vinculo && crmAgendamentoId) {
    const agendamento = await buscarAgendamento(
      integracao.empresa_id,
      crmAgendamentoId
    );

    if (agendamento && evento.status !== "cancelled") {
      await salvarVinculo({
        integracao,
        agendamento,
        evento,
        origem: "google",
      });
      vinculo = await buscarVinculoPorAgendamento(agendamento.id);
    }
  }

  if (!vinculo) return { cancelado: null, conflito: null };

  const agendamento = await buscarAgendamento(
    integracao.empresa_id,
    vinculo.agendamento_id
  );

  if (!agendamento) {
    await getSupabaseAdmin()
      .from("agenda_google_eventos")
      .delete()
      .eq("id", vinculo.id);
    return { cancelado: null, conflito: null };
  }

  // Se o CRM já cancelou, o Google não pode restaurar ou manter o evento ativo.
  // A exclusão é repetida de forma idempotente quando uma sincronização de entrada
  // chega antes do processamento da fila de saída.
  if (agendamento.status === "cancelado") {
    if (evento.status !== "cancelled" && vinculo.google_event_id) {
      await excluirEventoGoogle(integracao, vinculo.google_event_id);
    }
    await marcarEventoGoogleComoExcluido({
      agendamento,
      vinculo,
      origem: "crm",
      googleUpdatedAt: evento.updated || null,
    });
    await getSupabaseAdmin()
      .from("agenda_google_sync_fila")
      .delete()
      .eq("agendamento_id", agendamento.id);
    return { cancelado: null, conflito: null };
  }

  const crmMudou =
    timestamp(agendamento.updated_at) >
    timestamp(vinculo.crm_updated_at_snapshot) + TOLERANCIA_CONFLITO_MS;
  const googleMudou =
    !vinculo.google_etag || evento.etag !== vinculo.google_etag;
  const detalhes = {
    crm_updated_at: agendamento.updated_at,
    crm_snapshot: vinculo.crm_updated_at_snapshot || null,
    google_updated_at: evento.updated || null,
    google_snapshot: vinculo.google_updated_at_snapshot || null,
    google_etag_anterior: vinculo.google_etag || null,
    google_etag_atual: evento.etag || null,
    detectado_em: new Date().toISOString(),
  };

  if (evento.status === "cancelled") {
    if (
      crmMudou &&
      timestamp(agendamento.updated_at) >
        timestamp(evento.updated) + TOLERANCIA_CONFLITO_MS
    ) {
      await registrarConflito(vinculo, "resolvido_crm", detalhes);
      await sincronizarAgendamentoGoogleCalendar({
        empresaId: integracao.empresa_id,
        agendaId: integracao.agenda_id,
        agendamentoId: agendamento.id,
        forcar: true,
      });
      return { cancelado: null, conflito: "resolvido_crm" };
    }

    await cancelarAgendamentoPorGoogle({
      integracao,
      agendamento,
      vinculo,
      evento,
      conflitoStatus: crmMudou ? "resolvido_google" : "sem_conflito",
      conflitoDetalhes: crmMudou ? detalhes : null,
    });
    return {
      cancelado: agendamento.id,
      conflito: crmMudou ? "resolvido_google" : null,
    };
  }

  if (!googleMudou) return { cancelado: null, conflito: null };

  if (Array.isArray(evento.recurrence) && evento.recurrence.length > 0) {
    const atualizado = await atualizarEventoGoogle(
      integracao,
      agendamento,
      vinculo,
      true
    );
    const detalhesRecorrencia = {
      ...detalhes,
      motivo: "recorrencia_nao_suportada_no_crm",
    };
    await salvarVinculo({
      integracao,
      agendamento,
      evento: atualizado,
      origem: "crm",
      conflitoStatus: "resolvido_crm",
      conflitoDetalhes: detalhesRecorrencia,
    });
    return { cancelado: null, conflito: "resolvido_crm" };
  }

  if (!evento.start?.dateTime || !evento.end?.dateTime) {
    const atualizado = await atualizarEventoGoogle(
      integracao,
      agendamento,
      vinculo,
      true
    );
    const detalhesDiaInteiro = {
      ...detalhes,
      motivo: "evento_dia_inteiro_nao_suportado",
    };
    await salvarVinculo({
      integracao,
      agendamento,
      evento: atualizado,
      origem: "crm",
      conflitoStatus: "resolvido_crm",
      conflitoDetalhes: detalhesDiaInteiro,
    });
    return { cancelado: null, conflito: "resolvido_crm" };
  }

  if (crmMudou) {
    if (
      timestamp(evento.updated) >
      timestamp(agendamento.updated_at) + TOLERANCIA_CONFLITO_MS
    ) {
      await aplicarEventoGoogleNoCrm({
        integracao,
        agendamento,
        vinculo,
        evento,
        conflitoStatus: "resolvido_google",
        conflitoDetalhes: detalhes,
      });
      return { cancelado: null, conflito: "resolvido_google" };
    }

    const atualizado = await atualizarEventoGoogle(
      integracao,
      agendamento,
      vinculo,
      true
    );
    await salvarVinculo({
      integracao,
      agendamento,
      evento: atualizado,
      origem: "crm",
      conflitoStatus: "resolvido_crm",
      conflitoDetalhes: detalhes,
    });
    return { cancelado: null, conflito: "resolvido_crm" };
  }

  await aplicarEventoGoogleNoCrm({
    integracao,
    agendamento,
    vinculo,
    evento,
  });
  return { cancelado: null, conflito: null };
}

async function listarAlteracoesGoogle(
  integracao: GoogleIntegracao,
  syncToken?: string | null
) {
  const calendarId = encodeURIComponent(integracao.google_calendar_id);
  const itens: any[] = [];
  let pageToken: string | null = null;
  let nextSyncToken: string | null = null;

  do {
    const query = new URLSearchParams({
      maxResults: "2500",
      showDeleted: "true",
      singleEvents: "false",
    });

    if (syncToken) query.set("syncToken", syncToken);
    if (pageToken) query.set("pageToken", pageToken);

    const json = await googleFetch(
      integracao,
      `/calendar/v3/calendars/${calendarId}/events?${query}`
    );

    itens.push(...(json?.items || []));
    pageToken = json?.nextPageToken || null;
    if (json?.nextSyncToken) nextSyncToken = json.nextSyncToken;
  } while (pageToken);

  return { itens, nextSyncToken };
}

export async function sincronizarAlteracoesGoogleCalendar(params: {
  empresaId: string;
  agendaId: string;
  forcarCompleta?: boolean;
}) {
  const integracao = await obterIntegracao(params.empresaId, params.agendaId);
  if (!integracao) return { processados: 0, cancelados: [], conflitos: [] };

  const token = params.forcarCompleta ? null : integracao.sync_token || null;
  let resultado: { itens: any[]; nextSyncToken: string | null };

  try {
    resultado = await listarAlteracoesGoogle(integracao, token);
  } catch (error) {
    if (
      error instanceof GoogleCalendarHttpError &&
      error.status === 410 &&
      token
    ) {
      await atualizarStatusIntegracao(integracao, {
        sync_token: null,
        sync_status: "sincronizando",
        ultimo_erro: null,
      });
      resultado = await listarAlteracoesGoogle(integracao, null);
    } else {
      await atualizarStatusIntegracao(integracao, {
        sync_status: "erro",
        ultimo_erro: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  const cancelados: string[] = [];
  const conflitos: string[] = [];

  for (const evento of resultado.itens) {
    const processado = await processarEventoGoogle(integracao, evento);
    if (processado.cancelado) cancelados.push(processado.cancelado);
    if (processado.conflito) conflitos.push(processado.conflito);
  }

  const agora = new Date().toISOString();
  await atualizarStatusIntegracao(integracao, {
    sync_token: resultado.nextSyncToken || integracao.sync_token || null,
    ultima_sincronizacao_incremental_em: agora,
    ultima_sincronizacao_em: agora,
    sync_status: "ativo",
    ultimo_erro: null,
  });

  return {
    processados: resultado.itens.length,
    cancelados,
    conflitos,
  };
}

export async function garantirCanalGoogleCalendar(params: {
  empresaId: string;
  agendaId: string;
  forcar?: boolean;
}) {
  const integracao = await obterIntegracao(params.empresaId, params.agendaId);
  if (!integracao) return null;

  const expiraEm = timestamp(integracao.channel_expiration_at);
  if (
    !params.forcar &&
    integracao.channel_id &&
    integracao.channel_resource_id &&
    expiraEm > Date.now() + RENOVAR_CANAL_ANTES_MS
  ) {
    return {
      channel_id: integracao.channel_id,
      expiration: expiraEm,
    };
  }

  const canalAnterior = { ...integracao };
  const channelId = crypto.randomUUID();
  const channelToken = crypto.randomBytes(32).toString("base64url");
  const calendarId = encodeURIComponent(integracao.google_calendar_id);
  const canal = await googleFetch(
    integracao,
    `/calendar/v3/calendars/${calendarId}/events/watch`,
    {
      method: "POST",
      body: JSON.stringify({
        id: channelId,
        token: channelToken,
        type: "web_hook",
        address: googleCalendarWebhookUrl(),
        params: { ttl: String(CANAL_TTL_SEGUNDOS) },
      }),
    }
  );
  const expiration = Number(canal?.expiration || Date.now() + CANAL_TTL_SEGUNDOS * 1000);
  const agora = new Date().toISOString();

  await atualizarStatusIntegracao(integracao, {
    channel_id: canal?.id || channelId,
    channel_resource_id: canal?.resourceId || null,
    channel_token_hash: hashSeguro(channelToken),
    channel_expiration_at: new Date(expiration).toISOString(),
    channel_created_at: agora,
    ultimo_message_number: null,
    sync_status: "ativo",
    ultimo_erro: null,
  });

  if (
    canalAnterior.channel_id &&
    canalAnterior.channel_resource_id &&
    canalAnterior.channel_id !== (canal?.id || channelId)
  ) {
    await pararCanal(canalAnterior);
  }

  return {
    channel_id: canal?.id || channelId,
    resource_id: canal?.resourceId || null,
    expiration,
  };
}

export async function processarNotificacaoGoogleCalendar(headers: Headers) {
  const channelId = String(headers.get("x-goog-channel-id") || "");
  const resourceId = String(headers.get("x-goog-resource-id") || "");
  const channelToken = String(headers.get("x-goog-channel-token") || "");
  const resourceState = String(headers.get("x-goog-resource-state") || "");
  const messageNumber = Number(headers.get("x-goog-message-number") || 0);

  if (!channelId || !resourceId || !channelToken) {
    return { ok: false, ignorado: true, motivo: "cabecalhos_ausentes" };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("agenda_google_integracoes")
    .select("*")
    .eq("channel_id", channelId)
    .eq("sync_ativo", true)
    .maybeSingle();

  if (error) throw new Error(`Erro ao localizar canal Google: ${error.message}`);

  const integracao = (data || null) as GoogleIntegracao | null;
  if (!integracao) {
    return { ok: true, ignorado: true, motivo: "canal_desconhecido" };
  }

  if (
    integracao.channel_resource_id !== resourceId ||
    !integracao.channel_token_hash ||
    !compararHash(channelToken, integracao.channel_token_hash)
  ) {
    return { ok: true, ignorado: true, motivo: "canal_invalido" };
  }

  if (
    messageNumber > 0 &&
    Number(integracao.ultimo_message_number || 0) >= messageNumber
  ) {
    return { ok: true, ignorado: true, motivo: "mensagem_duplicada" };
  }

  await atualizarStatusIntegracao(integracao, {
    ultimo_webhook_em: new Date().toISOString(),
    ultimo_message_number: messageNumber || integracao.ultimo_message_number || null,
    sync_status: resourceState === "sync" ? integracao.sync_status || "ativo" : "pendente_google",
    ultimo_erro: null,
  });

  return {
    ok: true,
    enfileirado: resourceState !== "sync",
    estado: resourceState,
  };
}

export async function processarIntegracoesPendentesGoogleCalendar(limite = 15) {
  const supabase = getSupabaseAdmin();
  const limiteSeguro = Math.min(Math.max(Math.floor(limite), 1), 50);
  const { data, error } = await supabase
    .from("agenda_google_integracoes")
    .select("empresa_id, agenda_id")
    .eq("sync_ativo", true)
    .eq("sync_status", "pendente_google")
    .order("ultimo_webhook_em", { ascending: true })
    .limit(limiteSeguro);

  if (error) {
    throw new Error(`Erro ao listar notificações Google pendentes: ${error.message}`);
  }

  const resultados: Array<Record<string, unknown>> = [];

  for (const item of data || []) {
    try {
      const resultado = await sincronizarAlteracoesGoogleCalendar({
        empresaId: item.empresa_id,
        agendaId: item.agenda_id,
      });
      resultados.push({ agenda_id: item.agenda_id, ok: true, ...resultado });
    } catch (erro) {
      resultados.push({
        agenda_id: item.agenda_id,
        ok: false,
        error: erro instanceof Error ? erro.message : String(erro),
      });
    }
  }

  return resultados;
}

export async function renovarCanaisGoogleCalendar(limite = 25) {
  const supabase = getSupabaseAdmin();
  const limiteSeguro = Math.min(Math.max(Math.floor(limite), 1), 100);
  const ate = new Date(Date.now() + RENOVAR_CANAL_ANTES_MS).toISOString();
  const { data, error } = await supabase
    .from("agenda_google_integracoes")
    .select("empresa_id, agenda_id")
    .eq("sync_ativo", true)
    .or(`channel_expiration_at.is.null,channel_expiration_at.lt.${ate}`)
    .limit(limiteSeguro);

  if (error) {
    throw new Error(`Erro ao listar canais Google para renovação: ${error.message}`);
  }

  const resultados: Array<Record<string, unknown>> = [];

  for (const item of data || []) {
    try {
      const canal = await garantirCanalGoogleCalendar({
        empresaId: item.empresa_id,
        agendaId: item.agenda_id,
        forcar: true,
      });
      resultados.push({
        agenda_id: item.agenda_id,
        ok: true,
        expiration: canal?.expiration || null,
      });
    } catch (error) {
      resultados.push({
        agenda_id: item.agenda_id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return resultados;
}

export async function processarFilaGoogleCalendar(limite = 30) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("agenda_google_sync_reservar", {
    p_limite: Math.min(Math.max(Math.floor(limite), 1), 100),
  });

  if (error) {
    throw new Error(`Erro ao reservar fila Google: ${error.message}`);
  }

  const resultados: Array<Record<string, unknown>> = [];

  for (const item of data || []) {
    try {
      await sincronizarAgendamentoGoogleCalendar({
        empresaId: item.empresa_id,
        agendaId: item.agenda_id,
        agendamentoId: item.agendamento_id,
        forcar: item.operacao === "delete",
      });
      resultados.push({ id: item.id, ok: true });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      const esperaMinutos = Math.min(2 ** Math.min(Number(item.tentativas || 1), 8), 240);
      await supabase
        .from("agenda_google_sync_fila")
        .update({
          status: "pendente",
          erro: mensagem,
          bloqueado_em: null,
          proxima_tentativa_em: new Date(
            Date.now() + esperaMinutos * 60_000
          ).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      resultados.push({ id: item.id, ok: false, error: mensagem });
    }
  }

  return resultados;
}

export async function reconciliarExclusoesGoogleCalendar(params: {
  empresaId: string;
  agendaId: string;
  inicioAt?: string;
  fimAt?: string;
}) {
  const resultado = await sincronizarAlteracoesGoogleCalendar({
    empresaId: params.empresaId,
    agendaId: params.agendaId,
  });
  return resultado.cancelados;
}

export async function excluirEventosVinculadosGoogleCalendar(params: {
  empresaId: string;
  agendaId: string;
}) {
  const integracao = await obterIntegracao(params.empresaId, params.agendaId);
  if (!integracao) return;

  const { data: vinculos, error } = await getSupabaseAdmin()
    .from("agenda_google_eventos")
    .select("google_event_id")
    .eq("empresa_id", params.empresaId)
    .eq("agenda_id", params.agendaId);

  if (error) {
    throw new Error(`Erro ao listar eventos vinculados ao Google: ${error.message}`);
  }

  for (const vinculo of vinculos || []) {
    await excluirEventoGoogle(integracao, vinculo.google_event_id);
  }
}

export async function listarOcupacoesGoogleCalendar(params: {
  empresaId: string;
  agendaId: string;
  inicioAt: string;
  fimAt: string;
}) {
  const integracao = await obterIntegracao(params.empresaId, params.agendaId);
  if (!integracao) return [];

  const json = await googleFetch(integracao, "/calendar/v3/freeBusy", {
    method: "POST",
    body: JSON.stringify({
      timeMin: params.inicioAt,
      timeMax: params.fimAt,
      items: [{ id: integracao.google_calendar_id }],
    }),
  });

  return json?.calendars?.[integracao.google_calendar_id]?.busy || [];
}

export async function listarEventosExternosGoogleCalendar(params: {
  empresaId: string;
  agendaId: string;
  inicioAt: string;
  fimAt: string;
}) {
  const integracao = await obterIntegracao(params.empresaId, params.agendaId);
  if (!integracao) return [];

  const calendarId = encodeURIComponent(integracao.google_calendar_id);
  const query = new URLSearchParams({
    timeMin: params.inicioAt,
    timeMax: params.fimAt,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "2500",
  });
  const json = await googleFetch(
    integracao,
    `/calendar/v3/calendars/${calendarId}/events?${query}`
  );

  return (json?.items || [])
    .filter(
      (evento: any) =>
        evento.status !== "cancelled" &&
        evento.transparency !== "transparent" &&
        !evento.extendedProperties?.private?.crm_agendamento_id
    )
    .map((evento: any) => ({
      id: evento.id,
      titulo: evento.summary || "Ocupado no Google Calendar",
      inicio_at: evento.start?.dateTime || evento.start?.date || "",
      fim_at: evento.end?.dateTime || evento.end?.date || "",
      dia_inteiro: Boolean(evento.start?.date && !evento.start?.dateTime),
      html_link: evento.htmlLink || null,
    }))
    .filter((evento: any) => evento.inicio_at && evento.fim_at);
}

export async function sincronizarAgendaGoogleCalendar(params: {
  empresaId: string;
  agendaId: string;
}) {
  const integracao = await obterIntegracao(params.empresaId, params.agendaId);
  if (!integracao) return;

  try {
    if (integracao.sync_token) {
      await sincronizarAlteracoesGoogleCalendar(params);
    }

    const supabase = getSupabaseAdmin();
    const { data: agendamentos, error } = await supabase
      .from("agenda_agendamentos")
      .select("id")
      .eq("empresa_id", params.empresaId)
      .eq("agenda_id", params.agendaId);

    if (error) throw new Error(`Erro ao listar agendamentos: ${error.message}`);

    for (const agendamento of agendamentos || []) {
      await sincronizarAgendamentoGoogleCalendar({
        empresaId: params.empresaId,
        agendaId: params.agendaId,
        agendamentoId: agendamento.id,
      });
    }

    if (!integracao.sync_token) {
      await sincronizarAlteracoesGoogleCalendar({
        ...params,
        forcarCompleta: true,
      });
    }

    await garantirCanalGoogleCalendar(params);

    const agora = new Date().toISOString();
    await atualizarStatusIntegracao(integracao, {
      ultima_sincronizacao_em: agora,
      sync_status: "ativo",
      ultimo_erro: null,
    });
  } catch (error) {
    await atualizarStatusIntegracao(integracao, {
      sync_status: "erro",
      ultimo_erro: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function desvincularGoogleCalendar(params: {
  empresaId: string;
  agendaId: string;
}) {
  const integracao = await obterIntegracao(
    params.empresaId,
    params.agendaId,
    false
  );

  if (!integracao) return;

  await pararCanal(integracao);

  const { error } = await getSupabaseAdmin()
    .from("agenda_google_integracoes")
    .delete()
    .eq("id", integracao.id);

  if (error) {
    throw new Error(`Erro ao desvincular Google Calendar: ${error.message}`);
  }
}
