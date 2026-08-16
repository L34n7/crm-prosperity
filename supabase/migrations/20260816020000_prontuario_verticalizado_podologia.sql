-- Verticaliza o modulo clinico: prontuario como entrada principal de saude e
-- recursos especializados (odontograma/mapa podal) embutidos no prontuario.
-- Paciente permanece como entidade de dominio ligada a pessoa/prontuario,
-- mas deixa de existir como modulo independente do CRM.

insert into public.nichos (
  id,
  codigo,
  nome,
  grupo,
  rotulo_cadastro_singular,
  rotulo_cadastro_plural,
  ordem
)
values (
  '10000000-0000-4000-8000-000000000005',
  'podologia',
  'Podologia',
  'saude',
  'Paciente',
  'Pacientes',
  35
)
on conflict (codigo) do update
set
  nome = excluded.nome,
  grupo = excluded.grupo,
  rotulo_cadastro_singular = excluded.rotulo_cadastro_singular,
  rotulo_cadastro_plural = excluded.rotulo_cadastro_plural,
  ativo = true,
  ordem = excluded.ordem,
  updated_at = now();

-- Remove o conceito legado de "Pacientes" como modulo. As tabelas pessoas e
-- pacientes continuam intactas e sao usadas internamente pelos prontuarios.
delete from public.empresa_modulos
where modulo_codigo = 'saude.pacientes';

delete from public.nicho_modulos
where modulo_codigo = 'saude.pacientes';

delete from public.modulos
where codigo = 'saude.pacientes';

insert into public.nicho_modulos (nicho_id, modulo_codigo, obrigatorio)
values
  ('10000000-0000-4000-8000-000000000005', 'cadastros.pessoas', true),
  ('10000000-0000-4000-8000-000000000005', 'saude.prontuarios', true)
on conflict (nicho_id, modulo_codigo) do update
set obrigatorio = excluded.obrigatorio;

insert into public.empresa_modulos (empresa_id, modulo_codigo, habilitado)
select empresa.id, nicho_modulo.modulo_codigo, true
from public.empresas empresa
join public.nicho_modulos nicho_modulo
  on nicho_modulo.nicho_id = empresa.nicho_id
where empresa.nicho_id = '10000000-0000-4000-8000-000000000005'
on conflict (empresa_id, modulo_codigo) do update
set
  habilitado = true,
  updated_at = now();

create table if not exists public.mapa_podal_regioes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  paciente_id uuid not null,
  pessoa_id uuid not null,
  lado text not null check (lado in ('esquerdo', 'direito')),
  regiao text not null check (
    regiao in ('halux', 'outros_dedos', 'antepe', 'mediape', 'calcanhar')
  ),
  status text not null default 'sem_alteracao' check (
    status in (
      'sem_alteracao',
      'atencao',
      'calosidade',
      'fissura',
      'lesao',
      'inflamacao',
      'infeccao',
      'tratamento'
    )
  ),
  procedimento text,
  observacoes text,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, paciente_id, lado, regiao),
  constraint mapa_podal_regioes_paciente_empresa_fk
    foreign key (empresa_id, paciente_id)
    references public.pacientes (empresa_id, id)
    on delete restrict,
  constraint mapa_podal_regioes_pessoa_empresa_fk
    foreign key (empresa_id, pessoa_id)
    references public.pessoas (empresa_id, id)
    on delete restrict
);

create index if not exists mapa_podal_regioes_empresa_paciente_idx
  on public.mapa_podal_regioes (empresa_id, paciente_id, lado, regiao);

drop trigger if exists mapa_podal_regioes_atualizar_updated_at
  on public.mapa_podal_regioes;
create trigger mapa_podal_regioes_atualizar_updated_at
before update on public.mapa_podal_regioes
for each row execute function public.cadastros_atualizar_updated_at();

alter table public.mapa_podal_regioes enable row level security;

drop policy if exists mapa_podal_regioes_empresa_select
  on public.mapa_podal_regioes;
create policy mapa_podal_regioes_empresa_select
  on public.mapa_podal_regioes
  for select
  to authenticated
  using (empresa_id = public.usuario_empresa_id_atual());
