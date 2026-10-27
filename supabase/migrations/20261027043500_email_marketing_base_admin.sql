create table if not exists public.email_remetentes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid null references public.empresas(id) on delete cascade,
  escopo text not null default 'sistema' check (escopo in ('sistema','empresa')),
  nome text not null,
  email text not null,
  dominio text not null,
  provider text not null default 'resend' check (provider in ('resend')),
  provider_domain_id text null,
  status text not null default 'pendente' check (status in ('pendente','verificado','erro','inativo')),
  is_default boolean not null default false,
  criado_por_usuario_id uuid null references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists email_remetentes_email_unico
  on public.email_remetentes (lower(email));

create unique index if not exists email_remetentes_default_sistema_unico
  on public.email_remetentes ((1))
  where escopo = 'sistema' and empresa_id is null and is_default = true;

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid null references public.empresas(id) on delete cascade,
  escopo text not null default 'sistema' check (escopo in ('sistema','empresa')),
  nome text not null,
  assunto text not null,
  html text not null,
  texto text null,
  status text not null default 'rascunho' check (status in ('rascunho','ativo','arquivado')),
  criado_por_usuario_id uuid null references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_templates_empresa_status_idx
  on public.email_templates (empresa_id, status, created_at desc);

create table if not exists public.email_campanhas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid null references public.empresas(id) on delete cascade,
  escopo text not null default 'sistema' check (escopo in ('sistema','empresa')),
  nome text not null,
  assunto text not null,
  remetente_id uuid not null references public.email_remetentes(id) on delete restrict,
  template_id uuid null references public.email_templates(id) on delete set null,
  status text not null default 'rascunho'
    check (status in ('rascunho','agendada','processando','enviada','pausada','cancelada','falha')),
  audiencia_json jsonb not null default '{}'::jsonb,
  agendada_para timestamptz null,
  iniciada_em timestamptz null,
  finalizada_em timestamptz null,
  total_destinatarios integer not null default 0,
  total_enviados integer not null default 0,
  total_entregues integer not null default 0,
  total_abertos integer not null default 0,
  total_cliques integer not null default 0,
  total_bounces integer not null default 0,
  total_reclamacoes integer not null default 0,
  total_descadastros integer not null default 0,
  criado_por_usuario_id uuid null references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_campanhas_status_agendada_idx
  on public.email_campanhas (status, agendada_para)
  where status = 'agendada';

create index if not exists email_campanhas_empresa_created_idx
  on public.email_campanhas (empresa_id, created_at desc);

create table if not exists public.email_campanha_destinatarios (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.email_campanhas(id) on delete cascade,
  contato_id uuid null references public.contatos(id) on delete set null,
  email text not null,
  nome text null,
  status text not null default 'pendente'
    check (status in ('pendente','processando','enviado','entregue','aberto','clicado','bounce','reclamacao','suprimido','falha')),
  provider_message_id text null,
  erro text null,
  enviado_em timestamptz null,
  entregue_em timestamptz null,
  aberto_em timestamptz null,
  clicado_em timestamptz null,
  bounce_em timestamptz null,
  reclamacao_em timestamptz null,
  suprimido_em timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists email_campanha_destinatarios_campanha_email_unico
  on public.email_campanha_destinatarios (campanha_id, lower(email));

create unique index if not exists email_campanha_destinatarios_provider_message_unico
  on public.email_campanha_destinatarios (provider_message_id)
  where provider_message_id is not null;

create index if not exists email_campanha_destinatarios_status_idx
  on public.email_campanha_destinatarios (campanha_id, status);

create table if not exists public.email_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid null references public.empresas(id) on delete cascade,
  campanha_id uuid null references public.email_campanhas(id) on delete cascade,
  destinatario_id uuid null references public.email_campanha_destinatarios(id) on delete set null,
  provider text not null default 'resend',
  provider_event_id text null,
  provider_message_id text null,
  tipo text not null,
  destinatario_email text null,
  ocorrido_em timestamptz null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists email_eventos_provider_event_unico
  on public.email_eventos (provider, provider_event_id)
  where provider_event_id is not null;

create index if not exists email_eventos_provider_message_idx
  on public.email_eventos (provider_message_id, created_at desc);

create index if not exists email_eventos_campanha_tipo_idx
  on public.email_eventos (campanha_id, tipo, created_at desc);

create table if not exists public.email_suppressions (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid null references public.empresas(id) on delete cascade,
  email text not null,
  motivo text not null check (motivo in ('descadastro','bounce','reclamacao','manual')),
  fonte text not null default 'resend',
  provider_message_id text null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists email_suppressions_escopo_email_unico
  on public.email_suppressions (
    coalesce(empresa_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(email)
  );

create index if not exists email_suppressions_email_idx
  on public.email_suppressions (lower(email));

alter table public.email_remetentes enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_campanhas enable row level security;
alter table public.email_campanha_destinatarios enable row level security;
alter table public.email_eventos enable row level security;
alter table public.email_suppressions enable row level security;

revoke all on table public.email_remetentes from anon, authenticated;
revoke all on table public.email_templates from anon, authenticated;
revoke all on table public.email_campanhas from anon, authenticated;
revoke all on table public.email_campanha_destinatarios from anon, authenticated;
revoke all on table public.email_eventos from anon, authenticated;
revoke all on table public.email_suppressions from anon, authenticated;

grant select, insert, update, delete on table public.email_remetentes to service_role;
grant select, insert, update, delete on table public.email_templates to service_role;
grant select, insert, update, delete on table public.email_campanhas to service_role;
grant select, insert, update, delete on table public.email_campanha_destinatarios to service_role;
grant select, insert, update, delete on table public.email_eventos to service_role;
grant select, insert, update, delete on table public.email_suppressions to service_role;

insert into public.email_remetentes (
  escopo,
  nome,
  email,
  dominio,
  provider,
  provider_domain_id,
  status,
  is_default
)
values (
  'sistema',
  'CRM Prosperity',
  'marketing@email.crmprosperity.com',
  'email.crmprosperity.com',
  'resend',
  '6cd75f26-75fa-4db0-b537-f0f05c9cbeda',
  'verificado',
  true
)
on conflict (lower(email)) do update
set
  nome = excluded.nome,
  dominio = excluded.dominio,
  provider = excluded.provider,
  provider_domain_id = excluded.provider_domain_id,
  status = excluded.status,
  is_default = excluded.is_default,
  updated_at = now();
