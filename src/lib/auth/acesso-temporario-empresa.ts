import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const ACESSO_TEMPORARIO_EMPRESA_COOKIE =
  "crm-acesso-temporario-empresa";
export const ACESSO_TEMPORARIO_EMPRESA_DURACAO_SEGUNDOS = 30 * 60;

const SESSAO_PREFIXO = "suporte_empresa:";

type MetadataSessaoSuporte = {
  tipo: "acesso_temporario_empresa";
  empresa_alvo_id: string;
  empresa_alvo_nome: string;
  usuario_alvo_id: string;
  usuario_alvo_nome: string | null;
  usuario_alvo_email: string | null;
  operador_empresa_id: string | null;
  operador_nome: string | null;
  operador_email: string | null;
  criado_em: string;
  expira_em: string;
  encerrado_em?: string | null;
};

type SessaoSuporteRow = {
  id: string;
  empresa_id: string | null;
  usuario_id: string;
  auth_user_id: string | null;
  client_session_id: string;
  login_at: string;
  last_seen_at: string;
  logout_at: string | null;
  status: string;
  metadata_json: MetadataSessaoSuporte | Record<string, unknown> | null;
};

export type AcessoTemporarioEmpresaAtivo = {
  sessao_id: string;
  operador_usuario_id: string;
  operador_auth_user_id: string;
  operador_empresa_id: string | null;
  operador_nome: string | null;
  operador_email: string | null;
  empresa_id: string;
  empresa_nome: string;
  usuario_alvo_id: string;
  usuario_alvo_nome: string | null;
  usuario_alvo_email: string | null;
  criado_em: string;
  expira_em: string;
};

const supabaseAdmin = getSupabaseAdmin();

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function normalizarMetadata(
  valor: SessaoSuporteRow["metadata_json"]
): MetadataSessaoSuporte | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    return null;
  }

  const metadata = valor as Partial<MetadataSessaoSuporte>;

  if (
    metadata.tipo !== "acesso_temporario_empresa" ||
    typeof metadata.empresa_alvo_id !== "string" ||
    typeof metadata.empresa_alvo_nome !== "string" ||
    typeof metadata.usuario_alvo_id !== "string" ||
    typeof metadata.criado_em !== "string" ||
    typeof metadata.expira_em !== "string"
  ) {
    return null;
  }

  return {
    tipo: "acesso_temporario_empresa",
    empresa_alvo_id: metadata.empresa_alvo_id,
    empresa_alvo_nome: metadata.empresa_alvo_nome,
    usuario_alvo_id: metadata.usuario_alvo_id,
    usuario_alvo_nome:
      typeof metadata.usuario_alvo_nome === "string"
        ? metadata.usuario_alvo_nome
        : null,
    usuario_alvo_email:
      typeof metadata.usuario_alvo_email === "string"
        ? metadata.usuario_alvo_email
        : null,
    operador_empresa_id:
      typeof metadata.operador_empresa_id === "string"
        ? metadata.operador_empresa_id
        : null,
    operador_nome:
      typeof metadata.operador_nome === "string"
        ? metadata.operador_nome
        : null,
    operador_email:
      typeof metadata.operador_email === "string"
        ? metadata.operador_email
        : null,
    criado_em: metadata.criado_em,
    expira_em: metadata.expira_em,
    encerrado_em:
      typeof metadata.encerrado_em === "string"
        ? metadata.encerrado_em
        : null,
  };
}

async function marcarSessaoComoEncerrada(
  sessao: SessaoSuporteRow,
  metadata: MetadataSessaoSuporte,
  encerradoEm: string
) {
  await supabaseAdmin
    .from("usuario_sessoes")
    .update({
      status: "offline",
      logout_at: encerradoEm,
      last_seen_at: encerradoEm,
      updated_at: encerradoEm,
      metadata_json: {
        ...metadata,
        encerrado_em: encerradoEm,
      },
    })
    .eq("id", sessao.id)
    .eq("status", "online");
}

export async function criarAcessoTemporarioEmpresa(input: {
  operador: {
    id: string;
    auth_user_id: string;
    empresa_id: string | null;
    nome: string | null;
    email: string | null;
  };
  empresa: {
    id: string;
    nome: string;
  };
  usuarioAlvo: {
    id: string;
    nome: string | null;
    email: string | null;
  };
  ip?: string | null;
  userAgent?: string | null;
}) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const agora = new Date();
  const expiraEm = new Date(
    agora.getTime() +
      ACESSO_TEMPORARIO_EMPRESA_DURACAO_SEGUNDOS * 1000
  );

  const metadata: MetadataSessaoSuporte = {
    tipo: "acesso_temporario_empresa",
    empresa_alvo_id: input.empresa.id,
    empresa_alvo_nome: input.empresa.nome,
    usuario_alvo_id: input.usuarioAlvo.id,
    usuario_alvo_nome: input.usuarioAlvo.nome,
    usuario_alvo_email: input.usuarioAlvo.email,
    operador_empresa_id: input.operador.empresa_id,
    operador_nome: input.operador.nome,
    operador_email: input.operador.email,
    criado_em: agora.toISOString(),
    expira_em: expiraEm.toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("usuario_sessoes")
    .insert({
      empresa_id: input.operador.empresa_id,
      usuario_id: input.operador.id,
      auth_user_id: input.operador.auth_user_id,
      client_session_id: `${SESSAO_PREFIXO}${tokenHash}`,
      login_at: agora.toISOString(),
      last_seen_at: agora.toISOString(),
      status: "online",
      ip: input.ip ?? null,
      user_agent: input.userAgent ?? null,
      metadata_json: metadata,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    throw new Error(
      `Erro ao criar sessão temporária: ${error?.message || "sessão não criada"}`
    );
  }

  return {
    token,
    sessao_id: data.id,
    expira_em: expiraEm.toISOString(),
  };
}

export async function obterAcessoTemporarioEmpresaAtual(options?: {
  authUserId?: string | null;
  operadorUsuarioId?: string | null;
}) {
  const cookieStore = await cookies();
  const token =
    cookieStore.get(ACESSO_TEMPORARIO_EMPRESA_COOKIE)?.value?.trim() || "";

  if (!token) return null;

  const clientSessionId = `${SESSAO_PREFIXO}${hashToken(token)}`;

  const { data, error } = await supabaseAdmin
    .from("usuario_sessoes")
    .select(
      "id, empresa_id, usuario_id, auth_user_id, client_session_id, login_at, last_seen_at, logout_at, status, metadata_json"
    )
    .eq("client_session_id", clientSessionId)
    .eq("status", "online")
    .is("logout_at", null)
    .maybeSingle<SessaoSuporteRow>();

  if (error || !data) return null;

  if (
    options?.authUserId &&
    data.auth_user_id !== options.authUserId
  ) {
    return null;
  }

  if (
    options?.operadorUsuarioId &&
    data.usuario_id !== options.operadorUsuarioId
  ) {
    return null;
  }

  const metadata = normalizarMetadata(data.metadata_json);
  if (!metadata) return null;

  const expiraEmMs = new Date(metadata.expira_em).getTime();

  if (!Number.isFinite(expiraEmMs) || expiraEmMs <= Date.now()) {
    await marcarSessaoComoEncerrada(
      data,
      metadata,
      new Date().toISOString()
    );
    return null;
  }

  return {
    sessao_id: data.id,
    operador_usuario_id: data.usuario_id,
    operador_auth_user_id: data.auth_user_id || "",
    operador_empresa_id: metadata.operador_empresa_id,
    operador_nome: metadata.operador_nome,
    operador_email: metadata.operador_email,
    empresa_id: metadata.empresa_alvo_id,
    empresa_nome: metadata.empresa_alvo_nome,
    usuario_alvo_id: metadata.usuario_alvo_id,
    usuario_alvo_nome: metadata.usuario_alvo_nome,
    usuario_alvo_email: metadata.usuario_alvo_email,
    criado_em: metadata.criado_em,
    expira_em: metadata.expira_em,
  } satisfies AcessoTemporarioEmpresaAtivo;
}

export async function encerrarAcessoTemporarioEmpresaAtual(options?: {
  authUserId?: string | null;
  operadorUsuarioId?: string | null;
}) {
  const acesso = await obterAcessoTemporarioEmpresaAtual(options);

  if (!acesso) return null;

  const agora = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("usuario_sessoes")
    .update({
      status: "offline",
      logout_at: agora,
      last_seen_at: agora,
      updated_at: agora,
    })
    .eq("id", acesso.sessao_id)
    .eq("status", "online");

  if (error) {
    throw new Error(`Error ao encerrar sessão temporéria: ${error.message}`);
  }

  return acesso;
}

export function getAcessoTemporarioEmpresaCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: ACESSO_TEMPORARIO_EMPRESA_DURACAO_SEGUNDOS,
  };
}
