-- Normaliza o erro 131048 como uma pausa global do contato, independente da
-- categoria do template, e impede que o worker reivindique o item durante 12h.

create or replace function public.normalizar_cooldown_rate_limit_131048()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_referencia timestamptz;
begin
  if new.erro_codigo_meta is distinct from 131048
     and new.motivo is distinct from 'meta_131048' then
    return new;
  end if;

  v_referencia := coalesce(
    new.ultima_ocorrencia_em,
    new.bloqueado_em,
    new.updated_at,
    new.created_at,
    now()
  );

  new.categoria := 'marketing';
  new.motivo := 'meta_131048';
  new.erro_codigo_meta := 131048;
  new.bloqueado_em := coalesce(new.bloqueado_em, v_referencia);
  new.expira_em := v_referencia + interval '12 hours';
  new.ativo := new.expira_em > now();
  new.metadata_json := coalesce(new.metadata_json, '{}'::jsonb) ||
    jsonb_build_object(
      'cooldown_horas', 12,
      'cooldown_escopo', 'contato',
      'politica', 'rate_limit_131048_12h_contato'
    );
  new.updated_at := now();

  return new;
end;
$function$;

drop trigger if exists trg_normalizar_cooldown_rate_limit_131048
  on public.whatsapp_disparo_cooldowns;

create trigger trg_normalizar_cooldown_rate_limit_131048
before insert or update of
  erro_codigo_meta,
  motivo,
  categoria,
  expira_em,
  ultima_ocorrencia_em,
  bloqueado_em
on public.whatsapp_disparo_cooldowns
for each row
execute function public.normalizar_cooldown_rate_limit_131048();

update public.whatsapp_disparo_cooldowns cooldown
set
  categoria = 'marketing',
  motivo = 'meta_131048',
  erro_codigo_meta = 131048,
  expira_em = coalesce(
    cooldown.ultima_ocorrencia_em,
    cooldown.bloqueado_em,
    cooldown.updated_at,
    cooldown.created_at,
    now()
  ) + interval '12 hours',
  ativo = coalesce(
    cooldown.ultima_ocorrencia_em,
    cooldown.bloqueado_em,
    cooldown.updated_at,
    cooldown.created_at,
    now()
  ) + interval '12 hours' > now(),
  metadata_json = coalesce(cooldown.metadata_json, '{}'::jsonb) ||
    jsonb_build_object(
      'cooldown_horas', 12,
      'cooldown_escopo', 'contato',
      'politica', 'rate_limit_131048_12h_contato',
      'normalizado_em', now()
    ),
  updated_at = now()
where cooldown.erro_codigo_meta = 131048
   or cooldown.motivo = 'meta_131048';

create or replace function public.cancelar_itens_rate_limit_em_cooldown(
  p_item_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total integer := 0;
begin
  update public.whatsapp_disparo_cooldowns cooldown
  set
    ativo = false,
    updated_at = now(),
    metadata_json = coalesce(cooldown.metadata_json, '{}'::jsonb) ||
      jsonb_build_object(
        'liberado_automaticamente_em', now(),
        'motivo_liberacao', 'fim_cooldown_rate_limit_131048_12h'
      )
  where cooldown.ativo = true
    and cooldown.erro_codigo_meta = 131048
    and cooldown.expira_em <= now();

  update public.whatsapp_disparo_itens item
  set
    status = 'cancelado',
    erro = 'Envio bloqueado: este contato esta em pausa de 12 horas apos rate limit 131048 da Meta.',
    locked_at = null,
    processed_at = now(),
    updated_at = now(),
    metadata_json = coalesce(item.metadata_json, '{}'::jsonb) ||
      jsonb_build_object(
        'motivo_cancelamento', 'rate_limit_131048_cooldown_12h',
        'cooldown_escopo', 'contato',
        'cancelado_antes_envio_meta', true,
        'cancelado_em', now()
      )
  where item.status = 'pendente'
    and (p_item_id is null or item.id = p_item_id)
    and exists (
      select 1
      from public.whatsapp_disparo_cooldowns cooldown
      where cooldown.empresa_id = item.empresa_id
        and cooldown.telefone_normalizado = regexp_replace(
          coalesce(item.telefone_normalizado, item.numero, ''),
          '[^0-9]',
          '',
          'g'
        )
        and cooldown.erro_codigo_meta = 131048
        and cooldown.ativo = true
        and cooldown.expira_em > now()
    );

  get diagnostics v_total = row_count;
  return v_total;
end;
$function$;

create or replace function public.reivindicar_whatsapp_disparo_item(
  p_item_id uuid
)
returns setof public.whatsapp_disparo_itens
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.cancelar_itens_numero_invalido_em_cooldown(p_item_id);
  perform public.cancelar_itens_rate_limit_em_cooldown(p_item_id);

  return query
    with candidato as (
      select item.id
      from public.whatsapp_disparo_itens item
      join public.whatsapp_disparo_campanhas campanha
        on campanha.id = item.campanha_id
      where item.id = p_item_id
        and item.status = 'pendente'
        and coalesce(item.next_attempt_at, item.created_at) <= now()
        and item.tentativas < item.max_tentativas
        and campanha.status in ('pendente', 'enviando')
      limit 1
      for update of item skip locked
    ),
    atualizado as (
      update public.whatsapp_disparo_itens item
      set
        status = 'processando',
        tentativas = item.tentativas + 1,
        locked_at = now(),
        updated_at = now()
      from candidato
      where item.id = candidato.id
      returning item.*
    ),
    campanha_atualizada as (
      update public.whatsapp_disparo_campanhas campanha
      set
        status = 'enviando',
        started_at = coalesce(campanha.started_at, now()),
        updated_at = now()
      from (
        select distinct campanha_id
        from atualizado
      ) atualizados
      where campanha.id = atualizados.campanha_id
        and campanha.status = 'pendente'
      returning campanha.id
    )
    select atualizado.*
    from atualizado
    left join campanha_atualizada
      on campanha_atualizada.id = atualizado.campanha_id;
end;
$function$;
