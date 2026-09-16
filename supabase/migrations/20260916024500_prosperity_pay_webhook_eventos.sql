create table if not exists public.prosperity_pay_webhook_eventos (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  payment_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'processing' check (status in ('processing', 'processed', 'ignored', 'failed')),
  attempts integer not null default 1 check (attempts >= 1),
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prosperity_pay_webhook_eventos_status_idx
  on public.prosperity_pay_webhook_eventos (status, created_at);

alter table public.prosperity_pay_webhook_eventos enable row level security;
alter table public.prosperity_pay_webhook_eventos force row level security;

revoke all on public.prosperity_pay_webhook_eventos from anon, authenticated;
grant all on public.prosperity_pay_webhook_eventos to service_role;

create or replace function public.set_prosperity_pay_webhook_eventos_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_prosperity_pay_webhook_eventos_updated_at
  on public.prosperity_pay_webhook_eventos;

create trigger trg_prosperity_pay_webhook_eventos_updated_at
before update on public.prosperity_pay_webhook_eventos
for each row execute function public.set_prosperity_pay_webhook_eventos_updated_at();
