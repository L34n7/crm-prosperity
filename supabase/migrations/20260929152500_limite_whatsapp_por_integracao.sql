-- CRM_WHATSAPP_LIMITE_POR_INTEGRACAO_V1
-- Cada integração WhatsApp possui capacidade independente.
-- A janela móvel termina 24h após o envio inicial do template e nunca é
-- prolongada por eventos posteriores de entregue/lido.

create index if not exists idx_whatsapp_meta_conversas_iniciadas_integracao_limite
  on public.whatsapp_meta_conversas_iniciadas (
    empresa_id,
    integracao_whatsapp_id,
    janela_expira_em,
    status,
    telefone_normalizado
  );

create or replace function public.obter_resumo_whatsapp_meta_limite(
  p_empresa_id uuid,
  p_integracao_whatsapp_id uuid,
  p_limite integer
)
returns table(
  portfolio_id text,
  usados integer,
  restantes integer,
  antispam_bloqueado boolean,
  antispam_bloqueado_ate timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portfolio_id text;
  v_usados integer := 0;
begin
  if p_empresa_id is null or p_integracao_whatsapp_id is null then
    raise exception 'Empresa e integracao sao obrigatorias.';
  end if;

  if coalesce(p_limite, 0) <= 0 then
    raise exception 'Limite invalido.';
  end if;

  -- Mantido apenas como informação cadastral/compatibilidade da resposta.
  -- O consumo do limite não é agrupado por portfolio.
  v_portfolio_id := public.whatsapp_meta_portfolio_key(
    p_integracao_whatsapp_id
  );

  select count(distinct r.telefone_normalizado)::integer
    into v_usados
  from public.whatsapp_meta_conversas_iniciadas r
  where r.empresa_id = p_empresa_id
    and r.integracao_whatsapp_id = p_integracao_whatsapp_id
    and r.janela_expira_em > now()
    and r.status in ('reservado', 'processando', 'enviado');

  return query
    select
      v_portfolio_id,
      v_usados,
      greatest(p_limite - v_usados, 0),
      false,
      null::timestamptz;
end;
$$;

create or replace function public.reservar_whatsapp_meta_limite(
  p_empresa_id uuid,
  p_integracao_whatsapp_id uuid,
  p_phone_number_id text,
  p_telefones text[],
  p_limite integer,
  p_origem text default 'disparo_template'::text,
  p_template_id uuid default null::uuid,
  p_template_nome text default null::text,
  p_usuario_id uuid default null::uuid,
  p_metadata_json jsonb default '{}'::jsonb
)
returns table(
  ok boolean,
  limite integer,
  usados integer,
  reservados integer,
  restantes integer,
  telefones_bloqueados text[],
  reserva_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portfolio_id text;
  v_telefones text[];
  v_novos text[];
  v_usados integer := 0;
  v_restantes integer := 0;
  v_bloqueados text[] := array[]::text[];
  v_reserva_ids uuid[] := array[]::uuid[];
begin
  if p_empresa_id is null or p_integracao_whatsapp_id is null then
    raise exception 'Empresa e integracao sao obrigatorias.';
  end if;

  if coalesce(p_limite, 0) <= 0 then
    raise exception 'Limite invalido.';
  end if;

  v_portfolio_id := public.whatsapp_meta_portfolio_key(
    p_integracao_whatsapp_id
  );

  -- Lock exclusivo por integração/número.
  perform pg_advisory_xact_lock(
    hashtext(p_empresa_id::text),
    hashtext(p_integracao_whatsapp_id::text)
  );

  select count(distinct r.telefone_normalizado)::integer
    into v_usados
  from public.whatsapp_meta_conversas_iniciadas r
  where r.empresa_id = p_empresa_id
    and r.integracao_whatsapp_id = p_integracao_whatsapp_id
    and r.janela_expira_em > now()
    and r.status in ('reservado', 'processando', 'enviado');

  v_restantes := greatest(p_limite - v_usados, 0);

  select coalesce(array_agg(distinct telefone), array[]::text[])
    into v_telefones
  from (
    select regexp_replace(coalesce(item, ''), '[^0-9]', '', 'g') as telefone
    from unnest(coalesce(p_telefones, array[]::text[])) as t(item)
  ) normalizados
  where char_length(telefone) >= 10;

  if coalesce(array_length(v_telefones, 1), 0) = 0 then
    return query
      select
        true,
        p_limite,
        v_usados,
        0,
        v_restantes,
        array[]::text[],
        array[]::uuid[];
    return;
  end if;

  select coalesce(array_agg(telefone), array[]::text[])
    into v_novos
  from unnest(v_telefones) as t(telefone)
  where not exists (
    select 1
    from public.whatsapp_meta_conversas_iniciadas r
    where r.empresa_id = p_empresa_id
      and r.integracao_whatsapp_id = p_integracao_whatsapp_id
      and r.telefone_normalizado = telefone
      and r.janela_expira_em > now()
      and r.status in ('reservado', 'processando', 'enviado')
  );

  if coalesce(array_length(v_novos, 1), 0) > v_restantes then
    select coalesce(array_agg(telefone), array[]::text[])
      into v_bloqueados
    from (
      select telefone, row_number() over () as rn
      from unnest(v_novos) as t(telefone)
    ) ordenados
    where rn > v_restantes;

    return query
      select
        false,
        p_limite,
        v_usados,
        0,
        v_restantes,
        v_bloqueados,
        array[]::uuid[];
    return;
  end if;

  if coalesce(array_length(v_novos, 1), 0) > 0 then
    with inseridos as (
      insert into public.whatsapp_meta_conversas_iniciadas (
        empresa_id,
        integracao_whatsapp_id,
        business_portfolio_id,
        phone_number_id,
        telefone_normalizado,
        template_id,
        template_nome,
        usuario_id,
        origem,
        status,
        metadata_json
      )
      select
        p_empresa_id,
        p_integracao_whatsapp_id,
        coalesce(
          nullif(v_portfolio_id, ''),
          'integracao:' || p_integracao_whatsapp_id::text
        ),
        nullif(p_phone_number_id, ''),
        telefone,
        p_template_id,
        p_template_nome,
        p_usuario_id,
        coalesce(nullif(p_origem, ''), 'disparo_template'),
        'reservado',
        coalesce(p_metadata_json, '{}'::jsonb) || jsonb_build_object(
          'business_portfolio_id', v_portfolio_id,
          'limite_escopo', 'integracao_whatsapp',
          'janela_tipo', 'movel_24h_desde_envio'
        )
      from unnest(v_novos) as t(telefone)
      returning id
    )
    select coalesce(array_agg(id), array[]::uuid[])
      into v_reserva_ids
    from inseridos;
  end if;

  return query
    select
      true,
      p_limite,
      v_usados,
      coalesce(array_length(v_novos, 1), 0),
      greatest(
        p_limite - v_usados - coalesce(array_length(v_novos, 1), 0),
        0
      ),
      array[]::text[],
      coalesce(v_reserva_ids, array[]::uuid[]);
end;
$$;

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

-- Corrige imediatamente as janelas existentes que foram ampliadas por
-- eventos de entregue/lido. enviado_em é a fonte de verdade do envio.
update public.whatsapp_meta_conversas_iniciadas
set
  janela_expira_em = enviado_em + interval '24 hours',
  updated_at = now(),
  metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
    'limite_escopo', 'integracao_whatsapp',
    'janela_base', 'envio_template',
    'janela_reconciliada_em', now(),
    'janela_recalculada_por_leitura', false
  )
where status = 'enviado'
  and enviado_em is not null
  and janela_expira_em is distinct from (enviado_em + interval '24 hours');

grant execute on function public.obter_resumo_whatsapp_meta_limite(
  uuid,
  uuid,
  integer
) to authenticated, service_role;

grant execute on function public.reservar_whatsapp_meta_limite(
  uuid,
  uuid,
  text,
  text[],
  integer,
  text,
  uuid,
  text,
  uuid,
  jsonb
) to authenticated, service_role;

notify pgrst, 'reload schema';
