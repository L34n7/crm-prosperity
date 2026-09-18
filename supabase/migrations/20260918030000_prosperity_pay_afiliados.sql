create table if not exists public.prosperity_pay_afiliados (
  id uuid primary key default gen_random_uuid(),
  integration_key text not null,
  external_membership_id text not null,
  external_program_id text,
  external_user_id text,
  affiliate_ref text not null,
  nome text,
  email text,
  status text not null default 'pending'
    check (status in ('pending','active','blocked','rejected','cancelled')),
  product_id text not null,
  product_name text,
  offer_references text[] not null default '{}'::text[],
  tracking_parameter text not null default 'ref',
  tracking_url text,
  cookie_days integer not null default 30 check (cookie_days between 1 and 365),
  attribution_model text not null default 'last_click'
    check (attribution_model in ('last_click','first_click')),
  last_event_id text,
  payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prosperity_pay_afiliados_integration_membership_key
    unique (integration_key, external_membership_id)
);

create index if not exists prosperity_pay_afiliados_ref_idx
  on public.prosperity_pay_afiliados (affiliate_ref);

create index if not exists prosperity_pay_afiliados_product_status_idx
  on public.prosperity_pay_afiliados (product_id, status);

alter table public.prosperity_pay_afiliados enable row level security;
alter table public.prosperity_pay_afiliados force row level security;

revoke all on public.prosperity_pay_afiliados from anon, authenticated;
grant all on public.prosperity_pay_afiliados to service_role;
