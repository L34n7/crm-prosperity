import { isAdministrador } from "@/lib/auth/authorization";
import type { UsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const MAX_INTEGRACOES_WHATSAPP = 3;

const supabaseAdmin = getSupabaseAdmin();

export type IntegracaoWhatsappResumo = {
  id: string;
  empresa_id?: string;
  nome_conexao: string | null;
  numero: string | null;
  status: string | null;
  provider?: string | null;
  modo_integracao?: string | null;
  coex_status?: string | null;
  phone_number_id?: string | null;
  waba_id?: string | null;
  posicao?: number | null;
  created_at?: string | null;
};

type EmpresaLimiteWhatsapp = {
  id: string;
  limite_integracoes_whatsapp?: number | null;
  planos?: {
    limite_integracoes_whatsapp?: number | null;
  } | null;
};

function limitarQuantidade(valor: unknown) {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) return 1;

  return Math.min(Math.max(Math.floor(numero), 1), MAX_INTEGRACOES_WHATSAPP);
}

function normalizarPlano(valor: unknown) {
  if (Array.isArray(valor)) return valor[0] || null;
  return valor && typeof valor === "object"
    ? (valor as EmpresaLimiteWhatsapp["planos"])
    : null;
}

export function normalizarPosicaoIntegracao(valor: unknown) {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) return null;

  const posicao = Math.floor(numero);
  return posicao >= 1 && posicao <= MAX_INTEGRACOES_WHATSAPP ? posicao : null;
}

export function getPosicaoVisualIntegracao(
  integracao: Pick<IntegracaoWhatsappResumo, "posicao"> | null | undefined,
  fallbackIndex = 0
) {
  return normalizarPosicaoIntegracao(integracao?.posicao) || fallbackIndex + 1;
}

export async function obterLimiteIntegracoesWhatsapp(empresaId: string) {
  const { data, error } = await supabaseAdmin
    .from("empresas")
    .select(
      "id, limite_integracoes_whatsapp, planos:plano_id(limite_integracoes_whatsapp)"
    )
    .eq("id", empresaId)
    .maybeSingle<EmpresaLimiteWhatsapp>();

  if (error) {
    throw new Error(
      `Erro ao buscar limite de integracoes WhatsApp: ${error.message}`
    );
  }

  const plano = normalizarPlano(data?.planos);

  return limitarQuantidade(
    data?.limite_integracoes_whatsapp ??
      plano?.limite_integracoes_whatsapp ??
      1
  );
}

export async function listarIntegracoesWhatsappDaEmpresa(
  empresaId: string
): Promise<IntegracaoWhatsappResumo[]> {
  const { data, error } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select(
      [
        "id",
        "empresa_id",
        "nome_conexao",
        "numero",
        "status",
        "provider",
        "modo_integracao",
        "coex_status",
        "phone_number_id",
        "waba_id",
        "posicao",
        "created_at",
      ].join(", ")
    )
    .eq("empresa_id", empresaId)
    .eq("provider", "meta_official")
    .order("posicao", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(
      `Erro ao listar integracoes WhatsApp: ${error.message}`
    );
  }

  return (data || []) as unknown as IntegracaoWhatsappResumo[];
}

export async function listarIntegracoesWhatsappPermitidas(params: {
  usuario: Pick<
    UsuarioContexto,
    "id" | "empresa_id" | "perfis_dinamicos" | "perfil_dinamico_principal"
  >;
  empresaId: string;
}) {
  const integracoes = await listarIntegracoesWhatsappDaEmpresa(params.empresaId);

  if (isAdministrador(params.usuario)) {
    return {
      integracoes,
      idsPermitidos: integracoes.map((item) => item.id),
      acessoRestrito: false,
    };
  }

  const perfilIds = params.usuario.perfis_dinamicos
    .map((perfil) => perfil.id)
    .filter(Boolean);

  if (perfilIds.length === 0 || integracoes.length === 0) {
    return {
      integracoes,
      idsPermitidos: integracoes.map((item) => item.id),
      acessoRestrito: false,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("perfil_integracoes_whatsapp")
    .select("perfil_empresa_id, integracao_whatsapp_id")
    .eq("empresa_id", params.empresaId)
    .in("perfil_empresa_id", perfilIds);

  if (error) {
    throw new Error(
      `Erro ao buscar permissoes de integracoes WhatsApp: ${error.message}`
    );
  }

  const idsConfigurados = new Set(
    (data || [])
      .map((item) => String(item.integracao_whatsapp_id || ""))
      .filter(Boolean)
  );
  const perfisComRestricao = new Set(
    (data || [])
      .map((item) => String(item.perfil_empresa_id || ""))
      .filter(Boolean)
  );

  if (
    idsConfigurados.size === 0 ||
    perfilIds.some((perfilId) => !perfisComRestricao.has(perfilId))
  ) {
    return {
      integracoes,
      idsPermitidos: integracoes.map((item) => item.id),
      acessoRestrito: false,
    };
  }

  const integracoesPermitidas = integracoes.filter((item) =>
    idsConfigurados.has(item.id)
  );

  return {
    integracoes: integracoesPermitidas,
    idsPermitidos: integracoesPermitidas.map((item) => item.id),
    acessoRestrito: true,
  };
}

export async function usuarioPodeAcessarIntegracaoWhatsapp(params: {
  usuario: Pick<
    UsuarioContexto,
    "id" | "empresa_id" | "perfis_dinamicos" | "perfil_dinamico_principal"
  >;
  empresaId: string;
  integracaoId: string | null | undefined;
}) {
  if (!params.integracaoId) return true;

  const { idsPermitidos } = await listarIntegracoesWhatsappPermitidas({
    usuario: params.usuario,
    empresaId: params.empresaId,
  });

  return idsPermitidos.includes(params.integracaoId);
}

export function calcularProximaPosicaoLivre(
  integracoes: Array<Pick<IntegracaoWhatsappResumo, "posicao">>,
  limite: number
) {
  const ocupadas = new Set(
    integracoes
      .map((item, index) => getPosicaoVisualIntegracao(item, index))
      .filter((posicao) => posicao >= 1 && posicao <= MAX_INTEGRACOES_WHATSAPP)
  );

  for (let posicao = 1; posicao <= limite; posicao += 1) {
    if (!ocupadas.has(posicao)) return posicao;
  }

  return null;
}
