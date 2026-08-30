-- Ajustes recomendados pelos advisors: índices para FKs do módulo e auth.uid()
-- como initplan nas policies, mantendo o mesmo isolamento por empresa.

create index if not exists agente_ia_conhecimentos_created_by_idx
  on public.agente_ia_conhecimentos (created_by);
create index if not exists agente_ia_conhecimentos_updated_by_idx
  on public.agente_ia_conhecimentos (updated_by);
create index if not exists agente_ia_conversa_estados_ultima_mensagem_idx
  on public.agente_ia_conversa_estados (ultima_mensagem_id);
create index if not exists agente_ia_execucoes_contato_idx
  on public.agente_ia_execucoes (contato_id);
create index if not exists agente_ia_ferramentas_empresa_idx
  on public.agente_ia_ferramentas (empresa_id);
create index if not exists agente_ia_pendencias_contato_idx
  on public.agente_ia_pendencias (contato_id);
create index if not exists agentes_ia_created_by_idx
  on public.agentes_ia (created_by);
create index if not exists agentes_ia_fallback_fluxo_idx
  on public.agentes_ia (fallback_fluxo_id);
create index if not exists agentes_ia_updated_by_idx
  on public.agentes_ia (updated_by);

drop policy if exists agentes_ia_mesma_empresa on public.agentes_ia;
create policy agentes_ia_mesma_empresa on public.agentes_ia
  for all to authenticated
  using (exists (
    select 1 from public.usuarios u
    where u.auth_user_id = (select auth.uid())
      and u.empresa_id = agentes_ia.empresa_id
      and u.status = 'ativo'
  ))
  with check (exists (
    select 1 from public.usuarios u
    where u.auth_user_id = (select auth.uid())
      and u.empresa_id = agentes_ia.empresa_id
      and u.status = 'ativo'
  ));

drop policy if exists agente_ia_conhecimentos_mesma_empresa on public.agente_ia_conhecimentos;
create policy agente_ia_conhecimentos_mesma_empresa on public.agente_ia_conhecimentos
  for all to authenticated
  using (exists (
    select 1 from public.usuarios u
    where u.auth_user_id = (select auth.uid())
      and u.empresa_id = agente_ia_conhecimentos.empresa_id
      and u.status = 'ativo'
  ))
  with check (exists (
    select 1 from public.usuarios u
    where u.auth_user_id = (select auth.uid())
      and u.empresa_id = agente_ia_conhecimentos.empresa_id
      and u.status = 'ativo'
  ));

drop policy if exists agente_ia_ferramentas_mesma_empresa on public.agente_ia_ferramentas;
create policy agente_ia_ferramentas_mesma_empresa on public.agente_ia_ferramentas
  for all to authenticated
  using (exists (
    select 1 from public.usuarios u
    where u.auth_user_id = (select auth.uid())
      and u.empresa_id = agente_ia_ferramentas.empresa_id
      and u.status = 'ativo'
  ))
  with check (exists (
    select 1 from public.usuarios u
    where u.auth_user_id = (select auth.uid())
      and u.empresa_id = agente_ia_ferramentas.empresa_id
      and u.status = 'ativo'
  ));

drop policy if exists agente_ia_conversa_estados_mesma_empresa on public.agente_ia_conversa_estados;
create policy agente_ia_conversa_estados_mesma_empresa on public.agente_ia_conversa_estados
  for all to authenticated
  using (exists (
    select 1 from public.usuarios u
    where u.auth_user_id = (select auth.uid())
      and u.empresa_id = agente_ia_conversa_estados.empresa_id
      and u.status = 'ativo'
  ))
  with check (exists (
    select 1 from public.usuarios u
    where u.auth_user_id = (select auth.uid())
      and u.empresa_id = agente_ia_conversa_estados.empresa_id
      and u.status = 'ativo'
  ));

drop policy if exists agente_ia_execucoes_mesma_empresa on public.agente_ia_execucoes;
create policy agente_ia_execucoes_mesma_empresa on public.agente_ia_execucoes
  for select to authenticated
  using (exists (
    select 1 from public.usuarios u
    where u.auth_user_id = (select auth.uid())
      and u.empresa_id = agente_ia_execucoes.empresa_id
      and u.status = 'ativo'
  ));

drop policy if exists agente_ia_pendencias_mesma_empresa on public.agente_ia_pendencias;
create policy agente_ia_pendencias_mesma_empresa on public.agente_ia_pendencias
  for select to authenticated
  using (exists (
    select 1 from public.usuarios u
    where u.auth_user_id = (select auth.uid())
      and u.empresa_id = agente_ia_pendencias.empresa_id
      and u.status = 'ativo'
  ));
