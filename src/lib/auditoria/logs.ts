import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { obterAcessoTemporarioEmpresaAtual } from "@/lib/auth/acesso-temporario-empresa";

const supabaseAdmin = getSupabaseAdmin();

const ACOES_DISPARO_COM_CONFIRMACAO_COBRANCA_META = new Set([
  "disparo_em_massa_enfileirado",
  "disparo_agendado_criado",
]);
const CONFIRMACAO_COBRANCA_META_VERSAO = "2026-09-v1";
const CONFIRMACAO_COBRANCA_META_TEXTO =
  "Li as informações acima e estou ciente de que este disparo pode gerar cobrança.";

export type CategoriaAuditoria =
  | "automacoes"
  | "permissoes"
  | "usuarios"
  | "conversas"
  | "contatos"
  | "disparos"
  | "fluxos"
  | "pessoas"
  | "saude"
  | "imobiliario"
  | "setores"
  | "perfis"
  | "sistema";

export type RegistrarLogAuditoriaInput = {
  empresa_id: string;
  categoria?: CategoriaAuditoria;
  entidade:
    | "setor"
    | "perfil"
    | "usuario"
    | "permissao"
    | "politica_empresa"
    | "conversa"
    | "conversa_nota"
    | "contato"
    | "lista_contatos"
    | "pessoa"
    | "prontuario"
    | "odontograma"
    | "podograma"
    | "imovel"
    | "empresa"
    | "imovel_publicacao"
    | "imovel_lead_portal"
    | "imovel_externo"
    | "disparo"
    | "fluxo"
    | "integracao_whatsapp"
    | "rotina_automacao"
    | "rotina_automacao_job";
  entidade_id: string;
  acao: string;
  descricao?: string | null;
  usuario_id?: string | null;
  usuario_nome?: string | null;
  usuario_email?: string | null;
  antes?: Record<string, unknown> | unknown[] | null;
  depois?: Record<string, unknown> | unknown[] | null;
  detalhes?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  user_agent?: string | null;
};

export function getRequestAuditMetadata(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip =
    forwardedFor?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;

  return {
    ip,
    user_agent: request.headers.get("user-agent") || null,
  };
}

function obterConfirmacaoCobrancaMeta(input: RegistrarLogAuditoriaInput) {
  const categoria = input.categoria ?? input.entidade;

  if (
    categoria !== "disparos" ||
    input.entidade !== "disparo" ||
    !ACOES_DISPARO_COM_CONFIRMACAO_COBRANCA_META.has(input.acao)
  ) {
    return null;
  }

  return {
    confirmada: true,
    confirmada_em: new Date().toISOString(),
    versao: CONFIRMACAO_COBRANCA_META_VERSAO,
    texto: CONFIRMACAO_COBRANCA_META_TEXTO,
  };
}

export async function registrarLogAuditoria(
  input: RegistrarLogAuditoriaInput
) {
  const acessoTemporario = await obterAcessoTemporarioEmpresaAtual();
  const acessoNesteAmbiente =
    acessoTemporario?.empresa_id === input.empresa_id
      ? acessoTemporario
      : null;

  const usuarioId =
    acessoNesteAmbiente?.operador_usuario_id ?? input.usuario_id ?? null;
  const usuarioNome =
    acessoNesteAmbiente?.operador_nome ?? input.usuario_nome ?? null;
  const usuarioEmail =
    acessoNesteAmbiente?.operador_email ?? input.usuario_email ?? null;

  const confirmacaoCobrancaMeta = obterConfirmacaoCobrancaMeta(input);
  const detalhes = {
    ...(input.detalhes ?? {}),
    ...(usuarioEmail ? { usuario_email: usuarioEmail } : {}),
    ...(acessoNesteAmbiente
      ? {
          acesso_temporario_administrativo: {
            sessao_id: acessoNesteAmbiente.sessao_id,
            operador_usuario_id: acessoNesteAmbiente.operador_usuario_id,
            operador_nome: acessoNesteAmbiente.operador_nome,
            operador_email: acessoNesteAmbiente.operador_email,
            empresa_id: acessoNesteAmbiente.empresa_id,
            empresa_nome: acessoNesteAmbiente.empresa_nome,
            usuario_administrador_alvo_id:
              acessoNesteAmbiente.usuario_alvo_id,
            usuario_administrador_alvo_nome:
              acessoNesteAmbiente.usuario_alvo_nome,
            usuario_administrador_alvo_email:
              acessoNesteAmbiente.usuario_alvo_email,
            iniciado_em: acessoNesteAmbiente.criado_em,
            expira_em: acessoNesteAmbiente.expira_em,
          },
        }
      : {}),
    ...(confirmacaoCobrancaMeta
      ? { confirmacao_cobranca_meta: confirmacaoCobrancaMeta }
      : {}),
  };

  const { error } = await supabaseAdmin.from("logs_auditoria").insert([
    {
      empresa_id: input.empresa_id,
      categoria: input.categoria ?? input.entidade,
      entidade: input.entidade,
      entidade_id: input.entidade_id,
      acao: input.acao,
      descricao: input.descricao ?? null,
      usuario_id: usuarioId,
      usuario_nome: usuarioNome,
      detalhes,
      antes: input.antes ?? null,
      depois: input.depois ?? null,
      metadata: input.metadata ?? null,
      ip: input.ip ?? null,
      user_agent: input.user_agent ?? null,
    },
  ]);

  if (error) {
    throw new Error(`Erro ao registrar log de auditoria: ${error.message}`);
  }
}

export async function registrarLogAuditoriaSeguro(
  input: RegistrarLogAuditoriaInput
) {
  try {
    await registrarLogAuditoria(input);
  } catch (error) {
    console.error("[AUDITORIA] Falha ao registrar log:", error);
  }
}
