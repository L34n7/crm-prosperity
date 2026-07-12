alter table if exists public.planos
  add column if not exists limite_integracoes_whatsapp integer not null default 1;

alter table if exists public.empresas
  add column if not exists limite_integracoes_whatsapp integer;

comment on column public.planos.limite_integracoes_whatsapp is
  'Limite padrao de integracoes WhatsApp oficiais permitido pelo plano.';

comment on column public.empresas.limite_integracoes_whatsapp is
  'Override manual do limite de integracoes WhatsApp oficiais da empresa. Null usa o plano.';

update public.planos
set limite_integracoes_whatsapp = 1
where limite_integracoes_whatsapp is null
   or limite_integracoes_whatsapp < 1;

alter table if exists public.integracoes_whatsapp
  add column if not exists posicao integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'integracoes_whatsapp_posicao_check'
  ) then
    alter table public.integracoes_whatsapp
      add constraint integracoes_whatsapp_posicao_check
      check (posicao is null or posicao between 1 and 3);
  end if;
end $$;

with ordenadas as (
  select
    id,
    row_number() over (
      partition by empresa_id
      order by created_at asc nulls last, id asc
    ) as rn
  from public.integracoes_whatsapp
  where provider = 'meta_official'
    and posicao is null
)
update public.integracoes_whatsapp integracao
set posicao = ordenadas.rn
from ordenadas
where integracao.id = ordenadas.id
  and ordenadas.rn between 1 and 3;

create unique index if not exists integracoes_whatsapp_empresa_posicao_uidx
  on public.integracoes_whatsapp (empresa_id, posicao)
  where provider = 'meta_official'
    and posicao is not null;

create table if not exists public.perfil_integracoes_whatsapp (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  perfil_empresa_id uuid not null references public.perfis_empresa(id) on delete cascade,
  integracao_whatsapp_id uuid not null references public.integracoes_whatsapp(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint perfil_integracoes_whatsapp_unique
    unique (perfil_empresa_id, integracao_whatsapp_id)
);

create index if not exists perfil_integracoes_whatsapp_empresa_idx
  on public.perfil_integracoes_whatsapp (empresa_id, perfil_empresa_id);

create index if not exists perfil_integracoes_whatsapp_integracao_idx
  on public.perfil_integracoes_whatsapp (integracao_whatsapp_id);

alter table public.perfil_integracoes_whatsapp enable row level security;

revoke all on table public.perfil_integracoes_whatsapp from anon, authenticated;
grant all on table public.perfil_integracoes_whatsapp to service_role;

comment on table public.perfil_integracoes_whatsapp is
  'Restricao opcional de quais integracoes WhatsApp cada perfil dinamico pode acessar. Sem linhas para o perfil, o acesso permanece livre.';
