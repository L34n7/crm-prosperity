-- Mantém os atalhos já existentes visíveis e oculta por padrão os criados daqui em diante.
alter table public.conversas_listas add column if not exists exibir_atalho_conversas boolean not null default true;
alter table public.conversas_listas alter column exibir_atalho_conversas set default false;
alter table public.conversas_listas add column if not exists ordem_exibicao integer;
comment on column public.conversas_listas.exibir_atalho_conversas is
  'Controla somente o atalho da lista no módulo Conversas; vínculos de contatos são preservados.';
comment on column public.conversas_listas.ordem_exibicao is
  'Prioridade manual. NULL segue a ordem de criação e fica depois das listas reordenadas.';

create or replace function public.reordenar_listas_personalizadas(p_empresa_id uuid, p_lista_ids uuid[])
returns integer
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare total integer; n integer;
begin
  if p_empresa_id is null or p_lista_ids is null then
    raise exception 'Empresa ou listas não informadas.';
  end if;
  n := cardinality(p_lista_ids);
  if n > 1000 then raise exception 'Máximo de 1000 listas por operação.'; end if;
  if n <> (select count(distinct id) from unnest(p_lista_ids) as x(id)) then
    raise exception 'A ordenação contém listas duplicadas ou inválidas.';
  end if;
  perform 1 from public.conversas_listas where empresa_id=p_empresa_id order by id for update;
  select count(*) into total from public.conversas_listas where empresa_id=p_empresa_id;
  if total <> n or exists (
    select 1 from unnest(p_lista_ids) as x(id)
    where not exists (select 1 from public.conversas_listas l where l.empresa_id=p_empresa_id and l.id=x.id)
  ) then raise exception 'A ordenação deve conter todas e somente as listas da empresa.'; end if;
  update public.conversas_listas l
    set ordem_exibicao=ordered.pos::integer,updated_at=now()
    from unnest(p_lista_ids) with ordinality as ordered(id,pos)
    where l.empresa_id=p_empresa_id and l.id=ordered.id;
  return n;
end;
$$;
revoke all on function public.reordenar_listas_personalizadas(uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.reordenar_listas_personalizadas(uuid,uuid[]) to service_role;
