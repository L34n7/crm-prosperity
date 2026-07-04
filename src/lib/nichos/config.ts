export const NICHO_CODIGOS = [
  "comercio",
  "imobiliaria",
  "medicina",
  "odontologia",
  "outro",
] as const;

export type NichoCodigo = (typeof NICHO_CODIGOS)[number];
export type NichoGrupo = "comercial" | "saude";

export type NichoConfig = {
  codigo: NichoCodigo;
  nome: string;
  grupo: NichoGrupo;
  cadastroSingular: "Cliente" | "Paciente";
  cadastroPlural: "Clientes" | "Pacientes";
  modulos: string[];
};

export const NICHOS_CONFIG: Record<NichoCodigo, NichoConfig> = {
  comercio: {
    codigo: "comercio",
    nome: "Comércio e serviços",
    grupo: "comercial",
    cadastroSingular: "Cliente",
    cadastroPlural: "Clientes",
    modulos: ["cadastros.pessoas"],
  },
  imobiliaria: {
    codigo: "imobiliaria",
    nome: "Imobiliária",
    grupo: "comercial",
    cadastroSingular: "Cliente",
    cadastroPlural: "Clientes",
    modulos: [
      "cadastros.pessoas",
      "imobiliario.imoveis",
      "imobiliario.negociacoes",
    ],
  },
  medicina: {
    codigo: "medicina",
    nome: "Medicina",
    grupo: "saude",
    cadastroSingular: "Paciente",
    cadastroPlural: "Pacientes",
    modulos: [
      "cadastros.pessoas",
      "saude.pacientes",
      "saude.prontuarios",
    ],
  },
  odontologia: {
    codigo: "odontologia",
    nome: "Odontologia",
    grupo: "saude",
    cadastroSingular: "Paciente",
    cadastroPlural: "Pacientes",
    modulos: [
      "cadastros.pessoas",
      "saude.pacientes",
      "saude.prontuarios",
      "saude.odontograma",
    ],
  },
  outro: {
    codigo: "outro",
    nome: "Outro / ainda não definido",
    grupo: "comercial",
    cadastroSingular: "Cliente",
    cadastroPlural: "Clientes",
    modulos: ["cadastros.pessoas"],
  },
};

export function isNichoCodigo(valor: unknown): valor is NichoCodigo {
  return (
    typeof valor === "string" &&
    (NICHO_CODIGOS as readonly string[]).includes(valor)
  );
}

export function getNichoConfig(valor: unknown): NichoConfig {
  return isNichoCodigo(valor)
    ? NICHOS_CONFIG[valor]
    : NICHOS_CONFIG.comercio;
}
