create or replace function public.listar_contatos_operacionais_contexto_disparo_anterior(
  p_empresa_id uuid,
  p_campanha_id uuid,
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
  select contato.*
  from public.listar_contatos_operacionais_contexto(
    p_empresa_id => p_empresa_id,
    p_integracao_whatsapp_id => p_integracao_whatsapp_id,
    p_mensagem_data_inicio => p_mensagem_data_inicio,
    p_mensagem_data_fim => p_mensagem_data_fim,
    p_ultimo_atendente_id => p_ultimo_atendente_id,
    p_filtrar_por_integracao => p_filtrar_por_integracao
  ) contato
  where exists (
    select 1
    from public.whatsapp_disparo_itens item
    where item.empresa_id = p_empresa_id
      and item.campanha_id = p_campanha_id
      and item.status = 'enviado'
      and (
        item.contato_id = contato.id
        or (
          item.contato_id is null
          and coalesce(contato.telefone_normalizado, '') <> ''
          and item.telefone_normalizado = contato.telefone_normalizado
        )
      )
  );
$$;

comment on function public.listar_contatos_operacionais_contexto_disparo_anterior(
  uuid,
  uuid,
  uuid,
  date,
  date,
  uuid,
  boolean
) is
  'Combina o filtro de disparo anterior com integracao, periodo de mensagens, ultimo atendente, opt-in e opt-out.';

revoke all on function public.listar_contatos_operacionais_contexto_disparo_anterior(
  uuid,
  uuid,
  uuid,
  date,
  date,
  uuid,
  boolean
) from public, anon, authenticated;

grant execute on function public.listar_contatos_operacionais_contexto_disparo_anterior(
  uuid,
  uuid,
  uuid,
  date,
  date,
  uuid,
  boolean
) to service_role;
