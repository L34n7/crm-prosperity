create index if not exists whatsapp_disparo_itens_empresa_campanha_contato_idx
  on public.whatsapp_disparo_itens (empresa_id, campanha_id, contato_id)
  where contato_id is not null
    and status = 'enviado';

create index if not exists whatsapp_disparo_itens_empresa_campanha_telefone_idx
  on public.whatsapp_disparo_itens (
    empresa_id,
    campanha_id,
    telefone_normalizado
  )
  where status = 'enviado';

create or replace function public.listar_contatos_operacionais_por_disparo_anterior(
  p_empresa_id uuid,
  p_campanha_id uuid
)
returns setof public.contatos_visao_operacional
language sql
stable
security invoker
set search_path = public
as $$
  select contato.*
  from public.contatos_visao_operacional contato
  where contato.empresa_id = p_empresa_id
    and (
      exists (
        select 1
        from public.whatsapp_disparo_itens item
        where item.empresa_id = p_empresa_id
          and item.campanha_id = p_campanha_id
          and item.status = 'enviado'
          and item.contato_id = contato.id
      )
      or (
        contato.telefone_normalizado <> ''
        and exists (
          select 1
          from public.whatsapp_disparo_itens item
          where item.empresa_id = p_empresa_id
            and item.campanha_id = p_campanha_id
            and item.status = 'enviado'
            and item.contato_id is null
            and item.telefone_normalizado = contato.telefone_normalizado
        )
      )
    );
$$;

revoke all on function public.listar_contatos_operacionais_por_disparo_anterior(
  uuid,
  uuid
) from public, anon, authenticated;

grant execute on function public.listar_contatos_operacionais_por_disparo_anterior(
  uuid,
  uuid
) to service_role;
