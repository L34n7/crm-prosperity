create table if not exists public.rotina_automacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  descricao text,
  categoria text not null check (categoria in ('agenda','conversas','contatos','imoveis','integracoes','sistema')),
  status text not null default 'pausada' check (status in ('rascunho','ativa','pausada','erro','arquivada')),
  origem_tipo text not null default 'crm',
  origem_id uuid,
  configuracao_json jsonb not null default '{}'::jsonb,
  criado_por uuid,
  atualizado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rotina_automacao_gatilhos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  automacao_id uuid not null references public.rotina_automacoes(id) on delete cascade,
  tipo text not null check (tipo in ('evento','data_relativa','agendamento','webhook','manual')),
  evento text not null,
  entidade_tipo text,
  offset_minutos integer,
  offset_referencia text,
  configuracao_json jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rotina_automacao_condicoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  automacao_id uuid not null references public.rotina_automacoes(id) on delete cascade,
  grupo integer not null default 0,
  ordem integer not null default 0,
  conjuncao text not null default 'and' check (conjuncao in ('and','or')),
  campo text not null,
  operador text not null check (operador in ('igual','diferente','contem','nao_contem','existe','nao_existe','maior_que','menor_que','em','nao_em')),
  valor_json jsonb not null default 'null'::jsonb,
  configuracao_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rotina_automacao_acoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  automacao_id uuid not null references public.rotina_automacoes(id) on delete cascade,
  ordem integer not null default 0,
  tipo_acao text not null,
  configuracao_json jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rotina_automacao_execucoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  automacao_id uuid not null references public.rotina_automacoes(id) on delete cascade,
  gatilho_id uuid references public.rotina_automacao_gatilhos(id) on delete set null,
  evento_chave text,
  entidade_tipo text,
  entidade_id uuid,
  status text not null default 'iniciada' check (status in ('iniciada','processando','concluida','ignorada','erro','cancelada')),
  contexto_json jsonb not null default '{}'::jsonb,
  resultado_json jsonb not null default '{}'::jsonb,
  erro text,
  iniciada_em timestamptz not null default now(),
  finalizada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rotina_automacao_jobs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  automacao_id uuid not null references public.rotina_automacoes(id) on delete cascade,
  execucao_id uuid references public.rotina_automacao_execucoes(id) on delete cascade,
  acao_id uuid references public.rotina_automacao_acoes(id) on delete set null,
  entidade_tipo text,
  entidade_id uuid,
  executar_em timestamptz not null default now(),
  status text not null default 'pendente' check (status in ('pendente','processando','concluido','cancelado','erro')),
  tentativas integer not null default 0 check (tentativas >= 0),
  max_tentativas integer not null default 5 check (max_tentativas between 1 and 20),
  proxima_tentativa_em timestamptz,
  bloqueado_em timestamptz,
  chave_idempotencia text not null,
  contexto_json jsonb not null default '{}'::jsonb,
  resultado_json jsonb not null default '{}'::jsonb,
  erro text,
  executado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chave_idempotencia)
);

create index if not exists rotina_automacoes_empresa_status_idx
  on public.rotina_automacoes (empresa_id, status, updated_at desc);
create index if not exists rotina_automacao_gatilhos_evento_idx
  on public.rotina_automacao_gatilhos (empresa_id, evento) where ativo = true;
create index if not exists rotina_automacao_condicoes_automacao_idx
  on public.rotina_automacao_condicoes (automacao_id, grupo, ordem);
create index if not exists rotina_automacao_acoes_automacao_idx
  on public.rotina_automacao_acoes (automacao_id, ordem) where ativo = true;
create index if not exists rotina_automacao_execucoes_empresa_idx
  on public.rotina_automacao_execucoes (empresa_id, iniciada_em desc);
create index if not exists rotina_automacao_jobs_pendentes_idx
  on public.rotina_automacao_jobs (coalesce(proxima_tentativa_em, executar_em), created_at)
  where status = 'pendente';

create trigger rotina_automacoes_set_updated_at
before update on public.rotina_automacoes
for each row execute function public.set_updated_at();
create trigger rotina_automacao_gatilhos_set_updated_at
before update on public.rotina_automacao_gatilhos
for each row execute function public.set_updated_at();
create trigger rotina_automacao_condicoes_set_updated_at
before update on public.rotina_automacao_condicoes
for each row execute function public.set_updated_at();
create trigger rotina_automacao_acoes_set_updated_at
before update on public.rotina_automacao_acoes
for each row execute function public.set_updated_at();
create trigger rotina_automacao_execucoes_set_updated_at
before update on public.rotina_automacao_execucoes
for each row execute function public.set_updated_at();
create trigger rotina_automacao_jobs_set_updated_at
before update on public.rotina_automacao_jobs
for each row execute function public.set_updated_at();

alter table public.rotina_automacoes enable row level security;
alter table public.rotina_automacao_gatilhos enable row level security;
alter table public.rotina_automacao_condicoes enable row level security;
alter table public.rotina_automacao_acoes enable row level security;
alter table public.rotina_automacao_execucoes enable row level security;
alter table public.rotina_automacao_jobs enable row level security;

revoke all on public.rotina_automacoes from anon, authenticated;
revoke all on public.rotina_automacao_gatilhos from anon, authenticated;
revoke all on public.rotina_automacao_condicoes from anon, authenticated;
revoke all on public.rotina_automacao_acoes from anon, authenticated;
revoke all on public.rotina_automacao_execucoes from anon, authenticated;
revoke all on public.rotina_automacao_jobs from anon, authenticated;

grant select, insert, update, delete on public.rotina_automacoes to service_role;
grant select, insert, update, delete on public.rotina_automacao_gatilhos to service_role;
grant select, insert, update, delete on public.rotina_automacao_condicoes to service_role;
grant select, insert, update, delete on public.rotina_automacao_acoes to service_role;
grant select, insert, update, delete on public.rotina_automacao_execucoes to service_role;
grant select, insert, update, delete on public.rotina_automacao_jobs to service_role;

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
  if v_nome = '' then
    raise exception 'Nome da automação é obrigatório.';
  end if;
  if v_categoria not in ('agenda','conversas','contatos','imoveis','integracoes','sistema') then
    raise exception 'Categoria de automação inválida.';
  end if;
  if v_status not in ('rascunho','ativa','pausada') then
    v_status := 'pausada';
  end if;
  if jsonb_array_length(coalesce(p_payload->'gatilhos', '[]'::jsonb)) = 0 then
    raise exception 'A automação precisa de um gatilho.';
  end if;
  if jsonb_array_length(coalesce(p_payload->'acoes', '[]'::jsonb)) = 0 then
    raise exception 'A automação precisa de pelo menos uma ação.';
  end if;

  if p_rotina_id is null then
    insert into public.rotina_automacoes (
      empresa_id, nome, descricao, categoria, status, origem_tipo, origem_id,
      configuracao_json, criado_por, atualizado_por
    ) values (
      p_empresa_id,
      v_nome,
      nullif(btrim(coalesce(p_payload->>'descricao', '')), ''),
      v_categoria,
      v_status,
      coalesce(nullif(p_payload->>'origem_tipo', ''), 'crm'),
      nullif(p_payload->>'origem_id', '')::uuid,
      coalesce(p_payload->'configuracao_json', '{}'::jsonb),
      p_usuario_id,
      p_usuario_id
    ) returning id into v_id;
  else
    update public.rotina_automacoes
       set nome = v_nome,
           descricao = nullif(btrim(coalesce(p_payload->>'descricao', '')), ''),
           categoria = v_categoria,
           status = v_status,
           origem_tipo = coalesce(nullif(p_payload->>'origem_tipo', ''), origem_tipo),
           origem_id = nullif(p_payload->>'origem_id', '')::uuid,
           configuracao_json = coalesce(p_payload->'configuracao_json', '{}'::jsonb),
           atualizado_por = p_usuario_id
     where id = p_rotina_id
       and empresa_id = p_empresa_id
     returning id into v_id;

    if v_id is null then
      raise exception 'Automação não encontrada.';
    end if;

    delete from public.rotina_automacao_gatilhos where automacao_id = v_id and empresa_id = p_empresa_id;
    delete from public.rotina_automacao_condicoes where automacao_id = v_id and empresa_id = p_empresa_id;
    delete from public.rotina_automacao_acoes where automacao_id = v_id and empresa_id = p_empresa_id;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'gatilhos', '[]'::jsonb))
  loop
    insert into public.rotina_automacao_gatilhos (
      empresa_id, automacao_id, tipo, evento, entidade_tipo, offset_minutos,
      offset_referencia, configuracao_json, ativo
    ) values (
      p_empresa_id,
      v_id,
      coalesce(nullif(v_item->>'tipo', ''), 'evento'),
      btrim(coalesce(v_item->>'evento', '')),
      nullif(v_item->>'entidade_tipo', ''),
      nullif(v_item->>'offset_minutos', '')::integer,
      nullif(v_item->>'offset_referencia', ''),
      coalesce(v_item->'configuracao_json', '{}'::jsonb),
      coalesce((v_item->>'ativo')::boolean, true)
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'condicoes', '[]'::jsonb))
  loop
    if btrim(coalesce(v_item->>'campo', '')) = '' then
      continue;
    end if;
    insert into public.rotina_automacao_condicoes (
      empresa_id, automacao_id, grupo, ordem, conjuncao, campo, operador,
      valor_json, configuracao_json
    ) values (
      p_empresa_id,
      v_id,
      coalesce(nullif(v_item->>'grupo', '')::integer, 0),
      coalesce(nullif(v_item->>'ordem', '')::integer, 0),
      case when v_item->>'conjuncao' = 'or' then 'or' else 'and' end,
      btrim(v_item->>'campo'),
      coalesce(nullif(v_item->>'operador', ''), 'igual'),
      coalesce(v_item->'valor_json', 'null'::jsonb),
      coalesce(v_item->'configuracao_json', '{}'::jsonb)
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'acoes', '[]'::jsonb))
  loop
    insert into public.rotina_automacao_acoes (
      empresa_id, automacao_id, ordem, tipo_acao, configuracao_json, ativo
    ) values (
      p_empresa_id,
      v_id,
      coalesce(nullif(v_item->>'ordem', '')::integer, 0),
      btrim(coalesce(v_item->>'tipo_acao', '')),
      coalesce(v_item->'configuracao_json', '{}'::jsonb),
      coalesce((v_item->>'ativo')::boolean, true)
    );
  end loop;

  return v_id;
end;
$$;

revoke all on function public.rotina_automacao_salvar(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.rotina_automacao_salvar(uuid, uuid, uuid, jsonb) to service_role;
