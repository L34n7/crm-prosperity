import type { NichoCodigo } from "@/lib/nichos/config";

export type CampoCadastroTipo =
  | "texto"
  | "texto_longo"
  | "numero"
  | "data"
  | "booleano"
  | "select";

export type CampoCadastroEscopo = "pessoa" | "paciente";

export type CampoCadastro = {
  chave: string;
  nome: string;
  tipo: CampoCadastroTipo;
  escopo: CampoCadastroEscopo;
  obrigatorio?: boolean;
  opcoes?: string[];
};

const CAMPOS_NICHO: Record<NichoCodigo, CampoCadastro[]> = {
  comercio: [
    {
      chave: "profissao",
      nome: "Profissão",
      tipo: "texto",
      escopo: "pessoa",
    },
    {
      chave: "como_conheceu",
      nome: "Como conheceu a empresa?",
      tipo: "texto",
      escopo: "pessoa",
    },
  ],
  imobiliaria: [
    {
      chave: "profissao",
      nome: "Profissão",
      tipo: "texto",
      escopo: "pessoa",
    },
    {
      chave: "estado_civil",
      nome: "Estado civil",
      tipo: "select",
      escopo: "pessoa",
      opcoes: ["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viúvo(a)"],
    },
    {
      chave: "renda_mensal",
      nome: "Renda mensal",
      tipo: "numero",
      escopo: "pessoa",
    },
  ],
  medicina: [
    {
      chave: "preferencia_atendimento",
      nome: "Preferência de atendimento",
      tipo: "texto",
      escopo: "paciente",
    },
  ],
  odontologia: [
    {
      chave: "preferencia_atendimento",
      nome: "Preferência de atendimento",
      tipo: "texto",
      escopo: "paciente",
    },
  ],
  outro: [
    {
      chave: "profissao",
      nome: "Profissão",
      tipo: "texto",
      escopo: "pessoa",
    },
    {
      chave: "como_conheceu",
      nome: "Como conheceu a empresa?",
      tipo: "texto",
      escopo: "pessoa",
    },
  ],
};

export function getCamposPadraoNicho(
  nichoCodigo: NichoCodigo
): CampoCadastro[] {
  return CAMPOS_NICHO[nichoCodigo] ?? [];
}
