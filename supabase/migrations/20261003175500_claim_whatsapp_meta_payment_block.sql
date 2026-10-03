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

  if lower(coalesce(v_bloqueio ->> 'ativo', 'false')) = 'true' then
    v_bloqueio :=
      v_bloqueio ||
      jsonb_build_object(
        'codigo', p_codigo,
        'detalhe', p_detalhe,
        'ultima_falha_em', p_ocorrido_em,
        'mensagem_externa_id', p_mensagem_externa_id
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
      updated_at = p_ocorrido_em
    where id = p_integracao_id
      and empresa_id = p_empresa_id;

    return false;
  end if;

  v_bloqueio := jsonb_build_object(
    'ativo', true,
    'codigo', p_codigo,
    'detalhe', p_detalhe,
    'ocorrido_em', p_ocorrido_em,
    'ultima_falha_em', p_ocorrido_em,
    'mensagem_externa_id', p_mensagem_externa_id,
    'origem', 'webhook_status_meta',
    'pausas', jsonb_build_object(
      'conversas_encerradas', 0,
      'execucoes_canceladas', 0,
      'agendamentos_cancelados', 0,
      'pendencias_ia_canceladas', 0,
      'execucoes_ia_canceladas', 0,
      'jobs_fila_cancelados', 0,
      'campanhas_pausadas', 0
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
    updated_at = p_ocorrido_em
  where id = p_integracao_id
    and empresa_id = p_empresa_id;

  return true;
end;
$$;

revoke all on function public.claim_whatsapp_meta_payment_block(
  uuid, uuid, integer, text, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.claim_whatsapp_meta_payment_block(
  uuid, uuid, integer, text, text, timestamptz
) to service_role;
