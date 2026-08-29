-- Intenções são uma camada paralela dos fluxos. Não criam nós ou conexões no React Flow.

create table if not exists public.automacao_intencoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  fluxo_id uuid not null references public.automacao_fluxos(id) on delete cascade,
  titulo text not null,
  resposta text not null,
  contexto_ia text not null,
  status text not null default 'ativa'
    check (status in ('ativa', 'pausada')),
  ordem integer not null default 0 check (ordem >= 0),
  acoes_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automacao_intencoes_titulo_not_blank
    check (length(btrim(titulo)) > 0),
  constraint automacao_intencoes_resposta_not_blank
    check (length(btrim(resposta)) > 0),
  constraint automacao_intencoes_contexto_not_blank
    check (length(btrim(contexto_ia)) > 0),
  constraint automacao_intencoes_acoes_array
    check (jsonb_typeof(acoes_json) = 'array')
);

create index if not exists idx_automacao_intencoes_fluxo_status_ordem
  on public.automacao_intencoes (empresa_id, fluxo_id, status, ordem, created_at);

create index if not exists idx_automacao_intencoes_fluxo_ordem
  on public.automacao_intencoes (fluxo_id, ordem, created_at);

create table if not exists public.automacao_intencao_execucoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  fluxo_id uuid not null references public.automacao_fluxos(id) on delete cascade,
  intencao_id uuid references public.automacao_intencoes(id) on delete set null,
  intencao_titulo text not null,
  execucao_id uuid references public.automacao_execucoes(id) on delete set null,
  conversa_id uuid references public.conversas(id) on delete set null,
  mensagem_id uuid references public.mensagens(id) on delete set null,
  mensagem_recebida text not null,
  confianca numeric(5,4),
  acoes_executadas jsonb not null default '[]'::jsonb,
  status text not null default 'processando'
    check (status in ('processando', 'concluido', 'erro', 'ignorado')),
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automacao_intencao_execucoes_acoes_array
    check (jsonb_typeof(acoes_executadas) = 'array')
);

create unique index if not exists uq_automacao_intencao_execucao_mensagem
  on public.automacao_intencao_execucoes (empresa_id, mensagem_id, intencao_id)
  where mensagem_id is not null and intencao_id is not null;

create index if not exists idx_automacao_intencao_execucoes_fluxo_created
  on public.automacao_intencao_execucoes (empresa_id, fluxo_id, created_at desc);

create index if not exists idx_automacao_intencao_execucoes_conversa_created
  on public.automacao_intencao_execucoes (empresa_id, conversa_id, created_at desc);

alter table public.automacao_intencoes enable row level security;
alter table public.automacao_intencao_execucoes enable row level security;

-- O runtime acessa estas tabelas exclusivamente pelo backend com supabaseAdmin.
-- Grants explícitos evitam depender do comportamento de exposição automática do Data API.
grant select, insert, update, delete
  on public.automacao_intencoes
  to service_role;
grant select, insert, update, delete
  on public.automacao_intencao_execucoes
  to service_role;

drop policy if exists automacao_intencoes_select_empresa on public.automacao_intencoes;
create policy automacao_intencoes_select_empresa
  on public.automacao_intencoes
  for select
  using (
    exists (
      select 1
      from public.usuarios u
      where u.auth_user_id = auth.uid()
        and u.empresa_id = automacao_intencoes.empresa_id
        and u.status = 'ativo'
    )
  );

drop policy if exists automacao_intencao_execucoes_select_empresa
  on public.automacao_intencao_execucoes;
create policy automacao_intencao_execucoes_select_empresa
  on public.automacao_intencao_execucoes
  for select
  using (
    exists (
      select 1
      from public.usuarios u
      where u.auth_user_id = auth.uid()
        and u.empresa_id = automacao_intencao_execucoes.empresa_id
        and u.status = 'ativo'
    )
  );

-- Cancelamento transacional da execução atual quando uma intenção contém "Parar fluxo".
-- Mantém o mesmo conjunto de estados e cancela resíduos agendados/fila ligados à execução.
create or replace function public.parar_automacao_execucao_por_intencao(
  p_empresa_id uuid,
  p_execucao_id uuid,
  p_motivo text default 'intencao_parar_fluxo'
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_execucao record;
  v_agora timestamptz := now();
begin
  update public.automacao_execucoes as execucao
     set status = 'cancelado',
         finished_at = v_agora,
         updated_at = v_agora,
         metadata_json = coalesce(execucao.metadata_json, '{}'::jsonb)
           || jsonb_build_object(
                'motivo_cancelamento', coalesce(nullif(btrim(p_motivo), ''), 'intencao_parar_fluxo'),
                'cancelado_em', v_agora,
                'origem_cancelamento', 'intencao'
              )
   where execucao.id = p_execucao_id
     and execucao.empresa_id = p_empresa_id
     and execucao.status in ('rodando', 'aguardando')
  returning execucao.id, execucao.fluxo_id, execucao.no_atual_id
       into v_execucao;

  if v_execucao.id is null then
    return false;
  end if;

  update public.automacao_agendamentos
     set status = 'cancelado',
         locked_at = null,
         payload_json = coalesce(payload_json, '{}'::jsonb)
           || jsonb_build_object(
                'motivo_cancelamento', coalesce(nullif(btrim(p_motivo), ''), 'intencao_parar_fluxo'),
                'cancelado_em', v_agora
              )
   where empresa_id = p_empresa_id
     and execucao_id = p_execucao_id
     and status in ('pendente', 'executando');

  update public.fila_processamento_auto
     set status = 'cancelado',
         locked_at = null,
         updated_at = v_agora,
         payload_json = coalesce(payload_json, '{}'::jsonb)
           || jsonb_build_object(
                'motivo_cancelamento', coalesce(nullif(btrim(p_motivo), ''), 'intencao_parar_fluxo'),
                'cancelado_em', v_agora
              )
   where empresa_id = p_empresa_id
     and execucao_id = p_execucao_id
     and status in ('pendente', 'executando');

  insert into public.automacao_execucao_logs (
    empresa_id,
    execucao_id,
    fluxo_id,
    no_id,
    tipo_evento,
    descricao,
    entrada_json,
    saida_json,
    created_at
  ) values (
    p_empresa_id,
    p_execucao_id,
    v_execucao.fluxo_id,
    v_execucao.no_atual_id,
    'execucao_cancelada_por_intencao',
    'Execução cancelada por ação explícita de uma intenção.',
    jsonb_build_object('motivo', coalesce(nullif(btrim(p_motivo), ''), 'intencao_parar_fluxo')),
    jsonb_build_object('status', 'cancelado', 'cancelado_em', v_agora),
    v_agora
  );

  return true;
end;
$$;

revoke all on function public.parar_automacao_execucao_por_intencao(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.parar_automacao_execucao_por_intencao(uuid, uuid, text)
  to service_role;
