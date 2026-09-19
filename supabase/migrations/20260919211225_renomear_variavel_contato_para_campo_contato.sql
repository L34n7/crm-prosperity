drop function if exists public.listar_contatos_operacionais_contexto_disparo_anterior_lista(uuid, uuid, uuid, uuid, date, date, uuid, boolean);
drop function if exists public.listar_contatos_operacionais_contexto_lista(uuid, uuid, uuid, date, date, uuid, boolean);
drop function if exists public.listar_contatos_operacionais_contexto_disparo_anterior(uuid, uuid, uuid, date, date, uuid, boolean);
drop function if exists public.listar_contatos_operacionais_contexto(uuid, uuid, date, date, uuid, boolean);

alter table public.contatos rename column variavel_contato to campo_contato;
alter table public.contatos rename column variavel_contato_base to campo_contato_base;
alter table public.contatos_lista_membros rename column variavel_contato to campo_contato;

comment on column public.contatos.campo_contato is
  'Campo individual do contato, usado como valor efetivo em filtros e disparos.';
comment on column public.contatos.campo_contato_base is
  'Valor manual/base do campo do contato, usado como fallback quando não existe valor ativo em listas.';
comment on column public.contatos_lista_membros.campo_contato is
  'Valor do campo individual do contato especificamente nesta lista/importação.';

CREATE OR REPLACE FUNCTION public.listar_contatos_operacionais_contexto(p_empresa_id uuid, p_integracao_whatsapp_id uuid DEFAULT NULL::uuid, p_mensagem_data_inicio date DEFAULT NULL::date, p_mensagem_data_fim date DEFAULT NULL::date, p_ultimo_atendente_id uuid DEFAULT NULL::uuid, p_filtrar_por_integracao boolean DEFAULT false)
 RETURNS TABLE(id uuid, empresa_id uuid, nome text, whatsapp_profile_name text, telefone text, email text, origem text, campanha text, campo_contato text, rastreamento_origem_id uuid, rastreamento_campanha_id uuid, rastreamento_link_id uuid, rastreamento_clique_id uuid, observacoes text, telefone_revisar boolean, classificacao text, classificacao_atualizada_em timestamp with time zone, classificacao_evento_id uuid, classificacao_protocolo_id uuid, contato_novo boolean, campanha_exibicao text, campanha_status text, campanha_origem_nome text, telefone_normalizado text, origem_exibicao text, opt_in_whatsapp boolean, whatsapp_opt_out boolean, whatsapp_opt_out_geral boolean, whatsapp_opt_out_marketing boolean, whatsapp_opt_out_utility boolean, conversa_id uuid, conversa_status text, conversa_ultima_mensagem_em timestamp with time zone, conversa_encerrada_em timestamp with time zone, protocolo_atual text, protocolo_resultado text, contato_novo_no_inicio boolean, iniciado_com_bot boolean, finalizado_com_bot boolean, finalizado_por_tipo text, finalizado_por_usuario_id uuid, finalizado_por_usuario_nome text, contexto_integracao_whatsapp_id uuid, contexto_integracao_nome text, contexto_integracao_numero text, ultima_mensagem_contato_em timestamp with time zone, ultimo_atendente_id uuid, ultimo_atendente_nome text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    contato.id,
    contato.empresa_id,
    contato.nome,
    contato.whatsapp_profile_name,
    contato.telefone,
    contato.email,
    contato.origem,
    contato.campanha,
    contato.campo_contato,
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
$function$
;
CREATE OR REPLACE FUNCTION public.listar_contatos_operacionais_contexto_disparo_anterior(p_empresa_id uuid, p_campanha_id uuid, p_integracao_whatsapp_id uuid DEFAULT NULL::uuid, p_mensagem_data_inicio date DEFAULT NULL::date, p_mensagem_data_fim date DEFAULT NULL::date, p_ultimo_atendente_id uuid DEFAULT NULL::uuid, p_filtrar_por_integracao boolean DEFAULT false)
 RETURNS TABLE(id uuid, empresa_id uuid, nome text, whatsapp_profile_name text, telefone text, email text, origem text, campanha text, campo_contato text, rastreamento_origem_id uuid, rastreamento_campanha_id uuid, rastreamento_link_id uuid, rastreamento_clique_id uuid, observacoes text, telefone_revisar boolean, classificacao text, classificacao_atualizada_em timestamp with time zone, classificacao_evento_id uuid, classificacao_protocolo_id uuid, contato_novo boolean, campanha_exibicao text, campanha_status text, campanha_origem_nome text, telefone_normalizado text, origem_exibicao text, opt_in_whatsapp boolean, whatsapp_opt_out boolean, whatsapp_opt_out_geral boolean, whatsapp_opt_out_marketing boolean, whatsapp_opt_out_utility boolean, conversa_id uuid, conversa_status text, conversa_ultima_mensagem_em timestamp with time zone, conversa_encerrada_em timestamp with time zone, protocolo_atual text, protocolo_resultado text, contato_novo_no_inicio boolean, iniciado_com_bot boolean, finalizado_com_bot boolean, finalizado_por_tipo text, finalizado_por_usuario_id uuid, finalizado_por_usuario_nome text, contexto_integracao_whatsapp_id uuid, contexto_integracao_nome text, contexto_integracao_numero text, ultima_mensagem_contato_em timestamp with time zone, ultimo_atendente_id uuid, ultimo_atendente_nome text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select contexto.*
  from public.listar_contatos_operacionais_contexto(
    p_empresa_id,
    p_integracao_whatsapp_id,
    p_mensagem_data_inicio,
    p_mensagem_data_fim,
    p_ultimo_atendente_id,
    p_filtrar_por_integracao
  ) contexto
  where exists (
    select 1
    from public.whatsapp_disparo_itens item
    where item.empresa_id = p_empresa_id
      and item.campanha_id = p_campanha_id
      and item.status = 'enviado'
      and (
        item.contato_id = contexto.id
        or (
          item.contato_id is null
          and nullif(item.telefone_normalizado, '') is not null
          and item.telefone_normalizado = contexto.telefone_normalizado
        )
      )
  );
$function$
;
CREATE OR REPLACE FUNCTION public.listar_contatos_operacionais_contexto_lista(p_empresa_id uuid, p_lista_id uuid, p_integracao_whatsapp_id uuid DEFAULT NULL::uuid, p_mensagem_data_inicio date DEFAULT NULL::date, p_mensagem_data_fim date DEFAULT NULL::date, p_ultimo_atendente_id uuid DEFAULT NULL::uuid, p_filtrar_por_integracao boolean DEFAULT false)
 RETURNS TABLE(id uuid, empresa_id uuid, nome text, whatsapp_profile_name text, telefone text, email text, origem text, campanha text, campo_contato text, rastreamento_origem_id uuid, rastreamento_campanha_id uuid, rastreamento_link_id uuid, rastreamento_clique_id uuid, observacoes text, telefone_revisar boolean, classificacao text, classificacao_atualizada_em timestamp with time zone, classificacao_evento_id uuid, classificacao_protocolo_id uuid, contato_novo boolean, campanha_exibicao text, campanha_status text, campanha_origem_nome text, telefone_normalizado text, origem_exibicao text, opt_in_whatsapp boolean, whatsapp_opt_out boolean, whatsapp_opt_out_geral boolean, whatsapp_opt_out_marketing boolean, whatsapp_opt_out_utility boolean, conversa_id uuid, conversa_status text, conversa_ultima_mensagem_em timestamp with time zone, conversa_encerrada_em timestamp with time zone, protocolo_atual text, protocolo_resultado text, contato_novo_no_inicio boolean, iniciado_com_bot boolean, finalizado_com_bot boolean, finalizado_por_tipo text, finalizado_por_usuario_id uuid, finalizado_por_usuario_nome text, contexto_integracao_whatsapp_id uuid, contexto_integracao_nome text, contexto_integracao_numero text, ultima_mensagem_contato_em timestamp with time zone, ultimo_atendente_id uuid, ultimo_atendente_nome text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    contexto.id,
    contexto.empresa_id,
    contexto.nome,
    contexto.whatsapp_profile_name,
    contexto.telefone,
    contexto.email,
    contexto.origem,
    contexto.campanha,
    coalesce(membro.campo_contato, contexto.campo_contato) as campo_contato,
    contexto.rastreamento_origem_id,
    contexto.rastreamento_campanha_id,
    contexto.rastreamento_link_id,
    contexto.rastreamento_clique_id,
    contexto.observacoes,
    contexto.telefone_revisar,
    contexto.classificacao,
    contexto.classificacao_atualizada_em,
    contexto.classificacao_evento_id,
    contexto.classificacao_protocolo_id,
    contexto.contato_novo,
    contexto.campanha_exibicao,
    contexto.campanha_status,
    contexto.campanha_origem_nome,
    contexto.telefone_normalizado,
    contexto.origem_exibicao,
    contexto.opt_in_whatsapp,
    contexto.whatsapp_opt_out,
    contexto.whatsapp_opt_out_geral,
    contexto.whatsapp_opt_out_marketing,
    contexto.whatsapp_opt_out_utility,
    contexto.conversa_id,
    contexto.conversa_status,
    contexto.conversa_ultima_mensagem_em,
    contexto.conversa_encerrada_em,
    contexto.protocolo_atual,
    contexto.protocolo_resultado,
    contexto.contato_novo_no_inicio,
    contexto.iniciado_com_bot,
    contexto.finalizado_com_bot,
    contexto.finalizado_por_tipo,
    contexto.finalizado_por_usuario_id,
    contexto.finalizado_por_usuario_nome,
    contexto.contexto_integracao_whatsapp_id,
    contexto.contexto_integracao_nome,
    contexto.contexto_integracao_numero,
    contexto.ultima_mensagem_contato_em,
    contexto.ultimo_atendente_id,
    contexto.ultimo_atendente_nome,
    contexto.created_at,
    contexto.updated_at
  from public.listar_contatos_operacionais_contexto(
    p_empresa_id,
    p_integracao_whatsapp_id,
    p_mensagem_data_inicio,
    p_mensagem_data_fim,
    p_ultimo_atendente_id,
    p_filtrar_por_integracao
  ) contexto
  join public.contatos_lista_membros membro
    on membro.lista_id = p_lista_id
   and membro.contato_id = contexto.id
  join public.contatos_listas lista
    on lista.id = membro.lista_id
   and lista.empresa_id = p_empresa_id;
$function$
;
CREATE OR REPLACE FUNCTION public.listar_contatos_operacionais_contexto_disparo_anterior_lista(p_empresa_id uuid, p_campanha_id uuid, p_lista_id uuid, p_integracao_whatsapp_id uuid DEFAULT NULL::uuid, p_mensagem_data_inicio date DEFAULT NULL::date, p_mensagem_data_fim date DEFAULT NULL::date, p_ultimo_atendente_id uuid DEFAULT NULL::uuid, p_filtrar_por_integracao boolean DEFAULT false)
 RETURNS TABLE(id uuid, empresa_id uuid, nome text, whatsapp_profile_name text, telefone text, email text, origem text, campanha text, campo_contato text, rastreamento_origem_id uuid, rastreamento_campanha_id uuid, rastreamento_link_id uuid, rastreamento_clique_id uuid, observacoes text, telefone_revisar boolean, classificacao text, classificacao_atualizada_em timestamp with time zone, classificacao_evento_id uuid, classificacao_protocolo_id uuid, contato_novo boolean, campanha_exibicao text, campanha_status text, campanha_origem_nome text, telefone_normalizado text, origem_exibicao text, opt_in_whatsapp boolean, whatsapp_opt_out boolean, whatsapp_opt_out_geral boolean, whatsapp_opt_out_marketing boolean, whatsapp_opt_out_utility boolean, conversa_id uuid, conversa_status text, conversa_ultima_mensagem_em timestamp with time zone, conversa_encerrada_em timestamp with time zone, protocolo_atual text, protocolo_resultado text, contato_novo_no_inicio boolean, iniciado_com_bot boolean, finalizado_com_bot boolean, finalizado_por_tipo text, finalizado_por_usuario_id uuid, finalizado_por_usuario_nome text, contexto_integracao_whatsapp_id uuid, contexto_integracao_nome text, contexto_integracao_numero text, ultima_mensagem_contato_em timestamp with time zone, ultimo_atendente_id uuid, ultimo_atendente_nome text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    contexto.id,
    contexto.empresa_id,
    contexto.nome,
    contexto.whatsapp_profile_name,
    contexto.telefone,
    contexto.email,
    contexto.origem,
    contexto.campanha,
    coalesce(membro.campo_contato, contexto.campo_contato) as campo_contato,
    contexto.rastreamento_origem_id,
    contexto.rastreamento_campanha_id,
    contexto.rastreamento_link_id,
    contexto.rastreamento_clique_id,
    contexto.observacoes,
    contexto.telefone_revisar,
    contexto.classificacao,
    contexto.classificacao_atualizada_em,
    contexto.classificacao_evento_id,
    contexto.classificacao_protocolo_id,
    contexto.contato_novo,
    contexto.campanha_exibicao,
    contexto.campanha_status,
    contexto.campanha_origem_nome,
    contexto.telefone_normalizado,
    contexto.origem_exibicao,
    contexto.opt_in_whatsapp,
    contexto.whatsapp_opt_out,
    contexto.whatsapp_opt_out_geral,
    contexto.whatsapp_opt_out_marketing,
    contexto.whatsapp_opt_out_utility,
    contexto.conversa_id,
    contexto.conversa_status,
    contexto.conversa_ultima_mensagem_em,
    contexto.conversa_encerrada_em,
    contexto.protocolo_atual,
    contexto.protocolo_resultado,
    contexto.contato_novo_no_inicio,
    contexto.iniciado_com_bot,
    contexto.finalizado_com_bot,
    contexto.finalizado_por_tipo,
    contexto.finalizado_por_usuario_id,
    contexto.finalizado_por_usuario_nome,
    contexto.contexto_integracao_whatsapp_id,
    contexto.contexto_integracao_nome,
    contexto.contexto_integracao_numero,
    contexto.ultima_mensagem_contato_em,
    contexto.ultimo_atendente_id,
    contexto.ultimo_atendente_nome,
    contexto.created_at,
    contexto.updated_at
  from public.listar_contatos_operacionais_contexto_disparo_anterior(
    p_empresa_id,
    p_campanha_id,
    p_integracao_whatsapp_id,
    p_mensagem_data_inicio,
    p_mensagem_data_fim,
    p_ultimo_atendente_id,
    p_filtrar_por_integracao
  ) contexto
  join public.contatos_lista_membros membro
    on membro.lista_id = p_lista_id
   and membro.contato_id = contexto.id
  join public.contatos_listas lista
    on lista.id = membro.lista_id
   and lista.empresa_id = p_empresa_id;
$function$
;
CREATE OR REPLACE FUNCTION public.processar_lote_importacao_contatos(p_importacao_id uuid, p_tamanho_lote integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_importacao public.contatos_importacoes%rowtype;
  v_lote jsonb;
  v_processados integer := 0;
  v_importados integer := 0;
  v_vinculados integer := 0;
  v_aceitos integer := 0;
  v_novo_cursor integer := 0;
  v_concluida boolean := false;
  v_erro text;
begin
  p_tamanho_lote := least(greatest(coalesce(p_tamanho_lote, 100), 1), 200);

  select *
  into v_importacao
  from public.contatos_importacoes
  where id = p_importacao_id
  for update skip locked;

  if not found then
    if exists (
      select 1
      from public.contatos_importacoes
      where id = p_importacao_id
        and status = 'concluida'
    ) then
      return jsonb_build_object(
        'ok', true,
        'concluida', true,
        'ignorada', true,
        'motivo', 'Importação já concluída.'
      );
    end if;

    if exists (
      select 1
      from public.contatos_importacoes
      where id = p_importacao_id
    ) then
      return jsonb_build_object(
        'ok', true,
        'concluida', false,
        'ocupada', true,
        'motivo', 'Outro worker está processando esta importação.'
      );
    end if;

    return jsonb_build_object(
      'ok', false,
      'concluida', false,
      'erro', 'Importação não encontrada.'
    );
  end if;

  if v_importacao.status = 'concluida' then
    return jsonb_build_object(
      'ok', true,
      'concluida', true,
      'ignorada', true,
      'motivo', 'Importação já concluída.'
    );
  end if;

  update public.contatos_importacoes
  set
    status = 'processando',
    tentativas = tentativas + 1,
    started_at = coalesce(started_at, now()),
    erro = null,
    updated_at = now()
  where id = p_importacao_id;

  select coalesce(jsonb_agg(item order by ordem), '[]'::jsonb)
  into v_lote
  from jsonb_array_elements(v_importacao.payload_json)
    with ordinality as itens(item, ordem)
  where ordem > v_importacao.cursor_atual
    and ordem <= v_importacao.cursor_atual + p_tamanho_lote;

  v_processados := jsonb_array_length(v_lote);

  if v_processados = 0 then
    update public.contatos_importacoes
    set
      status = 'concluida',
      cursor_atual = total,
      processados = total,
      payload_json = '[]'::jsonb,
      completed_at = coalesce(completed_at, now()),
      erro = null,
      updated_at = now()
    where id = p_importacao_id;

    return jsonb_build_object(
      'ok', true,
      'concluida', true,
      'processados_lote', 0,
      'importados_lote', 0,
      'vinculados_lista_lote', 0,
      'ignorados_lote', 0,
      'cursor_atual', v_importacao.total,
      'total', v_importacao.total
    );
  end if;

  begin
    with lote as (
      select
        nullif(btrim(item.nome), '') as nome,
        nullif(regexp_replace(coalesce(item.telefone, ''), '\D', '', 'g'), '') as telefone,
        nullif(lower(btrim(item.email)), '') as email,
        nullif(btrim(item.origem), '') as origem,
        nullif(btrim(item.campanha), '') as campanha,
        coalesce(
          nullif(btrim(item.campo_contato), ''),
          nullif(btrim(item.variavel_contato), '')
        ) as campo_contato,
        nullif(btrim(item.observacoes), '') as observacoes,
        coalesce(item.telefone_revisar, false) as telefone_revisar
      from jsonb_to_recordset(v_lote) as item(
        nome text,
        telefone text,
        email text,
        origem text,
        campanha text,
        campo_contato text,
        variavel_contato text,
        observacoes text,
        telefone_revisar boolean
      )
    ),
    inseridos as (
      insert into public.contatos (
        empresa_id,
        nome,
        telefone,
        email,
        origem,
        campanha,
        campo_contato,
        classificacao,
        classificacao_atualizada_em,
        observacoes,
        telefone_revisar
      )
      select
        v_importacao.empresa_id,
        lote.nome,
        lote.telefone,
        lote.email,
        lote.origem,
        lote.campanha,
        lote.campo_contato,
        null,
        null,
        lote.observacoes,
        lote.telefone_revisar
      from lote
      where lote.telefone is not null
        and length(lote.telefone) >= 8
      on conflict (empresa_id, telefone) do nothing
      returning id, telefone
    ),
    atualizados_existentes as (
      update public.contatos contato
      set
        campo_contato = lote.campo_contato,
        updated_at = now()
      from lote
      where coalesce(v_importacao.permitir_contatos_existentes, false)
        and lote.telefone is not null
        and lote.campo_contato is not null
        and contato.empresa_id = v_importacao.empresa_id
        and contato.telefone = lote.telefone
        and contato.campo_contato is distinct from lote.campo_contato
      returning contato.id
    ),
    candidatos_lista as (
      select
        inserido.id as contato_id,
        lote.campo_contato
      from inseridos inserido
      join lote
        on lote.telefone = inserido.telefone
      where v_importacao.lista_id is not null

      union

      select
        contato.id as contato_id,
        lote.campo_contato
      from lote
      join public.contatos contato
        on contato.empresa_id = v_importacao.empresa_id
       and contato.telefone = lote.telefone
      where v_importacao.lista_id is not null
        and coalesce(v_importacao.permitir_contatos_existentes, false)
    ),
    membros_inseridos as (
      insert into public.contatos_lista_membros (
        lista_id,
        contato_id,
        campo_contato
      )
      select
        v_importacao.lista_id,
        candidato.contato_id,
        candidato.campo_contato
      from candidatos_lista candidato
      on conflict (lista_id, contato_id) do update
      set campo_contato = excluded.campo_contato
      returning contato_id
    )
    select
      (select count(*)::integer from inseridos),
      (select count(*)::integer from membros_inseridos)
    into v_importados, v_vinculados;
  exception
    when others then
      get stacked diagnostics v_erro = message_text;

      update public.contatos_importacoes
      set
        status = 'erro',
        erro = v_erro,
        updated_at = now()
      where id = p_importacao_id;

      return jsonb_build_object(
        'ok', false,
        'concluida', false,
        'erro', v_erro,
        'repetir', true
      );
  end;

  v_aceitos := greatest(v_importados, v_vinculados);
  v_novo_cursor := least(
    v_importacao.total,
    v_importacao.cursor_atual + v_processados
  );
  v_concluida := v_novo_cursor >= v_importacao.total;

  update public.contatos_importacoes
  set
    status = case when v_concluida then 'concluida' else 'pendente' end,
    cursor_atual = v_novo_cursor,
    processados = processados + v_processados,
    importados = importados + v_importados,
    membros_vinculados = membros_vinculados + v_vinculados,
    ignorados = ignorados + greatest(v_processados - v_aceitos, 0),
    payload_json = case when v_concluida then '[]'::jsonb else payload_json end,
    completed_at = case when v_concluida then now() else completed_at end,
    erro = null,
    updated_at = now()
  where id = p_importacao_id;

  return jsonb_build_object(
    'ok', true,
    'concluida', v_concluida,
    'processados_lote', v_processados,
    'importados_lote', v_importados,
    'vinculados_lista_lote', v_vinculados,
    'ignorados_lote', greatest(v_processados - v_aceitos, 0),
    'cursor_atual', v_novo_cursor,
    'total', v_importacao.total
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.excluir_lista_contatos_com_exclusivos(p_empresa_id uuid, p_lista_id uuid, p_confirmar_exclusao boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_nome text;
  v_exclusivos uuid[] := '{}'::uuid[];
  v_compartilhados uuid[] := '{}'::uuid[];
  v_conversas uuid[] := '{}'::uuid[];
  v_total integer := 0;
  v_total_exclusivos integer := 0;
  v_total_compartilhados integer := 0;
  v_total_conversas integer := 0;
  v_contatos_com_conversa integer := 0;
  v_agendamentos_bloqueadores integer := 0;
  v_analises_bloqueadoras integer := 0;
  v_contatos_excluidos integer := 0;
  v_conversas_excluidas integer := 0;
begin
  if not coalesce(p_confirmar_exclusao, false) then
    return jsonb_build_object(
      'ok', false,
      'erro', 'Confirmação de exclusão obrigatória.'
    );
  end if;

  select lista.nome
  into v_nome
  from public.contatos_listas lista
  where lista.id = p_lista_id
    and lista.empresa_id = p_empresa_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'erro', 'Lista não encontrada.'
    );
  end if;

  select count(*)::integer
  into v_total
  from public.contatos_lista_membros membro
  where membro.lista_id = p_lista_id;

  select coalesce(array_agg(membro.contato_id), '{}'::uuid[])
  into v_exclusivos
  from public.contatos_lista_membros membro
  where membro.lista_id = p_lista_id
    and not exists (
      select 1
      from public.contatos_lista_membros outro
      where outro.contato_id = membro.contato_id
        and outro.lista_id <> p_lista_id
    );

  select coalesce(array_agg(membro.contato_id), '{}'::uuid[])
  into v_compartilhados
  from public.contatos_lista_membros membro
  where membro.lista_id = p_lista_id
    and exists (
      select 1
      from public.contatos_lista_membros outro
      where outro.contato_id = membro.contato_id
        and outro.lista_id <> p_lista_id
    );

  v_total_exclusivos := coalesce(array_length(v_exclusivos, 1), 0);
  v_total_compartilhados := greatest(v_total - v_total_exclusivos, 0);

  if v_total_exclusivos > 0 then
    select count(*)::integer
    into v_agendamentos_bloqueadores
    from public.agenda_agendamentos agendamento
    where agendamento.empresa_id = p_empresa_id
      and agendamento.contato_id = any(v_exclusivos);

    select count(*)::integer
    into v_analises_bloqueadoras
    from public.automacao_arquivo_analises analise
    where analise.empresa_id = p_empresa_id
      and analise.contato_id = any(v_exclusivos);

    if v_agendamentos_bloqueadores > 0 or v_analises_bloqueadoras > 0 then
      return jsonb_build_object(
        'ok', false,
        'erro',
          'Há contatos exclusivos com vínculos que impedem a exclusão. Remova os agendamentos ou análises de arquivo vinculados antes de excluir a lista.',
        'agendamentos_bloqueadores', v_agendamentos_bloqueadores,
        'analises_arquivo_bloqueadoras', v_analises_bloqueadoras
      );
    end if;

    select
      coalesce(array_agg(conversa.id), '{}'::uuid[]),
      count(distinct conversa.contato_id)::integer
    into
      v_conversas,
      v_contatos_com_conversa
    from public.conversas conversa
    where conversa.empresa_id = p_empresa_id
      and conversa.contato_id = any(v_exclusivos);

    v_total_conversas := coalesce(array_length(v_conversas, 1), 0);

    if v_total_conversas > 0 then
      delete from public.mensagens mensagem
      where mensagem.empresa_id = p_empresa_id
        and mensagem.conversa_id = any(v_conversas);

      delete from public.conversas conversa
      where conversa.empresa_id = p_empresa_id
        and conversa.id = any(v_conversas);

      get diagnostics v_conversas_excluidas = row_count;
    end if;

    delete from public.contatos contato
    where contato.empresa_id = p_empresa_id
      and contato.id = any(v_exclusivos);

    get diagnostics v_contatos_excluidos = row_count;
  end if;

  delete from public.contatos_listas lista
  where lista.id = p_lista_id
    and lista.empresa_id = p_empresa_id;

  if not found then
    raise exception 'Lista não encontrada durante a exclusão.';
  end if;

  if coalesce(array_length(v_compartilhados, 1), 0) > 0 then
    with valores_efetivos as (
      select
        contato.id,
        coalesce(
          (
            select membro.campo_contato
            from public.contatos_lista_membros membro
            join public.contatos_listas lista
              on lista.id = membro.lista_id
            where membro.contato_id = contato.id
              and membro.campo_contato is not null
            order by
              membro.adicionado_em desc,
              lista.created_at desc,
              lista.id desc
            limit 1
          ),
          contato.campo_contato_base
        ) as novo_valor
      from public.contatos contato
      where contato.empresa_id = p_empresa_id
        and contato.id = any(v_compartilhados)
    )
    update public.contatos contato
    set
      campo_contato = valor.novo_valor,
      updated_at = now()
    from valores_efetivos valor
    where contato.id = valor.id
      and contato.campo_contato is distinct from valor.novo_valor;
  end if;

  return jsonb_build_object(
    'ok', true,
    'lista_id', p_lista_id,
    'nome', v_nome,
    'total_contatos_lista', v_total,
    'contatos_exclusivos_excluidos', v_contatos_excluidos,
    'contatos_compartilhados_preservados', v_total_compartilhados,
    'contatos_com_conversa', v_contatos_com_conversa,
    'conversas_excluidas', v_conversas_excluidas
  );
end;
$function$
;

revoke all on function public.listar_contatos_operacionais_contexto(uuid, uuid, date, date, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.listar_contatos_operacionais_contexto(uuid, uuid, date, date, uuid, boolean)
  to service_role;

grant execute on function public.listar_contatos_operacionais_contexto_disparo_anterior(uuid, uuid, uuid, date, date, uuid, boolean)
  to public, anon, authenticated, service_role;

revoke all on function public.listar_contatos_operacionais_contexto_lista(uuid, uuid, uuid, date, date, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.listar_contatos_operacionais_contexto_lista(uuid, uuid, uuid, date, date, uuid, boolean)
  to service_role;

revoke all on function public.listar_contatos_operacionais_contexto_disparo_anterior_lista(uuid, uuid, uuid, uuid, date, date, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.listar_contatos_operacionais_contexto_disparo_anterior_lista(uuid, uuid, uuid, uuid, date, date, uuid, boolean)
  to service_role;
