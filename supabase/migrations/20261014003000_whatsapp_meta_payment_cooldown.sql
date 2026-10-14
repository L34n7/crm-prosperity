-- Cooldown temporário por integração para erros financeiros da Meta (131042/131044).
-- Mantém fluxos na fila, libera somente uma tentativa controlada após o intervalo
-- e zera o cooldown assim que um envio posterior é confirmado.

create or replace function public.claim_whatsapp_meta_payment_block(
  p_empresa_id uuid,
  p_integracao_id uuid,
  p_codigo integer,
  p_detalhe text,
  p_mensagem_externa_id text,
  p_ocorrido_em timestamptz default now()
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_raw jsonb;
  v_bloqueio jsonb;
  v_ativo boolean := false;
  v_mesma_mensagem boolean := false;
  v_nivel integer := 0;
  v_segundos integer := 60;
  v_cooldown_ate timestamptz;
begin
  select coalesce(meta_saude_raw_json, '{}'::jsonb)
    into v_raw
  from public.integracoes_whatsapp
  where id = p_integracao_id
    and empresa_id = p_empresa_id
  for update;

  if not found then
    return false;
  end if;

  v_bloqueio := coalesce(v_raw -> 'bloqueio_financeiro_meta', '{}'::jsonb);
  v_ativo := lower(coalesce(v_bloqueio ->> 'ativo', 'false')) = 'true';
  v_mesma_mensagem :=
    coalesce(v_bloqueio ->> 'mensagem_externa_id', '') <> ''
    and coalesce(v_bloqueio ->> 'mensagem_externa_id', '') =
        coalesce(p_mensagem_externa_id, '');

  if v_ativo and v_mesma_mensagem then
    update public.integracoes_whatsapp
    set
      meta_saude_ultima_verificacao_em = greatest(
        coalesce(meta_saude_ultima_verificacao_em, p_ocorrido_em),
        p_ocorrido_em
      ),
      updated_at = now()
    where id = p_integracao_id
      and empresa_id = p_empresa_id;

    return false;
  end if;

  if v_ativo then
    begin
      v_nivel := greatest(
        1,
        coalesce((v_bloqueio ->> 'cooldown_nivel')::integer, 1)
      );
    exception when others then
      v_nivel := 1;
    end;
    v_nivel := least(3, v_nivel + 1);
  else
    v_nivel := 1;
  end if;

  v_segundos := case v_nivel
    when 1 then 60
    when 2 then 120
    else 300
  end;
  v_cooldown_ate := p_ocorrido_em + make_interval(secs => v_segundos);

  v_bloqueio :=
    v_bloqueio ||
    jsonb_build_object(
      'ativo', true,
      'codigo', p_codigo,
      'detalhe', p_detalhe,
      'ocorrido_em',
        case
          when v_ativo then coalesce(
            v_bloqueio -> 'ocorrido_em',
            to_jsonb(p_ocorrido_em)
          )
          else to_jsonb(p_ocorrido_em)
        end,
      'ultima_falha_em', p_ocorrido_em,
      'mensagem_externa_id', p_mensagem_externa_id,
      'origem', coalesce(v_bloqueio ->> 'origem', 'webhook_status_meta'),
      'cooldown_nivel', v_nivel,
      'cooldown_segundos', v_segundos,
      'cooldown_ate', v_cooldown_ate,
      'probe_em_andamento_ate', null,
      'falhas_consecutivas',
        case
          when v_ativo then
            case
              when coalesce(v_bloqueio ->> 'falhas_consecutivas', '') ~ '^\d+$'
                then (v_bloqueio ->> 'falhas_consecutivas')::integer + 1
              else 2
            end
          else 1
        end,
      'pausas', coalesce(
        v_bloqueio -> 'pausas',
        jsonb_build_object(
          'conversas_encerradas', 0,
          'execucoes_canceladas', 0,
          'agendamentos_cancelados', 0,
          'pendencias_ia_canceladas', 0,
          'execucoes_ia_canceladas', 0,
          'jobs_fila_cancelados', 0,
          'campanhas_pausadas', 0
        )
      )
    );

  update public.integracoes_whatsapp
  set
    meta_saude_ultima_verificacao_em = p_ocorrido_em,
    meta_saude_raw_json = jsonb_set(
      v_raw,
      '{bloqueio_financeiro_meta}',
      v_bloqueio,
      true
    ),
    updated_at = now()
  where id = p_integracao_id
    and empresa_id = p_empresa_id;

  return not v_ativo;
end;
$$;

create or replace function public.claim_whatsapp_meta_payment_send(
  p_empresa_id uuid,
  p_integracao_id uuid,
  p_agora timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_raw jsonb;
  v_bloqueio jsonb;
  v_cooldown_ate timestamptz;
  v_probe_ate timestamptz;
  v_novo_probe_ate timestamptz;
  v_nivel integer := 1;
begin
  select coalesce(meta_saude_raw_json, '{}'::jsonb)
    into v_raw
  from public.integracoes_whatsapp
  where id = p_integracao_id
    and empresa_id = p_empresa_id
  for update;

  if not found then
    return jsonb_build_object(
      'permitido', true,
      'modo', 'normal',
      'motivo', 'integracao_nao_encontrada'
    );
  end if;

  v_bloqueio := coalesce(v_raw -> 'bloqueio_financeiro_meta', '{}'::jsonb);

  if lower(coalesce(v_bloqueio ->> 'ativo', 'false')) <> 'true' then
    return jsonb_build_object('permitido', true, 'modo', 'normal');
  end if;

  begin
    v_nivel := greatest(
      1,
      coalesce((v_bloqueio ->> 'cooldown_nivel')::integer, 1)
    );
  exception when others then
    v_nivel := 1;
  end;

  begin
    v_cooldown_ate :=
      nullif(v_bloqueio ->> 'cooldown_ate', '')::timestamptz;
  exception when others then
    v_cooldown_ate := null;
  end;

  if v_cooldown_ate is not null and v_cooldown_ate > p_agora then
    return jsonb_build_object(
      'permitido', false,
      'modo', 'cooldown',
      'retry_at', v_cooldown_ate,
      'cooldown_nivel', v_nivel
    );
  end if;

  begin
    v_probe_ate :=
      nullif(v_bloqueio ->> 'probe_em_andamento_ate', '')::timestamptz;
  exception when others then
    v_probe_ate := null;
  end;

  if v_probe_ate is not null and v_probe_ate > p_agora then
    return jsonb_build_object(
      'permitido', false,
      'modo', 'aguardando_probe',
      'retry_at', v_probe_ate,
      'cooldown_nivel', v_nivel
    );
  end if;

  v_novo_probe_ate := p_agora + interval '8 seconds';
  v_bloqueio :=
    v_bloqueio ||
    jsonb_build_object(
      'probe_iniciado_em', p_agora,
      'probe_em_andamento_ate', v_novo_probe_ate
    );

  update public.integracoes_whatsapp
  set
    meta_saude_raw_json = jsonb_set(
      v_raw,
      '{bloqueio_financeiro_meta}',
      v_bloqueio,
      true
    ),
    updated_at = now()
  where id = p_integracao_id
    and empresa_id = p_empresa_id;

  return jsonb_build_object(
    'permitido', true,
    'modo', 'probe',
    'probe_ate', v_novo_probe_ate,
    'cooldown_nivel', v_nivel
  );
end;
$$;

create or replace function public.clear_whatsapp_meta_payment_warning_if_older(
  p_empresa_id uuid,
  p_integracao_id uuid,
  p_mensagem_criada_em timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_raw jsonb;
  v_bloqueio jsonb;
  v_ultima_falha timestamptz;
  v_agora timestamptz := now();
begin
  if p_empresa_id is null
    or p_integracao_id is null
    or p_mensagem_criada_em is null then
    return false;
  end if;

  select coalesce(meta_saude_raw_json, '{}'::jsonb)
    into v_raw
  from public.integracoes_whatsapp
  where id = p_integracao_id
    and empresa_id = p_empresa_id
  for update;

  if not found then
    return false;
  end if;

  v_bloqueio := coalesce(v_raw -> 'bloqueio_financeiro_meta', '{}'::jsonb);

  if lower(coalesce(v_bloqueio ->> 'ativo', 'false')) <> 'true' then
    return false;
  end if;

  begin
    v_ultima_falha :=
      nullif(v_bloqueio ->> 'ultima_falha_em', '')::timestamptz;
  exception when others then
    return false;
  end;

  if v_ultima_falha is null or p_mensagem_criada_em <= v_ultima_falha then
    return false;
  end if;

  v_bloqueio :=
    v_bloqueio ||
    jsonb_build_object(
      'ativo', false,
      'resolvido_em', v_agora,
      'resolvido_por', 'envio_confirmado',
      'cooldown_nivel', 0,
      'cooldown_segundos', 0,
      'cooldown_ate', null,
      'probe_em_andamento_ate', null,
      'falhas_consecutivas', 0
    );

  update public.integracoes_whatsapp
  set
    meta_saude_ultima_verificacao_em = v_agora,
    meta_saude_raw_json = jsonb_set(
      v_raw,
      '{bloqueio_financeiro_meta}',
      v_bloqueio,
      true
    ),
    updated_at = v_agora
  where id = p_integracao_id
    and empresa_id = p_empresa_id;

  return true;
end;
$$;

revoke all on function public.claim_whatsapp_meta_payment_send(
  uuid,
  uuid,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.claim_whatsapp_meta_payment_send(
  uuid,
  uuid,
  timestamptz
) to service_role;
