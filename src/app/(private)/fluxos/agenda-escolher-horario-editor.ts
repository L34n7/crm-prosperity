export const TIPO_NO_AGENDA_ESCOLHER_HORARIO = "agenda_escolher_horario";

export const SAIDAS_AGENDA_ESCOLHER_HORARIO = [
  { valor: "slot_escolhido", titulo: "Horário escolhido" },
  { valor: "sem_horarios", titulo: "Sem horários" },
] as const;

export function saidaAgendaEscolherHorarioPorValor(valor: unknown) {
  const normalizado = String(valor || "").trim();

  return (
    SAIDAS_AGENDA_ESCOLHER_HORARIO.find(
      (saida) => saida.valor === normalizado
    ) || null
  );
}
