-- CRM_AGENDA_VISUALIZACAO_USUARIO_V1
-- Calendarios fixados por usuario para restaurar a visualizacao ao abrir o modulo Agenda.

create table if not exists public.agenda_visualizacao_usuario_calendarios (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  agenda_id uuid not null references public.calendarios(id) on delete cascade,
  ordem integer not null default 0 check (ordem >= 0),
  created_at timestamptz not null default now(),
  primary key (usuario_id, agenda_id)
);

create index if not exists agenda_visualizacao_usuario_empresa_idx
  on public.agenda_visualizacao_usuario_calendarios
  (empresa_id, usuario_id, ordem);

alter table public.agenda_visualizacao_usuario_calendarios
  enable row level security;

grant select, insert, update, delete
  on table public.agenda_visualizacao_usuario_calendarios
  to service_role;

create or replace function public.agenda_validar_visualizacao_usuario_calendario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.usuarios u
    where u.id = new.usuario_id
      and u.empresa_id = new.empresa_id
  ) then
    raise exception 'Usuario da visualizacao nao pertence a empresa.'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.calendarios c
    where c.id = new.agenda_id
      and c.empresa_id = new.empresa_id
  ) then
    raise exception 'Calendario da visualizacao nao pertence a empresa.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.agenda_validar_visualizacao_usuario_calendario()
  from public, anon, authenticated;

drop trigger if exists agenda_visualizacao_usuario_validar
  on public.agenda_visualizacao_usuario_calendarios;

create trigger agenda_visualizacao_usuario_validar
before insert or update
on public.agenda_visualizacao_usuario_calendarios
for each row
execute function public.agenda_validar_visualizacao_usuario_calendario();
