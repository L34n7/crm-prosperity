create or replace function public.relatorio_whatsapp_disparo_campanha(
  p_empresa_id uuid,
  p_campanha_id uuid
)
returns table (
  numero text,
  nome_contato text,
  status_disparo text,
  situacao text,
  primeira_resposta text,
  enviado_em timestamptz,
  resposta_em timestamptz,
  status_mensagem text,
  erro text
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with itens as (
    select
      i.id,
      i.empresa_id,
      i.integracao_whatsapp_id,
      i.campanha_id,
      i.contato_id,
      i.conversa_id,
      i.numero,
      i.telefone_normalizado,
      coalesce(nullif(i.nome_contato, ''), nullif(c.nome, ''), 'Sem nome') as nome_contato,
      i.status,
      i.erro,
      i.created_at,
      i.updated_at,
      i.processed_at,
      i.message_id,
      m.status_envio as status_mensagem,
      coalesce(m.created_at, i.processed_at, i.updated_at, i.created_at) as enviado_em
    from public.whatsapp_disparo_itens i
    left join public.contatos c
      on c.id = i.contato_id
     and c.empresa_id = i.empresa_id
    left join public.mensagens m
      on m.empresa_id = i.empresa_id
     and m.mensagem_externa_id = i.message_id
    where i.empresa_id = p_empresa_id
      and i.campanha_id = p_campanha_id
  ),
  itens_com_proximo as (
    select
      i.*,
      (
        select min(
          coalesce(mn.created_at, n.processed_at, n.updated_at, n.created_at)
        )
        from public.whatsapp_disparo_itens n
        left join public.mensagens mn
          on mn.empresa_id = n.empresa_id
         and mn.mensagem_externa_id = n.message_id
        where n.empresa_id = i.empresa_id
          and n.integracao_whatsapp_id = i.integracao_whatsapp_id
          and n.telefone_normalizado = i.telefone_normalizado
          and n.id <> i.id
          and n.status = 'enviado'
          and coalesce(mn.created_at, n.processed_at, n.updated_at, n.created_at)
              > i.enviado_em
      ) as proximo_disparo_em
    from itens i
  )
  select
    i.numero,
    i.nome_contato,
    i.status as status_disparo,
    case
      when i.status in ('falha', 'cancelado')
        or coalesce(i.status_mensagem, '') = 'falha'
        then 'Recusado'
      when resposta.id is not null
        then 'Respondido'
      when coalesce(i.status_mensagem, '') = 'lida'
        then 'Lido'
      else 'Sem resposta'
    end as situacao,
    resposta.conteudo as primeira_resposta,
    i.enviado_em,
    resposta.created_at as resposta_em,
    i.status_mensagem,
    i.erro
  from itens_com_proximo i
  left join lateral (
    select
      msg.id,
      msg.conteudo,
      msg.created_at
    from public.mensagens msg
    where i.status = 'enviado'
      and i.conversa_id is not null
      and msg.empresa_id = i.empresa_id
      and msg.conversa_id = i.conversa_id
      and (msg.remetente_tipo = 'contato' or msg.origem = 'recebida')
      and msg.created_at > i.enviado_em
      and (
        i.proximo_disparo_em is null
        or msg.created_at < i.proximo_disparo_em
      )
    order by msg.created_at asc
    limit 1
  ) resposta on true
  order by i.enviado_em asc, i.numero asc;
$$;

revoke all on function public.relatorio_whatsapp_disparo_campanha(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.relatorio_whatsapp_disparo_campanha(uuid, uuid)
  to service_role;

comment on function public.relatorio_whatsapp_disparo_campanha(uuid, uuid) is
  'Retorna os contatos de uma campanha com status do disparo, situacao de leitura/resposta e primeira resposta recebida antes do proximo disparo para o mesmo numero.';
