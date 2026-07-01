export const TIPOS_EVENTO_MANUAL = [
  "venda_realizada",
  "venda_perdida",
  "lead_qualificado",
  "agendamento_criado",
  "agendamento_confirmado",
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
};

export function tipoEventoManualValido(tipo: string): tipo is TipoEventoManual {
  return TIPOS_EVENTO_MANUAL.includes(tipo as TipoEventoManual);
}

export function obterResultadoFluxoEventoManual(
  tipo: string
): ResultadoFluxoManual | null {
  return tipoEventoManualValido(tipo) ? RESULTADO_FLUXO_POR_TIPO[tipo] : null;
}
