-- Catalogo compartilhado entre todas as empresas do nicho imobiliario.
-- A view e acessada somente por rotas servidoras com service role.

create or replace view public.catalogo_imoveis_global as
select
  ('crm:' || imovel.id::text) as catalogo_id,
  'crm'::text as origem_tipo,
  imovel.id as origem_id,
  imovel.empresa_id,
  coalesce(
    nullif(trim(empresa.nome_fantasia), ''),
    nullif(trim(empresa.razao_social), ''),
    'Empresa do CRM'
  ) as empresa_nome,
  imovel.titulo,
  imovel.codigo,
  imovel.tipo,
  imovel.finalidade,
  imovel.status,
  imovel.valor,
  imovel.valor_condominio,
  imovel.valor_iptu,
  imovel.bairro,
  imovel.cidade,
  imovel.estado,
  imovel.quartos,
  imovel.suites,
  imovel.banheiros,
  imovel.vagas,
  imovel.area_m2,
  imovel.descricao,
  case
    when jsonb_typeof(imovel.fotos) = 'array'
      and jsonb_array_length(imovel.fotos) > 0
      and jsonb_typeof(imovel.fotos -> 0) = 'string'
      then imovel.fotos ->> 0
    when jsonb_typeof(imovel.fotos) = 'array'
      and jsonb_array_length(imovel.fotos) > 0
      and jsonb_typeof(imovel.fotos -> 0) = 'object'
      then coalesce(
        imovel.fotos -> 0 ->> 'url',
        imovel.fotos -> 0 ->> 'src',
        imovel.fotos -> 0 ->> 'original'
      )
    else null
  end as imagem_url,
  publicacao.external_url,
  imovel.created_at,
  imovel.updated_at
from public.imoveis imovel
join public.empresas empresa
  on empresa.id = imovel.empresa_id
join public.nichos nicho
  on nicho.id = empresa.nicho_id
left join lateral (
  select item.external_url
  from public.imovel_publicacoes item
  where item.empresa_id = imovel.empresa_id
    and item.imovel_id = imovel.id
    and item.external_url is not null
    and trim(item.external_url) <> ''
  order by
    case when item.status = 'publicado' then 0 else 1 end,
    item.updated_at desc
  limit 1
) publicacao on true
where nicho.codigo = 'imobiliaria'
  and imovel.status <> 'arquivado'

union all

select
  ('externo:' || externo.id::text) as catalogo_id,
  'externo'::text as origem_tipo,
  externo.id as origem_id,
  externo.empresa_id,
  coalesce(
    nullif(trim(integracao.nome), ''),
    nullif(trim(externo.canal_nome), ''),
    nullif(trim(empresa.nome_fantasia), ''),
    nullif(trim(empresa.razao_social), ''),
    'Imobiliaria parceira'
  ) as empresa_nome,
  externo.titulo,
  externo.codigo,
  externo.tipo,
  externo.finalidade,
  coalesce(nullif(trim(externo.status_origem), ''), externo.status) as status,
  externo.valor,
  externo.valor_condominio,
  externo.valor_iptu,
  externo.bairro,
  externo.cidade,
  externo.estado,
  externo.quartos,
  externo.suites,
  externo.banheiros,
  externo.vagas,
  externo.area_m2,
  externo.descricao,
  externo.imagem_url,
  externo.external_url,
  externo.created_at,
  externo.updated_at
from public.imoveis_externos externo
left join public.imobiliario_integracoes_webhook integracao
  on integracao.id = externo.integracao_id
left join public.empresas empresa
  on empresa.id = externo.empresa_id
where externo.status <> 'arquivado';

revoke all on public.catalogo_imoveis_global from anon;
revoke all on public.catalogo_imoveis_global from authenticated;
grant select on public.catalogo_imoveis_global to service_role;
