create or replace view public.imovel_leads_portal_resumo
with (security_invoker = true)
as
select
  empresa_id,
  imovel_id,
  imovel_externo_id,
  count(*)::bigint as total_leads
from public.imovel_leads_portal
where status <> 'arquivado'
group by empresa_id, imovel_id, imovel_externo_id;

comment on view public.imovel_leads_portal_resumo is
  'Resumo agregado de leads ativos por imóvel interno ou externo para listagens e indicadores.';
