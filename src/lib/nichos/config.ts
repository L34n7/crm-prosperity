export const NICHO_CODIGOS = [
  "comercio",
  "imobiliaria",
  "medicina",
  "podologia",
  "odontologia",
  "outro",
] as const;

export const PRONTUARIO_ABA_CODIGOS = [
  "resumo",
  "atendimento",
  "evolucoes",
  "odontograma",
  "mapa_podal",
] as const;

export type NichoCodigo = (typeof NICHO_CODIGOS)[number];
export type NichoGrupo = "comercial" | "saude";
export type ProntuarioAbaCodigo = (typeof PRONTUARIO_ABA_CODIGOS)[number];

export type NichoConfig = {
  codigo: NichoCodigo;
  nome: string;
  grupo: NichoGrupo;
  cadastroSingular: "Cliente" | "Paciente";
  cadastroPlural: "Clientes" | "Pacientes";
  modulos: string[];
  prontuarioAbas?: ProntuarioAbaCodigo[];
};

const ABAS_PRONTUARIO_PADRAO: ProntuarioAbaCodigo[] = [
  "resumo",
  "atendimento",
  "evolucoes",
];

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
    modulos: ["cadastros.pessoas", "saude.prontuarios"],
    prontuarioAbas: [...ABAS_PRONTUARIO_PADRAO],
  },
  podologia: {
    codigo: "podologia",
    nome: "Podologia",
    grupo: "saude",
    cadastroSingular: "Paciente",
    cadastroPlural: "Pacientes",
    modulos: ["cadastros.pessoas", "saude.prontuarios"],
    prontuarioAbas: [...ABAS_PRONTUARIO_PADRAO, "mapa_podal"],
  },
  odontologia: {
    codigo: "odontologia",
    nome: "Odontologia",
    grupo: "saude",
    cadastroSingular: "Paciente",
    cadastroPlural: "Pacientes",
    modulos: [
      "cadastros.pessoas",
      "saude.prontuarios",
      "saude.odontograma",
    ],
    prontuarioAbas: [...ABAS_PRONTUARIO_PADRAO, "odontograma"],
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

export function isProntuarioAbaCodigo(
  valor: unknown
): valor is ProntuarioAbaCodigo {
  return (
    typeof valor === "string" &&
    (PRONTUARIO_ABA_CODIGOS as readonly string[]).includes(valor)
  );
}

export function getNichoConfig(valor: unknown): NichoConfig {
  return isNichoCodigo(valor)
    ? NICHOS_CONFIG[valor]
    : NICHOS_CONFIG.comercio;
}
