create or replace function public.agenda_executar_rpc_contextual(
  p_usuario_id uuid,
  p_empresa_id uuid,
  p_operacao text,
  p_argumentos jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_auth_user_id uuid;
  v_operacao text := lower(trim(coalesce(p_operacao, '')));
  v_resultado jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Operacao permitida apenas para o backend do CRM.'
      using errcode = '42501';
  end if;

  select u.auth_user_id
    into v_auth_user_id
  from public.usuarios u
  where u.id = p_usuario_id
    and u.empresa_id = p_empresa_id
    and u.status = 'ativo'
    and u.auth_user_id is not null
  limit 1;

  if v_auth_user_id is null then
    raise exception 'Usuario de contexto nao encontrado ou inativo.'
      using errcode = '42501';
  end if;

  -- As RPCs legadas da Agenda resolvem empresa/usuario por auth.uid().
  -- Esta sobrescrita vale apenas durante a transacao desta chamada server-side.
  perform set_config('request.jwt.claim.sub', v_auth_user_id::text, true);

  case v_operacao
    when 'listar' then
      v_resultado := public.agenda_etapa1_listar(
        nullif(p_argumentos ->> 'agenda_id', '')::uuid,
        nullif(p_argumentos ->> 'inicio', '')::timestamptz,
        nullif(p_argumentos ->> 'fim', '')::timestamptz
      );

    when 'buscar_contatos' then
      v_resultado := public.agenda_etapa1_buscar_contatos(
        coalesce(p_argumentos ->> 'busca', ''),
        least(
          greatest(
            coalesce(nullif(p_argumentos ->> 'limite', '')::integer, 20),
            1
          ),
          50
        )
      );

    when 'salvar_tipo' then
      v_resultado := public.agenda_etapa1_salvar_tipo(
        nullif(p_argumentos ->> 'tipo_id', '')::uuid,
        p_argumentos ->> 'nome',
        coalesce(nullif(p_argumentos ->> 'cor', ''), '#22c55e'),
        coalesce(nullif(p_argumentos ->> 'icone', ''), 'calendar')
      );

    when 'salvar_agendamento' then
      v_resultado := public.agenda_etapa1_salvar_agendamento(
        nullif(p_argumentos ->> 'agenda_id', '')::uuid,
        nullif(p_argumentos ->> 'agendamento_id', '')::uuid,
        coalesce(p_argumentos -> 'payload', '{}'::jsonb)
      );

    else
      raise exception 'Operacao de agenda invalida.'
        using errcode = '22023';
  end case;

  return v_resultado;
end;
$$;

revoke all on function public.agenda_executar_rpc_contextual(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.agenda_executar_rpc_contextual(uuid, uuid, text, jsonb)
  to service_role;

comment on function public.agenda_executar_rpc_contextual(uuid, uuid, text, jsonb) is
  'Executa RPCs legadas da Agenda com contexto de usuario/empresa validado pelo backend, permitindo Sessao de suporte sem misturar contexto entre abas.';
