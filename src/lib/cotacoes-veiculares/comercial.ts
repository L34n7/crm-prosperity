import type { CategoriaCotacao, PlanoCotacao } from "./catalogo";

export const USOS_VEICULO = {
  particular: "Particular",
  aplicativo: "Aplicativo (Uber/99)",
  taxi: "Táxi",
  comercial: "Comercial / trabalho",
} as const;
export const ENERGIAS_VEICULO = {
  combustao: "Combustão",
  hibrido: "Híbrido",
  eletrico: "Elétrico",
} as const;
export type UsoVeiculo = keyof typeof USOS_VEICULO;
export type EnergiaVeiculo = keyof typeof ENERGIAS_VEICULO;

export type RegraComercialPlano = {
  categoria: CategoriaCotacao;
  plano: PlanoCotacao;
  participacao_percentual: number;
  participacao_min_centavos: number;
  terceiros_limite_centavos: number;
  assistencia_km_total: number;
  assistencias_ano: number;
  carro_reserva_incluso_dias: number;
  coberturas: string[];
  usos_permitidos: UsoVeiculo[];
  energias_permitidas: EnergiaVeiculo[];
  observacoes: string;
};
export type OpcionalComercial = {
  codigo: string;
  nome: string;
  valor_centavos: number;
  grupo_exclusivo: string;
  ativo: boolean;
};
export type RegrasPorPlano = Record<PlanoCotacao, RegraComercialPlano>;
export type OpcionaisPorPlano = Record<PlanoCotacao, OpcionalComercial[]>;

export function regraVazia(categoria: CategoriaCotacao, plano: PlanoCotacao): RegraComercialPlano {
  return {
    categoria, plano, participacao_percentual: 0, participacao_min_centavos: 0,
    terceiros_limite_centavos: 0, assistencia_km_total: 0, assistencias_ano: 0,
    carro_reserva_incluso_dias: 0, coberturas: [],
    usos_permitidos: [], energias_permitidas: [], observacoes: "",
  };
}
export function validarRegraComercial(regra: RegraComercialPlano, opcionais: OpcionalComercial[]): string | null {
  const validCent = (n:number) => Number.isSafeInteger(n) && n>=0 && n<=200000000000;
  if (!Number.isFinite(regra.participacao_percentual) ||
      regra.participacao_percentual<0 || regra.participacao_percentual>100 ||
      Math.round(regra.participacao_percentual*1000)/1000 !== regra.participacao_percentual)
    return "Informe participação percentual válida (0 a 100, até três decimais).";
  if (!validCent(regra.participacao_min_centavos) || !validCent(regra.terceiros_limite_centavos))
    return "Informe valores monetários válidos para participação mínima e terceiros.";
  for(const value of [regra.assistencia_km_total,regra.assistencias_ano,regra.carro_reserva_incluso_dias]){
    if(!Number.isInteger(value)||value<0||value>1000000) return "Informe valores inteiros não negativos para os limites de assistência.";
  }
  if(!Array.isArray(regra.coberturas)||regra.coberturas.length<1||regra.coberturas.length>30 ||
     regra.coberturas.some(v=>typeof v!=="string"||v.trim().length<2||v.length>160))
    return "Informe pelo menos uma cobertura, uma por linha (máximo 30).";
  if(!Array.isArray(regra.usos_permitidos)||regra.usos_permitidos.length<1||
      regra.usos_permitidos.some(v=>!(v in USOS_VEICULO)))
    return "Selecione ao menos uma finalidade de uso permitida.";
  if(!Array.isArray(regra.energias_permitidas)||regra.energias_permitidas.length<1||
      regra.energias_permitidas.some(v=>!(v in ENERGIAS_VEICULO)))
    return "Selecione ao menos um tipo de motorização permitido.";
  if(typeof regra.observacoes!=="string"||regra.observacoes.length>1000) return "Observações excedem o limite de 1.000 caracteres.";
  if(!Array.isArray(opcionais)||opcionais.length>60)return "Há opcionais demais.";
  const ids=new Set<string>();
  for(const opcao of opcionais){
    if(!/^[a-z0-9_]{2,50}$/.test(opcao.codigo)||opcao.nome.trim().length<2||opcao.nome.length>120 ||
        opcao.grupo_exclusivo.length>50||!validCent(opcao.valor_centavos)||opcacaoInvalida(opcao))
      return "Revise o nome, código, valor e grupo dos opcionais.";
    if(ids.has(opcao.codigo))return "Existem opcionais com códigos duplicados.";
    ids.add(opcao.codigo);
  }
  return null;
}
function opcacaoInvalida(item: OpcionalComercial) {
  return typeof item.ativo!=="boolean"|| !/^[a-z0-9_]{0,50}$/.test(item.grupo_exclusivo);
}
