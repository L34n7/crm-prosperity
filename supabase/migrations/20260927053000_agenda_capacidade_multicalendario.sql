-- CRM_AGENDA_CAPACIDADE_MULTICALENDARIO_V1
-- Responsavel fixo, grupos de ocupacao compartilhada e grupos de distribuicao.

alter table public.calendarios
  add column if not exists responsavel_id uuid null references public.usuarios(id) on delete set null;

create index if not exists calendarios_empresa_responsavel_idx
  on public.calendarios (empresa_id, responsavel_id)
  where responsavel_id is not null;

create table if not exists public.agenda_grupos_ocupacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  created_by uuid null references public.usuarios(id) on delete set null,
  updated_by uuid null references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agenda_grupos_ocupacao_empresa_idx
  on public.agenda_grupos_ocupacao (empresa_id, ativo, created_at desc);

create table if not exists public.agenda_grupos_ocupacao_calendarios (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  grupo_id uuid not null references public.agenda_grupos_ocupacao(id) on delete cascade,
  agenda_id uuid not null references public.calendarios(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (grupo_id, agenda_id),
  unique (empresa_id, agenda_id)
);

create index if not exists agenda_grupos_ocupacao_calendarios_empresa_grupo_idx
  on public.agenda_grupos_ocupacao_calendarios (empresa_id, grupo_id);

create table if not exists public.agenda_grupos_distribuicao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  estrategia text not null default 'rodizio'
    check (estrategia in ('rodizio', 'menor_carga', 'primeiro_disponivel')),
  ativo boolean not null default true,
  ultimo_agenda_id uuid null references public.calendarios(id) on delete set null,
  created_by uuid null references public.usuarios(id) on delete set null,
  updated_by uuid null references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agenda_grupos_distribuicao_empresa_idx
  on public.agenda_grupos_distribuicao (empresa_id, ativo, created_at desc);

create table if not exists public.agenda_grupos_distribuicao_calendarios (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  grupo_id uuid not null references public.agenda_grupos_distribuicao(id) on delete cascade,
  agenda_id uuid not null references public.calendarios(id) on delete cascade,
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (grupo_id, agenda_id)
);

create index if not exists agenda_grupos_distribuicao_calendarios_empresa_grupo_idx
  on public.agenda_grupos_distribuicao_calendarios (empresa_id, grupo_id, ativo, ordem);

alter table public.agenda_grupos_ocupacao enable row level security;
alter table public.agenda_grupos_ocupacao_calendarios enable row level security;
alter table public.agenda_grupos_distribuicao enable row level security;
alter table public.agenda_grupos_distribuicao_calendarios enable row level security;

-- Estas tabelas são acessadas exclusivamente pelo backend com service_role.
-- O GRANT explícito evita depender do comportamento padrão do projeto para
-- tabelas criadas depois da configuração inicial do Supabase.
grant select, insert, update, delete
  on table public.agenda_grupos_ocupacao,
           public.agenda_grupos_ocupacao_calendarios,
           public.agenda_grupos_distribuicao,
           public.agenda_grupos_distribuicao_calendarios
  to service_role;

create or replace function public.agenda_validar_calendario_responsavel()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.responsavel_id is not null and not exists (
    select 1
    from public.usuarios u
    where u.id = new.responsavel_id
      and u.empresa_id = new.empresa_id
      and u.status = 'ativo'
  ) then
    raise exception 'O responsavel do calendario precisa ser um usuario ativo da empresa.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.agenda_validar_calendario_responsavel()
  from public, anon, authenticated;

drop trigger if exists calendarios_validar_responsavel on public.calendarios;
create trigger calendarios_validar_responsavel
before insert or update of responsavel_id, empresa_id
on public.calendarios
for each row
execute function public.agenda_validar_calendario_responsavel();

create or replace function public.agenda_validar_membro_grupo_ocupacao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.agenda_grupos_ocupacao g
    where g.id = new.grupo_id
      and g.empresa_id = new.empresa_id
  ) then
    raise exception 'Grupo de ocupacao nao pertence a empresa.'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.calendarios c
    where c.id = new.agenda_id
      and c.empresa_id = new.empresa_id
  ) then
    raise exception 'Calendario do grupo de ocupacao nao pertence a empresa.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.agenda_validar_membro_grupo_ocupacao()
  from public, anon, authenticated;

drop trigger if exists agenda_grupo_ocupacao_validar_membro
  on public.agenda_grupos_ocupacao_calendarios;
create trigger agenda_grupo_ocupacao_validar_membro
before insert or update
on public.agenda_grupos_ocupacao_calendarios
for each row
execute function public.agenda_validar_membro_grupo_ocupacao();

create or replace function public.agenda_validar_membro_grupo_distribuicao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.agenda_grupos_distribuicao g
    where g.id = new.grupo_id
      and g.empresa_id = new.empresa_id
  ) then
    raise exception 'Grupo de distribuicao nao pertence a empresa.'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.calendarios c
    where c.id = new.agenda_id
      and c.empresa_id = new.empresa_id
  ) then
    raise exception 'Calendario do grupo de distribuicao nao pertence a empresa.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.agenda_validar_membro_grupo_distribuicao()
  from public, anon, authenticated;

drop trigger if exists agenda_grupo_distribuicao_validar_membro
  on public.agenda_grupos_distribuicao_calendarios;
create trigger agenda_grupo_distribuicao_validar_membro
before insert or update
on public.agenda_grupos_distribuicao_calendarios
for each row
execute function public.agenda_validar_membro_grupo_distribuicao();

create or replace function public.agenda_ids_bloqueio(
  p_empresa_id uuid,
  p_agenda_id uuid
)
returns table (agenda_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with grupo_atual as (
    select m.grupo_id
    from public.agenda_grupos_ocupacao_calendarios m
    join public.agenda_grupos_ocupacao g
      on g.id = m.grupo_id
     and g.empresa_id = m.empresa_id
     and g.ativo = true
    where m.empresa_id = p_empresa_id
      and m.agenda_id = p_agenda_id
    limit 1
  )
  select c.id
  from public.calendarios c
  where c.empresa_id = p_empresa_id
    and (
      c.id = p_agenda_id
      or c.id in (
        select m.agenda_id
        from public.agenda_grupos_ocupacao_calendarios m
        join grupo_atual g on g.grupo_id = m.grupo_id
        where m.empresa_id = p_empresa_id
      )
    );
$$;

revoke all on function public.agenda_ids_bloqueio(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.agenda_ids_bloqueio(uuid, uuid)
  to service_role;

create or replace function public.agenda_agendamentos_aplicar_capacidade()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_responsavel_id uuid;
  v_grupo_id uuid;
  v_chave_lock text;
begin
  select c.responsavel_id
    into v_responsavel_id
  from public.calendarios c
  where c.id = new.agenda_id
    and c.empresa_id = new.empresa_id;

  if not found then
    raise exception 'Calendario nao encontrado para este agendamento.'
      using errcode = '23503';
  end if;

  if v_responsavel_id is not null then
    new.responsavel_id := v_responsavel_id;
  end if;

  if new.status in ('agendado', 'confirmado') then
    select m.grupo_id
      into v_grupo_id
    from public.agenda_grupos_ocupacao_calendarios m
    join public.agenda_grupos_ocupacao g
      on g.id = m.grupo_id
     and g.empresa_id = m.empresa_id
     and g.ativo = true
    where m.empresa_id = new.empresa_id
      and m.agenda_id = new.agenda_id
    limit 1;

    v_chave_lock :=
      'agenda-capacidade:' ||
      new.empresa_id::text || ':' ||
      coalesce(v_grupo_id::text, new.agenda_id::text);

    perform pg_advisory_xact_lock(hashtextextended(v_chave_lock, 0));

    if exists (
      select 1
      from public.agenda_agendamentos a
      where a.empresa_id = new.empresa_id
        and a.agenda_id in (
          select b.agenda_id
          from public.agenda_ids_bloqueio(new.empresa_id, new.agenda_id) b
        )
        and a.status in ('agendado', 'confirmado')
        and a.id <> new.id
        and a.inicio_at < new.fim_at
        and a.fim_at > new.inicio_at
    ) then
      raise exception 'Este horario conflita com outro agendamento de um calendario que compartilha a mesma ocupacao.'
        using errcode = '23P01';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.agenda_agendamentos_aplicar_capacidade()
  from public, anon, authenticated;

drop trigger if exists agenda_agendamentos_aplicar_capacidade
  on public.agenda_agendamentos;
create trigger agenda_agendamentos_aplicar_capacidade
before insert or update of empresa_id, agenda_id, inicio_at, fim_at, status, responsavel_id
on public.agenda_agendamentos
for each row
execute function public.agenda_agendamentos_aplicar_capacidade();

create or replace function public.agenda_registrar_uso_distribuicao(
  p_empresa_id uuid,
  p_grupo_id uuid,
  p_agenda_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.agenda_grupos_distribuicao_calendarios m
    join public.agenda_grupos_distribuicao g
      on g.id = m.grupo_id
     and g.empresa_id = m.empresa_id
     and g.ativo = true
    where m.empresa_id = p_empresa_id
      and m.grupo_id = p_grupo_id
      and m.agenda_id = p_agenda_id
      and m.ativo = true
  ) then
    update public.agenda_grupos_distribuicao
    set ultimo_agenda_id = p_agenda_id,
        updated_at = now()
    where id = p_grupo_id
      and empresa_id = p_empresa_id;
  end if;
end;
$$;

revoke all on function public.agenda_registrar_uso_distribuicao(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.agenda_registrar_uso_distribuicao(uuid, uuid, uuid)
  to service_role;
