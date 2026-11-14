/** Valida a ciência e autorização explícitas, sem alterar opt-in ou bloqueios. */
export function validarConsentimentoSemOptOut(params: {
  categoria: string | null | undefined;
  optOutHabilitado: boolean | null | undefined;
  cienciaRiscos: boolean;
  autorizacaoContatos: boolean;
}) {
  const categoria = String(params.categoria || "").trim().toLowerCase();
  const necessario = (categoria === "marketing" || categoria === "utility") &&
    params.optOutHabilitado !== true;
  if (necessario && (!params.cienciaRiscos || !params.autorizacaoContatos)) {
    return { ok: false as const, necessario, error:
      "O template não tem o rodapé padrão de opt-out. Confirme as duas declarações da etapa 4 antes de enviar ou agendar." };
  }
  return { ok: true as const, necessario };
}
