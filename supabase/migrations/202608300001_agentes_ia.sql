-- Agentes de IA: configuração, conhecimento, ferramentas, memória curta e fila de execução.
-- Todas as entidades são isoladas por empresa_id e protegidas por RLS.

create table if not exists public.agentes_ia (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  descricao text,
  status text not null default 'rascunho' check (status in ('rascunho', 'ativo', 'inativo', 'arquivado')),
  modelo text not null default 'gpt-5.4-mini',
  prompt_sistema text not null default '',
  tom_voz text,
  instrucoes text,
  max_mensagens_contexto integer not null default 12 check (max_mensagens_contexto between 4 and 40),
  debounce_ms integer not null default 1200 check (debounce_ms between 250 and 10000),
  fallback_fluxo_id uuid references public.automacao_fluxos(id) on delete set null,
  integracoes_whatsapp_ids uuid[] not null default '{}'::uuid[],
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agentes_ia_empresa_status_idx
  on public.agentes_ia (empresa_id, status, created_at);

create table if not exists public.agente_ia_conhecimentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  agente_id uuid not null references public.agentes_ia(id) on delete cascade,
  titulo text not null,
  categoria text,
  conteudo text not null,
  palavras_chave text[] not null default '{}'::text[],
  prioridade integer not null default 0,
  ativo boolean not null default true,
  search_vector tsvector generated always as (
    setweight(to_tsvector('portuguese'::regconfig, coalesce(titulo, '')), 'A') ||
    setweight(to_tsvector('portuguese'::regconfig, coalesce(categoria, '')), 'B') ||
    setweight(to_tsvector('portuguese'::regconfig, coalesce(conteudo, '')), 'C')
  ) stored,
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agente_ia_conhecimentos_empresa_agente_idx
  on public.agente_ia_conhecimentos (empresa_id, agente_id, ativo, prioridade desc);
create index if not exists agente_ia_conhecimentos_search_idx
  on public.agente_ia_conhecimentos using gin (search_vector);

create table if not exists public.agente_ia_ferramentas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  agente_id uuid not null references public.agentes_ia(id) on delete cascade,
  tipo text not null check (tipo in (
    'consultar_conhecimento',
    'consultar_agenda',
    'criar_agendamento',
    'remarcar_agendamento',
    'cancelar_agendamento',
    'consultar_contato',
    'transferir_humano'
  )),
  ativo boolean not null default true,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agente_id, tipo)
);

create index if not exists agente_ia_ferramentas_empresa_agente_idx
  on public.agente_ia_ferramentas (empresa_id, agente_id, ativo);

create table if not exists public.agente_ia_conversa_estados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  agente_id uuid not null references public.agentes_ia(id) on delete cascade,
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  resumo text not null default '',
  estado_json jsonb not null default '{}'::jsonb,
  ultima_mensagem_id uuid references public.mensagens(id) on delete set null,
  ultima_interacao_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agente_id, conversa_id)
);

create index if not exists agente_ia_conversa_estados_empresa_conversa_idx
  on public.agente_ia_conversa_estados (empresa_id, conversa_id, updated_at desc);

create table if not exists public.agente_ia_execucoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  agente_id uuid not null references public.agentes_ia(id) on delete cascade,
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  contato_id uuid references public.contatos(id) on delete set null,
  mensagem_ids uuid[] not null default '{}'::uuid[],
  status text not null default 'pendente' check (status in ('pendente', 'processando', 'concluido', 'fallback', 'erro', 'cancelado')),
  entrada_resumida text,
  resposta text,
  ferramentas_json jsonb not null default '[]'::jsonb,
  modelo text,
  tokens_input bigint,
  tokens_output bigint,
  tokens_total bigint not null default 0,
  latencia_ms integer,
  erro text,
  metadata_json jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agente_ia_execucoes_empresa_conversa_idx
  on public.agente_ia_execucoes (empresa_id, conversa_id, created_at desc);
create index if not exists agente_ia_execucoes_agente_status_idx
  on public.agente_ia_execucoes (agente_id, status, created_at desc);

create table if not exists public.agente_ia_pendencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  agente_id uuid not null references public.agentes_ia(id) on delete cascade,
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  contato_id uuid references public.contatos(id) on delete set null,
  numero_destino text,
  mensagem_ids uuid[] not null default '{}'::uuid[],
  conteudo_agregado text not null default '',
  processar_em timestamptz not null default now(),
  status text not null default 'pendente' check (status in ('pendente', 'processando', 'processado', 'cancelado', 'erro')),
  versao bigint not null default 1,
  lock_token uuid,
  locked_at timestamptz,
  tentativas integer not null default 0,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, conversa_id)
);

create index if not exists agente_ia_pendencias_status_processar_idx
  on public.agente_ia_pendencias (status, processar_em)
  where status = 'pendente';

create or replace function public.agente_ia_buscar_conhecimento(
  p_empresa_id uuid,
  p_agente_id uuid,
  p_consulta text,
  p_limite integer default 5
)
returns table (
  id uuid,
  titulo text,
  categoria text,
  trecho text,
  rank real
)
language sql
stable
security invoker
set search_path = public
as $$
  with parametros as (
    select
      websearch_to_tsquery('portuguese'::regconfig, coalesce(nullif(trim(p_consulta), ''), '*')) as consulta,
      least(greatest(coalesce(p_limite, 5), 1), 5) as limite
  )
  select
    c.id,
    c.titulo,
    c.categoria,
    left(c.conteudo, 1600) as trecho,
    case
      when nullif(trim(p_consulta), '') is null then 0::real
      else ts_rank_cd(c.search_vector, websearch_to_tsquery('portuguese'::regconfig, p_consulta))
    end as rank
  from public.agente_ia_conhecimentos c
  cross join parametros p
  where c.empresa_id = p_empresa_id
    and c.agente_id = p_agente_id
    and c.ativo = true
    and (
      nullif(trim(p_consulta), '') is null
      or c.search_vector @@ websearch_to_tsquery('portuguese'::regconfig, p_consulta)
      or c.titulo ilike '%' || p_consulta || '%'
      or c.conteudo ilike '%' || p_consulta || '%'
    )
  order by c.prioridade desc, rank desc, c.updated_at desc
  limit (select limite from parametros);
$$;

create or replace function public.agente_ia_enfileirar_mensagem(
  p_empresa_id uuid,
  p_agente_id uuid,
  p_conversa_id uuid,
  p_contato_id uuid,
  p_numero_destino text,
  p_mensagem_id uuid,
  p_conteudo text,
  p_debounce_ms integer
)
returns public.agente_ia_pendencias
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pendencia public.agente_ia_pendencias;
  v_debounce integer := least(greatest(coalesce(p_debounce_ms, 1200), 250), 10000);
begin
  if not exists (
    select 1 from public.agentes_ia a
    where a.id = p_agente_id
      and a.empresa_id = p_empresa_id
      and a.status = 'ativo'
  ) then
    raise exception 'Agente ativo nao encontrado para a empresa.';
  end if;

  if not exists (
    select 1 from public.conversas c
    where c.id = p_conversa_id and c.empresa_id = p_empresa_id
  ) then
    raise exception 'Conversa nao encontrada para a empresa.';
  end if;

  insert into public.agente_ia_pendencias (
    empresa_id, agente_id, conversa_id, contato_id, numero_destino,
    mensagem_ids, conteudo_agregado, processar_em, status, versao,
    lock_token, locked_at, tentativas, erro, updated_at
  ) values (
    p_empresa_id, p_agente_id, p_conversa_id, p_contato_id, nullif(trim(p_numero_destino), ''),
    case when p_mensagem_id is null then '{}'::uuid[] else array[p_mensagem_id] end,
    coalesce(p_conteudo, ''),
    now() + make_interval(secs => v_debounce::numeric / 1000),
    'pendente', 1, null, null, 0, null, now()
  )
  on conflict (empresa_id, conversa_id) do update set
    agente_id = excluded.agente_id,
    contato_id = coalesce(excluded.contato_id, public.agente_ia_pendencias.contato_id),
    numero_destino = coalesce(excluded.numero_destino, public.agente_ia_pendencias.numero_destino),
    mensagem_ids = case
      when p_mensagem_id is null or p_mensagem_id = any(public.agente_ia_pendencias.mensagem_ids)
        then public.agente_ia_pendencias.mensagem_ids
      else array_append(public.agente_ia_pendencias.mensagem_ids, p_mensagem_id)
    end,
    conteudo_agregado = case
      when coalesce(trim(p_conteudo), '') = '' then public.agente_ia_pendencias.conteudo_agregado
      when coalesce(trim(public.agente_ia_pendencias.conteudo_agregado), '') = '' then p_conteudo
      else public.agente_ia_pendencias.conteudo_agregado || E'\n' || p_conteudo
    end,
    processar_em = now() + make_interval(secs => v_debounce::numeric / 1000),
    status = 'pendente',
    versao = public.agente_ia_pendencias.versao + 1,
    lock_token = null,
    locked_at = null,
    erro = null,
    updated_at = now()
  returning * into v_pendencia;

  return v_pendencia;
end;
$$;

create or replace function public.agente_ia_reservar_pendencia(
  p_pendencia_id uuid,
  p_lock_token uuid,
  p_forcar boolean default false
)
returns public.agente_ia_pendencias
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pendencia public.agente_ia_pendencias;
begin
  update public.agente_ia_pendencias
  set
    status = 'processando',
    lock_token = p_lock_token,
    locked_at = now(),
    tentativas = tentativas + 1,
    updated_at = now()
  where id = p_pendencia_id
    and status = 'pendente'
    and (p_forcar or processar_em <= now())
  returning * into v_pendencia;

  return v_pendencia;
end;
$$;

revoke all on function public.agente_ia_enfileirar_mensagem(uuid, uuid, uuid, uuid, text, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.agente_ia_enfileirar_mensagem(uuid, uuid, uuid, uuid, text, uuid, text, integer) to service_role;
revoke all on function public.agente_ia_reservar_pendencia(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.agente_ia_reservar_pendencia(uuid, uuid, boolean) to service_role;
grant execute on function public.agente_ia_buscar_conhecimento(uuid, uuid, text, integer) to authenticated, service_role;

alter table public.agentes_ia enable row level security;
alter table public.agente_ia_conhecimentos enable row level security;
alter table public.agente_ia_ferramentas enable row level security;
alter table public.agente_ia_conversa_estados enable row level security;
alter table public.agente_ia_execucoes enable row level security;
alter table public.agente_ia_pendencias enable row level security;

create policy agentes_ia_mesma_empresa on public.agentes_ia
  for all to authenticated
  using (exists (
    select 1 from public.usuarios u
    where u.auth_user_id = auth.uid() and u.empresa_id = agentes_ia.empresa_id and u.status = 'ativo'
  ))
  with check (exists (
    select 1 from public.usuarios u
    where u.auth_user_id = auth.uid() and u.empresa_id = agentes_ia.empresa_id and u.status = 'ativo'
  ));

create policy agente_ia_conhecimentos_mesma_empresa on public.agente_ia_conhecimentos
  for all to authenticated
  using (exists (
    select 1 from public.usuarios u
    where u.auth_user_id = auth.uid() and u.empresa_id = agente_ia_conhecimentos.empresa_id and u.status = 'ativo'
  ))
  with check (exists (
    select 1 from public.usuarios u
    where u.auth_user_id = auth.uid() and u.empresa_id = agente_ia_conhecimentos.empresa_id and u.status = 'ativo'
  ));

create policy agente_ia_ferramentas_mesma_empresa on public.agente_ia_ferramentas
  for all to authenticated
  using (exists (
    select 1 from public.usuarios u
    where u.auth_user_id = auth.uid() and u.empresa_id = agente_ia_ferramentas.empresa_id and u.status = 'ativo'
  ))
  with check (exists (
    select 1 from public.usuarios u
    where u.auth_user_id = auth.uid() and u.empresa_id = agente_ia_ferramentas.empresa_id and u.status = 'ativo'
  ));

create policy agente_ia_conversa_estados_mesma_empresa on public.agente_ia_conversa_estados
  for all to authenticated
  using (exists (
    select 1 from public.usuarios u
    where u.auth_user_id = auth.uid() and u.empresa_id = agente_ia_conversa_estados.empresa_id and u.status = 'ativo'
  ))
  with check (exists (
    select 1 from public.usuarios u
    where u.auth_user_id = auth.uid() and u.empresa_id = agente_ia_conversa_estados.empresa_id and u.status = 'ativo'
  ));

create policy agente_ia_execucoes_mesma_empresa on public.agente_ia_execucoes
  for select to authenticated
  using (exists (
    select 1 from public.usuarios u
    where u.auth_user_id = auth.uid() and u.empresa_id = agente_ia_execucoes.empresa_id and u.status = 'ativo'
  ));

create policy agente_ia_pendencias_mesma_empresa on public.agente_ia_pendencias
  for select to authenticated
  using (exists (
    select 1 from public.usuarios u
    where u.auth_user_id = auth.uid() and u.empresa_id = agente_ia_pendencias.empresa_id and u.status = 'ativo'
  ));

grant select, insert, update, delete on public.agentes_ia to authenticated;
grant select, insert, update, delete on public.agente_ia_conhecimentos to authenticated;
grant select, insert, update, delete on public.agente_ia_ferramentas to authenticated;
grant select, insert, update, delete on public.agente_ia_conversa_estados to authenticated;
grant select on public.agente_ia_execucoes to authenticated;
grant select on public.agente_ia_pendencias to authenticated;
grant all on public.agentes_ia, public.agente_ia_conhecimentos, public.agente_ia_ferramentas,
  public.agente_ia_conversa_estados, public.agente_ia_execucoes, public.agente_ia_pendencias to service_role;
