
-- Configuração independente dos arquivos comerciais por plano.
create table if not exists public.cotacao_veicular_planos_arquivos (
  empresa_id uuid not null,
  plano text not null,
  referencia text not null default '',
  vigencia_ate date,
  arquivo_precos_nome text,
  arquivo_precos_em timestamptz,
  arquivo_especiais_nome text,
  arquivo_especiais_em timestamptz,
  updated_at timestamptz not null default now(),
  primary key(empresa_id,plano),
  foreign key(empresa_id,plano) references public.cotacao_veicular_planos(empresa_id,codigo)
    on delete cascade
);
create table if not exists public.cotacao_veicular_modelos_plano (
  empresa_id uuid not null,
  plano text not null,
  modelo text not null check (length(trim(modelo)) between 2 and 220),
  codigo_fipe text,
  created_at timestamptz not null default now(),
  primary key(empresa_id,plano,modelo),
  foreign key(empresa_id,plano) references public.cotacao_veicular_planos(empresa_id,codigo)
    on delete cascade
);
create index if not exists cotacao_veicular_modelos_plano_fipe_idx
  on public.cotacao_veicular_modelos_plano(empresa_id,plano,codigo_fipe)
  where codigo_fipe is not null;
alter table public.cotacao_veicular_planos_arquivos enable row level security;
alter table public.cotacao_veicular_modelos_plano enable row level security;
revoke all on public.cotacao_veicular_planos_arquivos, public.cotacao_veicular_modelos_plano from anon, authenticated;

-- Preserva importações do formato antigo quando existirem, sem atribuir um arquivo
-- a um plano que não tenha preços próprios.
insert into public.cotacao_veicular_planos_arquivos
 (empresa_id,plano,referencia,vigencia_ate,arquivo_precos_nome,arquivo_precos_em,
  arquivo_especiais_nome,arquivo_especiais_em)
select p.empresa_id,p.codigo,coalesce(c.referencia,''),c.vigencia_ate,
       case when exists(select 1 from public.cotacao_veicular_precos_planos v
             where v.empresa_id=p.empresa_id and v.plano=p.codigo)
            then coalesce(c.arquivo_precos_nome,'Tabela anterior migrada') else null end,
       case when exists(select 1 from public.cotacao_veicular_precos_planos v
             where v.empresa_id=p.empresa_id and v.plano=p.codigo)
            then c.arquivo_precos_em else null end,
       c.arquivo_especiais_nome,c.arquivo_especiais_em
from public.cotacao_veicular_planos p
join public.cotacao_veicular_configuracoes c on c.empresa_id=p.empresa_id
where c.tabela_importada or c.modelos_importados
on conflict(empresa_id,plano) do nothing;
insert into public.cotacao_veicular_modelos_plano(empresa_id,plano,modelo,codigo_fipe)
select p.empresa_id,p.codigo,m.modelo,m.codigo_fipe
from public.cotacao_veicular_planos p
join public.cotacao_veicular_modelos_empresa m on m.empresa_id=p.empresa_id
where exists(select 1 from public.cotacao_veicular_planos_arquivos a
  where a.empresa_id=p.empresa_id and a.plano=p.codigo and a.arquivo_especiais_nome is not null)
on conflict do nothing;

create or replace function public.cotacao_veicular_importar_precos_plano(
  p_empresa_id uuid,p_plano text,p_linhas jsonb,p_referencia text,p_arquivo_nome text
) returns integer language plpgsql security definer set search_path=''
as $$
declare v_total integer;
begin
  if not exists(select 1 from public.cotacao_veicular_planos
     where empresa_id=p_empresa_id and codigo=p_plano and ativo=true)
     or jsonb_typeof(p_linhas)<>'array'
     or jsonb_array_length(p_linhas) not between 1 and 10000
     or length(trim(p_arquivo_nome)) not between 1 and 180
     or length(trim(p_referencia)) not between 3 and 160 then
    raise exception 'Plano ou tabela de preços inválidos.';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_linhas) as x(plano text)
    where x.plano is distinct from p_plano) then
    raise exception 'A tabela contém dados de outro plano.';
  end if;
  delete from public.cotacao_veicular_precos_planos
    where empresa_id=p_empresa_id and plano=p_plano;
  insert into public.cotacao_veicular_precos_planos
    (empresa_id,plano,categoria,fipe_min_centavos,fipe_max_centavos,codigo_produto,valor_centavos)
  select p_empresa_id,p_plano,x.categoria,x.fipe_min_centavos,x.fipe_max_centavos,x.codigo_produto,x.valor_centavos
  from jsonb_to_recordset(p_linhas) as x(
    plano text,categoria text,fipe_min_centavos bigint,fipe_max_centavos bigint,
    codigo_produto text,valor_centavos bigint
  );
  get diagnostics v_total=row_count;
  insert into public.cotacao_veicular_planos_arquivos
    (empresa_id,plano,referencia,vigencia_ate,arquivo_precos_nome,arquivo_precos_em,updated_at)
  values(p_empresa_id,p_plano,p_referencia,null,p_arquivo_nome,now(),now())
  on conflict(empresa_id,plano) do update set
    referencia=excluded.referencia,vigencia_ate=null,
    arquivo_precos_nome=excluded.arquivo_precos_nome,
    arquivo_precos_em=excluded.arquivo_precos_em,updated_at=now();
  return v_total;
end; $$;
revoke all on function public.cotacao_veicular_importar_precos_plano(uuid,text,jsonb,text,text)
 from public,anon,authenticated;
grant execute on function public.cotacao_veicular_importar_precos_plano(uuid,text,jsonb,text,text) to service_role;

create or replace function public.cotacao_veicular_importar_especiais_plano(
  p_empresa_id uuid,p_plano text,p_modelos jsonb,p_arquivo_nome text
) returns integer language plpgsql security definer set search_path=''
as $$
declare v_total integer;
begin
  if not exists(select 1 from public.cotacao_veicular_planos
    where empresa_id=p_empresa_id and codigo=p_plano and ativo=true)
     or jsonb_typeof(p_modelos)<>'array'
     or jsonb_array_length(p_modelos) not between 1 and 5000
     or length(trim(p_arquivo_nome)) not between 1 and 180 then
    raise exception 'Lista de veículos especiais ou plano inválido.';
  end if;
  delete from public.cotacao_veicular_modelos_plano
    where empresa_id=p_empresa_id and plano=p_plano;
  insert into public.cotacao_veicular_modelos_plano(empresa_id,plano,modelo,codigo_fipe)
    select p_empresa_id,p_plano,x.modelo,nullif(x.codigo_fipe,'')
    from jsonb_to_recordset(p_modelos) as x(modelo text,codigo_fipe text);
  get diagnostics v_total=row_count;
  insert into public.cotacao_veicular_planos_arquivos
    (empresa_id,plano,arquivo_especiais_nome,arquivo_especiais_em,updated_at)
  values(p_empresa_id,p_plano,p_arquivo_nome,now(),now())
  on conflict(empresa_id,plano) do update set
    arquivo_especiais_nome=excluded.arquivo_especiais_nome,
    arquivo_especiais_em=excluded.arquivo_especiais_em,updated_at=now();
  return v_total;
end; $$;
revoke all on function public.cotacao_veicular_importar_especiais_plano(uuid,text,jsonb,text)
 from public,anon,authenticated;
grant execute on function public.cotacao_veicular_importar_especiais_plano(uuid,text,jsonb,text) to service_role;

create or replace function public.cotacao_veicular_excluir_arquivo_plano(
 p_empresa_id uuid,p_plano text,p_tipo text
) returns void language plpgsql security definer set search_path=''
as $$
begin
  if not exists(select 1 from public.cotacao_veicular_planos
    where empresa_id=p_empresa_id and codigo=p_plano) then
    raise exception 'Plano não encontrado.';
  end if;
  if p_tipo='precos' then
    delete from public.cotacao_veicular_precos_planos
      where empresa_id=p_empresa_id and plano=p_plano;
    update public.cotacao_veicular_planos_arquivos
    set arquivo_precos_nome=null,arquivo_precos_em=null,vigencia_ate=null,updated_at=now()
    where empresa_id=p_empresa_id and plano=p_plano;
  elsif p_tipo='especiais' then
    delete from public.cotacao_veicular_modelos_plano
      where empresa_id=p_empresa_id and plano=p_plano;
    update public.cotacao_veicular_planos_arquivos
    set arquivo_especiais_nome=null,arquivo_especiais_em=null,updated_at=now()
    where empresa_id=p_empresa_id and plano=p_plano;
  else
    raise exception 'Tipo de arquivo inválido.';
  end if;
end; $$;
revoke all on function public.cotacao_veicular_excluir_arquivo_plano(uuid,text,text)
 from public,anon,authenticated;
grant execute on function public.cotacao_veicular_excluir_arquivo_plano(uuid,text,text) to service_role;
