update public.contatos contato
set
  origem =
    'Importação - '
    || lista.arquivo_nome
    || ' - '
    || to_char(
      lista.created_at at time zone 'America/Sao_Paulo',
      'DD/MM/YYYY HH24:MI'
    ),
  updated_at = now()
from public.contatos_listas lista
where lista.empresa_id = contato.empresa_id
  and lista.origem_legada is not null
  and lista.arquivo_nome is not null
  and contato.origem = lista.origem_legada
  and contato.origem is distinct from (
    'Importação - '
    || lista.arquivo_nome
    || ' - '
    || to_char(
      lista.created_at at time zone 'America/Sao_Paulo',
      'DD/MM/YYYY HH24:MI'
    )
  );
