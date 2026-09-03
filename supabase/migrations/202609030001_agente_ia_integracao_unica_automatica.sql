create or replace function public.agente_ia_definir_integracao_unica()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_total integer;
  v_integracao_id uuid;
begin
  if coalesce(cardinality(new.integracoes_whatsapp_ids), 0) = 0 then
    select count(*), (array_agg(i.id order by i.id))[1]
      into v_total, v_integracao_id
    from public.integracoes_whatsapp i
    where i.empresa_id = new.empresa_id;

    if v_total = 1 and v_integracao_id is not null then
      new.integracoes_whatsapp_ids := array[v_integracao_id]::uuid[];
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_agente_ia_integracao_unica on public.agentes_ia;
create trigger trg_agente_ia_integracao_unica
before insert or update on public.agentes_ia
for each row
execute function public.agente_ia_definir_integracao_unica();

with empresas_integracao_unica as (
  select
    empresa_id,
    (array_agg(id order by id))[1] as integracao_id
  from public.integracoes_whatsapp
  group by empresa_id
  having count(*) = 1
)
update public.agentes_ia a
set integracoes_whatsapp_ids = array[e.integracao_id]::uuid[]
from empresas_integracao_unica e
where a.empresa_id = e.empresa_id
  and coalesce(cardinality(a.integracoes_whatsapp_ids), 0) = 0;
