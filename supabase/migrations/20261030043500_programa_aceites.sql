-- Registro versionado de aceite expresso das condições dos programas educacionais.
-- Mantém histórico independente do documento/aceite previamente registrado em empresas.
create table if not exists public.programa_aceites (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  usuario_id uuid not null,
  versao_termos text not null,
  versao_privacidade text not null,
  versao_mensageria text not null,
  texto_aceite text not null,
  hash_aceite_sha256 text not null,
  ip text,
  user_agent text,
  origem text not null default 'modal_admin',
  aceito_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint programa_aceites_empresa_versao_key unique (empresa_id, versao_termos)
);
create index if not exists idx_programa_aceites_empresa_data on public.programa_aceites (empresa_id, aceito_em desc);
alter table public.programa_aceites enable row level security;
revoke all on public.programa_aceites from anon, authenticated;
comment on table public.programa_aceites is 'Confirmações expressas versionadas dos programas e condições do CRM, registradas exclusivamente pelo backend autenticado.';
