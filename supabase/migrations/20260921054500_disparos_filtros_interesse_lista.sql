create or replace function public.listar_opcoes_filtros_contatos(p_empresa_id uuid)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
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
  ),
  interesses as (
    select distinct nullif(btrim(contato.interesse), '') as nome
    from public.contatos contato
    where contato.empresa_id = p_empresa_id
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
    'interesses',
    coalesce(
      (
        select jsonb_agg(interesse.nome order by interesse.nome)
        from interesses interesse
        where interesse.nome is not null
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
$function$;

create or replace function public.listar_contatos_operacionais_contexto_filtros_disparo(
  p_empresa_id uuid,
  p_integracao_whatsapp_id uuid default null,
  p_mensagem_data_inicio date default null,
  p_mensagem_data_fim date default null,
  p_ultimo_atendente_id uuid default null,
  p_filtrar_por_integracao boolean default false,
  p_lista_id uuid default null,
  p_lista_compartilhada_id uuid default null,
  p_campanha_id uuid default null
)
returns table(
  id uuid,
  empresa_id uuid,
  nome text,
  whatsapp_profile_name text,
  telefone text,
  email text,
  origem text,
  campanha text,
  campo_contato text,
  interesse text,
  rastreamento_origem_id uuid,
  rastreamento_campanha_id uuid,
  rastreamento_link_id uuid,
  rastreamento_clique_id uuid,
  observacoes text,
  telefone_revisar boolean,
  classificacao text,
  classificacao_atualizada_em timestamptz,
  classificacao_evento_id uuid,
  classificacao_protocolo_id uuid,
  contato_novo boolean,
  campanha_exibicao text,
  campanha_status text,
  campanha_origem_nome text,
  telefone_normalizado text,
  origem_exibicao text,
  opt_in_whatsapp boolean,
  whatsapp_opt_out boolean,
  whatsapp_opt_out_geral boolean,
  whatsapp_opt_out_marketing boolean,
  whatsapp_opt_out_utility boolean,
  conversa_id uuid,
  conversa_status text,
  conversa_ultima_mensagem_em timestamptz,
  conversa_encerrada_em timestamptz,
  protocolo_atual text,
  protocolo_resultado text,
  contato_novo_no_inicio boolean,
  iniciado_com_bot boolean,
  finalizado_com_bot boolean,
  finalizado_por_tipo text,
  finalizado_por_usuario_id uuid,
  finalizado_por_usuario_nome text,
  created_at timestamptz,
  updated_at timestamptz,
  contexto_integracao_whatsapp_id uuid,
  contexto_integracao_nome text,
  contexto_integracao_numero text,
  ultima_mensagem_contato_em timestamptz,
  ultimo_atendente_id uuid,
  ultimo_atendente_nome text
)
language sql
stable
set search_path to 'public'
as $function$
  select
    base.id,
    base.empresa_id,
    base.nome,
    base.whatsapp_profile_name,
    base.telefone,
    base.email,
    base.origem,
    base.campanha,
    base.campo_contato,
    contato.interesse,
    base.rastreamento_origem_id,
    base.rastreamento_campanha_id,
    base.rastreamento_link_id,
    base.rastreamento_clique_id,
    base.observacoes,
    base.telefone_revisar,
    base.classificacao,
    base.classificacao_atualizada_em,
    base.classificacao_evento_id,
    base.classificacao_protocolo_id,
    base.contato_novo,
    base.campanha_exibicao,
    base.campanha_status,
    base.campanha_origem_nome,
    base.telefone_normalizado,
    base.origem_exibicao,
    base.opt_in_whatsapp,
    base.whatsapp_opt_out,
    base.whatsapp_opt_out_geral,
    base.whatsapp_opt_out_marketing,
    base.whatsapp_opt_out_utility,
    base.conversa_id,
    base.conversa_status,
    base.conversa_ultima_mensagem_em,
    base.conversa_encerrada_em,
    base.protocolo_atual,
    base.protocolo_resultado,
    base.contato_novo_no_inicio,
    base.iniciado_com_bot,
    base.finalizado_com_bot,
    base.finalizado_por_tipo,
    base.finalizado_por_usuario_id,
    base.finalizado_por_usuario_nome,
    base.created_at,
    base.updated_at,
    base.contexto_integracao_whatsapp_id,
    base.contexto_integracao_nome,
    base.contexto_integracao_numero,
    base.ultima_mensagem_contato_em,
    base.ultimo_atendente_id,
    base.ultimo_atendente_nome
  from public.listar_contatos_operacionais_contexto(
    p_empresa_id,
    p_integracao_whatsapp_id,
    p_mensagem_data_inicio,
    p_mensagem_data_fim,
    p_ultimo_atendente_id,
    p_filtrar_por_integracao
  ) base
  join public.contatos contato
    on contato.id = base.id
   and contato.empresa_id = p_empresa_id
  where (
    p_lista_id is null
    or exists (
      select 1
      from public.contatos_lista_membros membro
      join public.contatos_listas lista
        on lista.id = membro.lista_id
      where membro.lista_id = p_lista_id
        and membro.contato_id = base.id
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
        and membro.contato_id = base.id
        and membro.empresa_id = p_empresa_id
        and lista.empresa_id = p_empresa_id
    )
  )
  and (
    p_campanha_id is null
    or exists (
      select 1
      from public.whatsapp_disparo_itens item
      where item.empresa_id = p_empresa_id
        and item.campanha_id = p_campanha_id
        and item.status = 'enviado'
        and (
          item.contato_id = base.id
          or (
            item.contato_id is null
            and coalesce(base.telefone_normalizado, '') <> ''
            and item.telefone_normalizado = base.telefone_normalizado
          )
        )
    )
  );
$function$;

revoke all on function public.listar_contatos_operacionais_contexto_filtros_disparo(
  uuid, uuid, date, date, uuid, boolean, uuid, uuid, uuid
) from public, anon, authenticated;

grant execute on function public.listar_contatos_operacionais_contexto_filtros_disparo(
  uuid, uuid, date, date, uuid, boolean, uuid, uuid, uuid
) to service_role;
