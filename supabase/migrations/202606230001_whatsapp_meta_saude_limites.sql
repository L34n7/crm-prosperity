alter table public.integracoes_whatsapp
  add column if not exists meta_messaging_limit_tier text,
  add column if not exists meta_messaging_limit integer,
  add column if not exists meta_account_mode text,
  add column if not exists meta_saude_ultima_verificacao_em timestamptz,
  add column if not exists meta_saude_raw_json jsonb;

create table if not exists public.whatsapp_meta_saude_historico (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  integracao_whatsapp_id uuid not null references public.integracoes_whatsapp(id) on delete cascade,
  phone_number_id text,
  phone_number_status text,
  quality_rating text,
  messaging_limit_tier text,
  messaging_limit integer,
  account_mode text,
  raw_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_meta_saude_historico_integracao_created
  on public.whatsapp_meta_saude_historico (integracao_whatsapp_id, created_at desc);

create table if not exists public.whatsapp_meta_conversas_iniciadas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  integracao_whatsapp_id uuid not null references public.integracoes_whatsapp(id) on delete cascade,
  phone_number_id text,
  telefone_normalizado text not null,
  contato_id uuid references public.contatos(id) on delete set null,
  conversa_id uuid references public.conversas(id) on delete set null,
  template_id uuid references public.whatsapp_templates(id) on delete set null,
  template_nome text,
  usuario_id uuid references public.usuarios(id) on delete set null,
  origem text not null default 'disparo_template',
  message_id text,
  status text not null default 'reservado',
  reservado_em timestamptz not null default now(),
  enviado_em timestamptz,
  janela_expira_em timestamptz not null default (now() + interval '24 hours'),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_meta_conversas_iniciadas_status_check
    check (status in ('reservado', 'processando', 'enviado', 'falha', 'cancelado'))
);

create index if not exists idx_whatsapp_meta_conversas_iniciadas_limite
  on public.whatsapp_meta_conversas_iniciadas (
    integracao_whatsapp_id,
    janela_expira_em,
    status,
    telefone_normalizado
  );

create index if not exists idx_whatsapp_meta_conversas_iniciadas_empresa_created
  on public.whatsapp_meta_conversas_iniciadas (empresa_id, created_at desc);

create or replace function public.reservar_whatsapp_meta_limite(
  p_empresa_id uuid,
  p_integracao_whatsapp_id uuid,
  p_phone_number_id text,
  p_telefones text[],
  p_limite integer,
  p_origem text default 'disparo_template',
  p_template_id uuid default null,
  p_template_nome text default null,
  p_usuario_id uuid default null,
  p_metadata_json jsonb default '{}'::jsonb
)
returns table (
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
    raise exception 'Limite de mensagens/conversas Meta invalido.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_integracao_whatsapp_id::text));

  select coalesce(array_agg(distinct telefone), array[]::text[])
    into v_telefones
  from (
    select regexp_replace(coalesce(item, ''), '\D', '', 'g') as telefone
    from unnest(coalesce(p_telefones, array[]::text[])) as t(item)
  ) normalizados
  where char_length(telefone) >= 10;

  if coalesce(array_length(v_telefones, 1), 0) = 0 then
    return query
      select true, p_limite, 0, 0, p_limite, array[]::text[], array[]::uuid[];
    return;
  end if;

  select count(distinct telefone_normalizado)::integer
    into v_usados
  from public.whatsapp_meta_conversas_iniciadas
  where integracao_whatsapp_id = p_integracao_whatsapp_id
    and empresa_id = p_empresa_id
    and janela_expira_em > now()
    and status in ('reservado', 'processando', 'enviado');

  select coalesce(array_agg(telefone), array[]::text[])
    into v_novos
  from unnest(v_telefones) as t(telefone)
  where not exists (
    select 1
    from public.whatsapp_meta_conversas_iniciadas existentes
    where existentes.integracao_whatsapp_id = p_integracao_whatsapp_id
      and existentes.empresa_id = p_empresa_id
      and existentes.telefone_normalizado = telefone
      and existentes.janela_expira_em > now()
      and existentes.status in ('reservado', 'processando', 'enviado')
  );

  v_restantes := greatest(p_limite - v_usados, 0);

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
        nullif(p_phone_number_id, ''),
        telefone,
        p_template_id,
        p_template_nome,
        p_usuario_id,
        coalesce(nullif(p_origem, ''), 'disparo_template'),
        'reservado',
        coalesce(p_metadata_json, '{}'::jsonb)
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
      greatest(p_limite - v_usados - coalesce(array_length(v_novos, 1), 0), 0),
      array[]::text[],
      coalesce(v_reserva_ids, array[]::uuid[]);
end;
$$;

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
