-- Cotacoes multi-plano e catalogos isolados por empresa.
alter table public.cotacao_veicular_configuracoes
  add column if not exists tabela_importada boolean not null default false,
  add column if not exists modelos_importados boolean not null default false;

alter table public.cotacao_veicular_cotacoes
  add column if not exists grupo_id uuid;

create index if not exists cotacao_veicular_cotacoes_grupo_idx
  on public.cotacao_veicular_cotacoes (empresa_id, grupo_id)
  where grupo_id is not null;

create table if not exists public.cotacao_veicular_modelos_empresa (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  modelo text not null,
  codigo_fipe text,
  created_at timestamptz not null default now(),
  primary key (empresa_id, modelo),
  constraint cotacao_veicular_modelo_nome_valido check (length(trim(modelo)) between 2 and 220)
);
create index if not exists cotacao_modelos_empresa_fipe_idx
  on public.cotacao_veicular_modelos_empresa(empresa_id,codigo_fipe)
  where codigo_fipe is not null;

alter table public.cotacao_veicular_modelos_empresa enable row level security;
revoke all on public.cotacao_veicular_modelos_empresa from anon,authenticated;

-- Troca integral e transacional: nenhuma empresa altera tabela de outra.
create or replace function public.cotacao_veicular_substituir_faixas(
  p_empresa_id uuid, p_faixas jsonb, p_referencia text
) returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_total integer;
begin
  if jsonb_typeof(p_faixas) <> 'array' or jsonb_array_length(p_faixas) < 1
     or jsonb_array_length(p_faixas) > 5000 then
    raise exception 'A tabela deve ter entre 1 e 5000 faixas.';
  end if;
  if not exists (select 1 from public.empresas where id=p_empresa_id) then
    raise exception 'Empresa inválida.';
  end if;
  delete from public.cotacao_veicular_faixas where empresa_id=p_empresa_id;
  insert into public.cotacao_veicular_faixas
    (empresa_id,categoria,fipe_min_centavos,fipe_max_centavos,codigo_premium,
     premium_centavos,codigo_completo,completo_centavos,revisar,updated_at)
  select p_empresa_id, x.categoria, x.fipe_min_centavos, x.fipe_max_centavos,
    x.codigo_premium,x.premium_centavos,x.codigo_completo,x.completo_centavos,false,now()
  from jsonb_to_recordset(p_faixas) as x(
    categoria text,fipe_min_centavos bigint,fipe_max_centavos bigint,
    codigo_premium text,premium_centavos integer,codigo_completo text,
    completo_centavos integer
  );
  get diagnostics v_total = row_count;
  insert into public.cotacao_veicular_configuracoes
   (empresa_id,tabela_importada,tabela_validada,ia_habilitada,referencia,validada_em,updated_at)
  values (p_empresa_id,true,false,false,left(p_referencia,160),null,now())
  on conflict(empresa_id) do update
   set tabela_importada=true,tabela_validada=false,ia_habilitada=false,
       referencia=excluded.referencia,validada_em=null,updated_at=now();
  return v_total;
end;
$$;

create or replace function public.cotacao_veicular_substituir_especiais(
  p_empresa_id uuid, p_modelos jsonb
) returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_total integer;
begin
  if jsonb_typeof(p_modelos) <> 'array' or jsonb_array_length(p_modelos) < 1
     or jsonb_array_length(p_modelos) > 5000 then
    raise exception 'A lista deve ter entre 1 e 5000 modelos.';
  end if;
  if not exists (select 1 from public.empresas where id=p_empresa_id) then
    raise exception 'Empresa inválida.';
  end if;
  delete from public.cotacao_veicular_modelos_empresa where empresa_id=p_empresa_id;
  insert into public.cotacao_veicular_modelos_empresa(empresa_id,modelo,codigo_fipe)
  select p_empresa_id,x.modelo,nullif(x.codigo_fipe,'')
  from jsonb_to_recordset(p_modelos) as x(modelo text,codigo_fipe text);
  get diagnostics v_total = row_count;
  insert into public.cotacao_veicular_configuracoes
   (empresa_id,modelos_importados,tabela_validada,ia_habilitada,updated_at)
  values(p_empresa_id,true,false,false,now())
  on conflict(empresa_id) do update set
    modelos_importados=true,tabela_validada=false,ia_habilitada=false,
    validada_em=null,updated_at=now();
  return v_total;
end;
$$;

revoke all on function public.cotacao_veicular_substituir_faixas(uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.cotacao_veicular_substituir_especiais(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.cotacao_veicular_substituir_faixas(uuid,jsonb,text) to service_role;
grant execute on function public.cotacao_veicular_substituir_especiais(uuid,jsonb) to service_role;
