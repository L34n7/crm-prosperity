-- Recupera os telefones que foram informados no cadastro de compra e
-- nao foram copiados ao registro da empresa criado pelo webhook Prosperity Pay.
-- Apenas lead vinculado diretamente a empresa, numero valido e nao ambiguo.
with candidatos as (
  select e.id as empresa_id,
         regexp_replace(l.telefone, '[^0-9]', '', 'g') as telefone
    from public.empresas e
    join public.leads_cadastro l on l.empresa_id = e.id
   where e.observacoes ilike '%Criada automaticamente via webhook Prosperity Pay%'
     and (e.telefone is null or btrim(e.telefone) = '')
     and l.telefone is not null
), validados as (
  select empresa_id, telefone,
    case when left(telefone,2)='55' and length(telefone) in (12,13)
      then substring(telefone from 3) else telefone end as nacional
  from candidatos
), unicos as (
  select empresa_id, min(telefone) as telefone
  from validados
  where length(nacional) in (10,11)
    and nacional !~ '^([0-9])\1+$'
  group by empresa_id
  having count(distinct telefone)=1
)
update public.empresas e
   set telefone=u.telefone,
       updated_at=now()
  from unicos u
 where e.id=u.empresa_id
   and (e.telefone is null or btrim(e.telefone)='')
 returning e.id,e.nome_fantasia,e.telefone;