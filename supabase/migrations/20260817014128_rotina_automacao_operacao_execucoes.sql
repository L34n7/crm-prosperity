create table if not exists public.rotina_automacao_assinaturas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  evento text not null,
  quantidade_automacoes integer not null default 1 check (quantidade_automacoes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, evento)
);

alter table public.rotina_automacao_assinaturas enable row level security;
revoke all on table public.rotina_automacao_assinaturas from anon, authenticated;
grant select, insert, update, delete on table public.rotina_automacao_assinaturas to service_role;

drop trigger if exists rotina_automacao_assinaturas_set_updated_at on public.rotina_automacao_assinaturas;
create trigger rotina_automacao_assinaturas_set_updated_at
before update on public.rotina_automacao_assinaturas
for each row execute function public.set_updated_at();

alter table public.rotina_automacao_jobs
  add column if not exists ordem integer not null default 0,
  add column if not exists titulo text,
  add column if not exists canal text,
  add column if not exists depende_de_job_id uuid,
  add column if not exists cancelado_por uuid,
  add column if not exists cancelado_em timestamptz,
  add column if not exists origem_cancelamento text,
  add column if not exists cancelamento_solicitado_em timestamptz,
  add column if not exists cancelamento_solicitado_por uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.rotina_automacao_jobs'::regclass
      and conname = 'rotina_automacao_jobs_depende_de_job_id_fkey'
  ) then
    alter table public.rotina_automacao_jobs
      add constraint rotina_automacao_jobs_depende_de_job_id_fkey
      foreign key (depende_de_job_id)
      references public.rotina_automacao_jobs(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.rotina_automacao_jobs'::regclass
      and conname = 'rotina_automacao_jobs_cancelado_por_fkey'
  ) then
    alter table public.rotina_automacao_jobs
      add constraint rotina_automacao_jobs_cancelado_por_fkey
      foreign key (cancelado_por)
      references public.usuarios(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.rotina_automacao_jobs'::regclass
      and conname = 'rotina_automacao_jobs_cancelamento_solicitado_por_fkey'
  ) then
    alter table public.rotina_automacao_jobs
      add constraint rotina_automacao_jobs_cancelamento_solicitado_por_fkey
      foreign key (cancelamento_solicitado_por)
      references public.usuarios(id)
      on delete set null;
  end if;
end $$;

alter table public.rotina_automacao_execucoes
  add column if not exists cancelado_por uuid,
  add column if not exists cancelado_em timestamptz,
  add column if not exists motivo_cancelamento text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.rotina_automacao_execucoes'::regclass
      and conname = 'rotina_automacao_execucoes_cancelado_por_fkey'
  ) then
    alter table public.rotina_automacao_execucoes
      add constraint rotina_automacao_execucoes_cancelado_por_fkey
      foreign key (cancelado_por)
      references public.usuarios(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_rotina_automacao_assinaturas_empresa_evento
  on public.rotina_automacao_assinaturas (empresa_id, evento);
create index if not exists idx_rotina_automacao_jobs_execucao_ordem
  on public.rotina_automacao_jobs (execucao_id, ordem, executar_em);
create index if not exists idx_rotina_automacao_jobs_depende_de
  on public.rotina_automacao_jobs (depende_de_job_id)
  where depende_de_job_id is not null;
create index if not exists idx_rotina_automacao_jobs_disparos
  on public.rotina_automacao_jobs (empresa_id, canal, status, executar_em)
  where canal in ('whatsapp', 'email');
create index if not exists idx_rotina_automacao_jobs_cancelado_por
  on public.rotina_automacao_jobs (cancelado_por)
  where cancelado_por is not null;
create index if not exists idx_rotina_automacao_jobs_cancelamento_solicitado_por
  on public.rotina_automacao_jobs (cancelamento_solicitado_por)
  where cancelamento_solicitado_por is not null;
create index if not exists idx_rotina_automacao_execucoes_cancelado_por
  on public.rotina_automacao_execucoes (cancelado_por)
  where cancelado_por is not null;

create or replace function public.rotina_automacao_recalcular_assinaturas(
  p_empresa_id uuid
) returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_total integer := 0;
begin
  if p_empresa_id is null then
    return 0;
  end if;

  delete from public.rotina_automacao_assinaturas
  where empresa_id = p_empresa_id;

  insert into public.rotina_automacao_assinaturas (
    empresa_id,
    evento,
    quantidade_automacoes
  )
  select
    a.empresa_id,
    g.evento,
    count(distinct a.id)::integer
  from public.rotina_automacoes a
  join public.rotina_automacao_gatilhos g
    on g.automacao_id = a.id
   and g.empresa_id = a.empresa_id
   and g.ativo = true
  where a.empresa_id = p_empresa_id
    and a.status = 'ativa'
    and btrim(coalesce(g.evento, '')) <> ''
  group by a.empresa_id, g.evento;

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

create or replace function public.rotina_automacao_recalcular_assinaturas_status_trigger()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.rotina_automacao_recalcular_assinaturas(old.empresa_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.empresa_id is distinct from new.empresa_id then
    perform public.rotina_automacao_recalcular_assinaturas(old.empresa_id);
  end if;

  perform public.rotina_automacao_recalcular_assinaturas(new.empresa_id);
  return new;
end;
$$;

drop trigger if exists rotina_automacoes_recalcular_assinaturas on public.rotina_automacoes;
create trigger rotina_automacoes_recalcular_assinaturas
after insert or delete or update of status, empresa_id on public.rotina_automacoes
for each row execute function public.rotina_automacao_recalcular_assinaturas_status_trigger();

create or replace function public.rotina_automacao_salvar(
  p_empresa_id uuid,
  p_usuario_id uuid,
  p_rotina_id uuid,
  p_payload jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_item jsonb;
  v_nome text := btrim(coalesce(p_payload->>'nome', ''));
  v_categoria text := btrim(coalesce(p_payload->>'categoria', ''));
  v_status text := btrim(coalesce(p_payload->>'status', 'pausada'));
begin
  if v_nome = '' then raise exception 'Nome da automação é obrigatório.'; end if;
  if v_categoria not in ('agenda','conversas','contatos','imoveis','integracoes','sistema') then raise exception 'Categoria de automação inválida.'; end if;
  if v_status not in ('rascunho','ativa','pausada') then v_status := 'pausada'; end if;
  if jsonb_array_length(coalesce(p_payload->'gatilhos', '[]'::jsonb)) = 0 then raise exception 'A automação precisa de um gatilho.'; end if;
  if jsonb_array_length(coalesce(p_payload->'acoes', '[]'::jsonb)) = 0 then raise exception 'A automação precisa de pelo menos uma ação.'; end if;

  if p_rotina_id is null then
    insert into public.rotina_automacoes (
      empresa_id,nome,descricao,categoria,status,origem_tipo,origem_id,
      configuracao_json,criado_por,atualizado_por
    ) values (
      p_empresa_id,v_nome,nullif(btrim(coalesce(p_payload->>'descricao','')),''),
      v_categoria,v_status,coalesce(nullif(p_payload->>'origem_tipo',''),'crm'),
      nullif(p_payload->>'origem_id','')::uuid,
      coalesce(p_payload->'configuracao_json','{}'::jsonb),p_usuario_id,p_usuario_id
    ) returning id into v_id;
  else
    update public.rotina_automacoes
    set nome=v_nome,
        descricao=nullif(btrim(coalesce(p_payload->>'descricao','')),''),
        categoria=v_categoria,
        status=v_status,
        origem_tipo=coalesce(nullif(p_payload->>'origem_tipo',''),origem_tipo),
        origem_id=nullif(p_payload->>'origem_id','')::uuid,
        configuracao_json=coalesce(p_payload->'configuracao_json','{}'::jsonb),
        atualizado_por=p_usuario_id
    where id=p_rotina_id and empresa_id=p_empresa_id
    returning id into v_id;

    if v_id is null then raise exception 'Automação não encontrada.'; end if;

    delete from public.rotina_automacao_gatilhos where automacao_id=v_id and empresa_id=p_empresa_id;
    delete from public.rotina_automacao_condicoes where automacao_id=v_id and empresa_id=p_empresa_id;
    delete from public.rotina_automacao_acoes where automacao_id=v_id and empresa_id=p_empresa_id;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'gatilhos','[]'::jsonb)) loop
    insert into public.rotina_automacao_gatilhos (
      empresa_id,automacao_id,tipo,evento,entidade_tipo,offset_minutos,
      offset_referencia,configuracao_json,ativo
    ) values (
      p_empresa_id,v_id,coalesce(nullif(v_item->>'tipo',''),'evento'),
      btrim(coalesce(v_item->>'evento','')),nullif(v_item->>'entidade_tipo',''),
      nullif(v_item->>'offset_minutos','')::integer,nullif(v_item->>'offset_referencia',''),
      coalesce(v_item->'configuracao_json','{}'::jsonb),coalesce((v_item->>'ativo')::boolean,true)
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'condicoes','[]'::jsonb)) loop
    if btrim(coalesce(v_item->>'campo','')) = '' then continue; end if;
    insert into public.rotina_automacao_condicoes (
      empresa_id,automacao_id,grupo,ordem,conjuncao,campo,operador,valor_json,configuracao_json
    ) values (
      p_empresa_id,v_id,coalesce(nullif(v_item->>'grupo','')::integer,0),
      coalesce(nullif(v_item->>'ordem','')::integer,0),
      case when v_item->>'conjuncao'='or' then 'or' else 'and' end,
      btrim(v_item->>'campo'),coalesce(nullif(v_item->>'operador',''),'igual'),
      coalesce(v_item->'valor_json','null'::jsonb),coalesce(v_item->'configuracao_json','{}'::jsonb)
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'acoes','[]'::jsonb)) loop
    insert into public.rotina_automacao_acoes (
      empresa_id,automacao_id,ordem,tipo_acao,configuracao_json,ativo
    ) values (
      p_empresa_id,v_id,coalesce(nullif(v_item->>'ordem','')::integer,0),
      btrim(coalesce(v_item->>'tipo_acao','')),coalesce(v_item->'configuracao_json','{}'::jsonb),
      coalesce((v_item->>'ativo')::boolean,true)
    );
  end loop;

  perform public.rotina_automacao_recalcular_assinaturas(p_empresa_id);
  return v_id;
end;
$$;

create or replace function public.rotina_automacao_alterar_estado(
  p_empresa_id uuid,
  p_usuario_id uuid,
  p_automacao_id uuid,
  p_status text,
  p_cancelar_pendentes boolean default false,
  p_origem_cancelamento text default 'automacoes'
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_jobs_cancelados integer := 0;
  v_jobs_solicitados integer := 0;
  v_execucoes_canceladas integer := 0;
  v_automacao_id uuid;
begin
  if v_status not in ('ativa','pausada','arquivada') then
    raise exception 'Status da automação inválido.';
  end if;

  update public.rotina_automacoes
  set status = v_status,
      atualizado_por = p_usuario_id
  where id = p_automacao_id
    and empresa_id = p_empresa_id
    and status <> 'arquivada'
  returning id into v_automacao_id;

  if v_automacao_id is null then
    raise exception 'Automação não encontrada.';
  end if;

  if p_cancelar_pendentes then
    update public.rotina_automacao_jobs
    set status = 'cancelado',
        cancelado_por = p_usuario_id,
        cancelado_em = now(),
        origem_cancelamento = coalesce(nullif(p_origem_cancelamento,''),'automacoes'),
        bloqueado_em = null,
        proxima_tentativa_em = null,
        erro = coalesce(erro, 'Etapa cancelada manualmente ao alterar a automação.')
    where empresa_id = p_empresa_id
      and automacao_id = p_automacao_id
      and status = 'pendente';
    get diagnostics v_jobs_cancelados = row_count;

    update public.rotina_automacao_jobs
    set cancelamento_solicitado_em = coalesce(cancelamento_solicitado_em, now()),
        cancelamento_solicitado_por = coalesce(cancelamento_solicitado_por, p_usuario_id),
        origem_cancelamento = coalesce(origem_cancelamento, coalesce(nullif(p_origem_cancelamento,''),'automacoes'))
    where empresa_id = p_empresa_id
      and automacao_id = p_automacao_id
      and status = 'processando'
      and cancelamento_solicitado_em is null;
    get diagnostics v_jobs_solicitados = row_count;

    update public.rotina_automacao_execucoes e
    set status = 'cancelada',
        cancelado_por = p_usuario_id,
        cancelado_em = now(),
        motivo_cancelamento = 'Execução cancelada manualmente ao alterar a automação.',
        finalizada_em = coalesce(finalizada_em, now())
    where e.empresa_id = p_empresa_id
      and e.automacao_id = p_automacao_id
      and e.status in ('iniciada','processando')
      and not exists (
        select 1
        from public.rotina_automacao_jobs j
        where j.execucao_id = e.id
          and j.empresa_id = e.empresa_id
          and j.status in ('pendente','processando')
      );
    get diagnostics v_execucoes_canceladas = row_count;
  end if;

  perform public.rotina_automacao_recalcular_assinaturas(p_empresa_id);

  return jsonb_build_object(
    'automacao_id', p_automacao_id,
    'status', v_status,
    'jobs_cancelados', v_jobs_cancelados,
    'jobs_cancelamento_solicitado', v_jobs_solicitados,
    'execucoes_canceladas', v_execucoes_canceladas
  );
end;
$$;

create or replace function public.rotina_automacao_cancelar_job(
  p_empresa_id uuid,
  p_usuario_id uuid,
  p_job_id uuid,
  p_cancelar_dependentes boolean default true,
  p_origem_cancelamento text default 'automacoes_execucoes'
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_execucao_id uuid;
  v_cancelados integer := 0;
  v_solicitados integer := 0;
  v_total_dependentes integer := 0;
begin
  select execucao_id into v_execucao_id
  from public.rotina_automacao_jobs
  where id = p_job_id
    and empresa_id = p_empresa_id
  for update;

  if not found then
    raise exception 'Etapa da automação não encontrada.';
  end if;

  with recursive arvore as (
    select id
    from public.rotina_automacao_jobs
    where id = p_job_id and empresa_id = p_empresa_id
    union all
    select j.id
    from public.rotina_automacao_jobs j
    join arvore a on j.depende_de_job_id = a.id
    where j.empresa_id = p_empresa_id
      and p_cancelar_dependentes
  )
  select greatest(count(*) - 1, 0)::integer
  into v_total_dependentes
  from arvore;

  with recursive arvore as (
    select id
    from public.rotina_automacao_jobs
    where id = p_job_id and empresa_id = p_empresa_id
    union all
    select j.id
    from public.rotina_automacao_jobs j
    join arvore a on j.depende_de_job_id = a.id
    where j.empresa_id = p_empresa_id
      and p_cancelar_dependentes
  )
  update public.rotina_automacao_jobs j
  set status = 'cancelado',
      cancelado_por = p_usuario_id,
      cancelado_em = now(),
      origem_cancelamento = coalesce(nullif(p_origem_cancelamento,''),'automacoes_execucoes'),
      bloqueado_em = null,
      proxima_tentativa_em = null,
      erro = coalesce(j.erro, 'Etapa cancelada manualmente.')
  where j.id in (select id from arvore)
    and j.empresa_id = p_empresa_id
    and j.status = 'pendente';
  get diagnostics v_cancelados = row_count;

  with recursive arvore as (
    select id
    from public.rotina_automacao_jobs
    where id = p_job_id and empresa_id = p_empresa_id
    union all
    select j.id
    from public.rotina_automacao_jobs j
    join arvore a on j.depende_de_job_id = a.id
    where j.empresa_id = p_empresa_id
      and p_cancelar_dependentes
  )
  update public.rotina_automacao_jobs j
  set cancelamento_solicitado_em = coalesce(j.cancelamento_solicitado_em, now()),
      cancelamento_solicitado_por = coalesce(j.cancelamento_solicitado_por, p_usuario_id),
      origem_cancelamento = coalesce(j.origem_cancelamento, coalesce(nullif(p_origem_cancelamento,''),'automacoes_execucoes'))
  where j.id in (select id from arvore)
    and j.empresa_id = p_empresa_id
    and j.status = 'processando'
    and j.cancelamento_solicitado_em is null;
  get diagnostics v_solicitados = row_count;

  if v_execucao_id is not null and not exists (
    select 1
    from public.rotina_automacao_jobs
    where empresa_id = p_empresa_id
      and execucao_id = v_execucao_id
      and status in ('pendente','processando')
  ) then
    update public.rotina_automacao_execucoes
    set status = 'cancelada',
        cancelado_por = p_usuario_id,
        cancelado_em = now(),
        motivo_cancelamento = 'Execução encerrada após cancelamento manual das etapas.',
        finalizada_em = coalesce(finalizada_em, now())
    where id = v_execucao_id
      and empresa_id = p_empresa_id
      and status in ('iniciada','processando');
  end if;

  return jsonb_build_object(
    'job_id', p_job_id,
    'cancelados', v_cancelados,
    'cancelamento_solicitado', v_solicitados,
    'dependentes', v_total_dependentes
  );
end;
$$;

revoke execute on function public.rotina_automacao_recalcular_assinaturas_status_trigger() from public, anon, authenticated;
revoke execute on function public.rotina_automacao_recalcular_assinaturas(uuid) from public, anon, authenticated;
revoke execute on function public.rotina_automacao_salvar(uuid,uuid,uuid,jsonb) from public, anon, authenticated;
revoke execute on function public.rotina_automacao_alterar_estado(uuid,uuid,uuid,text,boolean,text) from public, anon, authenticated;
revoke execute on function public.rotina_automacao_cancelar_job(uuid,uuid,uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.rotina_automacao_recalcular_assinaturas(uuid) to service_role;
grant execute on function public.rotina_automacao_salvar(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.rotina_automacao_alterar_estado(uuid,uuid,uuid,text,boolean,text) to service_role;
grant execute on function public.rotina_automacao_cancelar_job(uuid,uuid,uuid,boolean,text) to service_role;
