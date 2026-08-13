create or replace function public.sincronizar_lead_webhook_imobiliario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  empresa_integracao uuid;
  imovel_compativel uuid;
begin
  if new.integracao_id is null then
    return new;
  end if;

  select integracao.empresa_id
    into empresa_integracao
  from public.imobiliario_integracoes_webhook integracao
  where integracao.id = new.integracao_id;

  if empresa_integracao is null then
    return new;
  end if;

  new.empresa_id := empresa_integracao;

  if nullif(btrim(new.imovel_external_id), '') is not null then
    select imovel.id
      into imovel_compativel
    from public.imoveis_externos imovel
    where imovel.empresa_id = empresa_integracao
      and imovel.integracao_id = new.integracao_id
      and imovel.external_id = new.imovel_external_id
    order by imovel.recebido_em desc nulls last, imovel.created_at desc
    limit 1;

    new.imovel_externo_id := imovel_compativel;
  elsif new.imovel_externo_id is not null then
    if not exists (
      select 1
      from public.imoveis_externos imovel
      where imovel.id = new.imovel_externo_id
        and imovel.empresa_id = empresa_integracao
        and imovel.integracao_id = new.integracao_id
    ) then
      new.imovel_externo_id := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sincronizar_lead_webhook_imobiliario
  on public.imovel_leads_portal;

create trigger trg_sincronizar_lead_webhook_imobiliario
before insert or update of empresa_id, integracao_id, imovel_externo_id, imovel_external_id
on public.imovel_leads_portal
for each row
execute function public.sincronizar_lead_webhook_imobiliario();
