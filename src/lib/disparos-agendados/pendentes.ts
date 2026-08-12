import { getSupabaseAdmin } from "@/lib/supabase/admin";

type DisparoFluxoPendente = {
  id: string;
  payload_json: unknown;
};

type DisparoAgendaPendente = {
  id: string;
  agendamento_id: string | null;
};

function obterAgendamentoIdPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "";
  }

  const valor = (payload as Record<string, unknown>).agendamento_id;
  return typeof valor === "string" ? valor.trim() : "";
}

function obterGrupoDisparoFluxo(disparo: DisparoFluxoPendente) {
  const agendamentoId = obterAgendamentoIdPayload(disparo.payload_json);

  return agendamentoId
    ? `agendamento:${agendamentoId}`
    : `disparo:${disparo.id}`;
}

function obterGrupoDisparoAgenda(disparo: DisparoAgendaPendente) {
  const agendamentoId = String(disparo.agendamento_id || "").trim();

  return agendamentoId
    ? `agendamento:${agendamentoId}`
    : `agenda_execucao:${disparo.id}`;
}

export async function contarGruposDisparosPendentes(empresaId: string) {
  const supabase = getSupabaseAdmin();

  const [fluxosResult, agendaResult] = await Promise.all([
    supabase
      .from("automacao_agendamentos")
      .select("id,payload_json")
      .eq("empresa_id", empresaId)
      .eq("tipo_agendamento", "disparo_template")
      .in("status", ["pendente", "executando"]),
    supabase
      .from("agenda_automacao_execucoes")
      .select("id,agendamento_id")
      .eq("empresa_id", empresaId)
      .in("status", ["pendente", "processando"]),
  ]);

  if (fluxosResult.error) {
    throw new Error(
      `Erro ao contar grupos de disparos dos fluxos: ${fluxosResult.error.message}`
    );
  }

  if (agendaResult.error) {
    throw new Error(
      `Erro ao contar grupos de disparos da agenda: ${agendaResult.error.message}`
    );
  }

  const grupos = new Set<string>();

  (fluxosResult.data || []).forEach((disparo) => {
    grupos.add(obterGrupoDisparoFluxo(disparo as DisparoFluxoPendente));
  });

  (agendaResult.data || []).forEach((disparo) => {
    grupos.add(obterGrupoDisparoAgenda(disparo as DisparoAgendaPendente));
  });

  return grupos.size;
}
