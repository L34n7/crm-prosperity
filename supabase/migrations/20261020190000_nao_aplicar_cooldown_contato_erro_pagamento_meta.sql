-- Erros financeiros da Meta pertencem à conta/integracao, não ao contato.
-- Mantém o cooldown financeiro curto por integração (131042/131044), mas
-- impede a criação de pausa individual de 24h nos destinatários.

create or replace function public.sincronizar_whatsapp_meta_reserva_por_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_telefone text;
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
    and r.integracao_whatsapp_id = new.integracao_whatsapp_id
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

    if v_nova_falha and v_erro_codigo not in (131042, 131044) then
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
        when nullif(v_status_meta, '') is not null
          then v_meta_timestamp
        else coalesce(r.meta_timestamp, v_meta_timestamp)
      end,
      enviado_em = coalesce(
        r.enviado_em,
        new.processed_at,
        v_meta_timestamp,
        now()
      ),
      janela_expira_em = coalesce(
        r.enviado_em,
        new.processed_at,
        v_meta_timestamp,
        now()
      ) + interval '24 hours',
      erro_codigo_meta = null,
      liberado_em = null,
      updated_at = now(),
      metadata_json = coalesce(r.metadata_json, '{}'::jsonb) ||
        jsonb_build_object(
          'item_disparo_id', new.id,
          'campanha_disparo_id', new.campanha_id,
          'status_item', new.status,
          'ultimo_status_meta', nullif(v_status_meta, ''),
          'meta_timestamp', v_meta_timestamp,
          'limite_escopo', 'integracao_whatsapp',
          'janela_base', 'envio_template',
          'janela_recalculada_por_leitura', false
        )
    where r.id = v_reserva_id;
  end if;

  return new;
end;
$$;

update public.whatsapp_disparo_cooldowns
set
  ativo = false,
  expira_em = least(coalesce(expira_em, now()), now()),
  metadata_json = coalesce(metadata_json, '{}'::jsonb) ||
    jsonb_build_object(
      'motivo_liberacao', 'erro_financeiro_nao_aplica_cooldown_contato',
      'liberado_em', now()
    ),
  updated_at = now()
where ativo = true
  and erro_codigo_meta in (131042, 131044);
