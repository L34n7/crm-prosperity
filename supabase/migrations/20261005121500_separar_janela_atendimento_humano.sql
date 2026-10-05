-- Separa a janela Meta de 24h do prazo operacional do atendimento humano.
-- Mensagens manuais do CRM/WhatsApp Business renovam o atendimento humano por 24h,
-- sem alterar window_expires_at, que continua baseado somente em inbound do cliente.

alter table public.conversas
  add column if not exists ultima_mensagem_humana_at timestamptz,
  add column if not exists atendimento_humano_ate timestamptz;

comment on column public.conversas.ultima_mensagem_humana_at is
  'Última mensagem manual enviada por atendente via CRM ou WhatsApp Business. Não altera a janela Meta de 24h.';

comment on column public.conversas.atendimento_humano_ate is
  'Prazo operacional independente para preservar atendimento humano. Renovado por 24h a cada mensagem manual do atendente.';

create index if not exists idx_conversas_atendimento_humano_ate
  on public.conversas (atendimento_humano_ate)
  where atendimento_humano_ate is not null;

create or replace function public.registrar_prazo_atendimento_humano_por_mensagem()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_mensagem_em timestamptz;
  v_tipo_metadata text;
  v_coex_source text;
  v_coex_direction text;
  v_coex_history boolean;
  v_eh_business_app boolean;
  v_eh_crm_manual boolean;
begin
  if new.remetente_tipo is distinct from 'usuario'
     or new.origem is distinct from 'enviada' then
    return new;
  end if;

  if new.automacao_execucao_id is not null
     or new.automacao_no_id is not null then
    return new;
  end if;

  v_tipo_metadata := lower(coalesce(new.metadata_json ->> 'tipo', ''));
  v_coex_source := lower(coalesce(new.metadata_json ->> 'coex_source', ''));
  v_coex_direction := lower(coalesce(new.metadata_json ->> 'coex_direction', ''));
  v_coex_history :=
    lower(coalesce(new.metadata_json ->> 'coex_history', 'false')) = 'true';

  if v_coex_history then
    return new;
  end if;

  if coalesce(new.metadata_json ? 'campanha_disparo_id', false)
     or coalesce(new.metadata_json ? 'item_disparo_id', false)
     or v_tipo_metadata like 'disparo_%' then
    return new;
  end if;

  v_eh_business_app :=
    v_coex_source = 'business_app'
    and v_coex_direction = 'outbound';

  v_eh_crm_manual :=
    coalesce(new.metadata_json ? 'whatsapp', false)
    and v_tipo_metadata = '';

  if not v_eh_business_app and not v_eh_crm_manual then
    return new;
  end if;

  v_mensagem_em := coalesce(new.created_at, clock_timestamp());

  update public.conversas c
     set ultima_mensagem_humana_at = greatest(
           coalesce(c.ultima_mensagem_humana_at, '-infinity'::timestamptz),
           v_mensagem_em
         ),
         atendimento_humano_ate = greatest(
           coalesce(c.atendimento_humano_ate, '-infinity'::timestamptz),
           v_mensagem_em + interval '24 hours'
         )
   where c.id = new.conversa_id
     and c.empresa_id = new.empresa_id;

  return new;
end;
$function$;

revoke all on function public.registrar_prazo_atendimento_humano_por_mensagem()
  from public, anon, authenticated;
grant execute on function public.registrar_prazo_atendimento_humano_por_mensagem()
  to service_role;

drop trigger if exists trg_registrar_prazo_atendimento_humano
  on public.mensagens;

create trigger trg_registrar_prazo_atendimento_humano
after insert on public.mensagens
for each row
execute function public.registrar_prazo_atendimento_humano_por_mensagem();

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

with ultima_manual as (
  select distinct on (m.empresa_id, m.conversa_id)
    m.empresa_id,
    m.conversa_id,
    m.created_at as mensagem_em
  from public.mensagens m
  where m.remetente_tipo = 'usuario'
    and m.origem = 'enviada'
    and m.automacao_execucao_id is null
    and m.automacao_no_id is null
    and m.created_at > clock_timestamp() - interval '24 hours'
    and lower(coalesce(m.metadata_json ->> 'coex_history', 'false')) <> 'true'
    and not coalesce(m.metadata_json ? 'campanha_disparo_id', false)
    and not coalesce(m.metadata_json ? 'item_disparo_id', false)
    and lower(coalesce(m.metadata_json ->> 'tipo', '')) not like 'disparo_%'
    and (
      (
        lower(coalesce(m.metadata_json ->> 'coex_source', '')) = 'business_app'
        and lower(coalesce(m.metadata_json ->> 'coex_direction', '')) = 'outbound'
      )
      or (
        coalesce(m.metadata_json ? 'whatsapp', false)
        and lower(coalesce(m.metadata_json ->> 'tipo', '')) = ''
      )
    )
  order by m.empresa_id, m.conversa_id, m.created_at desc
)
update public.conversas c
set
  ultima_mensagem_humana_at = u.mensagem_em,
  atendimento_humano_ate = u.mensagem_em + interval '24 hours'
from ultima_manual u
where c.empresa_id = u.empresa_id
  and c.id = u.conversa_id
  and c.status in ('aberta','bot','fila','em_atendimento','aguardando_cliente')
  and u.mensagem_em + interval '24 hours' > clock_timestamp();
