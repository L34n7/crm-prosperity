/* eslint-disable @typescript-eslint/no-explicit-any */

export type AgendaEstrategiaDistribuicao =
  | "rodizio"
  | "menor_carga"
  | "primeiro_disponivel";

function idsUnicos(value: unknown) {
  const values = Array.isArray(value) ? value : [];
  return Array.from(
    new Set(
      values
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );
}

export async function listarAgendaIdsBloqueio(params: {
  supabase: any;
  empresaId: string;
  agendaId: string;
}) {
  const { data, error } = await params.supabase.rpc("agenda_ids_bloqueio", {
    p_empresa_id: params.empresaId,
    p_agenda_id: params.agendaId,
  });

  if (error) {
    throw new Error(
      `Erro ao resolver calendários com ocupação compartilhada: ${error.message}`,
    );
  }

  const ids = (Array.isArray(data) ? data : [])
    .map((item: any) => String(item?.agenda_id || "").trim())
    .filter(Boolean);

  return ids.length > 0 ? Array.from(new Set(ids)) : [params.agendaId];
}

export async function obterCalendariosMesclados(params: {
  supabase: any;
  empresaId: string;
  agendaId: string;
}) {
  const ids = await listarAgendaIdsBloqueio(params);
  return ids.filter((id) => id !== params.agendaId);
}

export async function sincronizarOcupacaoCompartilhada(params: {
  supabase: any;
  empresaId: string;
  agendaId: string;
  agendaIds: unknown;
  usuarioId?: string | null;
}) {
  const selecionados = idsUnicos(params.agendaIds).filter(
    (id) => id !== params.agendaId,
  );

  const { data: agendaAtual, error: agendaAtualError } = await params.supabase
    .from("calendarios")
    .select("id, nome")
    .eq("empresa_id", params.empresaId)
    .eq("id", params.agendaId)
    .maybeSingle();

  if (agendaAtualError || !agendaAtual) {
    throw new Error("Calendário não encontrado para configurar ocupação.");
  }

  if (selecionados.length > 0) {
    const { data: validos, error: validosError } = await params.supabase
      .from("calendarios")
      .select("id")
      .eq("empresa_id", params.empresaId)
      .in("id", selecionados);

    if (validosError) {
      throw new Error(
        `Erro ao validar calendários compartilhados: ${validosError.message}`,
      );
    }

    const validosSet = new Set((validos || []).map((item: any) => item.id));
    if (selecionados.some((id) => !validosSet.has(id))) {
      throw new Error(
        "Um dos calendários selecionados não pertence à empresa.",
      );
    }
  }

  const { data: vinculoAtual, error: vinculoAtualError } = await params.supabase
    .from("agenda_grupos_ocupacao_calendarios")
    .select("grupo_id")
    .eq("empresa_id", params.empresaId)
    .eq("agenda_id", params.agendaId)
    .maybeSingle();

  if (vinculoAtualError) {
    throw new Error(
      `Erro ao consultar grupo de ocupação: ${vinculoAtualError.message}`,
    );
  }

  if (selecionados.length === 0) {
    if (!vinculoAtual?.grupo_id) return [];

    const grupoId = String(vinculoAtual.grupo_id);
    const { error: removerError } = await params.supabase
      .from("agenda_grupos_ocupacao_calendarios")
      .delete()
      .eq("empresa_id", params.empresaId)
      .eq("grupo_id", grupoId)
      .eq("agenda_id", params.agendaId);

    if (removerError) {
      throw new Error(
        `Erro ao remover ocupação compartilhada: ${removerError.message}`,
      );
    }

    const { data: restantes } = await params.supabase
      .from("agenda_grupos_ocupacao_calendarios")
      .select("agenda_id")
      .eq("empresa_id", params.empresaId)
      .eq("grupo_id", grupoId);

    if ((restantes || []).length < 2) {
      await params.supabase
        .from("agenda_grupos_ocupacao")
        .delete()
        .eq("empresa_id", params.empresaId)
        .eq("id", grupoId);
    }

    return [];
  }

  const desejados = [params.agendaId, ...selecionados];
  const { data: vinculosDesejados, error: vinculosDesejadosError } =
    await params.supabase
      .from("agenda_grupos_ocupacao_calendarios")
      .select("grupo_id, agenda_id")
      .eq("empresa_id", params.empresaId)
      .in("agenda_id", desejados);

  if (vinculosDesejadosError) {
    throw new Error(
      `Erro ao consultar ocupações existentes: ${vinculosDesejadosError.message}`,
    );
  }

  const grupoIds = Array.from(
    new Set(
      (vinculosDesejados || [])
        .map((item: any) => String(item.grupo_id || "").trim())
        .filter(Boolean),
    ),
  );

  let agendaIdsFinais = new Set(desejados);

  if (grupoIds.length > 0) {
    const { data: membrosExistentes, error: membrosError } = await params.supabase
      .from("agenda_grupos_ocupacao_calendarios")
      .select("grupo_id, agenda_id")
      .eq("empresa_id", params.empresaId)
      .in("grupo_id", grupoIds);

    if (membrosError) {
      throw new Error(
        `Erro ao carregar calendários já mesclados: ${membrosError.message}`,
      );
    }

    for (const item of membrosExistentes || []) {
      agendaIdsFinais.add(String(item.agenda_id));
    }
  }

  let grupoId = String(vinculoAtual?.grupo_id || grupoIds[0] || "");

  if (!grupoId) {
    const { data: criado, error: criarError } = await params.supabase
      .from("agenda_grupos_ocupacao")
      .insert({
        empresa_id: params.empresaId,
        nome: `Ocupação compartilhada · ${agendaAtual.nome}`,
        ativo: true,
        created_by: params.usuarioId || null,
        updated_by: params.usuarioId || null,
      })
      .select("id")
      .single();

    if (criarError || !criado) {
      throw new Error(
        `Erro ao criar grupo de ocupação: ${criarError?.message || "sem retorno"}`,
      );
    }

    grupoId = String(criado.id);
  }

  const gruposSecundarios = grupoIds.filter((id) => id !== grupoId);
  if (gruposSecundarios.length > 0) {
    const { error: liberarError } = await params.supabase
      .from("agenda_grupos_ocupacao_calendarios")
      .delete()
      .eq("empresa_id", params.empresaId)
      .in("grupo_id", gruposSecundarios);

    if (liberarError) {
      throw new Error(
        `Erro ao consolidar grupos de ocupação: ${liberarError.message}`,
      );
    }

    await params.supabase
      .from("agenda_grupos_ocupacao")
      .delete()
      .eq("empresa_id", params.empresaId)
      .in("id", gruposSecundarios);
  }

  const rows = Array.from(agendaIdsFinais).map((agendaId) => ({
    empresa_id: params.empresaId,
    grupo_id: grupoId,
    agenda_id: agendaId,
  }));

  const { error: upsertError } = await params.supabase
    .from("agenda_grupos_ocupacao_calendarios")
    .upsert(rows, { onConflict: "grupo_id,agenda_id" });

  if (upsertError) {
    throw new Error(
      `Erro ao salvar ocupação compartilhada: ${upsertError.message}`,
    );
  }

  await params.supabase
    .from("agenda_grupos_ocupacao")
    .update({
      ativo: true,
      updated_by: params.usuarioId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("empresa_id", params.empresaId)
    .eq("id", grupoId);

  return Array.from(agendaIdsFinais).filter((id) => id !== params.agendaId);
}

export async function listarGruposDistribuicao(params: {
  supabase: any;
  empresaId: string;
  somenteAtivos?: boolean;
}) {
  let gruposQuery = params.supabase
    .from("agenda_grupos_distribuicao")
    .select(
      "id, empresa_id, nome, estrategia, ativo, ultimo_agenda_id, created_at, updated_at",
    )
    .eq("empresa_id", params.empresaId)
    .order("created_at", { ascending: true });

  if (params.somenteAtivos !== false) {
    gruposQuery = gruposQuery.eq("ativo", true);
  }

  const [{ data: grupos, error: gruposError }, { data: membros, error: membrosError }] =
    await Promise.all([
      gruposQuery,
      params.supabase
        .from("agenda_grupos_distribuicao_calendarios")
        .select("grupo_id, agenda_id, ordem, ativo")
        .eq("empresa_id", params.empresaId)
        .order("ordem", { ascending: true }),
    ]);

  if (gruposError) {
    throw new Error(
      `Erro ao buscar grupos de distribuição: ${gruposError.message}`,
    );
  }

  if (membrosError) {
    throw new Error(
      `Erro ao buscar membros de distribuição: ${membrosError.message}`,
    );
  }

  const membrosPorGrupo = new Map<string, any[]>();
  for (const membro of membros || []) {
    const grupoId = String(membro.grupo_id);
    membrosPorGrupo.set(grupoId, [
      ...(membrosPorGrupo.get(grupoId) || []),
      membro,
    ]);
  }

  return (grupos || []).map((grupo: any) => ({
    ...grupo,
    agenda_ids: (membrosPorGrupo.get(String(grupo.id)) || [])
      .filter((item) => item.ativo !== false)
      .map((item) => String(item.agenda_id)),
  }));
}

export async function registrarUsoGrupoDistribuicao(params: {
  supabase: any;
  empresaId: string;
  grupoId?: string | null;
  agendaId: string;
}) {
  const grupoId = String(params.grupoId || "").trim();
  if (!grupoId) return;

  const { error } = await params.supabase.rpc(
    "agenda_registrar_uso_distribuicao",
    {
      p_empresa_id: params.empresaId,
      p_grupo_id: grupoId,
      p_agenda_id: params.agendaId,
    },
  );

  if (error) {
    console.error("[AGENDA_DISTRIBUICAO] Falha ao registrar uso do grupo:", error);
  }
}
