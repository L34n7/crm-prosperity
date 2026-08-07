create extension if not exists pgcrypto;

create table if not exists public.estoque_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  codigo text,
  nome text not null,
  descricao text,
  tipo text not null default 'produto'
    check (tipo in ('produto', 'material', 'insumo')),
  unidade text not null default 'un'
    check (unidade in ('un', 'kg', 'g', 'l', 'ml', 'm', 'cm', 'cx', 'pct')),
  saldo numeric(14, 3) not null default 0 check (saldo >= 0),
  estoque_minimo numeric(14, 3) not null default 0 check (estoque_minimo >= 0),
  custo_unitario numeric(14, 2) not null default 0 check (custo_unitario >= 0),
  preco_venda numeric(14, 2) check (preco_venda is null or preco_venda >= 0),
  ativo boolean not null default true,
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists estoque_itens_empresa_codigo_uk
  on public.estoque_itens (empresa_id, lower(codigo))
  where codigo is not null and btrim(codigo) <> '' and ativo;

create index if not exists estoque_itens_empresa_ativo_idx
  on public.estoque_itens (empresa_id, ativo, nome);

create table if not exists public.catalogo_servicos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  codigo text,
  nome text not null,
  descricao text,
  tipo text not null default 'servico'
    check (tipo in ('produto', 'servico', 'procedimento', 'imovel')),
  preco numeric(14, 2) not null default 0 check (preco >= 0),
  estoque_item_id uuid references public.estoque_itens(id) on delete restrict,
  imovel_id uuid references public.imoveis(id) on delete set null,
  ativo boolean not null default true,
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalogo_produto_estoque_ck check (
    tipo <> 'produto' or estoque_item_id is not null
  )
);

create unique index if not exists catalogo_servicos_empresa_codigo_uk
  on public.catalogo_servicos (empresa_id, lower(codigo))
  where codigo is not null and btrim(codigo) <> '' and ativo;

create index if not exists catalogo_servicos_empresa_ativo_idx
  on public.catalogo_servicos (empresa_id, ativo, tipo, nome);

create table if not exists public.catalogo_servico_insumos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  catalogo_servico_id uuid not null references public.catalogo_servicos(id) on delete cascade,
  estoque_item_id uuid not null references public.estoque_itens(id) on delete restrict,
  quantidade numeric(14, 3) not null check (quantidade > 0),
  created_at timestamptz not null default now(),
  unique (catalogo_servico_id, estoque_item_id)
);

create index if not exists catalogo_servico_insumos_empresa_idx
  on public.catalogo_servico_insumos (empresa_id, catalogo_servico_id);

create table if not exists public.estoque_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  estoque_item_id uuid not null references public.estoque_itens(id) on delete restrict,
  tipo text not null
    check (tipo in ('entrada', 'saida', 'ajuste', 'venda', 'execucao')),
  quantidade numeric(14, 3) not null check (quantidade >= 0),
  saldo_anterior numeric(14, 3) not null check (saldo_anterior >= 0),
  saldo_posterior numeric(14, 3) not null check (saldo_posterior >= 0),
  catalogo_servico_id uuid references public.catalogo_servicos(id) on delete set null,
  origem_id text,
  observacao text,
  created_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists estoque_movimentacoes_empresa_data_idx
  on public.estoque_movimentacoes (empresa_id, created_at desc);

create index if not exists estoque_movimentacoes_item_data_idx
  on public.estoque_movimentacoes (estoque_item_id, created_at desc);

drop trigger if exists estoque_itens_atualizar_updated_at on public.estoque_itens;
create trigger estoque_itens_atualizar_updated_at
before update on public.estoque_itens
for each row execute function public.cadastros_atualizar_updated_at();

drop trigger if exists catalogo_servicos_atualizar_updated_at on public.catalogo_servicos;
create trigger catalogo_servicos_atualizar_updated_at
before update on public.catalogo_servicos
for each row execute function public.cadastros_atualizar_updated_at();

create or replace function public.estoque_movimentar(
  p_empresa_id uuid,
  p_estoque_item_id uuid,
  p_tipo text,
  p_quantidade numeric,
  p_usuario_id uuid default null,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.estoque_itens%rowtype;
  v_saldo_posterior numeric(14, 3);
begin
  if p_tipo not in ('entrada', 'saida', 'ajuste') then
    raise exception 'Tipo de movimentacao invalido.';
  end if;

  if p_quantidade is null or p_quantidade < 0 then
    raise exception 'Informe uma quantidade valida.';
  end if;

  select * into v_item
  from public.estoque_itens
  where id = p_estoque_item_id
    and empresa_id = p_empresa_id
    and ativo
  for update;

  if not found then
    raise exception 'Item de estoque nao encontrado.';
  end if;

  v_saldo_posterior := case
    when p_tipo = 'entrada' then v_item.saldo + p_quantidade
    when p_tipo = 'saida' then v_item.saldo - p_quantidade
    else p_quantidade
  end;

  if v_saldo_posterior < 0 then
    raise exception 'Saldo insuficiente para %: disponivel %, solicitado %.',
      v_item.nome, v_item.saldo, p_quantidade;
  end if;

  update public.estoque_itens
  set saldo = v_saldo_posterior,
      updated_by = p_usuario_id
  where id = v_item.id;

  insert into public.estoque_movimentacoes (
    empresa_id, estoque_item_id, tipo, quantidade, saldo_anterior,
    saldo_posterior, observacao, created_by
  ) values (
    p_empresa_id, v_item.id, p_tipo,
    case when p_tipo = 'ajuste' then abs(v_saldo_posterior - v_item.saldo) else p_quantidade end,
    v_item.saldo, v_saldo_posterior, nullif(btrim(p_observacao), ''), p_usuario_id
  );

  return jsonb_build_object(
    'item_id', v_item.id,
    'saldo_anterior', v_item.saldo,
    'saldo_posterior', v_saldo_posterior
  );
end;
$$;

create or replace function public.estoque_registrar_baixa_catalogo(
  p_empresa_id uuid,
  p_catalogo_servico_id uuid,
  p_quantidade numeric default 1,
  p_usuario_id uuid default null,
  p_origem_id text default null,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_catalogo public.catalogo_servicos%rowtype;
  v_componente record;
  v_item public.estoque_itens%rowtype;
  v_total_itens integer := 0;
  v_tipo_movimento text;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Informe uma quantidade maior que zero.';
  end if;

  select * into v_catalogo
  from public.catalogo_servicos
  where id = p_catalogo_servico_id
    and empresa_id = p_empresa_id
    and ativo;

  if not found then
    raise exception 'Item do catalogo nao encontrado.';
  end if;

  v_tipo_movimento := case
    when v_catalogo.tipo = 'produto' then 'venda'
    else 'execucao'
  end;

  for v_componente in
    select componentes.estoque_item_id, sum(componentes.quantidade)::numeric(14, 3) as quantidade
    from (
      select v_catalogo.estoque_item_id as estoque_item_id, p_quantidade as quantidade
      where v_catalogo.tipo = 'produto' and v_catalogo.estoque_item_id is not null
      union all
      select composicao.estoque_item_id, composicao.quantidade * p_quantidade
      from public.catalogo_servico_insumos composicao
      where composicao.empresa_id = p_empresa_id
        and composicao.catalogo_servico_id = v_catalogo.id
    ) componentes
    group by componentes.estoque_item_id
    order by componentes.estoque_item_id
  loop
    select * into v_item
    from public.estoque_itens
    where id = v_componente.estoque_item_id
      and empresa_id = p_empresa_id
      and ativo
    for update;

    if not found then
      raise exception 'Um insumo vinculado nao esta mais disponivel.';
    end if;

    if v_item.saldo < v_componente.quantidade then
      raise exception 'Saldo insuficiente para %: disponivel %, necessario %.',
        v_item.nome, v_item.saldo, v_componente.quantidade;
    end if;

    update public.estoque_itens
    set saldo = saldo - v_componente.quantidade,
        updated_by = p_usuario_id
    where id = v_item.id;

    insert into public.estoque_movimentacoes (
      empresa_id, estoque_item_id, tipo, quantidade, saldo_anterior,
      saldo_posterior, catalogo_servico_id, origem_id, observacao, created_by
    ) values (
      p_empresa_id, v_item.id, v_tipo_movimento, v_componente.quantidade,
      v_item.saldo, v_item.saldo - v_componente.quantidade, v_catalogo.id,
      nullif(btrim(p_origem_id), ''), nullif(btrim(p_observacao), ''), p_usuario_id
    );

    v_total_itens := v_total_itens + 1;
  end loop;

  if v_total_itens = 0 then
    raise exception 'Cadastre os insumos consumidos antes de registrar a baixa.';
  end if;

  return jsonb_build_object(
    'catalogo_item_id', v_catalogo.id,
    'quantidade', p_quantidade,
    'itens_movimentados', v_total_itens
  );
end;
$$;

revoke all on function public.estoque_movimentar(uuid, uuid, text, numeric, uuid, text) from public, authenticated;
revoke all on function public.estoque_registrar_baixa_catalogo(uuid, uuid, numeric, uuid, text, text) from public, authenticated;
grant execute on function public.estoque_movimentar(uuid, uuid, text, numeric, uuid, text) to service_role;
grant execute on function public.estoque_registrar_baixa_catalogo(uuid, uuid, numeric, uuid, text, text) to service_role;

alter table public.estoque_itens enable row level security;
alter table public.catalogo_servicos enable row level security;
alter table public.catalogo_servico_insumos enable row level security;
alter table public.estoque_movimentacoes enable row level security;

drop policy if exists estoque_itens_empresa_select on public.estoque_itens;
create policy estoque_itens_empresa_select on public.estoque_itens
for select to authenticated
using (empresa_id = public.usuario_empresa_id_atual());

drop policy if exists catalogo_servicos_empresa_select on public.catalogo_servicos;
create policy catalogo_servicos_empresa_select on public.catalogo_servicos
for select to authenticated
using (empresa_id = public.usuario_empresa_id_atual());

drop policy if exists catalogo_servico_insumos_empresa_select on public.catalogo_servico_insumos;
create policy catalogo_servico_insumos_empresa_select on public.catalogo_servico_insumos
for select to authenticated
using (empresa_id = public.usuario_empresa_id_atual());

drop policy if exists estoque_movimentacoes_empresa_select on public.estoque_movimentacoes;
create policy estoque_movimentacoes_empresa_select on public.estoque_movimentacoes
for select to authenticated
using (empresa_id = public.usuario_empresa_id_atual());

insert into public.permissoes (codigo, descricao)
values
  ('estoque.visualizar', 'Visualizar estoque e catalogo'),
  ('estoque.gerenciar', 'Cadastrar itens, servicos e composicoes'),
  ('estoque.movimentar', 'Registrar entradas, saidas, vendas e execucoes')
on conflict (codigo) do update set descricao = excluded.descricao;

insert into public.perfil_permissoes (perfil_empresa_id, permissao_codigo)
select perfil.id, permissao.codigo
from public.perfis_empresa perfil
cross join (
  values ('estoque.visualizar'), ('estoque.gerenciar'), ('estoque.movimentar')
) as permissao(codigo)
where lower(perfil.nome) = 'administrador'
on conflict do nothing;
