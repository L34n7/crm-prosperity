export type ModoExecucaoAgendamento =
  | "imediato"
  | "apos_confirmacao"
  | "manual";

export function normalizarModoExecucaoAgendamento(
  valor: unknown,
): ModoExecucaoAgendamento {
  const modo = String(valor || "").trim();
  if (modo === "apos_confirmacao" || modo === "manual") return modo;
  return "imediato";
}

export function condicaoModoAgendamento(
  config: Record<string, unknown> | null | undefined,
  modo: ModoExecucaoAgendamento,
) {
  const chave =
    modo === "manual"
      ? "condicao_manual_prompt"
      : "condicao_confirmacao_prompt";
  return String(config?.[chave] || "").trim().slice(0, 1800);
}
