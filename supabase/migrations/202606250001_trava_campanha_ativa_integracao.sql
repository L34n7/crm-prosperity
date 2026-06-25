do $$
declare
  v_total_duplicadas integer;
begin
  select count(*)::integer
    into v_total_duplicadas
  from (
    select empresa_id, integracao_whatsapp_id
    from public.whatsapp_disparo_campanhas
    where status in ('pendente', 'enviando')
    group by empresa_id, integracao_whatsapp_id
    having count(*) > 1
  ) duplicadas;

  if v_total_duplicadas > 0 then
    raise exception
      'Existem % integracoes com mais de uma campanha ativa. Cancele ou conclua as duplicadas antes de aplicar a trava por integracao.',
      v_total_duplicadas
      using hint = 'Consulte public.whatsapp_disparo_campanhas com status pendente/enviando agrupando por empresa_id e integracao_whatsapp_id.';
  end if;
end $$;

create unique index if not exists whatsapp_disparo_campanhas_integracao_ativa_uidx
  on public.whatsapp_disparo_campanhas (empresa_id, integracao_whatsapp_id)
  where status in ('pendente', 'enviando');
