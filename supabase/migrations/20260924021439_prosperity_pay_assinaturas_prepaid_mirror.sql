
begin;

create table if not exists public.prosperity_pay_assinaturas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id) on delete cascade,
  external_subscription_id text not null unique,
  customer_email text,
  external_offer_reference text,
  status text not null default 'unknown',
  billing_model text not null default 'prepaid',
  base_amount_cents bigint,
  current_amount_cents bigint,
  currency text not null default 'BRL',
  cycle_number integer,
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_due_at timestamptz,
  items jsonb not null default '[]'::jsonb,
  pending_change jsonb,
  last_event_id text,
  last_event_type text,
  payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prosperity_pay_assinaturas_billing_model_check
    check (billing_model in ('prepaid','postpaid')),
  constraint prosperity_pay_assinaturas_amounts_check
    check (
      (base_amount_cents is null or base_amount_cents >= 0)
      and (current_amount_cents is null or current_amount_cents >= 0)
    )
);

create unique index if not exists prosperity_pay_assinaturas_empresa_uq
  on public.prosperity_pay_assinaturas(empresa_id)
  where empresa_id is not null;

create index if not exists prosperity_pay_assinaturas_email_idx
  on public.prosperity_pay_assinaturas(lower(customer_email))
  where customer_email is not null;

create index if not exists prosperity_pay_assinaturas_status_idx
  on public.prosperity_pay_assinaturas(status, next_due_at);

alter table public.prosperity_pay_assinaturas enable row level security;
alter table public.prosperity_pay_assinaturas force row level security;

revoke all on table public.prosperity_pay_assinaturas from public, anon, authenticated;
grant select, insert, update, delete on table public.prosperity_pay_assinaturas to service_role;

update public.ia_token_ofertas
set ativa = false,
    updated_at = now(),
    metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
      'desativado_motivo', 'substituido_por_addon_dinamico_assinatura',
      'desativado_em', now()
    )
where gateway = 'prosperity_pay'
  and referencia = '73845590f7a9'
  and tipo = 'mensalidade'
  and ativa = true;

commit;
