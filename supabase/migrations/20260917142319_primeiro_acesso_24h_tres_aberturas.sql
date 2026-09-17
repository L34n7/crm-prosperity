-- Primeiro acesso com link próprio do CRM: válido por 24 horas e até 3 aberturas.
create table if not exists public.primeiro_acesso_tokens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  expira_em timestamptz not null,
  aberturas integer not null default 0,
  max_aberturas integer not null default 3,
  ultimo_acesso_em timestamptz,
  senha_definida_em timestamptz,
  invalidado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint primeiro_acesso_tokens_aberturas_check
    check (aberturas >= 0 and max_aberturas >= 1 and max_aberturas <= 10 and aberturas <= max_aberturas)
);

create index if not exists idx_primeiro_acesso_tokens_auth_user_id
  on public.primeiro_acesso_tokens(auth_user_id);
create index if not exists idx_primeiro_acesso_tokens_email
  on public.primeiro_acesso_tokens(lower(email));
create index if not exists idx_primeiro_acesso_tokens_expira_em
  on public.primeiro_acesso_tokens(expira_em);

alter table public.primeiro_acesso_tokens enable row level security;
revoke all on public.primeiro_acesso_tokens from public, anon, authenticated;
grant all on public.primeiro_acesso_tokens to service_role;

create or replace function public.obter_auth_user_id_por_email(p_email text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select u.id
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
    and u.deleted_at is null
  order by u.created_at asc
  limit 1;
$$;

create or replace function public.registrar_abertura_primeiro_acesso(p_token_hash text)
returns table(
  ok boolean,
  motivo text,
  email text,
  aberturas integer,
  max_aberturas integer,
  aberturas_restantes integer,
  expira_em timestamptz
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
    return query select false, 'invalido', null::text, 0, 3, 0, null::timestamptz;
    return;
  end if;

  if v_row.senha_definida_em is not null then
    return query select false, 'senha_definida', v_row.email, v_row.aberturas, v_row.max_aberturas, greatest(v_row.max_aberturas - v_row.aberturas, 0), v_row.expira_em;
    return;
  end if;

  if v_row.invalidado_em is not null then
    return query select false, 'invalidado', v_row.email, v_row.aberturas, v_row.max_aberturas, greatest(v_row.max_aberturas - v_row.aberturas, 0), v_row.expira_em;
    return;
  end if;

  if v_row.expira_em <= now() then
    return query select false, 'expirado', v_row.email, v_row.aberturas, v_row.max_aberturas, 0, v_row.expira_em;
    return;
  end if;

  if v_row.aberturas >= v_row.max_aberturas then
    return query select false, 'limite_aberturas', v_row.email, v_row.aberturas, v_row.max_aberturas, 0, v_row.expira_em;
    return;
  end if;

  update public.primeiro_acesso_tokens
  set aberturas = aberturas + 1,
      ultimo_acesso_em = now(),
      updated_at = now()
  where id = v_row.id
  returning * into v_row;

  return query select true, 'ok', v_row.email, v_row.aberturas, v_row.max_aberturas, greatest(v_row.max_aberturas - v_row.aberturas, 0), v_row.expira_em;
end;
$$;

revoke all on function public.obter_auth_user_id_por_email(text) from public, anon, authenticated;
grant execute on function public.obter_auth_user_id_por_email(text) to service_role;
revoke all on function public.registrar_abertura_primeiro_acesso(text) from public, anon, authenticated;
grant execute on function public.registrar_abertura_primeiro_acesso(text) to service_role;
