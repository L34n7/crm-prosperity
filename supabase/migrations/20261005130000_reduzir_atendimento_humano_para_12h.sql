-- Reduz o prazo operacional do atendimento humano de 24h para 12h.
-- A janela Meta permanece independente e continua baseada em inbound do cliente.

comment on column public.conversas.atendimento_humano_ate is
  'Prazo operacional independente para preservar atendimento humano. Renovado por 12h a cada mensagem manual do atendente.';

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
           v_mensagem_em + interval '12 hours'
         )
   where c.id = new.conversa_id
     and c.empresa_id = new.empresa_id;

  return new;
end;
$function$;

update public.conversas
set atendimento_humano_ate = ultima_mensagem_humana_at + interval '12 hours'
where ultima_mensagem_humana_at is not null
  and atendimento_humano_ate is not null;
