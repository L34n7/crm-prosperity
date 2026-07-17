export const TIPOS_EVENTO_MANUAL = [
  "venda_realizada",
  "venda_perdida",
  "lead_qualificado",
  "agendamento_criado",
  "agendamento_confirmado",
  "entrada_grupo_confirmada",
  "pagamento_confirmado",
  "objetivo_concluido",
  "objetivo_nao_concluido",
  "sem_interesse",
] as const;

export type TipoEventoManual = (typeof TIPOS_EVENTO_MANUAL)[number];
export type ResultadoFluxoManual = "positivo" | "negativo" | "neutro";

const RESULTADO_FLUXO_POR_TIPO: Record<
  TipoEventoManual,
  ResultadoFluxoManual
> = {
  venda_realizada: "positivo",
  venda_perdida: "negativo",
  lead_qualificado: "neutro",
  agendamento_criado: "positivo",
  agendamento_confirmado: "positivo",
  entrada_grupo_confirmada: "positivo",
  pagamento_confirmado: "positivo",
  objetivo_concluido: "positivo",
  objetivo_nao_concluido: "negativo",
  sem_interesse: "negativo",
};

export function tipoEventoManualValido(tipo: string): tipo is TipoEventoManual {
  return TIPOS_EVENTO_MANUAL.includes(tipo as TipoEventoManual);
}

export function obterResultadoFluxoEventoManual(
  tipo: string
): ResultadoFluxoManual | null {
  return tipoEventoManualValido(tipo) ? RESULTADO_FLUXO_POR_TIPO[tipo] : null;
}
