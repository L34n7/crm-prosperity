-- Planos dinâmicos, preços independentes e rastreio dos arquivos importados.
create table if not exists public.cotacao_veicular_planos (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  codigo text not null check (codigo ~ '^[a-z0-9_]{2,50}$'),
  nome text not null check (length(trim(nome)) between 2 and 90),
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (empresa_id,codigo)
);
create unique index if not exists cotacao_veicular_planos_nome_empresa
  on public.cotacao_veicular_planos (empresa_id,lower(trim(nome)));
alter table public.cotacao_veicular_planos enable row level security;
revoke all on public.cotacao_veicular_planos from anon,authenticated;

-- Preserva configurações legadas sem criar planos para empresas novas.
insert into public.cotacao_veicular_planos(empresa_id,codigo,nome,ordem)
select distinct v.empresa_id,p.codigo,p.nome,p.ordem
from (
  select empresa_id from public.cotacao_veicular_faixas
  union select empresa_id from public.cotacao_veicular_regras_empresa
  union select empresa_id from public.cotacao_veicular_opcionais_empresa
  union select empresa_id from public.cotacao_veicular_configuracoes where tabela_importada
) v cross join (values ('premium','Premium',1),('completo','Completo',2)) p(codigo,nome,ordem)
on conflict (empresa_id,codigo) do nothing;

create table if not exists public.cotacao_veicular_precos_planos(
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  categoria text not null,
  plano text not null,
  fipe_min_centavos bigint not null check (fipe_min_centavos >= 0),
  fipe_max_centavos bigint not null check (fipe_max_centavos > fipe_min_centavos),
  codigo_produto text not null check (length(trim(codigo_produto)) between 1 and 70),
  valor_centavos bigint not null check (valor_centavos > 0),
  updated_at timestamptz not null default now(),
  primary key(empresa_id,categoria,plano,fipe_min_centavos),
  foreign key(empresa_id,plano) references public.cotacao_veicular_planos(empresa_id,codigo)
    on delete cascade
);
create index if not exists cotacao_precos_categoria_plano
  on public.cotacao_veicular_precos_planos(empresa_id,categoria,plano,fipe_min_centavos);
alter table public.cotacao_veicular_precos_planos enable row level security;
revoke all on public.cotacao_veicular_precos_planos from anon,authenticated;

-- Copia apenas tabelas efetivamente importadas pela empresa.
insert into public.cotacao_veicular_precos_planos
(empresa_id,categoria,plano,fipe_min_centavos,fipe_max_centavos,codigo_produto,valor_centavos)
select f.empresa_id,f.categoria,p.plano,f.fipe_min_centavos,f.fipe_max_centavos,
  case when p.plano='premium' then f.codigo_premium else f.codigo_completo end,
  case when p.plano='premium' then f.premium_centavos else f.completo_centavos end
from public.cotacao_veicular_faixas f
join public.cotacao_veicular_configuracoes c on c.empresa_id=f.empresa_id and c.tabela_importada
cross join (values ('premium'),('completo')) p(plano)
where case when p.plano='premium' then f.premium_centavos else f.completo_centavos end > 0
on conflict do nothing;

alter table public.cotacao_veicular_regras_empresa
 drop constraint if exists cotacao_veicular_regras_empresa_plano_check;
alter table public.cotacao_veicular_opcionais_empresa
 drop constraint if exists cotacao_veicular_opcionais_empresa_plano_check;
alter table public.cotacao_veicular_cotacoes
 drop constraint if exists cotacao_veicular_cotacoes_plano_check;
alter table public.cotacao_veicular_cotacoes
 add column if not exists plano_nome text;
update public.cotacao_veicular_cotacoes
set plano_nome=case plano when 'premium' then 'Premium' when 'completo' then 'Completo' else plano end
where plano_nome is null;

alter table public.cotacao_veicular_regras_empresa
 add constraint cotacao_veicular_regras_empresa_plano_ref
 foreign key(empresa_id,plano) references public.cotacao_veicular_planos(empresa_id,codigo)
 on delete cascade;
-- FK on opcionais -> regras já garante exclusão na remoção de um plano.
alter table public.cotacao_veicular_configuracoes
 add column if not exists arquivo_precos_nome text,
 add column if not exists arquivo_precos_em timestamptz,
 add column if not exists arquivo_especiais_nome text,
 add column if not exists arquivo_especiais_em timestamptz;

-- Importação atômica da tabela completa. As validações de negócio rodam também na API.
create or replace function public.cotacao_veicular_importar_precos_dinamicos(
 p_empresa_id uuid,p_linhas jsonb,p_referencia text,p_arquivo_nome text
) returns integer
language plpgsql security definer set search_path=''
as $$
declare v_total integer;
begin
 if jsonb_typeof(p_linhas)<>'array' or jsonb_array_length(p_linhas) not between 1 and 10000
    or length(trim(p_arquivo_nome))<1 or length(p_arquivo_nome)>180 then
   raise exception 'Arquivo de preços inválido.';
 end if;
 if not exists(select 1 from public.empresas where id=p_empresa_id) then
   raise exception 'Empresa inválida.';
 end if;
 if exists (
  select 1 from jsonb_to_recordset(p_linhas) as x(plano text)
  where not exists(select 1 from public.cotacao_veicular_planos p
                   where p.empresa_id=p_empresa_id and p.codigo=x.plano and p.ativo)
 ) then
   raise exception 'A planilha contém plano inexistente ou inativo.';
 end if;
 delete from public.cotacao_veicular_precos_planos where empresa_id=p_empresa_id;
 insert into public.cotacao_veicular_precos_planos
   (empresa_id,categoria,plano,fipe_min_centavos,fipe_max_centavos,codigo_produto,valor_centavos)
 select p_empresa_id,x.categoria,x.plano,x.fipe_min_centavos,x.fipe_max_centavos,
        x.codigo_produto,x.valor_centavos
 from jsonb_to_recordset(p_linhas) as x(
   categoria text,plano text,fipe_min_centavos bigint,fipe_max_centavos bigint,
   codigo_produto text,valor_centavos bigint);
 get diagnostics v_total=row_count;
 insert into public.cotacao_veicular_configuracoes
  (empresa_id,tabela_importada,tabela_validada,ia_habilitada,referencia,vigencia_ate,
   arquivo_precos_nome,arquivo_precos_em,updated_at)
 values(p_empresa_id,true,false,false,left(p_referencia,160),null,p_arquivo_nome,now(),now())
 on conflict(empresa_id) do update
   set tabela_importada=true,tabela_validada=false,ia_habilitada=false,
       referencia=excluded.referencia,vigencia_ate=null,
       arquivo_precos_nome=excluded.arquivo_precos_nome,
       arquivo_precos_em=excluded.arquivo_precos_em,updated_at=now();
 return v_total;
end;
$$;
revoke all on function public.cotacao_veicular_importar_precos_dinamicos(uuid,jsonb,text,text)
  from public,anon,authenticated;
grant execute on function public.cotacao_veicular_importar_precos_dinamicos(uuid,jsonb,text,text)
 to service_role;

create or replace function public.cotacao_veicular_excluir_importacao(
 p_empresa_id uuid,p_tipo text
) returns void language plpgsql security definer set search_path=''
as $$
begin
 if p_tipo='precos' then
   delete from public.cotacao_veicular_precos_planos where empresa_id=p_empresa_id;
   update public.cotacao_veicular_configuracoes set
     tabela_importada=false,arquivo_precos_nome=null,arquivo_precos_em=null,
     vigencia_ate=null,tabela_validada=false,ia_habilitada=false,updated_at=now()
   where empresa_id=p_empresa_id;
 elsif p_tipo='especiais' then
   delete from public.cotacao_veicular_modelos_empresa where empresa_id=p_empresa_id;
   update public.cotacao_veicular_configuracoes set
     modelos_importados=false,arquivo_especiais_nome=null,arquivo_especiais_em=null,
     tabela_validada=false,ia_habilitada=false,updated_at=now()
   where empresa_id=p_empresa_id;
 else
   raise exception 'Tipo de arquivo inválido.';
 end if;
end;
$$;
revoke all on function public.cotacao_veicular_excluir_importacao(uuid,text) from public,anon,authenticated;
grant execute on function public.cotacao_veicular_excluir_importacao(uuid,text) to service_role;

-- Reimplementa a importação de especiais para reter o nome real do arquivo.
create or replace function public.cotacao_veicular_importar_especiais(
 p_empresa_id uuid,p_modelos jsonb,p_arquivo_nome text
) returns integer language plpgsql security definer set search_path=''
as $$
declare v_total integer;
begin
 if jsonb_typeof(p_modelos)<>'array' or jsonb_array_length(p_modelos) not between 1 and 5000
   or length(trim(p_arquivo_nome))<1 or length(p_arquivo_nome)>180 then
   raise exception 'Arquivo de especiais inválido.';
 end if;
 delete from public.cotacao_veicular_modelos_empresa where empresa_id=p_empresa_id;
 insert into public.cotacao_veicular_modelos_empresa(empresa_id,modelo,codigo_fipe)
 select p_empresa_id,x.modelo,nullif(x.codigo_fipe,'')
 from jsonb_to_recordset(p_modelos) as x(modelo text,codigo_fipe text);
 get diagnostics v_total=row_count;
 insert into public.cotacao_veicular_configuracoes
 (empresa_id,modelos_importados,tabela_validada,ia_habilitada,arquivo_especiais_nome,arquivo_especiais_em,updated_at)
 values(p_empresa_id,true,false,false,p_arquivo_nome,now(),now())
 on conflict(empresa_id) do update set
 modelos_importados=true,tabela_validada=false,ia_habilitada=false,
 arquivo_especiais_nome=excluded.arquivo_especiais_nome,
 arquivo_especiais_em=excluded.arquivo_especiais_em,updated_at=now();
 return v_total;
end;
$$;
revoke all on function public.cotacao_veicular_importar_especiais(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.cotacao_veicular_importar_especiais(uuid,jsonb,text) to service_role;
