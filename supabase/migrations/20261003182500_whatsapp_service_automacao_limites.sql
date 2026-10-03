create table if not exists public.whatsapp_service_automacao_limites (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  integracao_whatsapp_id uuid not null references public.integracoes_whatsapp(id) on delete cascade,
  pausar_automacoes boolean not null default false,
  limite_extra integer not null default 0
    check (limite_extra >= 0 and limite_extra <= 1000000),
  bloqueado_mes date null,
  bloqueado_em timestamptz null,
  bloqueio_detalhe jsonb not null default '{}'::jsonb,
  updated_by uuid null references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, integracao_whatsapp_id)
);

create index if not exists idx_whatsapp_service_automacao_limites_empresa
  on public.whatsapp_service_automacao_limites (empresa_id, integracao_whatsapp_id);

alter table public.whatsapp_service_automacao_limites enable row level security;

revoke all on table public.whatsapp_service_automacao_limites
  from public, anon, authenticated;

grant select, insert, update, delete on table public.whatsapp_service_automacao_limites
  to service_role;

create or replace function public.claim_whatsapp_service_automation_limit(
  p_empresa_id uuid,
  p_integracao_id uuid,
  p_mes date,
  p_service_total integer,
  p_detalhe jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_config public.whatsapp_service_automacao_limites%rowtype;
  v_limite_total integer;
begin
  select *
    into v_config
  from public.whatsapp_service_automacao_limites
  where empresa_id = p_empresa_id
    and integracao_whatsapp_id = p_integracao_id
  for update;

  if not found or v_config.pausar_automacoes is not true then
    return false;
  end if;

  if v_config.bloqueado_mes = p_mes then
    return false;
  end if;

  v_limite_total := 1000 + greatest(v_config.limite_extra, 0);

  if greatest(p_service_total, 0) < v_limite_total then
    return false;
  end if;

  update public.whatsapp_service_automacao_limites
  set
    bloqueado_mes = p_mes,
    bloqueado_em = now(),
    bloqueio_detalhe = coalesce(p_detalhe, '{}'::jsonb),
    updated_at = now()
  where id = v_config.id;

  return true;
end;
$$;

revoke all on function public.claim_whatsapp_service_automation_limit(
  uuid, uuid, date, integer, jsonb
) from public, anon, authenticated;

grant execute on function public.claim_whatsapp_service_automation_limit(
  uuid, uuid, date, integer, jsonb
) to service_role;
