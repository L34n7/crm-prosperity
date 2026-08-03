-- Pausa automática somente por rate limit Meta 131048.
-- Erros de número inválido (131026) e demais falhas permanecem individuais.

create or replace function public.impedir_pausa_prematura_campanha()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_falhas_rate_limit integer := 0;
begin
  if new.status like 'pausada_%'
     and new.status <> 'pausada_por_conta_bloqueada'
     and old.status in ('pendente', 'enviando') then
    select count(*)::integer
      into v_falhas_rate_limit
    from public.whatsapp_disparo_itens i
    where i.campanha_id = old.id
      and i.status = 'falha'
      and i.erro_codigo_meta = 131048;

    if v_falhas_rate_limit <= 3 then
      raise exception
        'Campanha deve continuar: apenas % falha(s) de rate limit 131048.',
        v_falhas_rate_limit;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.pausar_campanha_apos_quarta_falha()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_falhas_rate_limit integer := 0;
  v_motivo text := 'Campanha pausada automaticamente após mais de 3 falhas de rate limit Meta 131048.';
begin
  if new.status = 'falha'
     and new.erro_codigo_meta = 131048
     and (
       tg_op = 'INSERT'
       or old.status is distinct from 'falha'
       or old.erro_codigo_meta is distinct from 131048
     ) then
    select count(*)::integer
      into v_falhas_rate_limit
    from public.whatsapp_disparo_itens i
    where i.campanha_id = new.campanha_id
      and i.status = 'falha'
      and i.erro_codigo_meta = 131048;

    if v_falhas_rate_limit > 3 then
      update public.whatsapp_disparo_campanhas c
      set
        status = 'pausada_por_erro_meta',
        pausa_motivo = v_motivo,
        erro = format(
          'Foram registradas %s falhas de rate limit 131048 na campanha.',
          v_falhas_rate_limit
        ),
        paused_at = coalesce(c.paused_at, now()),
        updated_at = now(),
        metadata_json = coalesce(c.metadata_json, '{}'::jsonb) || jsonb_build_object(
          'erro_codigo_meta', 131048,
          'pausa_automatica', true,
          'falhas_rate_limit', v_falhas_rate_limit,
          'criterio_pausa', 'mais_de_3_falhas_131048'
        )
      where c.id = new.campanha_id
        and c.status in ('pendente', 'enviando');

      update public.whatsapp_disparo_itens i
      set
        status = 'cancelado',
        erro = 'Cancelado porque a campanha ultrapassou 3 falhas de rate limit 131048.',
        locked_at = null,
        processed_at = now(),
        updated_at = now(),
        metadata_json = coalesce(i.metadata_json, '{}'::jsonb) || jsonb_build_object(
          'motivo_cancelamento', 'campanha_mais_de_3_rate_limit_131048'
        )
      where i.campanha_id = new.campanha_id
        and i.id <> new.id
        and i.status in ('pendente', 'processando');
    end if;
  end if;

  return new;
end;
$$;

-- Reabre campanhas pausadas incorretamente apenas por número inválido.
do $$
declare
  v_campanha record;
begin
  for v_campanha in
    select c.id
    from public.whatsapp_disparo_campanhas c
    where c.status = 'pausada_por_falhas'
      and exists (
        select 1
        from public.whatsapp_disparo_itens i
        where i.campanha_id = c.id
          and i.status = 'falha'
          and i.erro_codigo_meta = 131026
      )
      and not exists (
        select 1
        from public.whatsapp_disparo_itens i
        where i.campanha_id = c.id
          and i.status = 'falha'
          and i.erro_codigo_meta = 131048
      )
      and exists (
        select 1
        from public.whatsapp_disparo_itens i
        where i.campanha_id = c.id
          and i.status = 'cancelado'
          and i.metadata_json ->> 'motivo_cancelamento' = 'campanha_mais_de_3_falhas'
      )
  loop
    update public.whatsapp_disparo_itens i
    set
      status = 'pendente',
      erro = null,
      erro_codigo_meta = null,
      locked_at = null,
      processed_at = null,
      next_attempt_at = now(),
      qstash_message_id = null,
      qstash_publicado_at = null,
      qstash_erro = null,
      updated_at = now(),
      metadata_json = (coalesce(i.metadata_json, '{}'::jsonb)
        - 'motivo_cancelamento') || jsonb_build_object(
          'retomado_apos_correcao_regra', true,
          'retomado_em', now(),
          'motivo_retomada', 'numero_invalido_nao_pausa_campanha'
        )
    where i.campanha_id = v_campanha.id
      and i.status = 'cancelado'
      and i.metadata_json ->> 'motivo_cancelamento' = 'campanha_mais_de_3_falhas';

    update public.whatsapp_disparo_campanhas c
    set
      status = 'pendente',
      pausa_motivo = null,
      erro = null,
      paused_at = null,
      finished_at = null,
      processamento_modo = 'cron_fallback',
      qstash_publicados = 0,
      qstash_erro = null,
      updated_at = now(),
      metadata_json = coalesce(c.metadata_json, '{}'::jsonb) || jsonb_build_object(
        'retomada_automatica', true,
        'retomada_em', now(),
        'motivo_retomada', 'falhas_131026_nao_pausam_campanha'
      )
    where c.id = v_campanha.id;

    perform public.recalcular_whatsapp_disparo_campanha(v_campanha.id);
  end loop;
end;
$$;
