import { normalizarClassificacaoLead } from "@/lib/leads/classificacao";
import { supabaseAdmin } from "@/lib/supabase/admin";

type ContatoVariaveisFixas = {
  id?: string | null;
  nome?: string | null;
  whatsapp_profile_name?: string | null;
  email?: string | null;
  telefone?: string | null;
  campanha?: string | null;
  origem?: string | null;
  status_lead?: string | null;
  classificacao?: string | null;
};

type ExtrasVariaveisFixas = {
  nome_whatsapp?: string | null;
  protocolo_atual?: string | null;
  ultimo_protocolo?: string | null;
};

type CampoContatoVariavelFixa =
  | "nome"
  | "email"
  | "telefone"
  | "campanha"
  | "origem"
  | "status_lead"
  | "classificacao"
  | "nome_whatsapp"
  | "protocolo_atual"
  | "ultimo_protocolo";

const VARIAVEL_PIX_PENDENTES_RESUMO = "pagamento.pix_pendentes_resumo";
const CACHE_PIX_AUTORIZADO_MS = 1000;
const CACHE_PIX_NAO_AUTORIZADO_MS = 10 * 60 * 1000;

type CachePixPendente = {
  autorizado: boolean;
  resumo: string;
  expiraEm: number;
};

const cachePixPendentePorContato = new Map<string, CachePixPendente>();

const VARIAVEIS_FIXAS_CONTATO_CAMPOS: Record<
  string,
  CampoContatoVariavelFixa
> = {
  nome: "nome",
  nome_contato: "nome",
  contato_nome: "nome",

  nome_whatsapp: "nome_whatsapp",
  whatsapp_nome: "nome_whatsapp",
  nome_perfil_whatsapp: "nome_whatsapp",
  perfil_whatsapp_nome: "nome_whatsapp",

  email: "email",
  email_contato: "email",
  contato_email: "email",

  telefone: "telefone",
  numero: "telefone",
  numero_contato: "telefone",
  contato_numero: "telefone",
  telefone_contato: "telefone",
  contato_telefone: "telefone",

  campanha: "campanha",
  origem: "origem",

  status: "status_lead",
  status_lead: "status_lead",
  classificacao: "classificacao",
  classificacao_lead: "classificacao",
  lead_classificacao: "classificacao",

  protocolo_atual: "protocolo_atual",
  ultimo_protocolo: "ultimo_protocolo",
};

export const VARIAVEIS_FIXAS_CONTATO = [
  "nome_contato",
  "nome_whatsapp",
  "nome_perfil_whatsapp",
  "email_contato",
  "numero_contato",
  "campanha",
  "origem",
  "status_lead",
  "classificacao_lead",
  "protocolo_atual",
  "ultimo_protocolo",
  VARIAVEL_PIX_PENDENTES_RESUMO,
] as const;

export function normalizarChaveVariavelFluxo(valor: unknown) {
  return String(valor || "")
    .trim()
    .replace(/^\{\{\s*/, "")
    .replace(/\s*\}\}$/, "")
    .replace(/^variaveis\./, "")
    .trim()
    .toLowerCase();
}

export function chaveEhVariavelFixaContato(chave: unknown) {
  const chaveNormalizada = normalizarChaveVariavelFluxo(chave);

  return (
    chaveNormalizada === VARIAVEL_PIX_PENDENTES_RESUMO ||
    Object.prototype.hasOwnProperty.call(
      VARIAVEIS_FIXAS_CONTATO_CAMPOS,
      chaveNormalizada
    )
  );
}

const VARIAVEIS_NOME_WHATSAPP = new Set([
  "nome_whatsapp",
  "whatsapp_nome",
  "nome_perfil_whatsapp",
  "perfil_whatsapp_nome",
]);

export function chaveEhVariavelNomeWhatsapp(chave: unknown) {
  return VARIAVEIS_NOME_WHATSAPP.has(normalizarChaveVariavelFluxo(chave));
}

function limparCachePixPendente() {
  if (cachePixPendentePorContato.size <= 1000) return;

  const agora = Date.now();

  for (const [contatoId, item] of cachePixPendentePorContato) {
    if (item.expiraEm <= agora) {
      cachePixPendentePorContato.delete(contatoId);
    }
  }

  if (cachePixPendentePorContato.size <= 1000) return;

  const excedentes = cachePixPendentePorContato.size - 1000;
  let removidos = 0;

  for (const contatoId of cachePixPendentePorContato.keys()) {
    cachePixPendentePorContato.delete(contatoId);
    removidos += 1;

    if (removidos >= excedentes) break;
  }
}

async function carregarResumoPixPendentesProsperity(contatoId: string) {
  const id = String(contatoId || "").trim();
  if (!id) return "";

  const agora = Date.now();
  const cache = cachePixPendentePorContato.get(id);

  if (cache && cache.expiraEm > agora) {
    return cache.resumo;
  }

  if (cache) {
    cachePixPendentePorContato.delete(id);
  }

  const { data, error } = await supabaseAdmin.rpc(
    "prosperity_resumo_pix_pendentes_contato",
    { p_contato_id: id }
  );

  if (error) {
    console.error(
      "[AUTOMACAO_VARIAVEIS] Erro ao resolver resumo de PIX pendentes:",
      {
        code: error.code,
        message: error.message,
      }
    );

    return "";
  }

  const resultado =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const autorizado = resultado.autorizado === true;
  const resumo = autorizado ? String(resultado.resumo || "") : "";

  cachePixPendentePorContato.set(id, {
    autorizado,
    resumo,
    expiraEm:
      agora +
      (autorizado ? CACHE_PIX_AUTORIZADO_MS : CACHE_PIX_NAO_AUTORIZADO_MS),
  });
  limparCachePixPendente();

  return resumo;
}

export async function montarMapaVariaveisFixasContato(
  contato: ContatoVariaveisFixas | null | undefined,
  extras: ExtrasVariaveisFixas = {}
) {
  const classificacao = normalizarClassificacaoLead(
    contato?.classificacao || contato?.status_lead,
    "novo"
  );
  const valores: Record<CampoContatoVariavelFixa, string> = {
    nome: String(contato?.nome || "").trim(),
    email: String(contato?.email || "").trim(),
    telefone: String(contato?.telefone || "").trim(),
    campanha: String(contato?.campanha || "").trim(),
    origem: String(contato?.origem || "").trim(),
    status_lead: classificacao,
    classificacao,
    nome_whatsapp: String(
      extras.nome_whatsapp || contato?.whatsapp_profile_name || contato?.nome || ""
    ).trim(),
    protocolo_atual: String(extras.protocolo_atual || "").trim(),
    ultimo_protocolo: String(extras.ultimo_protocolo || "").trim(),
  };

  const mapa = new Map<string, string>();

  for (const [chave, campo] of Object.entries(VARIAVEIS_FIXAS_CONTATO_CAMPOS)) {
    mapa.set(chave, valores[campo]);
  }

  mapa.set(VARIAVEL_PIX_PENDENTES_RESUMO, "");

  if (contato?.id) {
    mapa.set(
      VARIAVEL_PIX_PENDENTES_RESUMO,
      await carregarResumoPixPendentesProsperity(contato.id)
    );
  }

  return mapa;
}
