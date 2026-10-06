insert into public.permissoes (codigo, descricao)
values (
  'conversas.visualizar_apenas_proprio_setor',
  'Visualizar somente conversas dos setores vinculados ao usuario'
)
on conflict (codigo) do update
set descricao = excluded.descricao;

do $migration$
declare
  v_nome text;
  v_oid oid;
  v_def text;
  v_original text;
  v_novo text;
begin
  foreach v_nome in array array[
    'listar_conversas_resumo_v2',
    'obter_contadores_conversas_v2',
    'contar_conversas_nao_lidas_v2'
  ]
  loop
    select p.oid
      into v_oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = v_nome
      and position(
        'p_usuario_pode_visualizar_bot boolean'
        in pg_get_function_identity_arguments(p.oid)
      ) > 0
      and position(
        'p_restringir_aos_setores boolean'
        in pg_get_function_identity_arguments(p.oid)
      ) = 0
    limit 1;

    if v_oid is null then
      raise exception 'Funcao % esperada nao encontrada', v_nome;
    end if;

    v_def := pg_get_functiondef(v_oid);

    v_def := replace(
      v_def,
      'p_usuario_pode_visualizar_bot boolean DEFAULT false)',
      'p_usuario_pode_visualizar_bot boolean DEFAULT false, p_restringir_aos_setores boolean DEFAULT false)'
    );

    if position('p_restringir_aos_setores boolean DEFAULT false' in v_def) = 0 then
      raise exception 'Nao foi possivel adicionar parametro de restricao em %', v_nome;
    end if;

    v_original :=
      'WHERE c.empresa_id = p_empresa_id' || chr(10) ||
      '      AND (';

    v_novo :=
      'WHERE c.empresa_id = p_empresa_id' || chr(10) ||
      '      AND (' || chr(10) ||
      '        NOT p_restringir_aos_setores' || chr(10) ||
      '        OR p_is_admin' || chr(10) ||
      '        OR (' || chr(10) ||
      '          c.setor_id IS NOT NULL' || chr(10) ||
      '          AND c.setor_id = ANY(COALESCE(p_setores_ids, ''{}''::uuid[]))' || chr(10) ||
      '        )' || chr(10) ||
      '      )' || chr(10) ||
      '      AND (';

    if position(v_original in v_def) = 0 then
      raise exception 'Trecho de visibilidade esperado nao encontrado em %', v_nome;
    end if;

    v_def := replace(v_def, v_original, v_novo);

    if position('NOT p_restringir_aos_setores' in v_def) = 0 then
      raise exception 'Nao foi possivel inserir restricao por setor em %', v_nome;
    end if;

    execute v_def;
  end loop;
end;
$migration$;

drop function public.listar_conversas_resumo_v2(
  uuid, uuid, boolean, uuid[], boolean, boolean, text, text, uuid, uuid,
  uuid, text, text, text, uuid, timestamptz, timestamptz, uuid, integer, boolean
);

drop function public.obter_contadores_conversas_v2(
  uuid, uuid, boolean, uuid[], boolean, boolean, text, text, uuid, uuid,
  uuid, text, text, uuid, uuid, uuid[], boolean
);

drop function public.contar_conversas_nao_lidas_v2(
  uuid, uuid, boolean, uuid[], boolean, boolean, text, text, uuid, uuid,
  uuid, text, text, uuid, uuid, uuid[], boolean
);

revoke execute on function public.listar_conversas_resumo_v2(
  uuid, uuid, boolean, uuid[], boolean, boolean, text, text, uuid, uuid,
  uuid, text, text, text, uuid, timestamptz, timestamptz, uuid, integer,
  boolean, boolean
) from public, anon, authenticated;
grant execute on function public.listar_conversas_resumo_v2(
  uuid, uuid, boolean, uuid[], boolean, boolean, text, text, uuid, uuid,
  uuid, text, text, text, uuid, timestamptz, timestamptz, uuid, integer,
  boolean, boolean
) to service_role;

revoke execute on function public.obter_contadores_conversas_v2(
  uuid, uuid, boolean, uuid[], boolean, boolean, text, text, uuid, uuid,
  uuid, text, text, uuid, uuid, uuid[], boolean, boolean
) from public, anon, authenticated;
grant execute on function public.obter_contadores_conversas_v2(
  uuid, uuid, boolean, uuid[], boolean, boolean, text, text, uuid, uuid,
  uuid, text, text, uuid, uuid, uuid[], boolean, boolean
) to service_role;

revoke execute on function public.contar_conversas_nao_lidas_v2(
  uuid, uuid, boolean, uuid[], boolean, boolean, text, text, uuid, uuid,
  uuid, text, text, uuid, uuid, uuid[], boolean, boolean
) from public, anon, authenticated;
grant execute on function public.contar_conversas_nao_lidas_v2(
  uuid, uuid, boolean, uuid[], boolean, boolean, text, text, uuid, uuid,
  uuid, text, text, uuid, uuid, uuid[], boolean, boolean
) to service_role;
