-- O erro Meta 131048 cria uma pausa individual de 12 horas, independente da
-- categoria do template. Os demais erros mantêm o prazo atual de 24 horas.

create or replace function public.sincronizar_whatsapp_meta_reserva_por_item()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_telefone text;
  v_portfolio_id text;
  v_reserva_id uuid;
  v_status_meta text;
  v_meta_timestamp timestamptz;
  v_erro_codigo integer;
  v_categoria text;
  v_nova_falha boolean := false;
  v_cooldown_horas integer := 24;
begin
  v_telefone := regexp_replace(
    coalesce(new.telefone_normalizado, new.numero, ''),
    '[^0-9]',
    '',
    'g'
  );

  if char_length(v_telefone) < 10 then
    return new;
  end if;

  v_portfolio_id := public.whatsapp_meta_portfolio_key(
    new.integracao_whatsapp_id
  );

  if v_portfolio_id is null then
    return new;
  end if;

  v_status_meta := lower(
    btrim(coalesce(new.metadata_json->>'ultimo_status_meta', ''))
  );
  v_meta_timestamp := public.whatsapp_meta_timestamp_item(
    coalesce(new.metadata_json, '{}'::jsonb),
    coalesce(new.processed_at, new.updated_at, now())
  );
  v_erro_codigo := new.erro_codigo_meta;
  v_cooldown_horas := case when v_erro_codigo = 131048 then 12 else 24 end;

  select lower(coalesce(t.categoria, 'marketing'))
    into v_categoria
  from public.whatsapp_templates t
  where t.id = new.template_id;

  v_categoria := case
    when v_categoria = 'utility' then 'utility'
    else 'marketing'
  end;

  select r.id
    into v_reserva_id
  from public.whatsapp_meta_conversas_iniciadas r
  where r.empresa_id = new.empresa_id
    and r.business_portfolio_id = v_portfolio_id
    and r.telefone_normalizado = v_telefone
    and r.status in ('reservado', 'processando', 'enviado')
  order by r.created_at desc
  limit 1
  for update;

  if new.status in ('falha', 'cancelado') then
    if v_reserva_id is not null then
      update public.whatsapp_meta_conversas_iniciadas r
      set
        status = case
          when new.status = 'cancelado' then 'cancelado'
          else 'falha'
        end,
        status_meta = nullif(v_status_meta, ''),
        meta_timestamp = v_meta_timestamp,
        erro_codigo_meta = v_erro_codigo,
        liberado_em = now(),
        updated_at = now(),
        metadata_json = coalesce(r.metadata_json, '{}'::jsonb) ||
          jsonb_build_object(
            'item_disparo_id', new.id,
            'campanha_disparo_id', new.campanha_id,
            'status_item', new.status,
            'erro_codigo_meta', v_erro_codigo,
            'reserva_liberada_em', now()
          )
      where r.id = v_reserva_id;
    end if;

    v_nova_falha := new.status = 'falha'
      and v_erro_codigo is not null
      and (
        tg_op = 'INSERT'
        or old.status is distinct from 'falha'
        or old.erro_codigo_meta is distinct from v_erro_codigo
      );

    if v_nova_falha then
      insert into public.whatsapp_disparo_cooldowns (
        empresa_id,
        contato_id,
        telefone_normalizado,
        integracao_whatsapp_id,
        categoria,
        motivo,
        ativo,
        bloqueado_em,
        expira_em,
        ocorrencias_janela,
        janela_inicio_em,
        ultima_ocorrencia_em,
        campanha_id,
        item_id,
        mensagem_externa_id,
        erro_codigo_meta,
        metadata_json,
        updated_at
      )
      values (
        new.empresa_id,
        new.contato_id,
        v_telefone,
        new.integracao_whatsapp_id,
        v_categoria,
        'meta_' || v_erro_codigo::text,
        true,
        v_meta_timestamp,
        v_meta_timestamp + make_interval(hours => v_cooldown_horas),
        1,
        v_meta_timestamp,
        v_meta_timestamp,
        new.campanha_id,
        new.id,
        new.message_id,
        v_erro_codigo,
        jsonb_build_object(
          'origem', 'falha_disparo_meta',
          'cooldown_escopo', 'contato',
          'cooldown_horas', v_cooldown_horas,
          'politica', case
            when v_erro_codigo = 131048 then 'rate_limit_131048_12h_contato'
            else 'falha_meta_24h_contato'
          end,
          'erro', new.erro
        ),
        now()
      )
      on conflict (
        empresa_id,
        telefone_normalizado,
        categoria,
        motivo
      ) where ativo = true
      do update set
        contato_id = excluded.contato_id,
        integracao_whatsapp_id = excluded.integracao_whatsapp_id,
        ativo = true,
        bloqueado_em = excluded.bloqueado_em,
        expira_em = case
          when excluded.erro_codigo_meta = 131048 then excluded.expira_em
          else greatest(
            public.whatsapp_disparo_cooldowns.expira_em,
            excluded.expira_em
          )
        end,
        ocorrencias_janela =
          public.whatsapp_disparo_cooldowns.ocorrencias_janela + 1,
        ultima_ocorrencia_em = excluded.ultima_ocorrencia_em,
        campanha_id = excluded.campanha_id,
        item_id = excluded.item_id,
        mensagem_externa_id = excluded.mensagem_externa_id,
        erro_codigo_meta = excluded.erro_codigo_meta,
        metadata_json =
          coalesce(
            public.whatsapp_disparo_cooldowns.metadata_json,
            '{}'::jsonb
          ) || excluded.metadata_json,
        updated_at = now();
    end if;

    return new;
  end if;

  if new.status = 'enviado' and v_reserva_id is not null then
    update public.whatsapp_meta_conversas_iniciadas r
    set
      status = 'enviado',
      status_meta = coalesce(
        nullif(v_status_meta, ''),
        r.status_meta,
        'accepted'
      ),
      meta_timestamp = case
        when v_status_meta in (
          'entregue',
          'delivered',
          'lida',
          'read',
          'enviada',
          'sent'
        ) then v_meta_timestamp
        else coalesce(r.meta_timestamp, v_meta_timestamp)
      end,
      enviado_em = coalesce(r.enviado_em, v_meta_timestamp),
      janela_expira_em = case
        when v_status_meta in (
          'entregue',
          'delivered',
          'lida',
          'read',
          'enviada',
          'sent'
        ) then v_meta_timestamp + interval '24 hours'
        when nullif(v_status_meta, '') is null then greatest(
          r.janela_expira_em,
          coalesce(new.processed_at, now()) + interval '24 hours'
        )
        else r.janela_expira_em
      end,
      erro_codigo_meta = null,
      liberado_em = null,
      updated_at = now()
    where r.id = v_reserva_id;
  end if;

  return new;
end;
$function$;

-- Converte os cooldowns 131048 já ativos para 12 horas a partir da última
-- ocorrência. A marca permanece ativa somente se o novo prazo ainda não venceu.
with referencias as (
  select
    id,
    coalesce(
      ultima_ocorrencia_em,
      bloqueado_em,
      updated_at,
      created_at,
      now()
    ) as referencia
  from public.whatsapp_disparo_cooldowns
  where erro_codigo_meta = 131048
     or motivo = 'meta_131048'
)
update public.whatsapp_disparo_cooldowns cooldown
set
  expira_em = referencias.referencia + interval '12 hours',
  ativo = referencias.referencia + interval '12 hours' > now(),
  metadata_json = coalesce(cooldown.metadata_json, '{}'::jsonb) ||
    jsonb_build_object(
      'cooldown_horas', 12,
      'politica', 'rate_limit_131048_12h_contato',
      'ajustado_em', now()
    ),
  updated_at = now()
from referencias
where cooldown.id = referencias.id;
