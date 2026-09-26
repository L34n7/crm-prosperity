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

  -- Vinculos sem empresa_id que usam RESTRICT contra entidades da empresa.
  delete from public.usuarios_setores us
  where us.setor_id in (
          select s.id from public.setores s
          where s.empresa_id = p_empresa_id
        )
     or us.usuario_id in (
          select u.id from public.usuarios u
          where u.empresa_id = p_empresa_id
        );
  get diagnostics v_excluidos = row_count;
  v_total_excluidos := v_total_excluidos + v_excluidos;

  delete from public.usuarios_perfis up
  where up.perfil_empresa_id in (
          select pe.id from public.perfis_empresa pe
          where pe.empresa_id = p_empresa_id
        )
     or up.usuario_id in (
          select u.id from public.usuarios u
          where u.empresa_id = p_empresa_id
        );
  get diagnostics v_excluidos = row_count;
  v_total_excluidos := v_total_excluidos + v_excluidos;

  -- Pre-remove somente tabelas que podem bloquear a cascata por RESTRICT /
  -- NO ACTION entre entidades pertencentes a mesma empresa.
  for v_pass in 1..6 loop
    v_houve_progresso := false;

    for v_tabela in
      with tables_with_company as (
        select distinct c.oid, c.relname
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid
        where n.nspname = 'public'
          and c.relkind in ('r', 'p')
          and a.attname = 'empresa_id'
          and a.attnum > 0
          and not a.attisdropped
      )
      select distinct child.relname as tabela
      from pg_constraint fk
      join pg_class child on child.oid = fk.conrelid
      join pg_class parent on parent.oid = fk.confrelid
      join pg_namespace ns on ns.oid = child.relnamespace
      join tables_with_company cc on cc.oid = child.oid
      join tables_with_company pc on pc.oid = parent.oid
      where fk.contype = 'f'
        and ns.nspname = 'public'
        and fk.confdeltype in ('a', 'r')
      order by child.relname
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

  -- Tabelas com empresa_id, mas sem FK direta para empresas, nao entram na
  -- cascata e precisam ser higienizadas explicitamente.
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

  -- FKs diretas para empresas que nao usam CASCADE.
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

  -- Com os bloqueadores removidos, o PostgreSQL cuida do restante por CASCADE.
  delete from public.empresas
  where id = p_empresa_id;

  if not found then
    raise exception 'Empresa nao encontrada no momento da exclusao.';
  end if;

  -- Segunda passagem nas tabelas sem FK direta, para limpar registros cuja
  -- dependencia tenha desaparecido somente durante o CASCADE.
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
