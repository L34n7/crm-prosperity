-- Fundacao multi-nicho: empresa -> nicho, cadastro central de pessoas,
-- extensao de pacientes, campos personalizados e vinculo com contatos.

create table if not exists public.nichos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  grupo text not null check (grupo in ('comercial', 'saude')),
  rotulo_cadastro_singular text not null,
  rotulo_cadastro_plural text not null,
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.nichos (
  id,
  codigo,
  nome,
  grupo,
  rotulo_cadastro_singular,
  rotulo_cadastro_plural,
  ordem
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'comercio',
    'Comercio e servicos',
    'comercial',
    'Cliente',
    'Clientes',
    10
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'imobiliaria',
    'Imobiliaria',
    'comercial',
    'Cliente',
    'Clientes',
    20
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'medicina',
    'Medicina',
    'saude',
    'Paciente',
    'Pacientes',
    30
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    'odontologia',
    'Odontologia',
    'saude',
    'Paciente',
    'Pacientes',
    40
  )
on conflict (codigo) do update
set
  nome = excluded.nome,
  grupo = excluded.grupo,
  rotulo_cadastro_singular = excluded.rotulo_cadastro_singular,
  rotulo_cadastro_plural = excluded.rotulo_cadastro_plural,
  ativo = excluded.ativo,
  ordem = excluded.ordem,
  updated_at = now();

alter table public.empresas
  add column if not exists nicho_id uuid references public.nichos(id);

update public.empresas
set nicho_id = '10000000-0000-4000-8000-000000000001'
where nicho_id is null;

alter table public.empresas
  alter column nicho_id set default '10000000-0000-4000-8000-000000000001',
  alter column nicho_id set not null;

alter table public.leads_cadastro
  add column if not exists nicho_id uuid references public.nichos(id);

update public.leads_cadastro
set nicho_id = '10000000-0000-4000-8000-000000000001'
where nicho_id is null;

alter table public.leads_cadastro
  alter column nicho_id set default '10000000-0000-4000-8000-000000000001';

create index if not exists empresas_nicho_idx
  on public.empresas (nicho_id);

create table if not exists public.modulos (
  codigo text primary key,
  nome text not null,
  created_at timestamptz not null default now()
);

insert into public.modulos (codigo, nome)
values
  ('cadastros.pessoas', 'Cadastros de pessoas'),
  ('saude.pacientes', 'Pacientes'),
  ('saude.prontuarios', 'Prontuarios'),
  ('saude.odontograma', 'Odontograma'),
  ('imobiliario.imoveis', 'Imoveis'),
  ('imobiliario.negociacoes', 'Negociacoes imobiliarias')
on conflict (codigo) do update
set nome = excluded.nome;

create table if not exists public.nicho_modulos (
  nicho_id uuid not null references public.nichos(id) on delete cascade,
  modulo_codigo text not null references public.modulos(codigo) on delete cascade,
  obrigatorio boolean not null default false,
  primary key (nicho_id, modulo_codigo)
);

insert into public.nicho_modulos (nicho_id, modulo_codigo, obrigatorio)
values
  ('10000000-0000-4000-8000-000000000001', 'cadastros.pessoas', true),
  ('10000000-0000-4000-8000-000000000002', 'cadastros.pessoas', true),
  ('10000000-0000-4000-8000-000000000002', 'imobiliario.imoveis', true),
  ('10000000-0000-4000-8000-000000000002', 'imobiliario.negociacoes', true),
  ('10000000-0000-4000-8000-000000000003', 'cadastros.pessoas', true),
  ('10000000-0000-4000-8000-000000000003', 'saude.pacientes', true),
  ('10000000-0000-4000-8000-000000000003', 'saude.prontuarios', true),
  ('10000000-0000-4000-8000-000000000004', 'cadastros.pessoas', true),
  ('10000000-0000-4000-8000-000000000004', 'saude.pacientes', true),
  ('10000000-0000-4000-8000-000000000004', 'saude.prontuarios', true),
  ('10000000-0000-4000-8000-000000000004', 'saude.odontograma', true)
on conflict (nicho_id, modulo_codigo) do update
set obrigatorio = excluded.obrigatorio;

create table if not exists public.empresa_modulos (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  modulo_codigo text not null references public.modulos(codigo) on delete cascade,
  habilitado boolean not null default true,
  configuracao jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (empresa_id, modulo_codigo)
);

insert into public.empresa_modulos (empresa_id, modulo_codigo, habilitado)
select empresa.id, nicho_modulo.modulo_codigo, true
from public.empresas empresa
join public.nicho_modulos nicho_modulo
  on nicho_modulo.nicho_id = empresa.nicho_id
on conflict (empresa_id, modulo_codigo) do nothing;

create or replace function public.sincronizar_modulos_padrao_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.empresa_modulos (empresa_id, modulo_codigo, habilitado)
  select new.id, nicho_modulo.modulo_codigo, true
  from public.nicho_modulos nicho_modulo
  where nicho_modulo.nicho_id = new.nicho_id
  on conflict (empresa_id, modulo_codigo) do update
  set
    habilitado = true,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists empresas_sincronizar_modulos_padrao
  on public.empresas;

create trigger empresas_sincronizar_modulos_padrao
after insert or update of nicho_id on public.empresas
for each row execute function public.sincronizar_modulos_padrao_empresa();

create table if not exists public.pessoas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo_pessoa text not null default 'fisica'
    check (tipo_pessoa in ('fisica', 'juridica')),
  nome text not null,
  nome_social text,
  razao_social text,
  cpf_cnpj text,
  data_nascimento date,
  email text,
  cep text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  estado text,
  observacoes text,
  dados_personalizados jsonb not null default '{}'::jsonb,
  status text not null default 'ativo'
    check (status in ('ativo', 'inativo', 'arquivado')),
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, id)
);

create index if not exists pessoas_empresa_created_idx
  on public.pessoas (empresa_id, created_at desc);

create index if not exists pessoas_empresa_nome_idx
  on public.pessoas (empresa_id, lower(nome));

create unique index if not exists pessoas_empresa_documento_unique_idx
  on public.pessoas (
    empresa_id,
    regexp_replace(cpf_cnpj, '[^0-9A-Za-z]', '', 'g')
  )
  where cpf_cnpj is not null
    and length(trim(cpf_cnpj)) > 0
    and status <> 'arquivado';

create index if not exists pessoas_dados_personalizados_gin_idx
  on public.pessoas using gin (dados_personalizados);

create table if not exists public.pacientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  pessoa_id uuid not null,
  numero_prontuario text,
  convenio text,
  numero_carteirinha text,
  responsavel_nome text,
  dados_personalizados jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, pessoa_id),
  unique (empresa_id, numero_prontuario),
  constraint pacientes_pessoa_empresa_fk
    foreign key (empresa_id, pessoa_id)
    references public.pessoas (empresa_id, id)
    on delete restrict
);

create index if not exists pacientes_empresa_created_idx
  on public.pacientes (empresa_id, created_at desc);

create or replace function public.pacientes_definir_numero_prontuario()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.numero_prontuario is null or trim(new.numero_prontuario) = '' then
    new.numero_prontuario :=
      'PAC-' || upper(substr(replace(new.id::text, '-', ''), 1, 10));
  end if;

  return new;
end;
$$;

drop trigger if exists pacientes_definir_numero_prontuario
  on public.pacientes;

create trigger pacientes_definir_numero_prontuario
before insert on public.pacientes
for each row execute function public.pacientes_definir_numero_prontuario();

create table if not exists public.campos_personalizados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  escopo text not null check (escopo in ('pessoa', 'paciente')),
  chave text not null,
  nome text not null,
  tipo text not null check (
    tipo in ('texto', 'texto_longo', 'numero', 'data', 'booleano', 'select')
  ),
  obrigatorio boolean not null default false,
  opcoes jsonb not null default '[]'::jsonb,
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campos_personalizados_chave_formato_check
    check (chave ~ '^[a-z][a-z0-9_]{1,62}$'),
  constraint campos_personalizados_opcoes_array_check
    check (jsonb_typeof(opcoes) = 'array')
);

create unique index if not exists campos_personalizados_empresa_escopo_chave_idx
  on public.campos_personalizados (empresa_id, escopo, lower(chave));

create index if not exists campos_personalizados_empresa_escopo_ordem_idx
  on public.campos_personalizados (empresa_id, escopo, ativo, ordem, created_at);

alter table public.contatos
  add column if not exists pessoa_id uuid;

create index if not exists contatos_empresa_pessoa_idx
  on public.contatos (empresa_id, pessoa_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.contatos'::regclass
      and conname = 'contatos_pessoa_empresa_fk'
  ) then
    alter table public.contatos
      add constraint contatos_pessoa_empresa_fk
      foreign key (empresa_id, pessoa_id)
      references public.pessoas (empresa_id, id)
      on delete restrict;
  end if;
end;
$$;

create or replace function public.validar_limite_contatos_pessoa()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_total integer;
begin
  if new.pessoa_id is null then
    return new;
  end if;

  select count(*)
  into v_total
  from public.contatos contato
  where contato.empresa_id = new.empresa_id
    and contato.pessoa_id = new.pessoa_id
    and contato.id is distinct from new.id;

  if v_total >= 3 then
    raise exception 'Uma pessoa pode ter no maximo tres contatos vinculados.';
  end if;

  return new;
end;
$$;

drop trigger if exists contatos_validar_limite_pessoa
  on public.contatos;

create trigger contatos_validar_limite_pessoa
before insert or update of pessoa_id on public.contatos
for each row execute function public.validar_limite_contatos_pessoa();

create or replace function public.cadastros_atualizar_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pessoas_atualizar_updated_at on public.pessoas;
create trigger pessoas_atualizar_updated_at
before update on public.pessoas
for each row execute function public.cadastros_atualizar_updated_at();

drop trigger if exists pacientes_atualizar_updated_at on public.pacientes;
create trigger pacientes_atualizar_updated_at
before update on public.pacientes
for each row execute function public.cadastros_atualizar_updated_at();

drop trigger if exists campos_personalizados_atualizar_updated_at
  on public.campos_personalizados;
create trigger campos_personalizados_atualizar_updated_at
before update on public.campos_personalizados
for each row execute function public.cadastros_atualizar_updated_at();

drop trigger if exists empresa_modulos_atualizar_updated_at
  on public.empresa_modulos;
create trigger empresa_modulos_atualizar_updated_at
before update on public.empresa_modulos
for each row execute function public.cadastros_atualizar_updated_at();

-- Operacao atomica usada pelas APIs. Cria/edita pessoa, extensao de paciente
-- e localiza/cria/vincula ate tres contatos pelo telefone normalizado.
create or replace function public.salvar_cadastro_pessoa(
  p_empresa_id uuid,
  p_usuario_id uuid,
  p_pessoa_id uuid,
  p_dados jsonb,
  p_paciente jsonb default null,
  p_contatos jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pessoa_id uuid;
  v_paciente_id uuid;
  v_contato jsonb;
  v_contato_id uuid;
  v_telefone text;
  v_contato_pessoa_id uuid;
  v_contato_ids uuid[] := array[]::uuid[];
begin
  if p_empresa_id is null or p_usuario_id is null then
    raise exception 'Empresa e usuario sao obrigatorios.';
  end if;

  if jsonb_typeof(coalesce(p_contatos, '[]'::jsonb)) <> 'array' then
    raise exception 'Contatos devem ser enviados como lista.';
  end if;

  if jsonb_array_length(coalesce(p_contatos, '[]'::jsonb)) > 3 then
    raise exception 'Uma pessoa pode ter no maximo tres contatos vinculados.';
  end if;

  if nullif(trim(p_dados->>'nome'), '') is null then
    raise exception 'Nome e obrigatorio.';
  end if;

  if p_pessoa_id is null then
    insert into public.pessoas (
      empresa_id,
      tipo_pessoa,
      nome,
      nome_social,
      razao_social,
      cpf_cnpj,
      data_nascimento,
      email,
      cep,
      logradouro,
      numero,
      complemento,
      bairro,
      cidade,
      estado,
      observacoes,
      dados_personalizados,
      status,
      created_by,
      updated_by
    )
    values (
      p_empresa_id,
      coalesce(nullif(p_dados->>'tipo_pessoa', ''), 'fisica'),
      trim(p_dados->>'nome'),
      nullif(trim(p_dados->>'nome_social'), ''),
      nullif(trim(p_dados->>'razao_social'), ''),
      nullif(trim(p_dados->>'cpf_cnpj'), ''),
      nullif(p_dados->>'data_nascimento', '')::date,
      nullif(lower(trim(p_dados->>'email')), ''),
      nullif(trim(p_dados->>'cep'), ''),
      nullif(trim(p_dados->>'logradouro'), ''),
      nullif(trim(p_dados->>'numero'), ''),
      nullif(trim(p_dados->>'complemento'), ''),
      nullif(trim(p_dados->>'bairro'), ''),
      nullif(trim(p_dados->>'cidade'), ''),
      nullif(upper(trim(p_dados->>'estado')), ''),
      nullif(trim(p_dados->>'observacoes'), ''),
      coalesce(p_dados->'dados_personalizados', '{}'::jsonb),
      coalesce(nullif(p_dados->>'status', ''), 'ativo'),
      p_usuario_id,
      p_usuario_id
    )
    returning id into v_pessoa_id;
  else
    update public.pessoas
    set
      tipo_pessoa = coalesce(nullif(p_dados->>'tipo_pessoa', ''), tipo_pessoa),
      nome = trim(p_dados->>'nome'),
      nome_social = nullif(trim(p_dados->>'nome_social'), ''),
      razao_social = nullif(trim(p_dados->>'razao_social'), ''),
      cpf_cnpj = nullif(trim(p_dados->>'cpf_cnpj'), ''),
      data_nascimento = nullif(p_dados->>'data_nascimento', '')::date,
      email = nullif(lower(trim(p_dados->>'email')), ''),
      cep = nullif(trim(p_dados->>'cep'), ''),
      logradouro = nullif(trim(p_dados->>'logradouro'), ''),
      numero = nullif(trim(p_dados->>'numero'), ''),
      complemento = nullif(trim(p_dados->>'complemento'), ''),
      bairro = nullif(trim(p_dados->>'bairro'), ''),
      cidade = nullif(trim(p_dados->>'cidade'), ''),
      estado = nullif(upper(trim(p_dados->>'estado')), ''),
      observacoes = nullif(trim(p_dados->>'observacoes'), ''),
      dados_personalizados =
        coalesce(p_dados->'dados_personalizados', '{}'::jsonb),
      status = coalesce(nullif(p_dados->>'status', ''), status),
      updated_by = p_usuario_id
    where id = p_pessoa_id
      and empresa_id = p_empresa_id
    returning id into v_pessoa_id;

    if v_pessoa_id is null then
      raise exception 'Pessoa nao encontrada nesta empresa.';
    end if;
  end if;

  if p_paciente is not null then
    insert into public.pacientes (
      empresa_id,
      pessoa_id,
      numero_prontuario,
      convenio,
      numero_carteirinha,
      responsavel_nome,
      dados_personalizados
    )
    values (
      p_empresa_id,
      v_pessoa_id,
      nullif(trim(p_paciente->>'numero_prontuario'), ''),
      nullif(trim(p_paciente->>'convenio'), ''),
      nullif(trim(p_paciente->>'numero_carteirinha'), ''),
      nullif(trim(p_paciente->>'responsavel_nome'), ''),
      coalesce(p_paciente->'dados_personalizados', '{}'::jsonb)
    )
    on conflict (empresa_id, pessoa_id) do update
    set
      numero_prontuario =
        case
          when nullif(trim(p_paciente->>'numero_prontuario'), '') is null
            then public.pacientes.numero_prontuario
          else excluded.numero_prontuario
        end,
      convenio = excluded.convenio,
      numero_carteirinha = excluded.numero_carteirinha,
      responsavel_nome = excluded.responsavel_nome,
      dados_personalizados = excluded.dados_personalizados
    returning id into v_paciente_id;
  end if;

  -- O desvinculo ocorre antes para permitir substituir um conjunto completo
  -- de tres numeros sem ultrapassar temporariamente o limite do trigger.
  update public.contatos
  set pessoa_id = null
  where empresa_id = p_empresa_id
    and pessoa_id = v_pessoa_id;

  for v_contato in
    select value
    from jsonb_array_elements(coalesce(p_contatos, '[]'::jsonb))
  loop
    v_telefone := regexp_replace(coalesce(v_contato->>'telefone', ''), '\D', '', 'g');

    if v_telefone = '' then
      continue;
    end if;

    select contato.id, contato.pessoa_id
    into v_contato_id, v_contato_pessoa_id
    from public.contatos contato
    where contato.empresa_id = p_empresa_id
      and contato.telefone = v_telefone
    order by contato.created_at asc
    limit 1
    for update;

    if v_contato_id is null then
      insert into public.contatos (
        empresa_id,
        pessoa_id,
        nome,
        telefone,
        email,
        origem,
        status_lead,
        telefone_revisar
      )
      values (
        p_empresa_id,
        v_pessoa_id,
        trim(p_dados->>'nome'),
        v_telefone,
        nullif(lower(trim(p_dados->>'email')), ''),
        'Cadastro manual',
        'cliente',
        false
      )
      returning id into v_contato_id;
    else
      if v_contato_pessoa_id is not null
        and v_contato_pessoa_id <> v_pessoa_id then
        raise exception 'O telefone % ja esta vinculado a outra pessoa.', v_telefone;
      end if;

      update public.contatos
      set pessoa_id = v_pessoa_id
      where id = v_contato_id
        and empresa_id = p_empresa_id;
    end if;

    if not (v_contato_id = any(v_contato_ids)) then
      v_contato_ids := array_append(v_contato_ids, v_contato_id);
    end if;
  end loop;

  if cardinality(v_contato_ids) > 3 then
    raise exception 'Uma pessoa pode ter no maximo tres contatos vinculados.';
  end if;

  update public.contatos
  set pessoa_id = null
  where empresa_id = p_empresa_id
    and pessoa_id = v_pessoa_id
    and not (id = any(v_contato_ids));

  return jsonb_build_object(
    'pessoa_id', v_pessoa_id,
    'paciente_id', v_paciente_id,
    'contatos_ids', to_jsonb(v_contato_ids)
  );
end;
$$;

revoke all on function public.salvar_cadastro_pessoa(
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  jsonb
) from public;

grant execute on function public.salvar_cadastro_pessoa(
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  jsonb
) to service_role;

alter table public.nichos enable row level security;
alter table public.empresa_modulos enable row level security;
alter table public.pessoas enable row level security;
alter table public.pacientes enable row level security;
alter table public.campos_personalizados enable row level security;

drop policy if exists nichos_authenticated_select on public.nichos;
create policy nichos_authenticated_select
  on public.nichos
  for select
  to authenticated
  using (ativo = true);

drop policy if exists empresa_modulos_empresa_select on public.empresa_modulos;
create policy empresa_modulos_empresa_select
  on public.empresa_modulos
  for select
  to authenticated
  using (empresa_id = public.usuario_empresa_id_atual());

drop policy if exists pessoas_empresa_select on public.pessoas;
create policy pessoas_empresa_select
  on public.pessoas
  for select
  to authenticated
  using (empresa_id = public.usuario_empresa_id_atual());

drop policy if exists pacientes_empresa_select on public.pacientes;
create policy pacientes_empresa_select
  on public.pacientes
  for select
  to authenticated
  using (empresa_id = public.usuario_empresa_id_atual());

drop policy if exists campos_personalizados_empresa_select
  on public.campos_personalizados;
create policy campos_personalizados_empresa_select
  on public.campos_personalizados
  for select
  to authenticated
  using (empresa_id = public.usuario_empresa_id_atual());

insert into public.permissoes (codigo, descricao)
values
  ('pessoas.visualizar', 'Visualizar clientes ou pacientes'),
  ('pessoas.criar', 'Cadastrar clientes ou pacientes'),
  ('pessoas.editar', 'Editar clientes ou pacientes'),
  ('pessoas.arquivar', 'Arquivar clientes ou pacientes'),
  ('pessoas.campos_personalizados', 'Gerenciar campos personalizados dos cadastros')
on conflict (codigo) do update
set descricao = excluded.descricao;

insert into public.perfil_permissoes (perfil_empresa_id, permissao_codigo)
select perfil.id, permissao.codigo
from public.perfis_empresa perfil
cross join (
  values
    ('pessoas.visualizar'),
    ('pessoas.criar'),
    ('pessoas.editar'),
    ('pessoas.arquivar'),
    ('pessoas.campos_personalizados')
) as permissao(codigo)
where lower(perfil.nome) = 'administrador'
on conflict do nothing;
