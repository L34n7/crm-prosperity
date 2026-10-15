begin;

create or replace function public.claim_whatsapp_meta_block_email(
  p_empresa_id uuid,
  p_integracao_id uuid,
  p_claimed_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_agora timestamptz := coalesce(p_claimed_at, now());
  v_row_count integer := 0;
begin
  update public.integracoes_whatsapp
  set config_json =
    coalesce(config_json, '{}'::jsonb) ||
    jsonb_build_object('whatsapp_meta_block_email_claimed_at', v_agora)
  where id = p_integracao_id
    and empresa_id = p_empresa_id
    and nullif(config_json ->> 'whatsapp_meta_block_email_sent_at', '') is null
    and nullif(config_json ->> 'whatsapp_meta_block_email_legacy_suppressed_at', '') is null
    and (
      nullif(config_json ->> 'whatsapp_meta_block_email_claimed_at', '') is null
      or (config_json ->> 'whatsapp_meta_block_email_claimed_at')::timestamptz
        < v_agora - interval '15 minutes'
    );

  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$function$;

revoke all on function public.claim_whatsapp_meta_block_email(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_whatsapp_meta_block_email(uuid, uuid, timestamptz)
  to service_role;

create or replace function public.mark_whatsapp_meta_block_email_sent(
  p_empresa_id uuid,
  p_integracao_id uuid,
  p_sent_at timestamptz default now(),
  p_destinatario text default null
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  update public.integracoes_whatsapp
  set config_json =
    (
      coalesce(config_json, '{}'::jsonb)
      - 'whatsapp_meta_block_email_claimed_at'
    ) ||
    jsonb_build_object(
      'whatsapp_meta_block_email_sent_at', coalesce(p_sent_at, now()),
      'whatsapp_meta_block_email_destinatario', nullif(trim(coalesce(p_destinatario, '')), '')
    )
  where id = p_integracao_id
    and empresa_id = p_empresa_id;
end;
$function$;

revoke all on function public.mark_whatsapp_meta_block_email_sent(uuid, uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.mark_whatsapp_meta_block_email_sent(uuid, uuid, timestamptz, text)
  to service_role;

create or replace function public.reset_whatsapp_meta_block_email_ao_recuperar()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_old_bloqueado boolean;
  v_new_bloqueado boolean;
begin
  v_old_bloqueado :=
    lower(coalesce(old.status, '')) in ('bloqueado', 'banido', 'blocked', 'banned')
    or lower(coalesce(old.phone_number_status, '')) in ('bloqueado', 'banido', 'blocked', 'banned');

  v_new_bloqueado :=
    lower(coalesce(new.status, '')) in ('bloqueado', 'banido', 'blocked', 'banned')
    or lower(coalesce(new.phone_number_status, '')) in ('bloqueado', 'banido', 'blocked', 'banned');

  if v_old_bloqueado and not v_new_bloqueado then
    new.config_json :=
      coalesce(new.config_json, '{}'::jsonb)
      - 'whatsapp_meta_block_email_claimed_at'
      - 'whatsapp_meta_block_email_sent_at'
      - 'whatsapp_meta_block_email_destinatario'
      - 'whatsapp_meta_block_email_legacy_suppressed_at';
  end if;

  return new;
end;
$function$;

drop trigger if exists integracoes_whatsapp_reset_meta_block_email_ao_recuperar
  on public.integracoes_whatsapp;

create trigger integracoes_whatsapp_reset_meta_block_email_ao_recuperar
before update of status, phone_number_status on public.integracoes_whatsapp
for each row
execute function public.reset_whatsapp_meta_block_email_ao_recuperar();

update public.integracoes_whatsapp
set config_json =
  coalesce(config_json, '{}'::jsonb) ||
  jsonb_build_object(
    'whatsapp_meta_block_email_legacy_suppressed_at',
    now()
  )
where
  lower(coalesce(status, '')) in ('bloqueado', 'banido', 'blocked', 'banned')
  or lower(coalesce(phone_number_status, '')) in ('bloqueado', 'banido', 'blocked', 'banned')
  or coalesce(config_json #>> '{whatsapp_meta_diagnostic,motivo}', '') = 'business_account_locked';

commit;
