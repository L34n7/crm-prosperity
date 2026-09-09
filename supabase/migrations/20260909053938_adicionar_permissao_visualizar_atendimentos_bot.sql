insert into public.permissoes (codigo, descricao)
values (
  'conversas.visualizar_atendimentos_bot',
  'Visualizar atendimentos do bot'
)
on conflict (codigo) do update
set descricao = excluded.descricao;

insert into public.perfil_permissoes (perfil_empresa_id, permissao_codigo)
select perfil.id, 'conversas.visualizar_atendimentos_bot'
from public.perfis_empresa perfil
where lower(trim(perfil.nome)) = 'administrador'
  and perfil.ativo is not false
  and perfil.archived_at is null
on conflict (perfil_empresa_id, permissao_codigo) do nothing;

delete from public.usuario_permissoes usuario_permissao
using public.usuarios_perfis usuario_perfil,
      public.perfis_empresa perfil
where usuario_perfil.usuario_id = usuario_permissao.usuario_id
  and perfil.id = usuario_perfil.perfil_empresa_id
  and perfil.ativo is not false
  and perfil.archived_at is null
  and lower(trim(perfil.nome)) = 'administrador'
  and usuario_permissao.permissao_codigo = 'conversas.visualizar_atendimentos_bot'
  and usuario_permissao.efeito = 'bloquear';

do $migration$
declare
  v_oid oid;
  v_def text;
  v_original text;
  v_novo text;
begin
  select p.oid
    into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'listar_conversas_resumo_v2'
    and pg_get_function_identity_arguments(p.oid) = 'p_empresa_id uuid, p_usuario_id uuid, p_is_admin boolean, p_setores_ids uuid[], p_usuario_pode_atribuir boolean, p_usuario_pode_visualizar_encerradas_setor boolean, p_status text, p_prioridade text, p_contato_id uuid, p_setor_id uuid, p_responsavel_id uuid, p_busca text, p_canal text, p_chip text, p_lista_id uuid, p_cursor_last_message_at timestamp with time zone, p_cursor_created_at timestamp with time zone, p_cursor_id uuid, p_limite integer';

  if v_oid is null then
    raise exception 'Funcao listar_conversas_resumo_v2 esperada nao encontrada';
  end if;

  v_def := pg_get_functiondef(v_oid);
  v_def := replace(
    v_def,
    ')' || chr(10) || ' RETURNS',
    ', p_usuario_pode_visualizar_bot boolean DEFAULT false)' || chr(10) || ' RETURNS'
  );

  v_original :=
    '        OR c.responsavel_id = p_usuario_id' || chr(10) ||
    '        OR (' || chr(10) ||
    '          c.escopo_fila = ''geral''';
  v_novo :=
    '        OR c.responsavel_id = p_usuario_id' || chr(10) ||
    '        OR (p_usuario_pode_visualizar_bot AND c.bot_ativo = true)' || chr(10) ||
    '        OR (' || chr(10) ||
    '          c.escopo_fila = ''geral''';

  v_def := replace(v_def, v_original, v_novo);

  if position('p_usuario_pode_visualizar_bot AND c.bot_ativo = true' in v_def) = 0 then
    raise exception 'Nao foi possivel inserir a regra de visibilidade do bot em listar_conversas_resumo_v2';
  end if;

  execute v_def;

  drop function public.listar_conversas_resumo_v2(
    uuid, uuid, boolean, uuid[], boolean, boolean, text, text, uuid, uuid,
    uuid, text, text, text, uuid, timestamptz, timestamptz, uuid, integer
  );
end;
$migration$;

revoke execute on function public.listar_conversas_resumo_v2(
  uuid, uuid, boolean, uuid[], boolean, boolean, text, text, uuid, uuid,
  uuid, text, text, text, uuid, timestamptz, timestamptz, uuid, integer, boolean
) from public, anon, authenticated;
grant execute on function public.listar_conversas_resumo_v2(
  uuid, uuid, boolean, uuid[], boolean, boolean, text, text, uuid, uuid,
  uuid, text, text, text, uuid, timestamptz, timestamptz, uuid, integer, boolean
) to service_role;

do $migration$
declare
  v_oid oid;
  v_def text;
  v_original text;
  v_novo text;
begin
  select p.oid
    into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'obter_contadores_conversas_v2'
    and pg_get_function_identity_arguments(p.oid) = 'p_empresa_id uuid, p_usuario_id uuid, p_is_admin boolean, p_setores_ids uuid[], p_usuario_pode_atribuir boolean, p_usuario_pode_visualizar_encerradas_setor boolean, p_status text, p_prioridade text, p_contato_id uuid, p_setor_id uuid, p_responsavel_id uuid, p_busca text, p_canal text, p_lista_id uuid, p_integracao_whatsapp_id uuid, p_integracoes_whatsapp_ids uuid[]';

  if v_oid is null then
    raise exception 'Funcao obter_contadores_conversas_v2 esperada nao encontrada';
  end if;

  v_def := pg_get_functiondef(v_oid);
  v_def := replace(
    v_def,
    ')' || chr(10) || ' RETURNS',
    ', p_usuario_pode_visualizar_bot boolean DEFAULT false)' || chr(10) || ' RETURNS'
  );

  v_original :=
    '        OR c.responsavel_id = p_usuario_id' || chr(10) ||
    '        OR (' || chr(10) ||
    '          c.escopo_fila = ''geral''';
  v_novo :=
    '        OR c.responsavel_id = p_usuario_id' || chr(10) ||
    '        OR (p_usuario_pode_visualizar_bot AND c.bot_ativo = true)' || chr(10) ||
    '        OR (' || chr(10) ||
    '          c.escopo_fila = ''geral''';

  v_def := replace(v_def, v_original, v_novo);

  if position('p_usuario_pode_visualizar_bot AND c.bot_ativo = true' in v_def) = 0 then
    raise exception 'Nao foi possivel inserir a regra de visibilidade do bot em obter_contadores_conversas_v2';
  end if;

  execute v_def;

  drop function public.obter_contadores_conversas_v2(
    uuid, uuid, boolean, uuid[], boolean, boolean, text, text, uuid, uuid,
    uuid, text, text, uuid, uuid, uuid[]
  );
end;
$migration$;

revoke execute on function public.obter_contadores_conversas_v2(
  uuid, uuid, boolean, uuid[], boolean, boolean, text, text, uuid, uuid,
  uuid, text, text, uuid, uuid, uuid[], boolean
) from public, anon, authenticated;
grant execute on function public.obter_contadores_conversas_v2(
  uuid, uuid, boolean, uuid[], boolean, boolean, text, text, uuid, uuid,
  uuid, text, text, uuid, uuid, uuid[], boolean
) to service_role;

do $migration$
declare
  v_oid oid;
  v_def text;
  v_original text;
  v_novo text;
begin
  select p.oid
    into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'contar_conversas_nao_lidas_v2'
    and pg_get_function_identity_arguments(p.oid) = 'p_empresa_id uuid, p_usuario_id uuid, p_is_admin boolean, p_setores_ids uuid[], p_usuario_pode_atribuir boolean, p_usuario_pode_visualizar_encerradas_setor boolean, p_status text, p_prioridade text, p_contato_id uuid, p_setor_id uuid, p_responsavel_id uuid, p_busca text, p_canal text, p_lista_id uuid, p_integracao_whatsapp_id uuid, p_integracoes_whatsapp_ids uuid[]';

  if v_oid is null then
    raise exception 'Funcao contar_conversas_nao_lidas_v2 esperada nao encontrada';
  end if;

  v_def := pg_get_functiondef(v_oid);
  v_def := replace(
    v_def,
    ')' || chr(10) || ' RETURNS',
    ', p_usuario_pode_visualizar_bot boolean DEFAULT false)' || chr(10) || ' RETURNS'
  );

  v_original :=
    '        OR c.responsavel_id = p_usuario_id' || chr(10) ||
    '        OR (' || chr(10) ||
    '          c.escopo_fila = ''geral''';
  v_novo :=
    '        OR c.responsavel_id = p_usuario_id' || chr(10) ||
    '        OR (p_usuario_pode_visualizar_bot AND c.bot_ativo = true)' || chr(10) ||
    '        OR (' || chr(10) ||
    '          c.escopo_fila = ''geral''';

  v_def := replace(v_def, v_original, v_novo);

  if position('p_usuario_pode_visualizar_bot AND c.bot_ativo = true' in v_def) = 0 then
    raise exception 'Nao foi possivel inserir a regra de visibilidade do bot em contar_conversas_nao_lidas_v2';
  end if;

  execute v_def;

  drop function public.contar_conversas_nao_lidas_v2(
    uuid, uuid, boolean, uuid[], boolean, boolean, text, text, uuid, uuid,
    uuid, text, text, uuid, uuid, uuid[]
  );
end;
$migration$;

revoke execute on function public.contar_conversas_nao_lidas_v2(
  uuid, uuid, boolean, uuid[], boolean, boolean, text, text, uuid, uuid,
  uuid, text, text, uuid, uuid, uuid[], boolean
) from public, anon, authenticated;
grant execute on function public.contar_conversas_nao_lidas_v2(
  uuid, uuid, boolean, uuid[], boolean, boolean, text, text, uuid, uuid,
  uuid, text, text, uuid, uuid, uuid[], boolean
) to service_role;
