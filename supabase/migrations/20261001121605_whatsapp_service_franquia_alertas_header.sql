create table if not exists public.whatsapp_service_franquia_alertas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  integracao_whatsapp_id uuid not null references public.integracoes_whatsapp(id) on delete cascade,
  mes date not null,
  percentual smallint not null check (percentual in (80, 95, 100)),
  service_usado bigint not null default 0 check (service_usado >= 0),
  service_limite integer not null default 1000 check (service_limite > 0),
  email_enviado_em timestamptz,
  email_erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integracao_whatsapp_id, mes, percentual)
);

create index if not exists idx_whatsapp_service_alertas_empresa_mes
  on public.whatsapp_service_franquia_alertas (empresa_id, mes desc);

create table if not exists public.whatsapp_service_franquia_alertas_confirmacoes (
  alerta_id uuid not null references public.whatsapp_service_franquia_alertas(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  confirmado_em timestamptz not null default now(),
  primary key (alerta_id, usuario_id)
);

create index if not exists idx_whatsapp_service_alertas_confirmacoes_usuario
  on public.whatsapp_service_franquia_alertas_confirmacoes (usuario_id, confirmado_em desc);

alter table public.whatsapp_service_franquia_alertas enable row level security;
alter table public.whatsapp_service_franquia_alertas_confirmacoes enable row level security;

revoke all on table public.whatsapp_service_franquia_alertas from anon, authenticated;
revoke all on table public.whatsapp_service_franquia_alertas_confirmacoes from anon, authenticated;
grant all on table public.whatsapp_service_franquia_alertas to service_role;
grant all on table public.whatsapp_service_franquia_alertas_confirmacoes to service_role;

update public.mensagens
set
  pricing_type = coalesce(
    pricing_type,
    nullif(metadata_json #>> '{whatsapp_status,pricing_type}', '')
  ),
  pricing_category = coalesce(
    pricing_category,
    nullif(metadata_json #>> '{whatsapp_status,pricing_category}', '')
  ),
  pricing_model = coalesce(
    pricing_model,
    nullif(metadata_json #>> '{whatsapp_status,pricing_model}', '')
  ),
  pricing_billable = coalesce(
    pricing_billable,
    case lower(coalesce(metadata_json #>> '{whatsapp_status,pricing_billable}', ''))
      when 'true' then true
      when 'false' then false
      else null
    end
  ),
  pricing_apurado_em = coalesce(
    pricing_apurado_em,
    case
      when nullif(metadata_json #>> '{whatsapp_status,pricing_category}', '') is not null
        or nullif(metadata_json #>> '{whatsapp_status,pricing_type}', '') is not null
      then updated_at
      else null
    end
  )
where
  (
    pricing_type is null
    or pricing_category is null
    or pricing_model is null
    or pricing_billable is null
    or pricing_apurado_em is null
  )
  and (
    nullif(metadata_json #>> '{whatsapp_status,pricing_category}', '') is not null
    or nullif(metadata_json #>> '{whatsapp_status,pricing_type}', '') is not null
  );
