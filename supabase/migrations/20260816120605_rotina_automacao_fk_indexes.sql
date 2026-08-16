create index if not exists rotina_automacao_acoes_empresa_idx
  on public.rotina_automacao_acoes (empresa_id);
create index if not exists rotina_automacao_condicoes_empresa_idx
  on public.rotina_automacao_condicoes (empresa_id);
create index if not exists rotina_automacao_execucoes_automacao_idx
  on public.rotina_automacao_execucoes (automacao_id);
create index if not exists rotina_automacao_execucoes_gatilho_idx
  on public.rotina_automacao_execucoes (gatilho_id)
  where gatilho_id is not null;
create index if not exists rotina_automacao_gatilhos_automacao_idx
  on public.rotina_automacao_gatilhos (automacao_id);
create index if not exists rotina_automacao_gatilhos_empresa_idx
  on public.rotina_automacao_gatilhos (empresa_id);
create index if not exists rotina_automacao_jobs_acao_idx
  on public.rotina_automacao_jobs (acao_id)
  where acao_id is not null;
create index if not exists rotina_automacao_jobs_automacao_idx
  on public.rotina_automacao_jobs (automacao_id);
create index if not exists rotina_automacao_jobs_empresa_idx
  on public.rotina_automacao_jobs (empresa_id);
create index if not exists rotina_automacao_jobs_execucao_idx
  on public.rotina_automacao_jobs (execucao_id)
  where execucao_id is not null;
