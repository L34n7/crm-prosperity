-- Regras comerciais de proteção veicular por empresa. Sem políticas de acesso direto;
-- acesso apenas via servidor usando a service_role e verificações por empresa.
alter table public.cotacao_veicular_configuracoes
  add column if not exists vigencia_ate date;
create table if not exists public.cotacao_veicular_regras_empresa (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  categoria text not null,
  plano text not null check (plano in ('premium','completo')),
  participacao_percentual numeric(7,3) not null check (participacao_percentual between 0 and 100),
  participacao_min_centavos bigint not null check (participacao_min_centavos >= 0),
  terceiros_limite_centavos bigint not null check (terceiros_limite_centavos >= 0),
  assistencia_km_total integer not null check (assistencia_km_total >= 0),
  assistencias_ano integer not null check (assistencias_ano >= 0),
  carro_reserva_incluso_dias integer not null default 0 check (carro_reserva_incluso_dias >= 0),
  coberturas jsonb not null default '[]'::jsonb
    check (jsonb_typeof(coberturas) = 'array'),
  usos_permitidos jsonb not null default '[]'::jsonb
    check (jsonb_typeof(usos_permitidos) = 'array'),
  energias_permitidas jsonb not null default '[]'::jsonb
    check (jsonb_typeof(energias_permitidas) = 'array'),
  observacoes text not null default '',
  updated_at timestamptz not null default now(),
  primary key(empresa_id,categoria,plano)
);
create table if not exists public.cotacao_veicular_opcionais_empresa (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  categoria text not null,
  plano text not null check (plano in ('premium','completo')),
  codigo text not null,
  nome text not null,
  valor_centavos integer not null check (valor_centavos >= 0),
  grupo_exclusivo text not null default '',
  ativo boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key(empresa_id,categoria,plano,codigo),
  foreign key(empresa_id,categoria,plano)
    references public.cotacao_veicular_regras_empresa(empresa_id,categoria,plano)
    on delete cascade
);
create index if not exists cotacao_veicular_regras_empresa_idx
  on public.cotacao_veicular_regras_empresa(empresa_id,categoria,plano);
alter table public.cotacao_veicular_regras_empresa enable row level security;
alter table public.cotacao_veicular_opcionais_empresa enable row level security;
revoke all on public.cotacao_veicular_regras_empresa,public.cotacao_veicular_opcionais_empresa
 from anon,authenticated;

-- Publicado somente como serviço; substituição integral de regras e opcionais de 1 plano.
create or replace function public.cotacao_veicular_salvar_regras(
  p_empresa_id uuid, p_categoria text, p_plano text,
  p_regra jsonb, p_opcionais jsonb
) returns void language plpgsql security definer set search_path=''
as $$
begin
  if not exists (select 1 from public.empresas where id=p_empresa_id)
     or p_plano not in ('premium','completo')
     or p_categoria not in ('motocicleta','auto_leves','app_taxi','especiais',
                           'van_utilitario','caminhao_leve','caminhao_pesado','agregado')
     or jsonb_typeof(p_regra) <> 'object'
     or jsonb_typeof(p_opcionais) <> 'array'
     or jsonb_array_length(p_opcionais) > 60 then
    raise exception 'Configuração comercial inválida.';
  end if;

  insert into public.cotacao_veicular_regras_empresa
    (empresa_id,categoria,plano,participacao_percentual,participacao_min_centavos,
     terceiros_limite_centavos,assistencia_km_total,assistencias_ano,
     carro_reserva_incluso_dias,coberturas,usos_permitidos,energias_permitidas,observacoes,updated_at)
  values
    (p_empresa_id,p_categoria,p_plano,
     (p_regra->>'participacao_percentual')::numeric,
     (p_regra->>'participacao_min_centavos')::bigint,
     (p_regra->>'terceiros_limite_centavos')::bigint,
     (p_regra->>'assistencia_km_total')::integer,
     (p_regra->>'assistencias_ano')::integer,
     coalesce((p_regra->>'carro_reserva_incluso_dias')::integer,0),
     coalesce(p_regra->'coberturas','[]'::jsonb),
     coalesce(p_regra->'usos_permitidos','[]'::jsonb),
     coalesce(p_regra->'energias_permitidas','[]'::jsonb),
     coalesce(p_regra->>'observacoes',''),now())
  on conflict(empresa_id,categoria,plano)
  do update set
    participacao_percentual=excluded.participacao_percentual,
    participacao_min_centavos=excluded.participacao_min_centavos,
    terceiros_limite_centavos=excluded.terceiros_limite_centavos,
    assistencia_km_total=excluded.assistencia_km_total,
    assistencias_ano=excluded.assistencias_ano,
    carro_reserva_incluso_dias=excluded.carro_reserva_incluso_dias,
    coberturas=excluded.coberturas,
    usos_permitidos=excluded.usos_permitidos,
    energias_permitidas=excluded.energias_permitidas,
    observacoes=excluded.observacoes,
    updated_at=now();
  delete from public.cotacao_veicular_opcionais_empresa
    where empresa_id=p_empresa_id and categoria=p_categoria and plano=p_plano;
  insert into public.cotacao_veicular_opcionais_empresa
    (empresa_id,categoria,plano,codigo,nome,valor_centavos,grupo_exclusivo,ativo)
  select p_empresa_id,p_categoria,p_plano,
      x.codigo,x.nome,x.valor_centavos,coalesce(x.grupo_exclusivo,''),x.ativo
  from jsonb_to_recordset(p_opcionais) as x(
    codigo text,nome text,valor_centavos integer,grupo_exclusivo text,ativo boolean);
end;
$$;
revoke all on function public.cotacao_veicular_salvar_regras(uuid,text,text,jsonb,jsonb)
 from public,anon,authenticated;
grant execute on function public.cotacao_veicular_salvar_regras(uuid,text,text,jsonb,jsonb)
 to service_role;

-- Vincula o histórico ao conjunto de regras que efetivamente foi cotado.
alter table public.cotacao_veicular_cotacoes
  add column if not exists regras_snapshot jsonb;
