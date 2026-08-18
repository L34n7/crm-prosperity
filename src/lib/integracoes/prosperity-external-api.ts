import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type ProsperityApiScope =
  | "leads:read"
  | "pagamentos:read"
  | "assinaturas:read"
  | "onboarding:read";

type ApiKeyRow = {
  id: string;
  nome: string;
  scopes: string[] | null;
  ativo: boolean;
  expira_em: string | null;
};

export const prosperityApiSupabase = getSupabaseAdmin();

export function respostaProsperityErro(error: unknown, status = 500) {
  return NextResponse.json(
    {
      ok: false,
      error: error instanceof Error ? error.message : "Erro interno da API.",
    },
    { status },
  );
}

function extrairBearer(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return "";
  return authorization.slice(7).trim();
}

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function autenticarProsperityApi(
  request: NextRequest,
  scope?: ProsperityApiScope,
) {
  const token = extrairBearer(request);
  if (!token || !token.startsWith("prsp_")) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Token Bearer ausente ou inválido." },
        { status: 401 },
      ),
    };
  }

  const tokenHash = hashToken(token);
  const { data, error } = await prosperityApiSupabase
    .from("prosperity_external_api_keys")
    .select("id,nome,scopes,ativo,expira_em")
    .eq("token_hash", tokenHash)
    .eq("ativo", true)
    .maybeSingle<ApiKeyRow>();

  if (error) {
    return {
      ok: false as const,
      response: respostaProsperityErro(new Error(error.message)),
    };
  }

  if (!data) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Token de acesso não reconhecido." },
        { status: 401 },
      ),
    };
  }

  if (data.expira_em && new Date(data.expira_em).getTime() <= Date.now()) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Token de acesso expirado." },
        { status: 401 },
      ),
    };
  }

  const scopes = Array.isArray(data.scopes) ? data.scopes : [];
  if (scope && !scopes.includes("*") && !scopes.includes(scope)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: `Token sem permissão para ${scope}.` },
        { status: 403 },
      ),
    };
  }

  await prosperityApiSupabase
    .from("prosperity_external_api_keys")
    .update({ ultimo_uso_em: new Date().toISOString() })
    .eq("id", data.id);

  return {
    ok: true as const,
    apiKey: data,
  };
}

export function lerPaginacao(request: NextRequest) {
  const limiteInformado = Number(request.nextUrl.searchParams.get("limite") || 50);
  const paginaInformada = Number(request.nextUrl.searchParams.get("pagina") || 1);
  const limite = Number.isFinite(limiteInformado)
    ? Math.min(100, Math.max(1, Math.floor(limiteInformado)))
    : 50;
  const pagina = Number.isFinite(paginaInformada)
    ? Math.max(1, Math.floor(paginaInformada))
    : 1;
  const inicio = (pagina - 1) * limite;

  return {
    limite,
    pagina,
    inicio,
    fim: inicio + limite - 1,
  };
}

export function respostaLista<T>(
  recurso: string,
  itens: T[],
  pagina: number,
  limite: number,
  total: number | null,
  extras?: Record<string, unknown>,
) {
  return NextResponse.json({
    ok: true,
    recurso,
    dados: itens,
    paginacao: {
      pagina,
      limite,
      total,
      possui_proxima: total == null ? itens.length === limite : pagina * limite < total,
    },
    ...(extras || {}),
  });
}

export function objetoSeguro(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};
  return valor as Record<string, unknown>;
}

export function textoOuNull(valor: unknown) {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  return texto || null;
}
