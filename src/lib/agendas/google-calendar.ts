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

type GoogleIntegracao = {
  id: string;
  empresa_id: string;
  agenda_id: string;
  google_email: string | null;
  google_calendar_id: string;
  refresh_token_encrypted: string;
  sync_ativo: boolean;
  ultima_sincronizacao_em: string | null;
};

function configGoogle() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error("Integracao com Google Calendar ainda nao configurada no servidor.");
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

function chaveCriptografia() {
  const segredo =
    process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!segredo) {
    throw new Error("Chave de criptografia do Google Calendar nao configurada.");
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

  if (
    !payload ||
    !assinatura ||
    assinatura.length !== assinaturaState(payload).length ||
    !crypto.timingSafeEqual(
      Buffer.from(assinatura),
      Buffer.from(assinaturaState(payload))
    )
  ) {
    throw new Error("Estado OAuth invalido.");
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

    throw new Error(json.error_description || "Google recusou a autenticacao.");
  }

  return json;
}

export async function concluirOAuthGoogleCalendar(params: {
  code: string;
  agendaId: string;
  empresaId: string;
  usuarioId: string;
}) {
  if (!params.code) {
    throw new Error("Google nao retornou o codigo de autorizacao.");
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
    throw new Error("Google nao retornou acesso offline. Vincule a conta novamente.");
  }

  const perfilResponse = await fetch(`${GOOGLE_API_URL}/oauth2/v2/userinfo`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const perfil = perfilResponse.ok ? await perfilResponse.json() : {};
  const supabase = getSupabaseAdmin();
  const { data: agenda } = await supabase
    .from("agenda_calendarios")
    .select("id")
    .eq("id", params.agendaId)
    .eq("empresa_id", params.empresaId)
    .maybeSingle();

  if (!agenda) {
    throw new Error("Agenda nao encontrada para concluir a integracao.");
  }

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
      updated_at: new Date().toISOString(),
    },
    { onConflict: "agenda_id" }
  );

  if (error) throw new Error(`Erro ao salvar integracao: ${error.message}`);
}

async function obterIntegracao(empresaId: string, agendaId: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("agenda_google_integracoes")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("agenda_id", agendaId)
    .eq("sync_ativo", true)
    .maybeSingle();

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
    throw new Error(json.error?.message || "Erro ao sincronizar com Google Calendar.");
  }

  return response.status === 204 ? null : response.json();
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
    }))
    .filter((evento: any) => evento.inicio_at && evento.fim_at);
}

export async function sincronizarAgendamentoGoogleCalendar(params: {
  empresaId: string;
  agendamentoId: string;
}) {
  const supabase = getSupabaseAdmin();
  const { data: agendamento } = await supabase
    .from("agenda_agendamentos")
    .select("*")
    .eq("empresa_id", params.empresaId)
    .eq("id", params.agendamentoId)
    .maybeSingle();

  if (!agendamento) return;

  const integracao = await obterIntegracao(params.empresaId, agendamento.agenda_id);

  if (!integracao) return;

  const { data: vinculo } = await supabase
    .from("agenda_google_eventos")
    .select("*")
    .eq("agendamento_id", agendamento.id)
    .maybeSingle();
  const calendarId = encodeURIComponent(integracao.google_calendar_id);

  if (["cancelado", "faltou"].includes(agendamento.status)) {
    if (vinculo?.google_event_id) {
      await googleFetch(
        integracao,
        `/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(vinculo.google_event_id)}`,
        { method: "DELETE" }
      ).catch((error) =>
        console.error("[GOOGLE_CALENDAR] Erro ao excluir evento:", error)
      );
      await supabase.from("agenda_google_eventos").delete().eq("id", vinculo.id);
    }
    return;
  }

  const evento = {
    summary: agendamento.titulo || "Agendamento",
    description: [
      agendamento.nome_cliente && `Cliente: ${agendamento.nome_cliente}`,
      agendamento.telefone_cliente && `Telefone: ${agendamento.telefone_cliente}`,
      agendamento.email_cliente && `E-mail: ${agendamento.email_cliente}`,
      agendamento.observacoes,
    ]
      .filter(Boolean)
      .join("\n"),
    start: { dateTime: agendamento.inicio_at },
    end: { dateTime: agendamento.fim_at },
    extendedProperties: {
      private: { crm_agendamento_id: agendamento.id },
    },
  };

  if (vinculo?.google_event_id) {
    await googleFetch(
      integracao,
      `/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(vinculo.google_event_id)}`,
      { method: "PATCH", body: JSON.stringify(evento) }
    );
  } else {
    const criado = await googleFetch(
      integracao,
      `/calendar/v3/calendars/${calendarId}/events`,
      { method: "POST", body: JSON.stringify(evento) }
    );

    await supabase.from("agenda_google_eventos").insert({
      empresa_id: params.empresaId,
      agenda_id: agendamento.agenda_id,
      agendamento_id: agendamento.id,
      integracao_id: integracao.id,
      google_event_id: criado.id,
    });
  }
}

export async function sincronizarAgendaGoogleCalendar(params: {
  empresaId: string;
  agendaId: string;
}) {
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
      agendamentoId: agendamento.id,
    });
  }

  await supabase
    .from("agenda_google_integracoes")
    .update({
      ultima_sincronizacao_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("empresa_id", params.empresaId)
    .eq("agenda_id", params.agendaId);
}
