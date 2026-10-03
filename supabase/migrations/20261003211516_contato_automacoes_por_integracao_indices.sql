create index if not exists contato_automacoes_integracoes_contato_idx
  on public.contato_automacoes_integracoes (contato_id);

create index if not exists contato_automacoes_integracoes_integracao_idx
  on public.contato_automacoes_integracoes (integracao_whatsapp_id);

create index if not exists contato_automacoes_integracoes_desabilitadas_por_idx
  on public.contato_automacoes_integracoes (desabilitadas_por);

create index if not exists contato_automacoes_integracoes_habilitadas_por_idx
  on public.contato_automacoes_integracoes (habilitadas_por);

drop policy if exists contato_automacoes_integracoes_sem_acesso_cliente
  on public.contato_automacoes_integracoes;

create policy contato_automacoes_integracoes_sem_acesso_cliente
  on public.contato_automacoes_integracoes
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);
