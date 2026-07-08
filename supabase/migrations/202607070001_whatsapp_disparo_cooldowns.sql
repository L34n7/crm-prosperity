create table if not exists public.whatsapp_disparo_cooldowns (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  contato_id uuid references public.contatos(id) on delete set null,
  telefone_normalizado text not null,
  integracao_whatsapp_id uuid references public.integracoes_whatsapp(id) on delete set null,
  categoria text not null default 'marketing'
    check (categoria in ('marketing', 'utility')),
  motivo text not null
    check (motivo in ('meta_131049', 'frequencia_marketing')),
  ativo boolean not null default true,
  bloqueado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  ocorrencias_janela integer not null default 1,
  janela_inicio_em timestamptz not null default now(),
  ultima_ocorrencia_em timestamptz not null default now(),
  campanha_id uuid references public.whatsapp_disparo_campanhas(id) on delete set null,
  item_id uuid references public.whatsapp_disparo_itens(id) on delete set null,
  mensagem_externa_id text,
  erro_codigo_meta integer,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_disparo_cooldowns_ativos_idx
  on public.whatsapp_disparo_cooldowns (
    empresa_id,
    telefone_normalizado,
    categoria,
    expira_em desc
  )
  where ativo = true;

create unique index if not exists whatsapp_disparo_cooldowns_ativo_unique_idx
  on public.whatsapp_disparo_cooldowns (
    empresa_id,
    telefone_normalizado,
    categoria,
    motivo
  )
  where ativo = true;

alter table public.whatsapp_disparo_cooldowns enable row level security;

revoke all on public.whatsapp_disparo_cooldowns from public, anon, authenticated;
grant all on public.whatsapp_disparo_cooldowns to service_role;

notify pgrst, 'reload schema';
