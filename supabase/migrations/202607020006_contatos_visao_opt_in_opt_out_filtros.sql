create or replace function public.normalizar_telefone_whatsapp(p_telefone text)
returns text
language plpgsql
immutable
parallel safe
as $$
declare
  v_telefone text := regexp_replace(
    coalesce(p_telefone, ''),
    '[^0-9]',
    '',
    'g'
  );
begin
  if v_telefone = '' then
    return '';
  end if;

  if v_telefone like '00%' then
    v_telefone := substring(v_telefone from 3);
  end if;

  if length(v_telefone) >= 12 and v_telefone like '0%' then
    v_telefone := substring(v_telefone from 4);
  end if;

  if v_telefone not like '55%'
    and length(v_telefone) in (10, 11) then
    v_telefone := '55' || v_telefone;
  end if;

  if v_telefone like '55%' and length(v_telefone) = 12 then
    v_telefone :=
      substring(v_telefone from 1 for 4)
      || '9'
      || substring(v_telefone from 5);
  end if;

  return v_telefone;
end;
$$;

create index if not exists conversas_empresa_contato_com_entrada_idx
  on public.conversas (empresa_id, contato_id)
  where last_inbound_message_at is not null;

create or replace view public.contatos_visao_operacional
with (security_invoker = true)
as
select
  ct.id,
  ct.empresa_id,
  ct.nome,
  ct.whatsapp_profile_name,
  ct.telefone,
  ct.email,
  ct.origem,
  ct.campanha,
  ct.rastreamento_origem_id,
  ct.rastreamento_campanha_id,
  ct.rastreamento_link_id,
  ct.rastreamento_clique_id,
  ct.observacoes,
  ct.telefone_revisar,
  ct.classificacao,
  ct.classificacao_atualizada_em,
  ct.classificacao_evento_id,
  ct.classificacao_protocolo_id,
  ct.created_at,
  ct.updated_at,
  public.contato_eh_novo(ct.created_at) as contato_novo,
  coalesce(rc.nome, ct.campanha) as campanha_exibicao,
  rc.status as campanha_status,
  ro.nome as campanha_origem_nome,
  cv.id as conversa_id,
  cv.status as conversa_status,
  cv.last_message_at as conversa_ultima_mensagem_em,
  cv.closed_at as conversa_encerrada_em,
  cp.protocolo as protocolo_atual,
  cp.resultado as protocolo_resultado,
  cp.contato_novo_no_inicio,
  cp.iniciado_com_bot,
  cp.finalizado_com_bot,
  cp.finalizado_por_tipo,
  cp.finalizado_por_usuario_id,
  usuario_finalizador.nome as finalizado_por_usuario_nome,
  telefone_normalizado.valor as telefone_normalizado,
  coalesce(ro.nome, ct.origem) as origem_exibicao,
  exists (
    select 1
    from public.conversas conversa_opt_in
    where conversa_opt_in.empresa_id = ct.empresa_id
      and conversa_opt_in.contato_id = ct.id
      and conversa_opt_in.last_inbound_message_at is not null
  ) as opt_in_whatsapp,
  coalesce(supressao.opt_out_geral, false) as whatsapp_opt_out_geral,
  (
    coalesce(supressao.opt_out_geral, false)
    or coalesce(supressao.opt_out_marketing, false)
  ) as whatsapp_opt_out_marketing,
  (
    coalesce(supressao.opt_out_geral, false)
    or coalesce(supressao.opt_out_utility, false)
  ) as whatsapp_opt_out_utility,
  (
    coalesce(supressao.opt_out_geral, false)
    or coalesce(supressao.opt_out_marketing, false)
    or coalesce(supressao.opt_out_utility, false)
  ) as whatsapp_opt_out
from public.contatos ct
left join public.rastreamento_campanhas rc
  on rc.id = ct.rastreamento_campanha_id
left join public.rastreamento_origens ro
  on ro.id = coalesce(rc.origem_id, ct.rastreamento_origem_id)
left join lateral (
  select
    conversa.id,
    conversa.status,
    conversa.last_message_at,
    conversa.closed_at
  from public.conversas conversa
  where conversa.empresa_id = ct.empresa_id
    and conversa.contato_id = ct.id
  order by
    case
      when conversa.status in (
        'aberta',
        'bot',
        'fila',
        'em_atendimento',
        'aguardando_cliente'
      ) then 0
      else 1
    end,
    conversa.last_message_at desc nulls last,
    conversa.created_at desc
  limit 1
) cv on true
left join lateral (
  select
    protocolo.protocolo,
    protocolo.resultado,
    protocolo.contato_novo_no_inicio,
    protocolo.iniciado_com_bot,
    protocolo.finalizado_com_bot,
    protocolo.finalizado_por_tipo,
    protocolo.finalizado_por_usuario_id
  from public.conversa_protocolos protocolo
  where protocolo.empresa_id = ct.empresa_id
    and protocolo.contato_id = ct.id
  order by
    coalesce(protocolo.started_at, protocolo.created_at) desc,
    protocolo.created_at desc
  limit 1
) cp on true
left join public.usuarios usuario_finalizador
  on usuario_finalizador.id = cp.finalizado_por_usuario_id
left join lateral (
  select public.normalizar_telefone_whatsapp(ct.telefone) as valor
) telefone_normalizado on true
left join lateral (
  select
    bool_or(supressao_item.escopo = 'todos_disparos') as opt_out_geral,
    bool_or(supressao_item.escopo = 'marketing') as opt_out_marketing,
    bool_or(supressao_item.escopo = 'utility') as opt_out_utility
  from public.whatsapp_supressoes supressao_item
  where supressao_item.empresa_id = ct.empresa_id
    and supressao_item.telefone_normalizado = telefone_normalizado.valor
    and supressao_item.ativo = true
) supressao on true;

create or replace function public.listar_opcoes_filtros_contatos(
  p_empresa_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with origens as (
    select nullif(btrim(contato.origem), '') as nome
    from public.contatos contato
    where contato.empresa_id = p_empresa_id

    union

    select nullif(btrim(origem.nome), '') as nome
    from public.rastreamento_origens origem
    where origem.empresa_id = p_empresa_id
  ),
  campanhas as (
    select nullif(btrim(contato.campanha), '') as nome
    from public.contatos contato
    where contato.empresa_id = p_empresa_id

    union

    select nullif(btrim(campanha.nome), '') as nome
    from public.rastreamento_campanhas campanha
    where campanha.empresa_id = p_empresa_id
  )
  select jsonb_build_object(
    'origens',
    coalesce(
      (
        select jsonb_agg(origem.nome order by origem.nome)
        from origens origem
        where origem.nome is not null
      ),
      '[]'::jsonb
    ),
    'campanhas',
    coalesce(
      (
        select jsonb_agg(campanha.nome order by campanha.nome)
        from campanhas campanha
        where campanha.nome is not null
      ),
      '[]'::jsonb
    ),
    'campanhas_rastreamento',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', campanha.id,
            'nome', campanha.nome,
            'codigo', campanha.codigo,
            'status', campanha.status,
            'origem_id', campanha.origem_id,
            'rastreamento_origens',
              case
                when origem.id is null then null
                else jsonb_build_object(
                  'id', origem.id,
                  'nome', origem.nome
                )
              end
          )
          order by campanha.created_at desc
        )
        from public.rastreamento_campanhas campanha
        left join public.rastreamento_origens origem
          on origem.id = campanha.origem_id
        where campanha.empresa_id = p_empresa_id
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.listar_opcoes_filtros_contatos(uuid)
  from public, anon, authenticated;

grant execute on function public.listar_opcoes_filtros_contatos(uuid)
  to service_role;
