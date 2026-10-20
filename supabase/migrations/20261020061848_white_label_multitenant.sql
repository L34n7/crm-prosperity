
create table if not exists public.white_labels (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null,
  dominio text not null,
  nome_produto text not null,
  logo_url text,
  favicon_url text,
  cor_primaria text not null default '#0f509a',
  licencas_contratadas integer not null default 5,
  plano_padrao_id uuid references public.planos(id) on delete set null,
  empresa_gestora_id uuid,
  status text not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint white_labels_licencas_check check (licencas_contratadas >= 1),
  constraint white_labels_status_check check (status in ('ativo', 'inativo'))
);

create unique index if not exists white_labels_slug_lower_uidx
  on public.white_labels (lower(slug));

create unique index if not exists white_labels_dominio_lower_uidx
  on public.white_labels (lower(dominio));

alter table public.empresas
  add column if not exists white_label_id uuid references public.white_labels(id) on delete set null,
  add column if not exists white_label_tipo text;

alter table public.empresas
  drop constraint if exists empresas_white_label_tipo_check;

alter table public.empresas
  add constraint empresas_white_label_tipo_check
  check (white_label_tipo is null or white_label_tipo in ('gestora', 'cliente'));

create index if not exists empresas_white_label_id_idx
  on public.empresas (white_label_id);

create index if not exists empresas_white_label_clientes_idx
  on public.empresas (white_label_id, white_label_tipo, status)
  where white_label_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'white_labels_empresa_gestora_id_fkey'
      and conrelid = 'public.white_labels'::regclass
  ) then
    alter table public.white_labels
      add constraint white_labels_empresa_gestora_id_fkey
      foreign key (empresa_gestora_id)
      references public.empresas(id)
      on delete set null;
  end if;
end
$$;

create table if not exists public.white_label_administradores (
  id uuid primary key default gen_random_uuid(),
  white_label_id uuid not null references public.white_labels(id) on delete cascade,
  usuario_id uuid references public.usuarios(id) on delete set null,
  email text not null,
  nome text,
  status text not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint white_label_administradores_status_check
    check (status in ('ativo', 'inativo'))
);

create unique index if not exists white_label_administradores_email_uidx
  on public.white_label_administradores (white_label_id, lower(email));

create unique index if not exists white_label_administradores_usuario_uidx
  on public.white_label_administradores (usuario_id)
  where usuario_id is not null;

create index if not exists white_label_administradores_white_label_idx
  on public.white_label_administradores (white_label_id, status);

alter table public.white_labels enable row level security;
alter table public.white_label_administradores enable row level security;

revoke all on table public.white_labels from anon, authenticated;
revoke all on table public.white_label_administradores from anon, authenticated;

grant select, insert, update, delete on table public.white_labels to service_role;
grant select, insert, update, delete on table public.white_label_administradores to service_role;
