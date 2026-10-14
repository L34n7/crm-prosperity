alter table public.primeiro_acesso_tokens
  add column if not exists resend_email_id text,
  add column if not exists email_delivery_status text,
  add column if not exists email_delivery_updated_at timestamptz,
  add column if not exists email_delivery_event_id text,
  add column if not exists email_delivery_error text,
  add column if not exists email_failure_notified_at timestamptz;

create unique index if not exists primeiro_acesso_tokens_resend_email_uidx
  on public.primeiro_acesso_tokens (resend_email_id)
  where resend_email_id is not null;

create index if not exists primeiro_acesso_tokens_delivery_status_idx
  on public.primeiro_acesso_tokens (email_delivery_status, email_delivery_updated_at desc)
  where email_delivery_status is not null;

create or replace function public.corrigir_email_acesso_empresa(
  p_empresa_id uuid,
  p_email_antigo text,
  p_email_novo text,
  p_auth_user_id uuid default null,
  p_agora timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_empresas integer := 0;
  v_leads integer := 0;
  v_usuarios integer := 0;
  v_assinaturas integer := 0;
  v_tokens integer := 0;
begin
  if p_empresa_id is null then
    raise exception 'Empresa obrigatória.';
  end if;

  if nullif(trim(coalesce(p_email_novo, '')), '') is null then
    raise exception 'Novo e-mail obrigatório.';
  end if;

  if exists (
    select 1
    from public.empresas
    where lower(email) = lower(trim(p_email_novo))
      and id <> p_empresa_id
  ) then
    raise exception 'O novo e-mail já está vinculado a outra empresa.';
  end if;

  update public.empresas
  set
    email = lower(trim(p_email_novo)),
    updated_at = p_agora
  where id = p_empresa_id
    and (
      lower(email) = lower(trim(coalesce(p_email_antigo, '')))
      or lower(email) = lower(trim(p_email_novo))
    );
  get diagnostics v_empresas = row_count;

  if v_empresas = 0 then
    raise exception 'Empresa não encontrada ou e-mail atual divergente.';
  end if;

  update public.leads_cadastro
  set
    email = lower(trim(p_email_novo)),
    updated_at = p_agora
  where empresa_id = p_empresa_id
    and lower(email) = lower(trim(coalesce(p_email_antigo, '')));
  get diagnostics v_leads = row_count;

  update public.usuarios
  set
    email = lower(trim(p_email_novo)),
    updated_at = p_agora
  where empresa_id = p_empresa_id
    and (
      (p_auth_user_id is not null and auth_user_id = p_auth_user_id)
      or lower(email) = lower(trim(coalesce(p_email_antigo, '')))
    );
  get diagnostics v_usuarios = row_count;

  update public.prosperity_pay_assinaturas
  set
    customer_email = lower(trim(p_email_novo)),
    updated_at = p_agora
  where empresa_id = p_empresa_id;
  get diagnostics v_assinaturas = row_count;

  update public.primeiro_acesso_tokens
  set
    invalidado_em = coalesce(invalidado_em, p_agora),
    updated_at = p_agora
  where empresa_id = p_empresa_id
    and senha_definida_em is null
    and invalidado_em is null;
  get diagnostics v_tokens = row_count;

  return jsonb_build_object(
    'empresas', v_empresas,
    'leads', v_leads,
    'usuarios', v_usuarios,
    'assinaturas', v_assinaturas,
    'tokens_invalidados', v_tokens
  );
end;
$$;

revoke all on function public.corrigir_email_acesso_empresa(
  uuid, text, text, uuid, timestamptz
) from public, anon, authenticated;

grant execute on function public.corrigir_email_acesso_empresa(
  uuid, text, text, uuid, timestamptz
) to service_role;
