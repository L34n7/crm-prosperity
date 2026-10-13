-- Prioriza contatos que nunca receberam disparo na ação "Add todos".
-- A classificação considera somente itens efetivamente enviados e preserva
-- compatibilidade com itens legados que não possuem contato_id, usando telefone.

create or replace function public.classificar_contatos_historico_disparo(
  p_empresa_id uuid,
  p_contato_ids uuid[]
)
returns table(
  contato_id uuid,
  ja_recebeu_disparo boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    contato.id as contato_id,
    (
      exists (
        select 1
        from public.whatsapp_disparo_itens item
        where item.empresa_id = p_empresa_id
          and item.status = 'enviado'
          and item.contato_id = contato.id
      )
      or (
        nullif(public.normalizar_telefone_whatsapp(contato.telefone), '') is not null
        and exists (
          select 1
          from public.whatsapp_disparo_itens item
          where item.empresa_id = p_empresa_id
            and item.status = 'enviado'
            and item.contato_id is null
            and item.telefone_normalizado =
              public.normalizar_telefone_whatsapp(contato.telefone)
        )
      )
    ) as ja_recebeu_disparo
  from public.contatos contato
  where contato.empresa_id = p_empresa_id
    and contato.id = any(coalesce(p_contato_ids, '{}'::uuid[]));
$$;

revoke all on function public.classificar_contatos_historico_disparo(uuid, uuid[])
  from public, anon, authenticated;

grant execute on function public.classificar_contatos_historico_disparo(uuid, uuid[])
  to service_role;

-- Mantém o aviso financeiro da Meta não bloqueante e evita corrida entre
-- uma falha nova e o callback de sucesso de uma mensagem mais antiga.
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
  if p_empresa_id is null or p_integracao_id is null or p_mensagem_criada_em is null then
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
    v_ultima_falha := nullif(v_bloqueio ->> 'ultima_falha_em', '')::timestamptz;
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
      'resolvido_por', 'envio_confirmado'
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

revoke all on function public.clear_whatsapp_meta_payment_warning_if_older(uuid, uuid, timestamptz)
  from public, anon, authenticated;

grant execute on function public.clear_whatsapp_meta_payment_warning_if_older(uuid, uuid, timestamptz)
  to service_role;
