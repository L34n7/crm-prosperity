alter table public.automacao_versoes
  alter column origem set default 'manual';

update public.automacao_versoes
   set origem = 'manual'
 where origem is null;

alter table public.automacao_versoes
  alter column origem set not null;

create index if not exists automacao_versoes_empresa_fluxo_versao_idx
  on public.automacao_versoes (empresa_id, fluxo_id, versao desc);

create or replace function public.registrar_versao_automacao_fluxo(
  p_empresa_id uuid,
  p_fluxo_id uuid,
  p_usuario_id uuid default null,
  p_origem text default 'manual',
  p_descricao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_snapshot jsonb;
  v_ultima_snapshot jsonb;
  v_ultima_versao integer;
  v_ultima_id uuid;
  v_nova_versao integer;
  v_nova_id uuid;
begin
  if p_empresa_id is null or p_fluxo_id is null then
    raise exception using
      errcode = '22023',
      message = 'Empresa e fluxo sao obrigatorios para registrar uma versao.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_fluxo_id::text, 0));

  perform 1
    from public.automacao_fluxos
   where id = p_fluxo_id
     and empresa_id = p_empresa_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Fluxo nao encontrado para registrar a versao.';
  end if;

  select jsonb_build_object(
    'schema_version', 1,
    'fluxo', jsonb_build_object(
      'id', fluxo.id,
      'empresa_id', fluxo.empresa_id,
      'nome', fluxo.nome,
      'descricao', fluxo.descricao,
      'status', fluxo.status,
      'canal', fluxo.canal,
      'fluxo_padrao', fluxo.fluxo_padrao,
      'configuracao_json', coalesce(fluxo.configuracao_json, '{}'::jsonb),
      'criado_por', fluxo.criado_por,
      'created_at', fluxo.created_at
    ),
    'nos', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', no.id,
          'tipo_no', no.tipo_no,
          'titulo', no.titulo,
          'descricao', no.descricao,
          'posicao_x', no.posicao_x,
          'posicao_y', no.posicao_y,
          'configuracao_json', coalesce(no.configuracao_json, '{}'::jsonb),
          'delay_segundos', no.delay_segundos
        )
        order by no.id
      )
      from public.automacao_nos no
      where no.empresa_id = p_empresa_id
        and no.fluxo_id = p_fluxo_id
        and no.ativo is true
    ), '[]'::jsonb),
    'conexoes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', conexao.id,
          'no_origem_id', conexao.no_origem_id,
          'no_destino_id', conexao.no_destino_id,
          'condicao_json', coalesce(conexao.condicao_json, '{}'::jsonb),
          'rotulo', conexao.rotulo,
          'ordem', conexao.ordem,
          'usar_ia', coalesce(conexao.usar_ia, false),
          'descricao_ia', conexao.descricao_ia
        )
        order by conexao.ordem, conexao.id
      )
      from public.automacao_conexoes conexao
      where conexao.empresa_id = p_empresa_id
        and conexao.fluxo_id = p_fluxo_id
        and conexao.ativo is true
    ), '[]'::jsonb),
    'gatilhos', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', gatilho.id,
          'tipo_gatilho', gatilho.tipo_gatilho,
          'valor', gatilho.valor,
          'condicao', gatilho.condicao,
          'ativo', gatilho.ativo
        )
        order by gatilho.id
      )
      from public.automacao_gatilhos gatilho
      where gatilho.empresa_id = p_empresa_id
        and gatilho.fluxo_id = p_fluxo_id
    ), '[]'::jsonb)
  )
  into v_snapshot
  from public.automacao_fluxos fluxo
  where fluxo.id = p_fluxo_id
    and fluxo.empresa_id = p_empresa_id;

  select versao, id, snapshot_json
    into v_ultima_versao, v_ultima_id, v_ultima_snapshot
    from public.automacao_versoes
   where empresa_id = p_empresa_id
     and fluxo_id = p_fluxo_id
   order by versao desc
   limit 1;

  if v_ultima_snapshot is not null and v_ultima_snapshot = v_snapshot then
    return jsonb_build_object(
      'criada', false,
      'id', v_ultima_id,
      'versao', v_ultima_versao,
      'motivo', 'snapshot_inalterado'
    );
  end if;

  v_nova_versao := coalesce(v_ultima_versao, 0) + 1;

  insert into public.automacao_versoes (
    empresa_id,
    fluxo_id,
    versao,
    snapshot_json,
    criado_por,
    origem,
    descricao,
    automacao_id,
    nodes_json,
    edges_json,
    created_by
  )
  values (
    p_empresa_id,
    p_fluxo_id,
    v_nova_versao,
    v_snapshot,
    p_usuario_id,
    coalesce(nullif(btrim(p_origem), ''), 'manual'),
    nullif(btrim(coalesce(p_descricao, '')), ''),
    p_fluxo_id,
    v_snapshot -> 'nos',
    v_snapshot -> 'conexoes',
    p_usuario_id
  )
  returning id into v_nova_id;

  return jsonb_build_object(
    'criada', true,
    'id', v_nova_id,
    'versao', v_nova_versao
  );
end;
$function$;

revoke all on function public.registrar_versao_automacao_fluxo(uuid, uuid, uuid, text, text) from public;
grant execute on function public.registrar_versao_automacao_fluxo(uuid, uuid, uuid, text, text) to service_role;

create or replace function public.automacao_fluxos_registrar_versao_apos_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  perform public.registrar_versao_automacao_fluxo(
    new.empresa_id,
    new.id,
    coalesce(new.atualizado_por, new.criado_por),
    case
      when new.nome like '✨ IA - %' then 'assistente_ia'
      else 'salvamento_automatico'
    end,
    'Snapshot automatico apos alteracao do fluxo.'
  );

  return new;
end;
$function$;

drop trigger if exists automacao_fluxos_registrar_versao_apos_update
  on public.automacao_fluxos;

create trigger automacao_fluxos_registrar_versao_apos_update
after update of nome, descricao, status, canal, atualizado_por, fluxo_padrao, configuracao_json, updated_at
on public.automacao_fluxos
for each row
execute function public.automacao_fluxos_registrar_versao_apos_update();

create or replace function public.automacao_versoes_compatibilidade_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.fluxo_id is null and new.automacao_id is not null then
    perform public.registrar_versao_automacao_fluxo(
      new.empresa_id,
      new.automacao_id,
      coalesce(new.criado_por, new.created_by),
      coalesce(nullif(btrim(new.origem), ''), 'manual'),
      new.descricao
    );
    return null;
  end if;

  new.automacao_id := coalesce(new.automacao_id, new.fluxo_id);
  new.criado_por := coalesce(new.criado_por, new.created_by);
  new.created_by := coalesce(new.created_by, new.criado_por);
  new.nodes_json := coalesce(new.nodes_json, new.snapshot_json -> 'nos');
  new.edges_json := coalesce(new.edges_json, new.snapshot_json -> 'conexoes');
  return new;
end;
$function$;

drop trigger if exists automacao_versoes_compatibilidade_insert
  on public.automacao_versoes;

create trigger automacao_versoes_compatibilidade_insert
before insert on public.automacao_versoes
for each row
execute function public.automacao_versoes_compatibilidade_insert();

create or replace function public.automacao_estrutura_registrar_versao_apos_mutacao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_empresa_id uuid;
  v_fluxo_id uuid;
  v_usuario_id uuid;
  v_nome_fluxo text;
begin
  if tg_op = 'DELETE' then
    v_empresa_id := old.empresa_id;
    v_fluxo_id := old.fluxo_id;
  else
    v_empresa_id := new.empresa_id;
    v_fluxo_id := new.fluxo_id;
  end if;

  select coalesce(fluxo.atualizado_por, fluxo.criado_por), fluxo.nome
    into v_usuario_id, v_nome_fluxo
    from public.automacao_fluxos fluxo
   where fluxo.id = v_fluxo_id
     and fluxo.empresa_id = v_empresa_id;

  if not found then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  perform public.registrar_versao_automacao_fluxo(
    v_empresa_id,
    v_fluxo_id,
    v_usuario_id,
    case
      when v_nome_fluxo like '✨ IA - %' then 'assistente_ia'
      else 'salvamento_automatico'
    end,
    'Snapshot automatico apos alteracao da estrutura do fluxo.'
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

drop trigger if exists automacao_nos_registrar_versao_apos_mutacao
  on public.automacao_nos;
create constraint trigger automacao_nos_registrar_versao_apos_mutacao
after insert or update or delete on public.automacao_nos
deferrable initially deferred
for each row
execute function public.automacao_estrutura_registrar_versao_apos_mutacao();

drop trigger if exists automacao_conexoes_registrar_versao_apos_mutacao
  on public.automacao_conexoes;
create constraint trigger automacao_conexoes_registrar_versao_apos_mutacao
after insert or update or delete on public.automacao_conexoes
deferrable initially deferred
for each row
execute function public.automacao_estrutura_registrar_versao_apos_mutacao();

drop trigger if exists automacao_gatilhos_registrar_versao_apos_mutacao
  on public.automacao_gatilhos;
create constraint trigger automacao_gatilhos_registrar_versao_apos_mutacao
after insert or update or delete on public.automacao_gatilhos
deferrable initially deferred
for each row
execute function public.automacao_estrutura_registrar_versao_apos_mutacao();

do $backfill$
declare
  fluxo record;
begin
  for fluxo in
    select id, empresa_id, coalesce(atualizado_por, criado_por) as usuario_id
      from public.automacao_fluxos
     order by created_at, id
  loop
    perform public.registrar_versao_automacao_fluxo(
      fluxo.empresa_id,
      fluxo.id,
      fluxo.usuario_id,
      'backfill_inicial',
      'Snapshot inicial criado na ativacao do versionamento.'
    );
  end loop;
end;
$backfill$;
