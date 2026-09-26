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
  v_pass integer;
  v_excluidos bigint;
  v_total_excluidos bigint := 0;
  v_houve_progresso boolean;
  v_restantes bigint;
  v_tabelas_pendentes text[] := array[]::text[];
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

  for v_pass in 1..12 loop
    v_houve_progresso := false;

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
      order by c.relname
    loop
      begin
        execute format(
          'delete from public.%I where empresa_id = $1',
          v_tabela.tabela
        )
        using p_empresa_id;

        get diagnostics v_excluidos = row_count;

        if v_excluidos > 0 then
          v_total_excluidos := v_total_excluidos + v_excluidos;
          v_houve_progresso := true;
        end if;
      exception
        when foreign_key_violation then
          null;
      end;
    end loop;

    exit when not v_houve_progresso;
  end loop;

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
    order by c.relname
  loop
    execute format(
      'select count(*) from public.%I where empresa_id = $1',
      v_tabela.tabela
    )
    into v_restantes
    using p_empresa_id;

    if v_restantes > 0 then
      v_tabelas_pendentes := array_append(
        v_tabelas_pendentes,
        v_tabela.tabela || ':' || v_restantes::text
      );
    end if;
  end loop;

  if cardinality(v_tabelas_pendentes) > 0 then
    raise exception
      'Exclusao interrompida: ainda existem registros vinculados em %',
      array_to_string(v_tabelas_pendentes, ', ');
  end if;

  delete from public.empresas
  where id = p_empresa_id;

  if not found then
    raise exception 'Empresa nao encontrada no momento da exclusao.';
  end if;

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
