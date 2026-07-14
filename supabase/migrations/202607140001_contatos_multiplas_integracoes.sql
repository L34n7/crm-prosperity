create index if not exists conversas_empresa_contato_integracao_ultima_idx
  on public.conversas (
    empresa_id,
    contato_id,
    integracao_whatsapp_id,
    last_message_at desc
  );

create index if not exists conversas_empresa_contato_integracao_anterior_idx
  on public.conversas (
    empresa_id,
    contato_id,
    integracao_whatsapp_id_anterior,
    last_message_at desc
  )
  where integracao_whatsapp_id_anterior is not null;

create index if not exists whatsapp_coex_contatos_contexto_ativo_idx
  on public.whatsapp_coex_contatos (
    empresa_id,
    integracao_whatsapp_id,
    contato_id
  )
  where acao_ultima <> 'remove' and removido_em is null;

create index if not exists mensagens_contato_conversa_data_idx
  on public.mensagens (empresa_id, conversa_id, created_at desc)
  where remetente_tipo = 'contato';

create index if not exists conversas_contato_integracao_ultima_entrada_idx
  on public.conversas (
    empresa_id,
    contato_id,
    integracao_whatsapp_id,
    last_inbound_message_at desc
  )
  where last_inbound_message_at is not null;

create index if not exists conversa_protocolos_conversa_ultimo_idx
  on public.conversa_protocolos (
    empresa_id,
    conversa_id,
    started_at desc,
    created_at desc
  );

create or replace function public.listar_contatos_operacionais_contexto(
  p_empresa_id uuid,
  p_integracao_whatsapp_id uuid default null,
  p_mensagem_data_inicio date default null,
  p_mensagem_data_fim date default null,
  p_ultimo_atendente_id uuid default null,
  p_filtrar_por_integracao boolean default false
)
returns table (
  id uuid,
  empresa_id uuid,
  nome text,
  whatsapp_profile_name text,
  telefone text,
  email text,
  origem text,
  campanha text,
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
  contexto_integracao_whatsapp_id uuid,
  contexto_integracao_nome text,
  contexto_integracao_numero text,
  ultima_mensagem_contato_em timestamptz,
  ultimo_atendente_id uuid,
  ultimo_atendente_nome text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    contato.id,
    contato.empresa_id,
    contato.nome,
    contato.whatsapp_profile_name,
    contato.telefone,
    contato.email,
    contato.origem,
    contato.campanha,
    contato.rastreamento_origem_id,
    contato.rastreamento_campanha_id,
    contato.rastreamento_link_id,
    contato.rastreamento_clique_id,
    contato.observacoes,
    contato.telefone_revisar,
    contato.classificacao,
    contato.classificacao_atualizada_em,
    contato.classificacao_evento_id,
    contato.classificacao_protocolo_id,
    public.contato_eh_novo(contato.created_at) as contato_novo,
    coalesce(campanha_rastreamento.nome, contato.campanha) as campanha_exibicao,
    campanha_rastreamento.status as campanha_status,
    origem_rastreamento.nome as campanha_origem_nome,
    telefone_contexto.valor as telefone_normalizado,
    coalesce(origem_rastreamento.nome, contato.origem) as origem_exibicao,
    case
      when p_integracao_whatsapp_id is null then null
      else exists (
        select 1
        from public.whatsapp_contatos_opt_in_numeros opt_in
        where opt_in.empresa_id = contato.empresa_id
          and opt_in.contato_id = contato.id
          and opt_in.telefone_normalizado = telefone_contexto.valor
          and opt_in.ativo = true
          and (
            opt_in.integracao_whatsapp_id = p_integracao_whatsapp_id
            or (
              integracao_contexto.phone_number_id is not null
              and opt_in.phone_number_id = integracao_contexto.phone_number_id
            )
          )
      )
    end as opt_in_whatsapp,
    (
      coalesce(supressao.opt_out_geral, false)
      or coalesce(supressao.opt_out_marketing, false)
      or coalesce(supressao.opt_out_utility, false)
    ) as whatsapp_opt_out,
    coalesce(supressao.opt_out_geral, false) as whatsapp_opt_out_geral,
    (
      coalesce(supressao.opt_out_geral, false)
      or coalesce(supressao.opt_out_marketing, false)
    ) as whatsapp_opt_out_marketing,
    (
      coalesce(supressao.opt_out_geral, false)
      or coalesce(supressao.opt_out_utility, false)
    ) as whatsapp_opt_out_utility,
    conversa_contexto.id as conversa_id,
    conversa_contexto.status as conversa_status,
    conversa_contexto.last_message_at as conversa_ultima_mensagem_em,
    conversa_contexto.closed_at as conversa_encerrada_em,
    protocolo_contexto.protocolo as protocolo_atual,
    protocolo_contexto.resultado as protocolo_resultado,
    protocolo_contexto.contato_novo_no_inicio,
    protocolo_contexto.iniciado_com_bot,
    protocolo_contexto.finalizado_com_bot,
    protocolo_contexto.finalizado_por_tipo,
    protocolo_contexto.finalizado_por_usuario_id,
    usuario_finalizador.nome as finalizado_por_usuario_nome,
    integracao_contexto.id as contexto_integracao_whatsapp_id,
    integracao_contexto.nome_conexao as contexto_integracao_nome,
    integracao_contexto.numero as contexto_integracao_numero,
    interacao_contexto.ultima_mensagem_contato_em,
    coalesce(
      conversa_contexto.responsavel_id,
      protocolo_contexto.finalizado_por_usuario_id
    ) as ultimo_atendente_id,
    usuario_atendente.nome as ultimo_atendente_nome,
    contato.created_at,
    contato.updated_at
  from public.contatos contato
  join public.empresas empresa
    on empresa.id = contato.empresa_id
  left join public.rastreamento_campanhas campanha_rastreamento
    on campanha_rastreamento.id = contato.rastreamento_campanha_id
  left join public.rastreamento_origens origem_rastreamento
    on origem_rastreamento.id = coalesce(
      campanha_rastreamento.origem_id,
      contato.rastreamento_origem_id
    )
  left join public.integracoes_whatsapp integracao_contexto
    on integracao_contexto.id = p_integracao_whatsapp_id
    and integracao_contexto.empresa_id = contato.empresa_id
  left join lateral (
    select public.normalizar_telefone_whatsapp(contato.telefone) as valor
  ) telefone_contexto on true
  left join lateral (
    select
      conversa.id,
      conversa.status,
      conversa.last_message_at,
      conversa.closed_at,
      conversa.responsavel_id
    from public.conversas conversa
    where conversa.empresa_id = contato.empresa_id
      and conversa.contato_id = contato.id
      and (
        p_integracao_whatsapp_id is null
        or conversa.integracao_whatsapp_id = p_integracao_whatsapp_id
        or conversa.integracao_whatsapp_id_anterior = p_integracao_whatsapp_id
      )
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
  ) conversa_contexto on true
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
    where protocolo.empresa_id = contato.empresa_id
      and protocolo.conversa_id = conversa_contexto.id
    order by
      coalesce(protocolo.started_at, protocolo.created_at) desc,
      protocolo.created_at desc
    limit 1
  ) protocolo_contexto on true
  left join public.usuarios usuario_finalizador
    on usuario_finalizador.id = protocolo_contexto.finalizado_por_usuario_id
  left join public.usuarios usuario_atendente
    on usuario_atendente.id = coalesce(
      conversa_contexto.responsavel_id,
      protocolo_contexto.finalizado_por_usuario_id
    )
  left join lateral (
    select max(
      conversa_interacao.last_inbound_message_at
    ) as ultima_mensagem_contato_em
    from public.conversas conversa_interacao
    where conversa_interacao.empresa_id = contato.empresa_id
      and conversa_interacao.contato_id = contato.id
      and conversa_interacao.last_inbound_message_at is not null
      and (
        p_integracao_whatsapp_id is null
        or conversa_interacao.integracao_whatsapp_id = p_integracao_whatsapp_id
        or conversa_interacao.integracao_whatsapp_id_anterior = p_integracao_whatsapp_id
      )
  ) interacao_contexto on true
  left join lateral (
    select
      bool_or(supressao_item.escopo = 'todos_disparos') as opt_out_geral,
      bool_or(supressao_item.escopo = 'marketing') as opt_out_marketing,
      bool_or(supressao_item.escopo = 'utility') as opt_out_utility
    from public.whatsapp_supressoes supressao_item
    where supressao_item.empresa_id = contato.empresa_id
      and supressao_item.telefone_normalizado = telefone_contexto.valor
      and supressao_item.ativo = true
  ) supressao on true
  where contato.empresa_id = p_empresa_id
    and (
      not coalesce(p_filtrar_por_integracao, false)
      or p_integracao_whatsapp_id is null
      or conversa_contexto.id is not null
      or exists (
        select 1
        from public.whatsapp_coex_contatos contato_coex
        where contato_coex.empresa_id = contato.empresa_id
          and contato_coex.contato_id = contato.id
          and contato_coex.integracao_whatsapp_id = p_integracao_whatsapp_id
          and contato_coex.acao_ultima <> 'remove'
          and contato_coex.removido_em is null
      )
      or exists (
        select 1
        from public.whatsapp_contatos_opt_in_numeros opt_in_associacao
        where opt_in_associacao.empresa_id = contato.empresa_id
          and opt_in_associacao.contato_id = contato.id
          and opt_in_associacao.ativo = true
          and (
            opt_in_associacao.integracao_whatsapp_id = p_integracao_whatsapp_id
            or (
              integracao_contexto.phone_number_id is not null
              and opt_in_associacao.phone_number_id = integracao_contexto.phone_number_id
            )
          )
      )
    )
    and (
      (p_mensagem_data_inicio is null and p_mensagem_data_fim is null)
      or exists (
        select 1
        from public.conversas conversa_periodo
        join public.mensagens mensagem_periodo
          on mensagem_periodo.empresa_id = conversa_periodo.empresa_id
          and mensagem_periodo.conversa_id = conversa_periodo.id
          and mensagem_periodo.remetente_tipo = 'contato'
        where conversa_periodo.empresa_id = contato.empresa_id
          and conversa_periodo.contato_id = contato.id
          and (
            p_integracao_whatsapp_id is null
            or conversa_periodo.integracao_whatsapp_id = p_integracao_whatsapp_id
            or conversa_periodo.integracao_whatsapp_id_anterior = p_integracao_whatsapp_id
          )
          and (
            p_mensagem_data_inicio is null
            or mensagem_periodo.created_at >= (
              p_mensagem_data_inicio::timestamp
              at time zone coalesce(empresa.timezone, 'America/Sao_Paulo')
            )
          )
          and (
            p_mensagem_data_fim is null
            or mensagem_periodo.created_at < (
              (p_mensagem_data_fim + 1)::timestamp
              at time zone coalesce(empresa.timezone, 'America/Sao_Paulo')
            )
          )
      )
    )
    and (
      p_ultimo_atendente_id is null
      or coalesce(
        conversa_contexto.responsavel_id,
        protocolo_contexto.finalizado_por_usuario_id
      ) = p_ultimo_atendente_id
    );
$$;

comment on function public.listar_contatos_operacionais_contexto(
  uuid,
  uuid,
  date,
  date,
  uuid,
  boolean
) is
  'Lista contatos no contexto de uma integracao WhatsApp e filtra mensagens recebidas e ultimo atendente sem duplicar contatos.';

revoke all on function public.listar_contatos_operacionais_contexto(
  uuid,
  uuid,
  date,
  date,
  uuid,
  boolean
) from public, anon, authenticated;

grant execute on function public.listar_contatos_operacionais_contexto(
  uuid,
  uuid,
  date,
  date,
  uuid,
  boolean
) to service_role;
