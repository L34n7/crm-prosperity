type ContatoVariaveisFixas = {
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
};

type CampoContatoVariavelFixa = "nome" | "email" | "telefone";

const VARIAVEIS_FIXAS_CONTATO_CAMPOS: Record<
  string,
  CampoContatoVariavelFixa
> = {
  nome_contato: "nome",
  contato_nome: "nome",
  email_contato: "email",
  contato_email: "email",
  numero_contato: "telefone",
  contato_numero: "telefone",
  telefone_contato: "telefone",
  contato_telefone: "telefone",
};

export const VARIAVEIS_FIXAS_CONTATO = [
  "nome_contato",
  "email_contato",
  "numero_contato",
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

export function montarMapaVariaveisFixasContato(
  contato: ContatoVariaveisFixas | null | undefined
) {
  const valores: Record<CampoContatoVariavelFixa, string> = {
    nome: String(contato?.nome || "").trim(),
    email: String(contato?.email || "").trim(),
    telefone: String(contato?.telefone || "").trim(),
  };

  const mapa = new Map<string, string>();

  for (const [chave, campo] of Object.entries(VARIAVEIS_FIXAS_CONTATO_CAMPOS)) {
    mapa.set(chave, valores[campo]);
  }

  return mapa;
}
