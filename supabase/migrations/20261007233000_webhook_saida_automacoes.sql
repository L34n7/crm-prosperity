create table if not exists public.integracao_webhooks_outbox (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  automacao_id uuid references public.rotina_automacoes(id) on delete set null,
  execucao_id uuid references public.rotina_automacao_execucoes(id) on delete set null,
  acao_id uuid references public.rotina_automacao_acoes(id) on delete set null,
  integracao_id uuid not null references public.integracoes_api_externas(id) on delete cascade,
  conversa_id uuid references public.conversas(id) on delete set null,
  mensagem_id uuid references public.mensagens(id) on delete set null,
  evento text not null,
  endpoint text not null,
  payload_json jsonb not null default '{}'::jsonb,
  status text not null default 'pendente'
    check (status in ('pendente','processando','processado','erro','descartado')),
  tentativas integer not null default 0 check (tentativas >= 0),
  max_tentativas integer not null default 6 check (max_tentativas between 1 and 20),
  chave_idempotencia text not null,
  qstash_message_id text,
  qstash_publicado_em timestamptz,
  ultimo_status_http integer,
  ultimo_erro text,
  locked_at timestamptz,
  processado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chave_idempotencia)
);

create index if not exists integracao_webhooks_outbox_pendentes_idx
  on public.integracao_webhooks_outbox (status, updated_at, created_at)
  where status in ('pendente','erro');

create index if not exists integracao_webhooks_outbox_empresa_idx
  on public.integracao_webhooks_outbox (empresa_id, created_at desc);

create index if not exists integracao_webhooks_outbox_integracao_idx
  on public.integracao_webhooks_outbox (integracao_id, created_at desc);

drop trigger if exists integracao_webhooks_outbox_set_updated_at
  on public.integracao_webhooks_outbox;
create trigger integracao_webhooks_outbox_set_updated_at
before update on public.integracao_webhooks_outbox
for each row execute function public.set_updated_at();

alter table public.integracao_webhooks_outbox enable row level security;
revoke all on table public.integracao_webhooks_outbox from anon, authenticated;
grant select, insert, update, delete on table public.integracao_webhooks_outbox to service_role;

create or replace function public.claim_integracao_webhook_outbox(p_id uuid)
returns setof public.integracao_webhooks_outbox
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item public.integracao_webhooks_outbox%rowtype;
begin
  update public.integracao_webhooks_outbox
     set status = 'processando',
         tentativas = tentativas + 1,
         locked_at = now(),
         ultimo_erro = null,
         updated_at = now()
   where id = p_id
     and status in ('pendente','erro')
     and tentativas < max_tentativas
  returning * into v_item;

  if found then
    return next v_item;
  end if;

  return;
end;
$$;

revoke execute on function public.claim_integracao_webhook_outbox(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_integracao_webhook_outbox(uuid)
  to service_role;

comment on table public.integracao_webhooks_outbox is
  'Fila assíncrona de webhooks de saída das automações. A conversa não aguarda a entrega externa.';
