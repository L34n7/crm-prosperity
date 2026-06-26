type ContatoVariaveisFixas = {
  nome?: string | null;
  whatsapp_profile_name?: string | null;
  email?: string | null;
  telefone?: string | null;
  campanha?: string | null;
  origem?: string | null;
  status_lead?: string | null;
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
  | "nome_whatsapp"
  | "protocolo_atual"
  | "ultimo_protocolo";

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
  "protocolo_atual",
  "ultimo_protocolo",
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
  return Object.prototype.hasOwnProperty.call(
    VARIAVEIS_FIXAS_CONTATO_CAMPOS,
    normalizarChaveVariavelFluxo(chave)
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

export function montarMapaVariaveisFixasContato(
  contato: ContatoVariaveisFixas | null | undefined,
  extras: ExtrasVariaveisFixas = {}
) {
  const valores: Record<CampoContatoVariavelFixa, string> = {
    nome: String(contato?.nome || "").trim(),
    email: String(contato?.email || "").trim(),
    telefone: String(contato?.telefone || "").trim(),
    campanha: String(contato?.campanha || "").trim(),
    origem: String(contato?.origem || "").trim(),
    status_lead: String(contato?.status_lead || "").trim(),
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

  return mapa;
}
