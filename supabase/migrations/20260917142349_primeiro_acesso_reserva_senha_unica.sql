-- Trava concorrente para garantir que a senha do primeiro acesso só possa ser cadastrada uma vez.
alter table public.primeiro_acesso_tokens
  add column if not exists processando_em timestamptz;

create or replace function public.reservar_definicao_senha_primeiro_acesso(p_token_hash text)
returns table(
  ok boolean,
  motivo text,
  auth_user_id uuid,
  empresa_id uuid,
  email text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.primeiro_acesso_tokens%rowtype;
begin
  select * into v_row
  from public.primeiro_acesso_tokens
  where token_hash = p_token_hash
  for update;

  if not found then
    return query select false, 'invalido', null::uuid, null::uuid, null::text;
    return;
  end if;

  if v_row.senha_definida_em is not null then
    return query select false, 'senha_definida', v_row.auth_user_id, v_row.empresa_id, v_row.email;
    return;
  end if;

  if v_row.invalidado_em is not null then
    return query select false, 'invalidado', v_row.auth_user_id, v_row.empresa_id, v_row.email;
    return;
  end if;

  if v_row.expira_em <= now() then
    return query select false, 'expirado', v_row.auth_user_id, v_row.empresa_id, v_row.email;
    return;
  end if;

  if v_row.aberturas < 1 or v_row.aberturas > v_row.max_aberturas then
    return query select false, 'abertura_necessaria', v_row.auth_user_id, v_row.empresa_id, v_row.email;
    return;
  end if;

  if v_row.processando_em is not null and v_row.processando_em > now() - interval '5 minutes' then
    return query select false, 'processando', v_row.auth_user_id, v_row.empresa_id, v_row.email;
    return;
  end if;

  update public.primeiro_acesso_tokens
  set processando_em = now(), updated_at = now()
  where id = v_row.id;

  return query select true, 'ok', v_row.auth_user_id, v_row.empresa_id, v_row.email;
end;
$$;

create or replace function public.concluir_definicao_senha_primeiro_acesso(p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.primeiro_acesso_tokens
  set senha_definida_em = now(),
      processando_em = null,
      updated_at = now()
  where token_hash = p_token_hash
    and senha_definida_em is null
    and invalidado_em is null
    and processando_em is not null;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.liberar_reserva_senha_primeiro_acesso(p_token_hash text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.primeiro_acesso_tokens
  set processando_em = null, updated_at = now()
  where token_hash = p_token_hash
    and senha_definida_em is null;
$$;

revoke all on function public.reservar_definicao_senha_primeiro_acesso(text) from public, anon, authenticated;
grant execute on function public.reservar_definicao_senha_primeiro_acesso(text) to service_role;
revoke all on function public.concluir_definicao_senha_primeiro_acesso(text) from public, anon, authenticated;
grant execute on function public.concluir_definicao_senha_primeiro_acesso(text) to service_role;
revoke all on function public.liberar_reserva_senha_primeiro_acesso(text) from public, anon, authenticated;
grant execute on function public.liberar_reserva_senha_primeiro_acesso(text) to service_role;
