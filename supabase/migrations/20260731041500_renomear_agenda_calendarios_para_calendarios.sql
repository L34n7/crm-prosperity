begin;

do $$
declare
  old_kind "char";
  new_kind "char";
begin
  select c.relkind
    into old_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'agenda_calendarios';

  select c.relkind
    into new_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'calendarios';

  if old_kind = 'r' and new_kind is null then
    alter table public.agenda_calendarios rename to calendarios;
  elsif old_kind = 'r' and new_kind is not null then
    raise exception 'As tabelas agenda_calendarios e calendarios existem simultaneamente.';
  elsif old_kind is null and new_kind is null then
    raise exception 'A tabela de calendários não foi encontrada.';
  end if;
end
$$;

do $$
begin
  if exists (select 1 from pg_constraint where conrelid = 'public.calendarios'::regclass and conname = 'agenda_calendarios_pkey') then
    alter table public.calendarios rename constraint agenda_calendarios_pkey to calendarios_pkey;
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.calendarios'::regclass and conname = 'agenda_calendarios_empresa_id_fkey') then
    alter table public.calendarios rename constraint agenda_calendarios_empresa_id_fkey to calendarios_empresa_id_fkey;
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.calendarios'::regclass and conname = 'agenda_calendarios_created_by_fkey') then
    alter table public.calendarios rename constraint agenda_calendarios_created_by_fkey to calendarios_created_by_fkey;
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.calendarios'::regclass and conname = 'agenda_calendarios_updated_by_fkey') then
    alter table public.calendarios rename constraint agenda_calendarios_updated_by_fkey to calendarios_updated_by_fkey;
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.calendarios'::regclass and conname = 'agenda_calendarios_duracao_minutos_check') then
    alter table public.calendarios rename constraint agenda_calendarios_duracao_minutos_check to calendarios_duracao_minutos_check;
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.calendarios'::regclass and conname = 'agenda_calendarios_intervalo_minutos_check') then
    alter table public.calendarios rename constraint agenda_calendarios_intervalo_minutos_check to calendarios_intervalo_minutos_check;
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.calendarios'::regclass and conname = 'agenda_calendarios_antecedencia_minutos_check') then
    alter table public.calendarios rename constraint agenda_calendarios_antecedencia_minutos_check to calendarios_antecedencia_minutos_check;
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.calendarios'::regclass and conname = 'agenda_calendarios_janela_dias_check') then
    alter table public.calendarios rename constraint agenda_calendarios_janela_dias_check to calendarios_janela_dias_check;
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.calendarios'::regclass and conname = 'agenda_calendarios_status_check') then
    alter table public.calendarios rename constraint agenda_calendarios_status_check to calendarios_status_check;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.agenda_calendarios_empresa_status_idx') is not null
     and to_regclass('public.calendarios_empresa_status_idx') is null then
    alter index public.agenda_calendarios_empresa_status_idx rename to calendarios_empresa_status_idx;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'agenda_calendarios'
       and c.relkind = 'v'
  ) then
    drop view public.agenda_calendarios;
  end if;
end
$$;

create view public.agenda_calendarios
with (security_invoker = true)
as
select * from public.calendarios;

grant select, insert, update, delete on public.agenda_calendarios to authenticated;
grant select, insert, update, delete on public.agenda_calendarios to service_role;

comment on table public.calendarios is
  'Calendários configuráveis da empresa. Cada calendário agrupa disponibilidade, integrações e agendamentos.';
comment on view public.agenda_calendarios is
  'Compatibilidade temporária para código legado. A tabela oficial é public.calendarios.';

notify pgrst, 'reload schema';

commit;
