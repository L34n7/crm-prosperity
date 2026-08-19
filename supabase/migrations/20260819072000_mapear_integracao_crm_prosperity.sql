update public.integracoes_api_externas
set
  tipo = 'crm_prosperity',
  updated_at = now()
where
  lower(trim(trailing '/' from base_url)) = 'https://crmprosperity.com/api/integracoes/prosperity/v1'
  and tipo <> 'crm_prosperity';
