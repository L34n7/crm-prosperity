create or replace function public.excluir_empresa_definitivamente_admin(
  p_empresa_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_empresa_nome text;
  v_tabela record;
  v_excluidos bigint;
  v_total_excluidos bigint := 0;
begin
  if p_empresa_id is null then
    raise exception 'Empresa nao informada.';
  end if;

  select nome_fantasia
    into v_empresa_nome
  from public.empresas
  where id = p_empresa_id
  for update;

  if not found then
    raise exception 'Empresa nao encontrada.';
  end if;

  -- Limpa somente tabelas com empresa_id que nao possuem FK direta para
  -- empresas. Elas nao participam do CASCADE e poderiam ficar orfas.
  for v_tabela in
    select distinct c.relname as tabela
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and a.attnum > 0
      and not a.attisdropped
      and a.attname = 'empresa_id'
      and c.relname <> 'empresas'
      and not exists (
        select 1
        from pg_constraint con
        where con.contype = 'f'
          and con.conrelid = c.oid
          and con.confrelid = 'public.empresas'::regclass
      )
    order by c.relname
  loop
    begin
      execute format(
        'delete from public.%I where empresa_id = $1',
        v_tabela.tabela
      )
      using p_empresa_id;

      get diagnostics v_excluidos = row_count;
      v_total_excluidos := v_total_excluidos + v_excluidos;
    exception
      when foreign_key_violation then
        null;
    end;
  end loop;

  -- agenda_agendamentos possui um filho RESTRICT.
  delete from public.estoque_consumos_clinicos
  where empresa_id = p_empresa_id;
  get diagnostics v_excluidos = row_count;
  v_total_excluidos := v_total_excluidos + v_excluidos;

  -- Limpa apenas FKs diretas para empresas que nao sao CASCADE.
  for v_tabela in
    select distinct c.relname as tabela
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'f'
      and con.confrelid = 'public.empresas'::regclass
      and con.confdeltype <> 'c'
      and n.nspname = 'public'
    order by c.relname
  loop
    execute format(
      'delete from public.%I where empresa_id = $1',
      v_tabela.tabela
    )
    using p_empresa_id;

    get diagnostics v_excluidos = row_count;
    v_total_excluidos := v_total_excluidos + v_excluidos;
  end loop;

  -- O PostgreSQL remove o restante pelas FKs ON DELETE CASCADE.
  delete from public.empresas
  where id = p_empresa_id;

  if not found then
    raise exception 'Empresa nao encontrada no momento da exclusao.';
  end if;

  -- Segunda passada nas tabelas sem FK direta para limpar qualquer registro
  -- que tenha ficado bloqueado por uma dependencia removida no CASCADE.
  for v_tabela in
    select distinct c.relname as tabela
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and a.attnum > 0
      and not a.attisdropped
      and a.attname = 'empresa_id'
      and c.relname <> 'empresas'
      and not exists (
        select 1
        from pg_constraint con
        where con.contype = 'f'
          and con.conrelid = c.oid
          and con.confrelid = 'public.empresas'::regclass
      )
    order by c.relname
  loop
    execute format(
      'delete from public.%I where empresa_id = $1',
      v_tabela.tabela
    )
    using p_empresa_id;

    get diagnostics v_excluidos = row_count;
    v_total_excluidos := v_total_excluidos + v_excluidos;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'empresa_id', p_empresa_id,
    'empresa_nome', v_empresa_nome,
    'registros_excluidos', v_total_excluidos
  );
end;
$function$;

revoke all on function public.excluir_empresa_definitivamente_admin(uuid)
from public, anon, authenticated;

grant execute on function public.excluir_empresa_definitivamente_admin(uuid)
to service_role;
