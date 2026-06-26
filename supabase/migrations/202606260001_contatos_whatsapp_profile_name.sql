alter table public.contatos
  add column if not exists whatsapp_profile_name text;

update public.contatos as contato
set whatsapp_profile_name = perfil.whatsapp_profile_name
from (
  select distinct on (conversa.contato_id)
    conversa.contato_id,
    nullif(trim(mensagem.metadata_json ->> 'whatsapp_profile_name'), '') as whatsapp_profile_name
  from public.conversas as conversa
  join public.mensagens as mensagem
    on mensagem.conversa_id = conversa.id
  where conversa.contato_id is not null
    and mensagem.remetente_tipo = 'contato'
    and nullif(trim(mensagem.metadata_json ->> 'whatsapp_profile_name'), '') is not null
  order by conversa.contato_id, mensagem.created_at desc
) as perfil
where contato.id = perfil.contato_id
  and nullif(trim(coalesce(contato.whatsapp_profile_name, '')), '') is null;
