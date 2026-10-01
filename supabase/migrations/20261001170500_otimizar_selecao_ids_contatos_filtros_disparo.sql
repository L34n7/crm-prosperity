-- Seleciona IDs de contatos com filtros de disparo sem materializar contexto
-- de conversa/protocolo para toda a empresa. O enriquecimento acontece depois
-- somente para a página selecionada.

create or replace function public.selecionar_ids_contatos_disparo_paginados(
  p_empresa_id uuid,
  p_busca text default null,
  p_origem text default null,
  p_interesse text default null,
  p_lista_id uuid default null,
  p_lista_compartilhada_id uuid default null,
  p_campanha text default null,
  p_rastreamento_campanha_id uuid default null,
  p_disparo_anterior_id uuid default null,
  p_classificacoes text[] default null,
  p_novos_desde timestamptz default null,
  p_telefone_revisar boolean default null,
  p_ordenacao text default 'recentes',
  p_offset integer default 0,
  p_limite integer default 500
)
returns table(
  id uuid,
  total bigint
)
language sql
stable
set work_mem = '12MB'
as $$
  with base as (
    select
      contato.id,
      contato.created_at,
      contato.nome
    from public.contatos contato
    left join public.rastreamento_campanhas campanha_rastreamento
      on campanha_rastreamento.id = contato.rastreamento_campanha_id
    left join public.rastreamento_origens origem_rastreamento
      on origem_rastreamento.id = coalesce(
        campanha_rastreamento.origem_id,
        contato.rastreamento_origem_id
      )
    where contato.empresa_id = p_empresa_id
      and (
        p_interesse is null
        or btrim(p_interesse) = ''
        or contato.interesse = p_interesse
      )
      and (
        coalesce(array_length(p_classificacoes, 1), 0) = 0
        or contato.classificacao = any(p_classificacoes)
      )
      and (
        p_novos_desde is null
        or contato.created_at >= p_novos_desde
      )
      and (
        p_telefone_revisar is null
        or contato.telefone_revisar = p_telefone_revisar
      )
      and (
        p_lista_id is null
        or exists (
          select 1
          from public.contatos_lista_membros membro
          join public.contatos_listas lista
            on lista.id = membro.lista_id
          where membro.lista_id = p_lista_id
            and membro.contato_id = contato.id
            and lista.empresa_id = p_empresa_id
        )
      )
      and (
        p_lista_compartilhada_id is null
        or exists (
          select 1
          from public.conversas_listas_contatos membro
          join public.conversas_listas lista
            on lista.id = membro.lista_id
          where membro.lista_id = p_lista_compartilhada_id
            and membro.contato_id = contato.id
            and membro.empresa_id = p_empresa_id
            and lista.empresa_id = p_empresa_id
        )
      )
      and (
        p_disparo_anterior_id is null
        or exists (
          select 1
          from public.whatsapp_disparo_itens item
          where item.empresa_id = p_empresa_id
            and item.campanha_id = p_disparo_anterior_id
            and item.status = 'enviado'
            and (
              item.contato_id = contato.id
              or (
                item.contato_id is null
                and item.telefone_normalizado =
                  public.normalizar_telefone_whatsapp(contato.telefone)
              )
            )
        )
      )
      and (
        p_origem is null
        or btrim(p_origem) = ''
        or coalesce(origem_rastreamento.nome, contato.origem) = p_origem
      )
      and (
        p_rastreamento_campanha_id is null
        or contato.rastreamento_campanha_id = p_rastreamento_campanha_id
      )
      and (
        p_rastreamento_campanha_id is not null
        or p_campanha is null
        or btrim(p_campanha) = ''
        or coalesce(campanha_rastreamento.nome, contato.campanha) = p_campanha
      )
      and (
        p_busca is null
        or btrim(p_busca) = ''
        or contato.nome ilike '%' || btrim(p_busca) || '%'
        or contato.whatsapp_profile_name ilike '%' || btrim(p_busca) || '%'
        or contato.email ilike '%' || btrim(p_busca) || '%'
        or contato.campo_contato ilike '%' || btrim(p_busca) || '%'
        or contato.interesse ilike '%' || btrim(p_busca) || '%'
        or coalesce(origem_rastreamento.nome, contato.origem) ilike '%' || btrim(p_busca) || '%'
        or coalesce(campanha_rastreamento.nome, contato.campanha) ilike '%' || btrim(p_busca) || '%'
        or contato.telefone ilike '%' || btrim(p_busca) || '%'
      )
  ),
  contado as (
    select
      base.*,
      count(*) over() as total
    from base
  )
  select contado.id, contado.total
  from contado
  order by
    case when p_ordenacao = 'antigos' then contado.created_at end asc nulls last,
    case when p_ordenacao = 'nome_asc' then contado.nome end asc nulls last,
    case when p_ordenacao = 'nome_desc' then contado.nome end desc nulls last,
    case
      when p_ordenacao not in ('antigos', 'nome_asc', 'nome_desc')
        then contado.created_at
    end desc nulls last,
    contado.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limite, 500), 1), 2000);
$$;
