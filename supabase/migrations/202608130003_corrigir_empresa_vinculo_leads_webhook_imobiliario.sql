with alvos as (
  select
    lead.id,
    integracao.empresa_id as empresa_id_correta,
    case
      when nullif(btrim(lead.imovel_external_id), '') is null then lead.imovel_externo_id
      else (
        select imovel.id
        from public.imoveis_externos imovel
        where imovel.empresa_id = integracao.empresa_id
          and imovel.integracao_id = integracao.id
          and imovel.external_id = lead.imovel_external_id
        order by imovel.recebido_em desc nulls last, imovel.created_at desc
        limit 1
      )
    end as imovel_externo_id_correto
  from public.imovel_leads_portal lead
  join public.imobiliario_integracoes_webhook integracao
    on integracao.id = lead.integracao_id
  where lead.integracao_id is not null
)
update public.imovel_leads_portal lead
set
  empresa_id = alvos.empresa_id_correta,
  imovel_externo_id = alvos.imovel_externo_id_correto,
  updated_at = now()
from alvos
where lead.id = alvos.id
  and (
    lead.empresa_id is distinct from alvos.empresa_id_correta
    or lead.imovel_externo_id is distinct from alvos.imovel_externo_id_correto
  );
