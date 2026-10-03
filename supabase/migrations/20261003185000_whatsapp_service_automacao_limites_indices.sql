create index if not exists idx_whatsapp_service_automacao_limites_integracao
  on public.whatsapp_service_automacao_limites (integracao_whatsapp_id);

create index if not exists idx_whatsapp_service_automacao_limites_updated_by
  on public.whatsapp_service_automacao_limites (updated_by)
  where updated_by is not null;
