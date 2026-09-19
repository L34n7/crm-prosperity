update public.contatos contato
set
  origem = case
    when lista.origem_legada = (
      'Importação - '
      || lista.arquivo_nome
      || ' - '
      || to_char(
        lista.created_at at time zone 'UTC',
        'DD/MM/YYYY HH24:MI'
      )
    )
    then
      'Importação - '
      || lista.arquivo_nome
      || ' - '
      || to_char(
        lista.created_at at time zone 'America/Sao_Paulo',
        'DD/MM/YYYY HH24:MI'
      )
    else lista.origem_legada
  end,
  updated_at = now()
from public.contatos_lista_membros membro
join public.contatos_listas lista
  on lista.id = membro.lista_id
where membro.contato_id = contato.id
  and lista.empresa_id = contato.empresa_id
  and lista.origem_legada is not null
  and lista.arquivo_nome is not null
  and contato.origem like ('Importação - ' || lista.arquivo_nome || ' - %');
