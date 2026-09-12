create table if not exists public.agenda_agendamento_notas (
  agendamento_id uuid primary key references public.agenda_agendamentos(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nota_id uuid not null unique references public.conversas_notas(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists agenda_agendamento_notas_empresa_idx
  on public.agenda_agendamento_notas (empresa_id);

alter table public.agenda_agendamento_notas enable row level security;
revoke all on table public.agenda_agendamento_notas from anon, authenticated;

create or replace function public.agenda_resolver_conversa_contato(
  p_empresa_id uuid,
  p_contato_id uuid,
  p_conversa_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversa_id uuid;
begin
  if p_conversa_id is not null then
    select c.id into v_conversa_id
    from public.conversas c
    where c.id = p_conversa_id
      and c.empresa_id = p_empresa_id
      and (p_contato_id is null or c.contato_id = p_contato_id)
    limit 1;

    if v_conversa_id is not null then
      return v_conversa_id;
    end if;
  end if;

  if p_contato_id is null then
    return null;
  end if;

  select c.id into v_conversa_id
  from public.conversas c
  where c.empresa_id = p_empresa_id
    and c.contato_id = p_contato_id
  order by c.ultimo_evento_em desc nulls last,
           c.updated_at desc nulls last,
           c.created_at desc
  limit 1;

  return v_conversa_id;
end;
$$;

revoke all on function public.agenda_resolver_conversa_contato(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.agenda_sincronizar_nota_descricao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_descricao_nova text;
  v_descricao_antiga text;
  v_conversa_id uuid;
  v_nota_id uuid;
  v_autor_id uuid;
  v_deve_criar boolean := false;
begin
  v_descricao_nova := nullif(trim(coalesce(new.observacoes, '')), '');
  if tg_op = 'UPDATE' then
    v_descricao_antiga := nullif(trim(coalesce(old.observacoes, '')), '');
  end if;

  select m.nota_id into v_nota_id
  from public.agenda_agendamento_notas m
  where m.agendamento_id = new.id
    and m.empresa_id = new.empresa_id
  limit 1;

  if v_descricao_nova is null then
    if v_nota_id is not null then
      delete from public.conversas_notas
      where id = v_nota_id
        and empresa_id = new.empresa_id;
    end if;
    return new;
  end if;

  v_conversa_id := public.agenda_resolver_conversa_contato(
    new.empresa_id,
    new.contato_id,
    new.conversa_id
  );

  if v_nota_id is not null then
    if v_conversa_id is null then
      delete from public.conversas_notas
      where id = v_nota_id
        and empresa_id = new.empresa_id;
    else
      update public.conversas_notas
      set conversa_id = v_conversa_id,
          conteudo = left('Descrição da reunião: ' || v_descricao_nova, 600),
          updated_at = now()
      where id = v_nota_id
        and empresa_id = new.empresa_id;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_deve_criar := true;
  else
    v_deve_criar := v_descricao_antiga is null
      or old.contato_id is distinct from new.contato_id
      or old.conversa_id is distinct from new.conversa_id;
  end if;

  if not v_deve_criar or v_conversa_id is null then
    return new;
  end if;

  select u.id into v_autor_id
  from public.usuarios u
  where u.empresa_id = new.empresa_id
    and u.auth_user_id = auth.uid()
  limit 1;

  if v_autor_id is null then
    select u.id into v_autor_id
    from public.usuarios u
    where u.empresa_id = new.empresa_id
      and u.id in (new.updated_by, new.created_by, new.responsavel_id)
    order by case
      when u.id = new.updated_by then 1
      when u.id = new.created_by then 2
      else 3
    end
    limit 1;
  end if;

  if v_autor_id is null then
    select u.id into v_autor_id
    from public.usuarios u
    where u.empresa_id = new.empresa_id
      and u.status = 'ativo'
    order by u.created_at
    limit 1;
  end if;

  if v_autor_id is null then
    return new;
  end if;

  insert into public.conversas_notas (
    empresa_id,
    conversa_id,
    autor_id,
    conteudo
  ) values (
    new.empresa_id,
    v_conversa_id,
    v_autor_id,
    left('Descrição da reunião: ' || v_descricao_nova, 600)
  ) returning id into v_nota_id;

  insert into public.agenda_agendamento_notas (
    agendamento_id,
    empresa_id,
    nota_id
  ) values (
    new.id,
    new.empresa_id,
    v_nota_id
  )
  on conflict (agendamento_id) do nothing;

  return new;
end;
$$;

revoke all on function public.agenda_sincronizar_nota_descricao() from public, anon, authenticated;

drop trigger if exists trg_agenda_sincronizar_nota_descricao on public.agenda_agendamentos;
create trigger trg_agenda_sincronizar_nota_descricao
after insert or update of observacoes, contato_id, conversa_id
on public.agenda_agendamentos
for each row
execute function public.agenda_sincronizar_nota_descricao();

create or replace function public.agenda_excluir_nota_descricao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nota_id uuid;
begin
  select m.nota_id into v_nota_id
  from public.agenda_agendamento_notas m
  where m.agendamento_id = old.id
    and m.empresa_id = old.empresa_id
  limit 1;

  if v_nota_id is not null then
    delete from public.conversas_notas
    where id = v_nota_id
      and empresa_id = old.empresa_id;
  end if;

  return old;
end;
$$;

revoke all on function public.agenda_excluir_nota_descricao() from public, anon, authenticated;

drop trigger if exists trg_agenda_excluir_nota_descricao on public.agenda_agendamentos;
create trigger trg_agenda_excluir_nota_descricao
before delete on public.agenda_agendamentos
for each row
execute function public.agenda_excluir_nota_descricao();

create or replace function public.agenda_etapa1_listar_tipos_personalizados()
returns table(id uuid, nome text, cor text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
begin
  select u.empresa_id into v_empresa_id
  from public.usuarios u
  where u.auth_user_id = auth.uid()
    and u.status = 'ativo'
    and u.empresa_id is not null
  limit 1;

  if v_empresa_id is null then
    raise exception 'Usuário não autenticado ou sem empresa ativa.' using errcode='42501';
  end if;

  return query
  select t.id, t.nome, t.cor
  from public.agenda_tipos t
  where t.empresa_id = v_empresa_id
    and t.ativo = true
    and coalesce(t.padrao, false) = false
  order by t.nome;
end;
$$;

revoke all on function public.agenda_etapa1_listar_tipos_personalizados() from public, anon;
grant execute on function public.agenda_etapa1_listar_tipos_personalizados() to authenticated;

create or replace function public.agenda_etapa1_excluir_tipo(p_tipo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_empresa_id uuid;
  v_tipo public.agenda_tipos%rowtype;
begin
  select u.id, u.empresa_id into v_usuario_id, v_empresa_id
  from public.usuarios u
  where u.auth_user_id = auth.uid()
    and u.status = 'ativo'
    and u.empresa_id is not null
  limit 1;

  if v_usuario_id is null or v_empresa_id is null then
    raise exception 'Usuário não autenticado ou sem empresa ativa.' using errcode='42501';
  end if;

  update public.agenda_tipos
  set ativo = false,
      updated_by = v_usuario_id,
      updated_at = now()
  where id = p_tipo_id
    and empresa_id = v_empresa_id
    and coalesce(padrao, false) = false
    and ativo = true
  returning * into v_tipo;

  if v_tipo.id is null then
    raise exception 'Tipo personalizado não encontrado ou já excluído.' using errcode='P0002';
  end if;

  return to_jsonb(v_tipo);
end;
$$;

revoke all on function public.agenda_etapa1_excluir_tipo(uuid) from public, anon;
grant execute on function public.agenda_etapa1_excluir_tipo(uuid) to authenticated;
