-- FEP Meta: mantém a conversa operacional enquanto o horário de expiração
-- confirmado no webhook da Meta estiver no futuro. Não amplia a janela de
-- atendimento de 24h para mensagens livres da API WhatsApp (131047).
begin;

alter table public.conversas
  add column if not exists meta_free_entry_expires_at timestamptz,
  add column if not exists meta_free_entry_status_at timestamptz;

comment on column public.conversas.meta_free_entry_expires_at is
  'Fim da janela de ponto de entrada gratuito informado pela Meta (conversation.expiration_timestamp). Não autoriza mensagens livres fora das 24h.';
comment on column public.conversas.meta_free_entry_status_at is
  'Timestamp do status de entrega da Meta que informou o vencimento da campanha.';

create index if not exists idx_conversas_meta_free_entry_ativa
  on public.conversas (meta_free_entry_expires_at)
  where meta_free_entry_expires_at is not null
    and status in ('aberta', 'bot', 'fila', 'em_atendimento', 'aguardando_cliente');

-- Corrige prazos das conversas existentes quando a própria Meta confirmou o
-- FEP. Não reabre atendimentos encerrados nem presume sete dias sem evidência.
with status_meta as (
  select a.empresa_id, m.conversa_id,
    case
      when x.exp ~ '^[0-9]{10}$' then to_timestamp(x.exp::double precision)
      when x.exp ~ '^[0-9]{13}$' then to_timestamp(x.exp::double precision / 1000)
      else null
    end as meta_expira_em,
    a.created_at as meta_status_em
  from public.contato_atribuicoes_meta a
  join public.mensagens m on m.id = a.mensagem_id and m.empresa_id = a.empresa_id
  cross join lateral (
    select a.payload_json->'status'->'conversation'->>'expiration_timestamp' as exp
  ) x
  where a.pricing_type = 'free_entry_point'
    and a.conversation_origin_type = 'referral_conversion'
    and a.created_at >= now() - interval '10 days'
), consolidados as (
  select empresa_id, conversa_id,
         max(meta_expira_em) as expira_em,
         max(meta_status_em) as status_em
  from status_meta
  where meta_expira_em > now()
    and meta_expira_em < now() + interval '8 days'
  group by empresa_id, conversa_id
)
update public.conversas c
  set meta_free_entry_expires_at = s.expira_em,
      meta_free_entry_status_at = s.status_em
  from consolidados s
  where c.id = s.conversa_id
    and c.empresa_id = s.empresa_id
    and (c.meta_free_entry_status_at is null or c.meta_free_entry_status_at <= s.status_em);

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
      and (c.meta_free_entry_expires_at is null or c.meta_free_entry_expires_at <= v_agora)
      and (
        c.atendimento_humano_ate is null
        or c.atendimento_humano_ate <= v_agora
      )
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
      atendimento_humano_ate = null,
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
      and (c.meta_free_entry_expires_at is null or c.meta_free_entry_expires_at <= v_agora)
      and (
        c.atendimento_humano_ate is null
        or c.atendimento_humano_ate <= v_agora
      )
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
      'Conversa encerrada automaticamente: janelas de atendimento e de campanha Meta encerradas sem nova resposta do cliente.',
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

commit;
