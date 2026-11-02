export const CATEGORIAS_COTACAO = {
  motocicleta: "Motocicleta", auto_leves: "Automóveis leves", app_taxi: "Aplicativo e táxi",
  especiais: "Especiais", van_utilitario: "Van e utilitário",
  caminhao_leve: "Caminhão leve", caminhao_pesado: "Caminhão pesado", agregado: "Agregado",
} as const;
export type CategoriaCotacao = keyof typeof CATEGORIAS_COTACAO;
export type PlanoCotacao = string;
export type PlanoEmpresa = {
  empresa_id:string;codigo:string;nome:string;ordem:number;ativo:boolean;
};
