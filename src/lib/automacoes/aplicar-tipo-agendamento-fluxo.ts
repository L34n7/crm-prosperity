import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

type AplicarTipoAgendamentoFluxoParams = {
  empresaId: string;
  execucaoId?: string | null;
};

export async function aplicarTipoAgendamentoFluxo(
  params: AplicarTipoAgendamentoFluxoParams
) {
  const execucaoId = String(params.execucaoId || "").trim();
  if (!execucaoId) return;

  const { data: agendamentos, error: agendamentosError } = await supabaseAdmin
    .from("agenda_agendamentos")
    .select("id, automacao_no_id")
    .eq("empresa_id", params.empresaId)
    .eq("automacao_execucao_id", execucaoId)
    .eq("origem", "automacao")
    .is("tipo_id", null);

  if (agendamentosError) {
    console.error(
      "[AUTOMATION_ENGINE] Erro ao buscar agendamentos sem tipo da execução:",
      agendamentosError
    );
    return;
  }

  const agendamentosPendentes = (agendamentos || []).filter((agendamento) =>
    String(agendamento.automacao_no_id || "").trim()
  );

  if (agendamentosPendentes.length === 0) return;

  const noIds = Array.from(
    new Set(
      agendamentosPendentes.map((agendamento) =>
        String(agendamento.automacao_no_id)
      )
    )
  );

  const { data: nos, error: nosError } = await supabaseAdmin
    .from("automacao_nos")
    .select("id, tipo_no, configuracao_json")
    .eq("empresa_id", params.empresaId)
    .in("id", noIds);

  if (nosError) {
    console.error(
      "[AUTOMATION_ENGINE] Erro ao buscar configuração do bloco para tipo do agendamento:",
      nosError
    );
    return;
  }

  const configuracoes = (nos || [])
    .filter((no) => no.tipo_no === "agenda_criar_agendamento")
    .map((no) => ({
      noId: String(no.id),
      tipoId: String(no.configuracao_json?.tipo_id || "").trim(),
    }))
    .filter((item) => item.tipoId);

  if (configuracoes.length === 0) return;

  const tipoIds = Array.from(
    new Set(configuracoes.map((configuracao) => configuracao.tipoId))
  );
  const { data: tipos, error: tiposError } = await supabaseAdmin
    .from("agenda_tipos")
    .select("id")
    .eq("empresa_id", params.empresaId)
    .eq("ativo", true)
    .in("id", tipoIds);

  if (tiposError) {
    console.error(
      "[AUTOMATION_ENGINE] Erro ao validar tipo configurado no agendamento do fluxo:",
      tiposError
    );
    return;
  }

  const tiposValidos = new Set((tipos || []).map((tipo) => String(tipo.id)));

  for (const configuracao of configuracoes) {
    if (!tiposValidos.has(configuracao.tipoId)) {
      console.warn(
        "[AUTOMATION_ENGINE] Tipo de agendamento do bloco ignorado por estar inativo ou não pertencer à empresa.",
        {
          empresaId: params.empresaId,
          execucaoId,
          noId: configuracao.noId,
          tipoId: configuracao.tipoId,
        }
      );
      continue;
    }

    const agendamentoIds = agendamentosPendentes
      .filter(
        (agendamento) =>
          String(agendamento.automacao_no_id) === configuracao.noId
      )
      .map((agendamento) => String(agendamento.id));

    if (agendamentoIds.length === 0) continue;

    const { error: updateError } = await supabaseAdmin
      .from("agenda_agendamentos")
      .update({ tipo_id: configuracao.tipoId })
      .eq("empresa_id", params.empresaId)
      .eq("automacao_execucao_id", execucaoId)
      .in("id", agendamentoIds)
      .is("tipo_id", null);

    if (updateError) {
      console.error(
        "[AUTOMATION_ENGINE] Erro ao aplicar tipo no agendamento criado pelo fluxo:",
        {
          empresaId: params.empresaId,
          execucaoId,
          noId: configuracao.noId,
          tipoId: configuracao.tipoId,
          erro: updateError,
        }
      );
    }
  }
}
