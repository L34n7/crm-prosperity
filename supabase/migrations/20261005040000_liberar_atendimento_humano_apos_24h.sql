-- Libera o atendimento humano quando a janela de 24h expira.
-- A conversa permanece encerrada, mas o próximo inbound pode voltar ao bot/Agente de IA padrão.

create or replace function public.processar_conversas_expiradas_24h(p_limite integer default 500)
returns table(conversa_id uuid, empresa_id uuid, encerrada_em timestamptz)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_conversa record;
  v_agora timestamptz := clock_timestamp();
  v_conversa_atualizada uuid;
begin
  for v_conversa in
    select
      c.id,
      c.empresa_id
    from public.conversas c
    where c.status in (
      'aberta',
      'bot',
      'fila',
      'em_atendimento',
      'aguardando_cliente'
    )
      and c.window_expires_at is not null
      and c.window_expires_at <= v_agora
    order by c.window_expires_at, c.id
    limit least(greatest(coalesce(p_limite, 500), 1), 1000)
    for update of c skip locked
  loop
    v_conversa_atualizada := null;

    update public.conversas c
    set
      status = 'encerrado_24h',
      bot_ativo = false,
      responsavel_id = null,
      aguardando_atendente = false,
      agente_ia_id = null,
      agente_ia_protocolo_id = null,
      agente_ia_fallback_ativo = false,
      closed_at = v_agora,
      updated_at = v_agora
    where c.id = v_conversa.id
      and c.empresa_id = v_conversa.empresa_id
      and c.status in (
        'aberta',
        'bot',
        'fila',
        'em_atendimento',
        'aguardando_cliente'
      )
      and c.window_expires_at is not null
      and c.window_expires_at <= v_agora
    returning c.id into v_conversa_atualizada;

    if v_conversa_atualizada is null then
      continue;
    end if;

    update public.conversa_protocolos cp
    set
      ativo = false,
      closed_at = v_agora,
      updated_at = v_agora
    where cp.empresa_id = v_conversa.empresa_id
      and cp.conversa_id = v_conversa.id
      and cp.ativo = true;

    update public.automacao_execucoes ae
    set
      status = 'cancelado',
      finished_at = v_agora,
      updated_at = v_agora,
      metadata_json =
        coalesce(ae.metadata_json, '{}'::jsonb)
        || jsonb_build_object(
          'motivo_cancelamento',
          'janela_24h_expirada'
        )
    where ae.empresa_id = v_conversa.empresa_id
      and ae.conversa_id = v_conversa.id
      and ae.status in ('rodando', 'aguardando', 'pausado');

    insert into public.mensagens (
      empresa_id,
      conversa_id,
      remetente_tipo,
      conteudo,
      tipo_mensagem,
      origem,
      status_envio,
      created_at,
      updated_at
    )
    values (
      v_conversa.empresa_id,
      v_conversa.id,
      'sistema',
      'Conversa encerrada automaticamente porque a janela de 24 horas do WhatsApp expirou sem nova resposta do cliente.',
      'texto',
      'automatica',
      'lida',
      v_agora,
      v_agora
    );

    conversa_id := v_conversa.id;
    empresa_id := v_conversa.empresa_id;
    encerrada_em := v_agora;
    return next;
  end loop;
end;
$function$;
