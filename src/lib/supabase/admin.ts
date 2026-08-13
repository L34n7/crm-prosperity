import { createClient } from "@supabase/supabase-js";

const AUTOMACAO_LOGS_PATH = "/rest/v1/automacao_execucao_logs";
const AUTOMACAO_LOCK_RPC_PATH =
  "/rest/v1/rpc/automacao_tentar_travar_execucao_no";
const AUTOMACAO_LOCK_PREFIX = "lock_execucao_no:";

type AutomacaoLockInsert = {
  empresa_id?: unknown;
  execucao_id?: unknown;
  fluxo_id?: unknown;
  no_id?: unknown;
  tipo_evento?: unknown;
  entrada_json?: unknown;
};

function textoNaoVazio(valor: unknown) {
  return typeof valor === "string" ? valor.trim() : "";
}

function normalizarPayloadLock(valor: unknown): AutomacaoLockInsert | null {
  const payload = Array.isArray(valor) && valor.length === 1 ? valor[0] : valor;

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const registro = payload as AutomacaoLockInsert;
  const tipoEvento = textoNaoVazio(registro.tipo_evento);

  if (!tipoEvento.startsWith(AUTOMACAO_LOCK_PREFIX)) {
    return null;
  }

  if (
    !textoNaoVazio(registro.empresa_id) ||
    !textoNaoVazio(registro.execucao_id) ||
    !textoNaoVazio(registro.fluxo_id) ||
    !textoNaoVazio(registro.no_id)
  ) {
    return null;
  }

  return registro;
}

function obterVisitaLock(payload: AutomacaoLockInsert) {
  const entrada =
    payload.entrada_json &&
    typeof payload.entrada_json === "object" &&
    !Array.isArray(payload.entrada_json)
      ? (payload.entrada_json as Record<string, unknown>)
      : null;
  const visitaEntrada = Number(entrada?.visita_no);

  if (Number.isFinite(visitaEntrada) && visitaEntrada > 0) {
    return Math.floor(visitaEntrada);
  }

  const tipoEvento = textoNaoVazio(payload.tipo_evento);
  const visitaTipoEvento = Number(tipoEvento.slice(AUTOMACAO_LOCK_PREFIX.length));

  return Number.isFinite(visitaTipoEvento) && visitaTipoEvento > 0
    ? Math.floor(visitaTipoEvento)
    : 1;
}

function respostaConflitoLock() {
  return new Response(
    JSON.stringify({
      code: "23505",
      details: null,
      hint: null,
      message:
        'duplicate key value violates unique constraint "automacao_logs_lock_execucao_no_unico"',
    }),
    {
      status: 409,
      headers: {
        "content-type": "application/json",
      },
    }
  );
}

/**
 * Compatibilidade para a trava legada do motor de automação.
 *
 * O motor ainda interpreta SQLSTATE 23505 como "outro worker ganhou a trava".
 * Em vez de provocar uma violação real no PostgreSQL, interceptamos somente o
 * INSERT de lock e usamos a RPC atomica com ON CONFLICT DO NOTHING. Quando a
 * RPC retorna false, sintetizamos o mesmo erro para o cliente localmente. Isso
 * preserva o contrato atual do motor sem gerar ERROR no log do banco.
 */
async function supabaseAdminFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const request = new Request(input, init);
  const url = new URL(request.url);

  if (
    request.method.toUpperCase() !== "POST" ||
    url.pathname !== AUTOMACAO_LOGS_PATH
  ) {
    return fetch(request);
  }

  let payloadBruto: unknown;

  try {
    payloadBruto = JSON.parse(await request.clone().text());
  } catch {
    return fetch(request);
  }

  const payload = normalizarPayloadLock(payloadBruto);

  if (!payload) {
    return fetch(request);
  }

  const rpcUrl = new URL(url.origin);
  rpcUrl.pathname = AUTOMACAO_LOCK_RPC_PATH;

  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.set("accept", "application/json");
  headers.delete("prefer");

  const rpcResponse = await fetch(rpcUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      p_empresa_id: textoNaoVazio(payload.empresa_id),
      p_execucao_id: textoNaoVazio(payload.execucao_id),
      p_fluxo_id: textoNaoVazio(payload.fluxo_id),
      p_no_id: textoNaoVazio(payload.no_id),
      p_visita_no: obterVisitaLock(payload),
    }),
    signal: request.signal,
  });

  if (!rpcResponse.ok) {
    return rpcResponse;
  }

  const travou = (await rpcResponse.json()) === true;

  if (!travou) {
    return respostaConflitoLock();
  }

  return new Response(null, {
    status: 201,
    headers: {
      "content-type": "application/json",
    },
  });
}

function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL não definida.");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não definida.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: supabaseAdminFetch,
    },
  });
}

export function getSupabaseAdmin() {
  return createSupabaseAdminClient();
}

export const supabaseAdmin = createSupabaseAdminClient();
