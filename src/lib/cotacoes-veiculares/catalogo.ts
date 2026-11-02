export const CATEGORIAS_COTACAO = {
  motocicleta: "Motocicleta",
  auto_leves: "Automóveis leves",
  app_taxi: "Aplicativo e táxi",
  especiais: "Especiais",
  van_utilitario: "Van e utilitário",
  caminhao_leve: "Caminhão leve",
  caminhao_pesado: "Caminhão pesado",
  agregado: "Agregado",
} as const;
export type CategoriaCotacao = keyof typeof CATEGORIAS_COTACAO;
export type PlanoCotacao = "premium" | "completo";
export const OPCIONAIS_COTACAO = {
  rastreador: "Rastreador",
  carro_reserva_7d: "Carro reserva — 7 dias",
  carro_reserva_15d: "Carro reserva — 15 dias",
  destombamento: "Destombamento (limite R$ 3.000)",
} as const;
export type OpcionalCotacao = keyof typeof OPCIONAIS_COTACAO;
export function opcionaisDisponiveis(categoria: CategoriaCotacao, plano: PlanoCotacao) {
  const itens: Array<{ codigo: OpcionalCotacao; nome: string; centavos: number }> = [];
  if (categoria === "motocicleta") {
    itens.push({ codigo: "rastreador", nome: OPCIONAIS_COTACAO.rastreador, centavos: 4990 });
  } else if (["auto_leves","app_taxi","especiais"].includes(categoria)) {
    if (!(categoria === "app_taxi" && plano === "premium")) {
      itens.push({ codigo: "carro_reserva_7d", nome: OPCIONAIS_COTACAO.carro_reserva_7d, centavos: 2200 });
      itens.push({ codigo: "carro_reserva_15d", nome: OPCIONAIS_COTACAO.carro_reserva_15d, centavos: 3200 });
    }
    itens.push({ codigo: "rastreador", nome: OPCIONAIS_COTACAO.rastreador, centavos: 4990 });
  } else {
    itens.push({ codigo: "rastreador", nome: OPCIONAIS_COTACAO.rastreador, centavos: 7500 });
    itens.push({ codigo: "destombamento", nome: OPCIONAIS_COTACAO.destombamento, centavos: 5000 });
  }
  return itens;
}
