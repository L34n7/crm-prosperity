-- Permite que uma integração imobiliária tenha empresas espelho sem duplicar
-- credenciais, token ou a integração de origem. O imóvel principal continua
-- vinculado à empresa dona da integração e os espelhos são mantidos
-- automaticamente por trigger.

alter table public.imoveis_externos
  add column if not exists espelho_origem_id uuid null references public.imoveis_externos(id) on delete cascade;

create unique index if not exists imoveis_externos_espelho_origem_empresa_idx
  on public.imoveis_externos (espelho_origem_id, empresa_id)
  where espelho_origem_id is not null;

create table if not exists public.imobiliario_integracao_espelhos (
  id uuid primary key default gen_random_uuid(),
  integracao_id uuid not null references public.imobiliario_integracoes_webhook(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integracao_id, empresa_id)
);

alter table public.imobiliario_integracao_espelhos enable row level security;

drop trigger if exists imobiliario_integracao_espelhos_atualizar_updated_at on public.imobiliario_integracao_espelhos;
create trigger imobiliario_integracao_espelhos_atualizar_updated_at
before update on public.imobiliario_integracao_espelhos
for each row execute function public.cadastros_atualizar_updated_at();

create or replace function public.imobiliario_sincronizar_imovel_espelhos(p_imovel_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_origem public.imoveis_externos%rowtype;
  v_destino record;
  v_total integer := 0;
begin
  select * into v_origem
  from public.imoveis_externos
  where id = p_imovel_id;

  if not found or v_origem.espelho_origem_id is not null or v_origem.integracao_id is null then
    return 0;
  end if;

  for v_destino in
    select e.empresa_id
    from public.imobiliario_integracao_espelhos e
    where e.integracao_id = v_origem.integracao_id
      and e.ativo
      and e.empresa_id <> v_origem.empresa_id
  loop
    insert into public.imoveis_externos (
      empresa_id, canal_codigo, canal_nome, external_id, external_url,
      titulo, tipo, finalidade, valor, bairro, cidade, estado, quartos,
      banheiros, vagas, area_m2, descricao, status, payload, recebido_em,
      integracao_id, codigo, status_origem, valor_venda, valor_locacao,
      valor_condominio, valor_iptu, cep, logradouro, numero, complemento,
      suites, area_util_m2, area_total_m2, area_terreno_m2, latitude,
      longitude, caracteristicas, imagem_url, imagem_urls,
      atualizado_origem_em, snapshot_hash, disponibilidade_origem,
      arquivado_por, espelho_origem_id, created_at, updated_at
    ) values (
      v_destino.empresa_id, v_origem.canal_codigo, v_origem.canal_nome,
      v_origem.external_id, v_origem.external_url, v_origem.titulo,
      v_origem.tipo, v_origem.finalidade, v_origem.valor, v_origem.bairro,
      v_origem.cidade, v_origem.estado, v_origem.quartos, v_origem.banheiros,
      v_origem.vagas, v_origem.area_m2, v_origem.descricao, v_origem.status,
      v_origem.payload, v_origem.recebido_em, null, v_origem.codigo,
      v_origem.status_origem, v_origem.valor_venda, v_origem.valor_locacao,
      v_origem.valor_condominio, v_origem.valor_iptu, v_origem.cep,
      v_origem.logradouro, v_origem.numero, v_origem.complemento,
      v_origem.suites, v_origem.area_util_m2, v_origem.area_total_m2,
      v_origem.area_terreno_m2, v_origem.latitude, v_origem.longitude,
      v_origem.caracteristicas, v_origem.imagem_url, v_origem.imagem_urls,
      v_origem.atualizado_origem_em, v_origem.snapshot_hash,
      v_origem.disponibilidade_origem, v_origem.arquivado_por,
      v_origem.id, v_origem.created_at, v_origem.updated_at
    )
    on conflict (espelho_origem_id, empresa_id) where espelho_origem_id is not null
    do update set
      canal_codigo = excluded.canal_codigo,
      canal_nome = excluded.canal_nome,
      external_id = excluded.external_id,
      external_url = excluded.external_url,
      titulo = excluded.titulo,
      tipo = excluded.tipo,
      finalidade = excluded.finalidade,
      valor = excluded.valor,
      bairro = excluded.bairro,
      cidade = excluded.cidade,
      estado = excluded.estado,
      quartos = excluded.quartos,
      banheiros = excluded.banheiros,
      vagas = excluded.vagas,
      area_m2 = excluded.area_m2,
      descricao = excluded.descricao,
      status = excluded.status,
      payload = excluded.payload,
      recebido_em = excluded.recebido_em,
      codigo = excluded.codigo,
      status_origem = excluded.status_origem,
      valor_venda = excluded.valor_venda,
      valor_locacao = excluded.valor_locacao,
      valor_condominio = excluded.valor_condominio,
      valor_iptu = excluded.valor_iptu,
      cep = excluded.cep,
      logradouro = excluded.logradouro,
      numero = excluded.numero,
      complemento = excluded.complemento,
      suites = excluded.suites,
      area_util_m2 = excluded.area_util_m2,
      area_total_m2 = excluded.area_total_m2,
      area_terreno_m2 = excluded.area_terreno_m2,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      caracteristicas = excluded.caracteristicas,
      imagem_url = excluded.imagem_url,
      imagem_urls = excluded.imagem_urls,
      atualizado_origem_em = excluded.atualizado_origem_em,
      snapshot_hash = excluded.snapshot_hash,
      disponibilidade_origem = excluded.disponibilidade_origem,
      arquivado_por = excluded.arquivado_por,
      updated_at = excluded.updated_at;

    v_total := v_total + 1;
  end loop;

  return v_total;
end;
$$;

create or replace function public.imobiliario_imoveis_externos_espelhar_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.espelho_origem_id is null then
    perform public.imobiliario_sincronizar_imovel_espelhos(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists imoveis_externos_espelhar on public.imoveis_externos;
create trigger imoveis_externos_espelhar
after insert or update on public.imoveis_externos
for each row execute function public.imobiliario_imoveis_externos_espelhar_trigger();

create or replace function public.imobiliario_sincronizar_integracao_espelhos(p_integracao_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item record;
  v_total integer := 0;
begin
  for v_item in
    select id
    from public.imoveis_externos
    where integracao_id = p_integracao_id
      and espelho_origem_id is null
  loop
    v_total := v_total + public.imobiliario_sincronizar_imovel_espelhos(v_item.id);
  end loop;
  return v_total;
end;
$$;
