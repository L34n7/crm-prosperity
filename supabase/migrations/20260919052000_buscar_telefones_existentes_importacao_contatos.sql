
create or replace function public.buscar_telefones_contatos_existentes(
  p_empresa_id uuid,
  p_telefones text[]
)
returns table(telefone_normalizado text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select distinct public.normalizar_telefone_whatsapp(contato.telefone)
  from public.contatos contato
  where contato.empresa_id = p_empresa_id
    and public.normalizar_telefone_whatsapp(contato.telefone) = any(
      coalesce(p_telefones, '{}'::text[])
    );
$function$;

revoke all on function public.buscar_telefones_contatos_existentes(uuid, text[])
  from public, anon, authenticated;

grant execute on function public.buscar_telefones_contatos_existentes(uuid, text[])
  to service_role;
