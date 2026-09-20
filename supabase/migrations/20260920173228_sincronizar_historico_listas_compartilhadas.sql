insert into public.conversas_listas_itens (
  empresa_id,
  lista_id,
  conversa_id,
  criado_por
)
select
  membro.empresa_id,
  membro.lista_id,
  conversa.id,
  case
    when exists (
      select 1
      from public.usuarios usuario
      where usuario.id = membro.criado_por
        and usuario.empresa_id = membro.empresa_id
    ) then membro.criado_por
    else (
      select usuario.id
      from public.usuarios usuario
      where usuario.empresa_id = membro.empresa_id
      order by usuario.id
      limit 1
    )
  end
from public.conversas_listas_contatos membro
join public.conversas conversa
  on conversa.empresa_id = membro.empresa_id
 and conversa.contato_id = membro.contato_id
where (
  exists (
    select 1
    from public.usuarios usuario
    where usuario.id = membro.criado_por
      and usuario.empresa_id = membro.empresa_id
  )
  or exists (
    select 1
    from public.usuarios usuario
    where usuario.empresa_id = membro.empresa_id
  )
)
on conflict (lista_id, conversa_id) do nothing;
