-- Substitui o mapa podal por um Podograma visual com coordenadas anatômicas,
-- histórico por atendimento e fotos clínicas privadas.

create table if not exists public.podograma_marcacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  paciente_id uuid not null,
  pessoa_id uuid not null,
  atendimento_id uuid references public.prontuario_atendimentos(id) on delete set null,
  lado text not null check (lado in ('esquerdo', 'direito')),
  vista text not null check (vista in ('plantar', 'dorsal', 'lateral')),
  coordenada_x numeric(6,3) not null check (coordenada_x >= 0 and coordenada_x <= 100),
  coordenada_y numeric(6,3) not null check (coordenada_y >= 0 and coordenada_y <= 100),
  coordenada_z numeric(6,3) check (coordenada_z is null or (coordenada_z >= 0 and coordenada_z <= 100)),
  regiao_anatomica text not null,
  tipo_ocorrencia text not null check (
    tipo_ocorrencia in (
      'onicocriptose',
      'onicomicose',
      'onicolise',
      'alteracao_unha',
      'calosidade',
      'hiperqueratose',
      'fissura',
      'verruga',
      'lesao',
      'inflamacao',
      'infeccao',
      'edema',
      'dor',
      'deformidade',
      'outra'
    )
  ),
  severidade text not null default 'moderada' check (severidade in ('leve', 'moderada', 'importante')),
  status text not null default 'ativa' check (status in ('ativa', 'em_tratamento', 'observacao', 'resolvida')),
  procedimento text,
  observacoes text,
  modelo_versao text not null default 'podograma-2d-v1',
  resolvido_em timestamptz,
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint podograma_marcacoes_paciente_empresa_fk
    foreign key (empresa_id, paciente_id)
    references public.pacientes (empresa_id, id)
    on delete cascade,
  constraint podograma_marcacoes_pessoa_empresa_fk
    foreign key (empresa_id, pessoa_id)
    references public.pessoas (empresa_id, id)
    on delete cascade
);

create index if not exists podograma_marcacoes_empresa_paciente_idx
  on public.podograma_marcacoes (empresa_id, paciente_id, created_at desc);
create index if not exists podograma_marcacoes_atendimento_idx
  on public.podograma_marcacoes (atendimento_id)
  where atendimento_id is not null;
create index if not exists podograma_marcacoes_status_idx
  on public.podograma_marcacoes (empresa_id, paciente_id, status);
create index if not exists podograma_marcacoes_created_by_idx
  on public.podograma_marcacoes (created_by)
  where created_by is not null;
create index if not exists podograma_marcacoes_updated_by_idx
  on public.podograma_marcacoes (updated_by)
  where updated_by is not null;

drop trigger if exists podograma_marcacoes_atualizar_updated_at on public.podograma_marcacoes;
create trigger podograma_marcacoes_atualizar_updated_at
before update on public.podograma_marcacoes
for each row execute function public.cadastros_atualizar_updated_at();

alter table public.podograma_marcacoes enable row level security;

drop policy if exists podograma_marcacoes_empresa_select on public.podograma_marcacoes;
create policy podograma_marcacoes_empresa_select
  on public.podograma_marcacoes
  for select
  to authenticated
  using (empresa_id = public.usuario_empresa_id_atual());

create table if not exists public.podograma_fotos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  paciente_id uuid not null,
  marcacao_id uuid not null references public.podograma_marcacoes(id) on delete cascade,
  storage_path text not null unique,
  nome_original text not null,
  mime_type text not null,
  tamanho_bytes bigint not null check (tamanho_bytes > 0 and tamanho_bytes <= 10485760),
  momento text not null default 'registro' check (momento in ('registro', 'antes', 'durante', 'depois')),
  legenda text,
  created_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint podograma_fotos_paciente_empresa_fk
    foreign key (empresa_id, paciente_id)
    references public.pacientes (empresa_id, id)
    on delete cascade
);

create index if not exists podograma_fotos_marcacao_idx
  on public.podograma_fotos (marcacao_id, created_at desc);
create index if not exists podograma_fotos_empresa_paciente_idx
  on public.podograma_fotos (empresa_id, paciente_id, created_at desc);
create index if not exists podograma_fotos_created_by_idx
  on public.podograma_fotos (created_by)
  where created_by is not null;

alter table public.podograma_fotos enable row level security;

drop policy if exists podograma_fotos_empresa_select on public.podograma_fotos;
create policy podograma_fotos_empresa_select
  on public.podograma_fotos
  for select
  to authenticated
  using (empresa_id = public.usuario_empresa_id_atual());

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'podograma-fotos',
  'podograma-fotos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- A tabela anterior não possui registros em produção e deixa de fazer parte do domínio.
drop table if exists public.mapa_podal_regioes;
