alter table public.pessoas
  add column if not exists interesse text;

comment on column public.pessoas.interesse is
  'Interesse único do Cliente/Paciente, sincronizado com todos os contatos vinculados.';

with canonico as (
  select distinct on (c.pessoa_id)
    c.pessoa_id,
    c.empresa_id,
    c.interesse
  from public.contatos c
  where c.pessoa_id is not null
    and nullif(trim(c.interesse), '') is not null
  order by
    c.pessoa_id,
    c.updated_at desc nulls last,
    c.created_at desc nulls last,
    c.id desc
),
historico as (
  select
    p.id as pessoa_id,
    p.empresa_id,
    p.interesse as interesse_anterior_pessoa,
    ca.interesse as interesse_canonico,
    jsonb_agg(distinct c.interesse)
      filter (where nullif(trim(c.interesse), '') is not null) as interesses_anteriores_contatos
  from public.pessoas p
  join canonico ca
    on ca.pessoa_id = p.id
   and ca.empresa_id = p.empresa_id
  join public.contatos c
    on c.pessoa_id = p.id
   and c.empresa_id = p.empresa_id
  group by p.id, p.empresa_id, p.interesse, ca.interesse
)
insert into public.logs_auditoria (
  empresa_id, categoria, entidade, entidade_id, acao, descricao, antes, depois, metadata
)
select
  h.empresa_id,
  'pessoas',
  'pessoa',
  h.pessoa_id,
  'interesse_sincronizado_inicial',
  'Interesse consolidado automaticamente entre Cliente/Paciente e contatos vinculados.',
  jsonb_build_object(
    'interesse', h.interesse_anterior_pessoa,
    'interesses_contatos', coalesce(h.interesses_anteriores_contatos, '[]'::jsonb)
  ),
  jsonb_build_object('interesse', h.interesse_canonico),
  jsonb_build_object(
    'origem', 'migracao_sincronizacao_interesse',
    'criterio', 'contato_com_interesse_atualizado_mais_recentemente'
  )
from historico h
where h.interesse_canonico is not null;

with canonico as (
  select distinct on (c.pessoa_id)
    c.pessoa_id,
    c.empresa_id,
    nullif(trim(c.interesse), '') as interesse
  from public.contatos c
  where c.pessoa_id is not null
    and nullif(trim(c.interesse), '') is not null
  order by
    c.pessoa_id,
    c.updated_at desc nulls last,
    c.created_at desc nulls last,
    c.id desc
)
update public.pessoas p
set interesse = ca.interesse
from canonico ca
where p.id = ca.pessoa_id
  and p.empresa_id = ca.empresa_id
  and p.interesse is distinct from ca.interesse;

update public.contatos c
set interesse = p.interesse
from public.pessoas p
where c.pessoa_id = p.id
  and c.empresa_id = p.empresa_id
  and c.interesse is distinct from p.interesse;

create or replace function public.sincronizar_interesse_pessoa_para_contatos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.contatos
  set interesse = new.interesse
  where empresa_id = new.empresa_id
    and pessoa_id = new.id
    and interesse is distinct from new.interesse;
  return new;
end;
$$;

create or replace function public.sincronizar_interesse_contato_para_pessoa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_interesse_pessoa text;
begin
  if new.pessoa_id is null then
    return new;
  end if;

  select p.interesse
    into v_interesse_pessoa
  from public.pessoas p
  where p.id = new.pessoa_id
    and p.empresa_id = new.empresa_id;

  if tg_op = 'INSERT'
     or (tg_op = 'UPDATE' and new.pessoa_id is distinct from old.pessoa_id) then
    if v_interesse_pessoa is not null then
      update public.contatos
      set interesse = v_interesse_pessoa
      where id = new.id
        and empresa_id = new.empresa_id
        and interesse is distinct from v_interesse_pessoa;
    elsif new.interesse is not null then
      update public.pessoas
      set interesse = new.interesse
      where id = new.pessoa_id
        and empresa_id = new.empresa_id
        and interesse is distinct from new.interesse;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.interesse is distinct from old.interesse then
    update public.pessoas
    set interesse = new.interesse
    where id = new.pessoa_id
      and empresa_id = new.empresa_id
      and interesse is distinct from new.interesse;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pessoas_interesse_insert_contatos on public.pessoas;
create trigger trg_pessoas_interesse_insert_contatos
  after insert on public.pessoas
  for each row
  execute function public.sincronizar_interesse_pessoa_para_contatos();

drop trigger if exists trg_pessoas_interesse_update_contatos on public.pessoas;
create trigger trg_pessoas_interesse_update_contatos
  after update of interesse on public.pessoas
  for each row
  when (old.interesse is distinct from new.interesse)
  execute function public.sincronizar_interesse_pessoa_para_contatos();

drop trigger if exists trg_contatos_interesse_pessoa on public.contatos;
create trigger trg_contatos_interesse_pessoa
  after insert or update of interesse, pessoa_id on public.contatos
  for each row
  execute function public.sincronizar_interesse_contato_para_pessoa();
