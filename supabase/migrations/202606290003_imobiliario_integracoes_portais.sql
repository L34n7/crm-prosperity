-- MVP de integracoes imobiliarias: publicacao multiportal, leads de portal
-- e imoveis externos recebidos por fontes autorizadas.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.imoveis'::regclass
      and conname = 'imoveis_empresa_id_id_key'
  ) then
    alter table public.imoveis
      add constraint imoveis_empresa_id_id_key unique (empresa_id, id);
  end if;
end;
$$;

create table if not exists public.imovel_publicacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  imovel_id uuid not null,
  canal_codigo text not null,
  canal_nome text not null,
  modo_integracao text not null default 'manual'
    check (modo_integracao in ('manual', 'xml', 'api')),
  status text not null default 'rascunho'
    check (
      status in (
        'rascunho',
        'pendente',
        'enviado',
        'em_analise',
        'publicado',
        'rejeitado',
        'despublicado'
      )
    ),
  payload jsonb not null default '{}'::jsonb,
  ultima_validacao jsonb not null default '{}'::jsonb,
  external_id text,
  external_url text,
  erro text,
  ultimo_envio_em timestamptz,
  publicado_em timestamptz,
  despublicado_em timestamptz,
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, imovel_id, canal_codigo),
  constraint imovel_publicacoes_payload_object_check
    check (jsonb_typeof(payload) = 'object'),
  constraint imovel_publicacoes_validacao_object_check
    check (jsonb_typeof(ultima_validacao) = 'object'),
  constraint imovel_publicacoes_imovel_empresa_fk
    foreign key (empresa_id, imovel_id)
    references public.imoveis (empresa_id, id)
    on delete cascade
);

create index if not exists imovel_publicacoes_empresa_status_idx
  on public.imovel_publicacoes (empresa_id, status, updated_at desc);

create index if not exists imovel_publicacoes_empresa_imovel_idx
  on public.imovel_publicacoes (empresa_id, imovel_id, canal_codigo);

create table if not exists public.imovel_leads_portal (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  imovel_id uuid,
  publicacao_id uuid references public.imovel_publicacoes(id) on delete set null,
  canal_codigo text not null,
  canal_nome text not null,
  nome text not null,
  email text,
  telefone text,
  mensagem text,
  status text not null default 'novo'
    check (
      status in (
        'novo',
        'em_atendimento',
        'convertido',
        'perdido',
        'arquivado'
      )
    ),
  origem_payload jsonb not null default '{}'::jsonb,
  recebido_em timestamptz not null default now(),
  created_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint imovel_leads_portal_payload_object_check
    check (jsonb_typeof(origem_payload) = 'object'),
  constraint imovel_leads_portal_imovel_empresa_fk
    foreign key (empresa_id, imovel_id)
    references public.imoveis (empresa_id, id)
    on delete cascade
);

create index if not exists imovel_leads_portal_empresa_recebido_idx
  on public.imovel_leads_portal (empresa_id, recebido_em desc);

create index if not exists imovel_leads_portal_empresa_imovel_idx
  on public.imovel_leads_portal (empresa_id, imovel_id, recebido_em desc);

create table if not exists public.imoveis_externos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  canal_codigo text not null,
  canal_nome text not null,
  external_id text,
  external_url text,
  titulo text not null,
  tipo text,
  finalidade text,
  valor numeric(14, 2),
  bairro text,
  cidade text,
  estado text,
  quartos integer,
  banheiros integer,
  vagas integer,
  area_m2 numeric(10, 2),
  descricao text,
  status text not null default 'novo'
    check (status in ('novo', 'favorito', 'descartado', 'importado', 'arquivado')),
  payload jsonb not null default '{}'::jsonb,
  recebido_em timestamptz not null default now(),
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint imoveis_externos_payload_object_check
    check (jsonb_typeof(payload) = 'object')
);

create unique index if not exists imoveis_externos_empresa_canal_external_id_idx
  on public.imoveis_externos (empresa_id, canal_codigo, external_id)
  where external_id is not null and trim(external_id) <> '';

create index if not exists imoveis_externos_empresa_recebido_idx
  on public.imoveis_externos (empresa_id, recebido_em desc);

create index if not exists imoveis_externos_empresa_busca_idx
  on public.imoveis_externos (empresa_id, status, cidade, bairro);

drop trigger if exists imovel_publicacoes_atualizar_updated_at
  on public.imovel_publicacoes;
create trigger imovel_publicacoes_atualizar_updated_at
before update on public.imovel_publicacoes
for each row execute function public.cadastros_atualizar_updated_at();

drop trigger if exists imovel_leads_portal_atualizar_updated_at
  on public.imovel_leads_portal;
create trigger imovel_leads_portal_atualizar_updated_at
before update on public.imovel_leads_portal
for each row execute function public.cadastros_atualizar_updated_at();

drop trigger if exists imoveis_externos_atualizar_updated_at
  on public.imoveis_externos;
create trigger imoveis_externos_atualizar_updated_at
before update on public.imoveis_externos
for each row execute function public.cadastros_atualizar_updated_at();

alter table public.imovel_publicacoes enable row level security;
alter table public.imovel_leads_portal enable row level security;
alter table public.imoveis_externos enable row level security;

drop policy if exists imovel_publicacoes_empresa_select
  on public.imovel_publicacoes;
create policy imovel_publicacoes_empresa_select
  on public.imovel_publicacoes
  for select
  to authenticated
  using (empresa_id = public.usuario_empresa_id_atual());

drop policy if exists imovel_leads_portal_empresa_select
  on public.imovel_leads_portal;
create policy imovel_leads_portal_empresa_select
  on public.imovel_leads_portal
  for select
  to authenticated
  using (empresa_id = public.usuario_empresa_id_atual());

drop policy if exists imoveis_externos_empresa_select
  on public.imoveis_externos;
create policy imoveis_externos_empresa_select
  on public.imoveis_externos
  for select
  to authenticated
  using (empresa_id = public.usuario_empresa_id_atual());

insert into public.permissoes (codigo, descricao)
values
  ('imoveis.publicar', 'Publicar e despublicar imoveis em portais'),
  ('imoveis.leads_gerenciar', 'Gerenciar leads recebidos de portais imobiliarios'),
  ('imoveis.importar', 'Importar imoveis externos autorizados')
on conflict (codigo) do update
set descricao = excluded.descricao;

insert into public.perfil_permissoes (perfil_empresa_id, permissao_codigo)
select perfil.id, permissao.codigo
from public.perfis_empresa perfil
cross join (
  values
    ('imoveis.publicar'),
    ('imoveis.leads_gerenciar'),
    ('imoveis.importar')
) as permissao(codigo)
where lower(perfil.nome) = 'administrador'
on conflict do nothing;
