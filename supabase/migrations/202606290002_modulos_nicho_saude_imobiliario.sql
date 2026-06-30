-- Modulos por nicho: prontuarios, odontograma e imoveis.
-- Esta camada fica separada do cadastro central de pessoas/pacientes.

insert into public.modulos (codigo, nome)
values
  ('saude.prontuarios', 'Prontuarios'),
  ('saude.odontograma', 'Odontograma'),
  ('imobiliario.imoveis', 'Imoveis')
on conflict (codigo) do update
set nome = excluded.nome;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.pacientes'::regclass
      and conname = 'pacientes_empresa_id_id_key'
  ) then
    alter table public.pacientes
      add constraint pacientes_empresa_id_id_key unique (empresa_id, id);
  end if;
end;
$$;

create table if not exists public.prontuarios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  paciente_id uuid not null,
  pessoa_id uuid not null,
  status text not null default 'ativo'
    check (status in ('ativo', 'inativo', 'arquivado')),
  observacoes_gerais text,
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, id),
  unique (empresa_id, paciente_id),
  constraint prontuarios_paciente_empresa_fk
    foreign key (empresa_id, paciente_id)
    references public.pacientes (empresa_id, id)
    on delete restrict,
  constraint prontuarios_pessoa_empresa_fk
    foreign key (empresa_id, pessoa_id)
    references public.pessoas (empresa_id, id)
    on delete restrict
);

create index if not exists prontuarios_empresa_created_idx
  on public.prontuarios (empresa_id, created_at desc);

create index if not exists prontuarios_empresa_pessoa_idx
  on public.prontuarios (empresa_id, pessoa_id);

create table if not exists public.prontuario_atendimentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  prontuario_id uuid not null,
  paciente_id uuid not null,
  pessoa_id uuid not null,
  data_atendimento timestamptz not null default now(),
  tipo text not null default 'consulta',
  queixa_principal text,
  anamnese text,
  diagnostico text,
  conduta text,
  prescricao text,
  observacoes text,
  anexos jsonb not null default '[]'::jsonb,
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prontuario_atendimentos_anexos_array_check
    check (jsonb_typeof(anexos) = 'array'),
  constraint prontuario_atendimentos_prontuario_empresa_fk
    foreign key (empresa_id, prontuario_id)
    references public.prontuarios (empresa_id, id)
    on delete restrict,
  constraint prontuario_atendimentos_paciente_empresa_fk
    foreign key (empresa_id, paciente_id)
    references public.pacientes (empresa_id, id)
    on delete restrict,
  constraint prontuario_atendimentos_pessoa_empresa_fk
    foreign key (empresa_id, pessoa_id)
    references public.pessoas (empresa_id, id)
    on delete restrict
);

create index if not exists prontuario_atendimentos_empresa_data_idx
  on public.prontuario_atendimentos (empresa_id, data_atendimento desc);

create index if not exists prontuario_atendimentos_paciente_data_idx
  on public.prontuario_atendimentos (empresa_id, paciente_id, data_atendimento desc);

create table if not exists public.odontograma_dentes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  paciente_id uuid not null,
  pessoa_id uuid not null,
  dente text not null,
  status text not null default 'saudavel'
    check (
      status in (
        'saudavel',
        'atencao',
        'carie',
        'restauracao',
        'canal',
        'extraido',
        'implante',
        'planejado',
        'realizado'
      )
    ),
  procedimento text,
  observacoes text,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, paciente_id, dente),
  constraint odontograma_dentes_codigo_check
    check (dente ~ '^[0-9]{2}$'),
  constraint odontograma_dentes_paciente_empresa_fk
    foreign key (empresa_id, paciente_id)
    references public.pacientes (empresa_id, id)
    on delete restrict,
  constraint odontograma_dentes_pessoa_empresa_fk
    foreign key (empresa_id, pessoa_id)
    references public.pessoas (empresa_id, id)
    on delete restrict
);

create index if not exists odontograma_dentes_empresa_paciente_idx
  on public.odontograma_dentes (empresa_id, paciente_id, dente);

create table if not exists public.imoveis (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  proprietario_pessoa_id uuid,
  titulo text not null,
  codigo text,
  tipo text not null default 'apartamento',
  finalidade text not null default 'venda'
    check (finalidade in ('venda', 'locacao', 'venda_locacao')),
  status text not null default 'disponivel'
    check (
      status in (
        'disponivel',
        'reservado',
        'vendido',
        'alugado',
        'inativo',
        'arquivado'
      )
    ),
  valor numeric(14, 2),
  valor_condominio numeric(14, 2),
  valor_iptu numeric(14, 2),
  cep text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  estado text,
  quartos integer,
  suites integer,
  banheiros integer,
  vagas integer,
  area_m2 numeric(10, 2),
  descricao text,
  caracteristicas jsonb not null default '{}'::jsonb,
  fotos jsonb not null default '[]'::jsonb,
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint imoveis_caracteristicas_object_check
    check (jsonb_typeof(caracteristicas) = 'object'),
  constraint imoveis_fotos_array_check
    check (jsonb_typeof(fotos) = 'array'),
  constraint imoveis_proprietario_empresa_fk
    foreign key (empresa_id, proprietario_pessoa_id)
    references public.pessoas (empresa_id, id)
    on delete restrict
);

create index if not exists imoveis_empresa_created_idx
  on public.imoveis (empresa_id, created_at desc);

create index if not exists imoveis_empresa_status_idx
  on public.imoveis (empresa_id, status, created_at desc);

create index if not exists imoveis_empresa_proprietario_idx
  on public.imoveis (empresa_id, proprietario_pessoa_id);

create table if not exists public.imovel_pessoas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  imovel_id uuid not null references public.imoveis(id) on delete cascade,
  pessoa_id uuid not null,
  papel text not null
    check (papel in ('proprietario', 'interessado', 'comprador', 'locatario')),
  status text not null default 'ativo'
    check (status in ('ativo', 'inativo', 'arquivado')),
  observacoes text,
  created_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, imovel_id, pessoa_id, papel),
  constraint imovel_pessoas_pessoa_empresa_fk
    foreign key (empresa_id, pessoa_id)
    references public.pessoas (empresa_id, id)
    on delete restrict
);

create index if not exists imovel_pessoas_empresa_imovel_idx
  on public.imovel_pessoas (empresa_id, imovel_id, papel);

create index if not exists imovel_pessoas_empresa_pessoa_idx
  on public.imovel_pessoas (empresa_id, pessoa_id, papel);

drop trigger if exists prontuarios_atualizar_updated_at on public.prontuarios;
create trigger prontuarios_atualizar_updated_at
before update on public.prontuarios
for each row execute function public.cadastros_atualizar_updated_at();

drop trigger if exists prontuario_atendimentos_atualizar_updated_at
  on public.prontuario_atendimentos;
create trigger prontuario_atendimentos_atualizar_updated_at
before update on public.prontuario_atendimentos
for each row execute function public.cadastros_atualizar_updated_at();

drop trigger if exists odontograma_dentes_atualizar_updated_at
  on public.odontograma_dentes;
create trigger odontograma_dentes_atualizar_updated_at
before update on public.odontograma_dentes
for each row execute function public.cadastros_atualizar_updated_at();

drop trigger if exists imoveis_atualizar_updated_at on public.imoveis;
create trigger imoveis_atualizar_updated_at
before update on public.imoveis
for each row execute function public.cadastros_atualizar_updated_at();

drop trigger if exists imovel_pessoas_atualizar_updated_at
  on public.imovel_pessoas;
create trigger imovel_pessoas_atualizar_updated_at
before update on public.imovel_pessoas
for each row execute function public.cadastros_atualizar_updated_at();

alter table public.prontuarios enable row level security;
alter table public.prontuario_atendimentos enable row level security;
alter table public.odontograma_dentes enable row level security;
alter table public.imoveis enable row level security;
alter table public.imovel_pessoas enable row level security;

drop policy if exists prontuarios_empresa_select on public.prontuarios;
create policy prontuarios_empresa_select
  on public.prontuarios
  for select
  to authenticated
  using (empresa_id = public.usuario_empresa_id_atual());

drop policy if exists prontuario_atendimentos_empresa_select
  on public.prontuario_atendimentos;
create policy prontuario_atendimentos_empresa_select
  on public.prontuario_atendimentos
  for select
  to authenticated
  using (empresa_id = public.usuario_empresa_id_atual());

drop policy if exists odontograma_dentes_empresa_select
  on public.odontograma_dentes;
create policy odontograma_dentes_empresa_select
  on public.odontograma_dentes
  for select
  to authenticated
  using (empresa_id = public.usuario_empresa_id_atual());

drop policy if exists imoveis_empresa_select on public.imoveis;
create policy imoveis_empresa_select
  on public.imoveis
  for select
  to authenticated
  using (empresa_id = public.usuario_empresa_id_atual());

drop policy if exists imovel_pessoas_empresa_select on public.imovel_pessoas;
create policy imovel_pessoas_empresa_select
  on public.imovel_pessoas
  for select
  to authenticated
  using (empresa_id = public.usuario_empresa_id_atual());

insert into public.permissoes (codigo, descricao)
values
  ('prontuarios.visualizar', 'Visualizar prontuarios'),
  ('prontuarios.criar', 'Criar evolucoes no prontuario'),
  ('prontuarios.editar', 'Editar prontuarios'),
  ('odontograma.visualizar', 'Visualizar odontograma'),
  ('odontograma.editar', 'Editar odontograma'),
  ('imoveis.visualizar', 'Visualizar imoveis'),
  ('imoveis.criar', 'Cadastrar imoveis'),
  ('imoveis.editar', 'Editar imoveis'),
  ('imoveis.arquivar', 'Arquivar imoveis')
on conflict (codigo) do update
set descricao = excluded.descricao;

insert into public.perfil_permissoes (perfil_empresa_id, permissao_codigo)
select perfil.id, permissao.codigo
from public.perfis_empresa perfil
cross join (
  values
    ('prontuarios.visualizar'),
    ('prontuarios.criar'),
    ('prontuarios.editar'),
    ('odontograma.visualizar'),
    ('odontograma.editar'),
    ('imoveis.visualizar'),
    ('imoveis.criar'),
    ('imoveis.editar'),
    ('imoveis.arquivar')
) as permissao(codigo)
where lower(perfil.nome) = 'administrador'
on conflict do nothing;
