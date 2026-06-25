drop policy if exists whatsapp_disparo_campanhas_usuario_select
  on public.whatsapp_disparo_campanhas;

drop policy if exists whatsapp_disparo_campanhas_empresa_select
  on public.whatsapp_disparo_campanhas;

create policy whatsapp_disparo_campanhas_empresa_select
  on public.whatsapp_disparo_campanhas
  for select
  to authenticated
  using (
    empresa_id = public.usuario_empresa_id_atual()
  );

grant select on public.whatsapp_disparo_campanhas to authenticated;
