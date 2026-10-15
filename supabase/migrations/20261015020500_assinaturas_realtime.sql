begin;

create or replace function public.usuario_pode_ver_assinatura_empresa_realtime(
  target_empresa_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.usuarios u
      where u.auth_user_id = auth.uid()
        and u.status = 'ativo'
        and u.empresa_id = target_empresa_id
    )
    or exists (
      select 1
      from public.usuario_sessoes s
      where s.auth_user_id = auth.uid()
        and s.status = 'online'
        and s.logout_at is null
        and s.metadata_json ->> 'tipo' = 'acesso_temporario_empresa'
        and s.metadata_json ->> 'empresa_alvo_id' = target_empresa_id::text
        and case
          when coalesce(s.metadata_json ->> 'expira_em', '') ~
            '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}'
          then (s.metadata_json ->> 'expira_em')::timestamptz > now()
          else false
        end
    );
$$;

revoke all on function public.usuario_pode_ver_assinatura_empresa_realtime(uuid)
  from public, anon;
grant execute on function public.usuario_pode_ver_assinatura_empresa_realtime(uuid)
  to authenticated;

grant select on table public.prosperity_pay_assinaturas to authenticated;
grant select on table public.prosperity_pay_recursos_agendados to authenticated;

drop policy if exists prosperity_pay_assinaturas_realtime_select
  on public.prosperity_pay_assinaturas;
create policy prosperity_pay_assinaturas_realtime_select
  on public.prosperity_pay_assinaturas
  for select
  to authenticated
  using (
    public.usuario_pode_ver_assinatura_empresa_realtime(empresa_id)
  );

drop policy if exists prosperity_pay_recursos_realtime_select
  on public.prosperity_pay_recursos_agendados;
create policy prosperity_pay_recursos_realtime_select
  on public.prosperity_pay_recursos_agendados
  for select
  to authenticated
  using (
    public.usuario_pode_ver_assinatura_empresa_realtime(empresa_id)
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'prosperity_pay_assinaturas'
  ) then
    alter publication supabase_realtime
      add table public.prosperity_pay_assinaturas;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'prosperity_pay_recursos_agendados'
  ) then
    alter publication supabase_realtime
      add table public.prosperity_pay_recursos_agendados;
  end if;
end;
$$;

commit;
