-- Webhook de entrada de imoveis por parceiro.
-- Cada integracao pertence a uma empresa e usa um segredo armazenado apenas
-- como hash. Os arquivos de imagem nao sao copiados; somente URLs sao salvas.

create table if not exists public.imobiliario_integracoes_webhook (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  canal_codigo text not null,
  token_hash text not null,
  token_hint text not null,
  status text not null default 'ativo'
    check (status in ('ativo', 'inativo')),
  ultimo_evento_em timestamptz,
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, canal_codigo)
);

create index if not exists imobiliario_integracoes_webhook_empresa_idx
  on public.imobiliario_integracoes_webhook (empresa_id, status, created_at desc);

create table if not exists public.imobiliario_webhook_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  integracao_id uuid not null
    references public.imobiliario_integracoes_webhook(id) on delete cascade,
  event_id text not null,
  event_type text not null,
  external_id text,
  status text not null default 'recebido'
    check (status in ('recebido', 'processado', 'ignorado', 'erro')),
  payload jsonb not null default '{}'::jsonb,
  erro text,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  created_at timestamptz not null default now(),
  unique (integracao_id, event_id),
  constraint imobiliario_webhook_eventos_payload_check
    check (jsonb_typeof(payload) = 'object')
);

create index if not exists imobiliario_webhook_eventos_empresa_idx
  on public.imobiliario_webhook_eventos (empresa_id, recebido_em desc);

create index if not exists imobiliario_webhook_eventos_integracao_idx
  on public.imobiliario_webhook_eventos
  (integracao_id, status, recebido_em desc);

alter table public.imoveis_externos
  add column if not exists integracao_id uuid
    references public.imobiliario_integracoes_webhook(id) on delete set null,
  add column if not exists codigo text,
  add column if not exists status_origem text,
  add column if not exists valor_venda numeric(14, 2),
  add column if not exists valor_locacao numeric(14, 2),
  add column if not exists valor_condominio numeric(14, 2),
  add column if not exists valor_iptu numeric(14, 2),
  add column if not exists cep text,
  add column if not exists logradouro text,
  add column if not exists numero text,
  add column if not exists complemento text,
  add column if not exists suites integer,
  add column if not exists area_util_m2 numeric(10, 2),
  add column if not exists area_total_m2 numeric(10, 2),
  add column if not exists area_terreno_m2 numeric(10, 2),
  add column if not exists latitude numeric(10, 7),
  add column if not exists longitude numeric(10, 7),
  add column if not exists caracteristicas jsonb not null default '{}'::jsonb,
  add column if not exists imagem_url text,
  add column if not exists imagem_urls jsonb not null default '[]'::jsonb,
  add column if not exists atualizado_origem_em timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.imoveis_externos'::regclass
      and conname = 'imoveis_externos_caracteristicas_check'
  ) then
    alter table public.imoveis_externos
      add constraint imoveis_externos_caracteristicas_check
      check (jsonb_typeof(caracteristicas) = 'object');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.imoveis_externos'::regclass
      and conname = 'imoveis_externos_imagem_urls_check'
  ) then
    alter table public.imoveis_externos
      add constraint imoveis_externos_imagem_urls_check
      check (jsonb_typeof(imagem_urls) = 'array');
  end if;
end;
$$;

create index if not exists imoveis_externos_integracao_idx
  on public.imoveis_externos (integracao_id, recebido_em desc);

drop trigger if exists imobiliario_integracoes_webhook_updated_at
  on public.imobiliario_integracoes_webhook;
create trigger imobiliario_integracoes_webhook_updated_at
before update on public.imobiliario_integracoes_webhook
for each row execute function public.cadastros_atualizar_updated_at();

alter table public.imobiliario_integracoes_webhook enable row level security;
alter table public.imobiliario_webhook_eventos enable row level security;

-- Sem policies para clientes autenticados: segredo (mesmo em hash) e payload
-- bruto so podem ser lidos pelas rotas servidoras que validam as permissoes.
