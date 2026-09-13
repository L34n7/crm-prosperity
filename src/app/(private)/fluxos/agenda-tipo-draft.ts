export type AgendaTipoAgendamentoDraft = {
  tipo_id: string | null;
};

type DraftInterno = {
  valor: AgendaTipoAgendamentoDraft;
  prontoParaAplicar: boolean;
};

const drafts = new Map<string, DraftInterno>();

function normalizarTipoId(valor: unknown) {
  const tipoId = String(valor || "").trim();
  return tipoId || null;
}

export function definirDraftTipoAgendamento(
  noId: string,
  tipoId: string | null
) {
  if (!noId) return;

  drafts.set(noId, {
    valor: {
      tipo_id: normalizarTipoId(tipoId),
    },
    prontoParaAplicar: false,
  });
}

export function atualizarDraftTipoAgendamento(
  noId: string,
  tipoId: string | null
) {
  if (!noId) return;

  const atual = drafts.get(noId);

  drafts.set(noId, {
    valor: {
      tipo_id: normalizarTipoId(tipoId),
    },
    prontoParaAplicar: atual?.prontoParaAplicar === true,
  });
}

export function prepararDraftTipoAgendamentoParaAplicar(noId: string) {
  const atual = drafts.get(noId);
  if (!atual) return;

  drafts.set(noId, {
    valor: { ...atual.valor },
    prontoParaAplicar: true,
  });
}

export function consumirDraftTipoAgendamentoParaAplicar(noId: string) {
  const atual = drafts.get(noId);
  if (!atual?.prontoParaAplicar) return null;

  drafts.delete(noId);

  return {
    tipo_id: normalizarTipoId(atual.valor.tipo_id),
  };
}

export function limparDraftTipoAgendamento(noId: string) {
  if (!noId) return;
  drafts.delete(noId);
}
