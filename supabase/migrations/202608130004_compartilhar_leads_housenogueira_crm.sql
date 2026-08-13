create table if not exists public.imobiliario_integracoes_leads_visibilidade (
  id uuid primary key default gen_random_uuid(),
  integracao_id uuid not null references public.imobiliario_integracoes_webhook(id) on delete cascade,
  empresa_visualizadora_id uuid not null references public.empresas(id) on delete cascade,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint imobiliario_integracoes_leads_visibilidade_uidx
    unique (integracao_id, empresa_visualizadora_id)
);

create index if not exists imobiliario_integracoes_leads_visibilidade_empresa_idx
  on public.imobiliario_integracoes_leads_visibilidade (
    empresa_visualizadora_id,
    ativo,
    integracao_id
  );

-- Mantem somente a autorizacao funcional da integracao oficial HouseNogueira
-- para a empresa CRM Prosperity do nicho imobiliario.
delete from public.imobiliario_integracoes_leads_visibilidade acesso
using public.imobiliario_integracoes_webhook integracao,
      public.empresas visualizadora
where acesso.integracao_id = integracao.id
  and acesso.empresa_visualizadora_id = visualizadora.id
  and lower(trim(integracao.nome)) = 'housenogueira'
  and lower(trim(coalesce(visualizadora.nome_fantasia, visualizadora.razao_social, ''))) = 'crm prosperity'
  and not (
    integracao.status = 'ativo'
    and exists (
      select 1
      from public.empresas proprietaria
      join public.nichos nicho_proprietaria
        on nicho_proprietaria.id = proprietaria.nicho_id
      where proprietaria.id = integracao.empresa_id
        and lower(trim(coalesce(proprietaria.nome_fantasia, proprietaria.razao_social, ''))) = 'house nogueira'
        and nicho_proprietaria.codigo = 'imobiliaria'
    )
    and exists (
      select 1
      from public.nichos nicho_visualizadora
      where nicho_visualizadora.id = visualizadora.nicho_id
        and nicho_visualizadora.codigo = 'imobiliaria'
    )
  );

insert into public.imobiliario_integracoes_leads_visibilidade (
  integracao_id,
  empresa_visualizadora_id,
  ativo
)
select integracao.id, visualizadora.id, true
from public.imobiliario_integracoes_webhook integracao
join public.empresas proprietaria
  on proprietaria.id = integracao.empresa_id
join public.nichos nicho_proprietaria
  on nicho_proprietaria.id = proprietaria.nicho_id
cross join public.empresas visualizadora
join public.nichos nicho_visualizadora
  on nicho_visualizadora.id = visualizadora.nicho_id
where lower(trim(integracao.nome)) = 'housenogueira'
  and integracao.status = 'ativo'
  and lower(trim(coalesce(proprietaria.nome_fantasia, proprietaria.razao_social, ''))) = 'house nogueira'
  and nicho_proprietaria.codigo = 'imobiliaria'
  and lower(trim(coalesce(visualizadora.nome_fantasia, visualizadora.razao_social, ''))) = 'crm prosperity'
  and nicho_visualizadora.codigo = 'imobiliaria'
on conflict (integracao_id, empresa_visualizadora_id)
do update set ativo = excluded.ativo, updated_at = now();

create or replace view public.imovel_leads_portal_visiveis as
select
  lead.empresa_id as empresa_visualizadora_id,
  false as compartilhado,
  lead.id,
  lead.empresa_id,
  lead.imovel_id,
  lead.publicacao_id,
  lead.canal_codigo,
  lead.canal_nome,
  lead.nome,
  lead.email,
  lead.telefone,
  lead.mensagem,
  lead.status,
  lead.origem_payload,
  lead.recebido_em,
  lead.created_by,
  lead.created_at,
  lead.updated_at,
  lead.integracao_id,
  lead.external_id,
  lead.imovel_externo_id,
  lead.imovel_external_id
from public.imovel_leads_portal lead
union all
select
  acesso.empresa_visualizadora_id,
  true as compartilhado,
  lead.id,
  lead.empresa_id,
  lead.imovel_id,
  lead.publicacao_id,
  lead.canal_codigo,
  lead.canal_nome,
  lead.nome,
  lead.email,
  lead.telefone,
  lead.mensagem,
  lead.status,
  lead.origem_payload,
  lead.recebido_em,
  lead.created_by,
  lead.created_at,
  lead.updated_at,
  lead.integracao_id,
  lead.external_id,
  imovel_local.id as imovel_externo_id,
  lead.imovel_external_id
from public.imovel_leads_portal lead
join public.imobiliario_integracoes_leads_visibilidade acesso
  on acesso.integracao_id = lead.integracao_id
 and acesso.ativo = true
join public.imobiliario_integracoes_webhook integracao
  on integracao.id = lead.integracao_id
left join lateral (
  select local.id
  from public.imoveis_externos local
  where local.empresa_id = acesso.empresa_visualizadora_id
    and local.external_id = lead.imovel_external_id
    and local.canal_codigo = integracao.canal_codigo
  order by local.updated_at desc, local.created_at desc
  limit 1
) imovel_local on true
where acesso.empresa_visualizadora_id <> lead.empresa_id;

create or replace view public.imovel_leads_portal_resumo as
select
  empresa_visualizadora_id as empresa_id,
  imovel_id,
  imovel_externo_id,
  count(distinct id) as total_leads
from public.imovel_leads_portal_visiveis
where status <> 'arquivado'
group by empresa_visualizadora_id, imovel_id, imovel_externo_id;

comment on table public.imobiliario_integracoes_leads_visibilidade is
  'Empresas autorizadas a visualizar leads recebidos por integracoes imobiliarias de outra empresa.';

comment on view public.imovel_leads_portal_visiveis is
  'Leads imobiliarios visiveis por empresa, incluindo compartilhamentos explicitamente autorizados e mapeados para a copia local do imovel.';