create table if not exists public.whatsapp_supressoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  contato_id uuid references public.contatos(id) on delete set null,
  telefone_normalizado text not null,
  escopo text not null default 'todos_disparos'
    check (escopo in ('todos_disparos')),
  ativo boolean not null default true,
  bloqueado_em timestamptz not null default now(),
  bloqueio_origem text not null default 'palavra_chave'
    check (bloqueio_origem in ('palavra_chave', 'manual', 'importacao', 'api')),
  palavra_chave text,
  mensagem_id uuid references public.mensagens(id) on delete set null,
  mensagem_externa_id text,
  integracao_whatsapp_id uuid
    references public.integracoes_whatsapp(id) on delete set null,
  desbloqueado_em timestamptz,
  desbloqueado_por uuid references public.usuarios(id) on delete set null,
  motivo_desbloqueio text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, telefone_normalizado)
);

create index if not exists whatsapp_supressoes_ativas_empresa_telefone_idx
  on public.whatsapp_supressoes (empresa_id, telefone_normalizado)
  where ativo = true;

create table if not exists public.whatsapp_opt_out_contextos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  contato_id uuid references public.contatos(id) on delete set null,
  telefone_normalizado text not null,
  integracao_whatsapp_id uuid not null
    references public.integracoes_whatsapp(id) on delete cascade,
  conversa_id uuid references public.conversas(id) on delete set null,
  template_id uuid references public.whatsapp_templates(id) on delete set null,
  campanha_id uuid references public.whatsapp_disparo_campanhas(id) on delete set null,
  item_id uuid references public.whatsapp_disparo_itens(id) on delete set null,
  mensagem_externa_id text not null,
  status text not null default 'aguardando_resposta'
    check (
      status in (
        'aguardando_resposta',
        'consumido',
        'opt_out',
        'expirado',
        'cancelado'
      )
    ),
  enviado_em timestamptz not null default now(),
  expira_em timestamptz not null default (now() + interval '7 days'),
  respondido_em timestamptz,
  resposta_mensagem_id uuid references public.mensagens(id) on delete set null,
  resposta_mensagem_externa_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, mensagem_externa_id)
);

create index if not exists whatsapp_opt_out_contextos_pendentes_idx
  on public.whatsapp_opt_out_contextos (
    empresa_id,
    integracao_whatsapp_id,
    telefone_normalizado,
    enviado_em desc
  )
  where status = 'aguardando_resposta';

create table if not exists public.whatsapp_supressao_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  supressao_id uuid references public.whatsapp_supressoes(id) on delete set null,
  contato_id uuid references public.contatos(id) on delete set null,
  telefone_normalizado text not null,
  integracao_whatsapp_id uuid
    references public.integracoes_whatsapp(id) on delete set null,
  contexto_id uuid
    references public.whatsapp_opt_out_contextos(id) on delete set null,
  mensagem_id uuid references public.mensagens(id) on delete set null,
  mensagem_externa_id text,
  evento text not null
    check (
      evento in (
        'opt_out',
        'opt_out_repetido',
        'bloqueio_manual',
        'desbloqueio_manual'
      )
    ),
  origem text not null,
  palavra_chave text,
  usuario_id uuid references public.usuarios(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (empresa_id, mensagem_externa_id, evento)
);

create index if not exists whatsapp_supressao_eventos_contato_idx
  on public.whatsapp_supressao_eventos (
    empresa_id,
    telefone_normalizado,
    created_at desc
  );

alter table public.whatsapp_supressoes enable row level security;
alter table public.whatsapp_opt_out_contextos enable row level security;
alter table public.whatsapp_supressao_eventos enable row level security;

create or replace function public.registrar_whatsapp_opt_out(
  p_empresa_id uuid,
  p_contato_id uuid,
  p_telefone_normalizado text,
  p_integracao_whatsapp_id uuid,
  p_contexto_id uuid,
  p_mensagem_id uuid,
  p_mensagem_externa_id text,
  p_palavra_chave text,
  p_metadata_json jsonb default '{}'::jsonb
)
returns table (
  supressao_id uuid,
  ja_bloqueado boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supressao_id uuid;
  v_ja_bloqueado boolean := false;
begin
  if p_empresa_id is null or coalesce(trim(p_telefone_normalizado), '') = '' then
    raise exception 'Empresa e telefone sao obrigatorios para registrar opt-out.';
  end if;

  select s.id
    into v_supressao_id
  from public.whatsapp_supressoes s
  where s.empresa_id = p_empresa_id
    and s.telefone_normalizado = p_telefone_normalizado
    and s.ativo = true
  limit 1;

  v_ja_bloqueado := v_supressao_id is not null;

  insert into public.whatsapp_supressoes (
    empresa_id,
    contato_id,
    telefone_normalizado,
    escopo,
    ativo,
    bloqueado_em,
    bloqueio_origem,
    palavra_chave,
    mensagem_id,
    mensagem_externa_id,
    integracao_whatsapp_id,
    desbloqueado_em,
    desbloqueado_por,
    motivo_desbloqueio,
    metadata_json,
    updated_at
  )
  values (
    p_empresa_id,
    p_contato_id,
    p_telefone_normalizado,
    'todos_disparos',
    true,
    now(),
    'palavra_chave',
    p_palavra_chave,
    p_mensagem_id,
    p_mensagem_externa_id,
    p_integracao_whatsapp_id,
    null,
    null,
    null,
    coalesce(p_metadata_json, '{}'::jsonb),
    now()
  )
  on conflict (empresa_id, telefone_normalizado)
  do update set
    contato_id = coalesce(excluded.contato_id, whatsapp_supressoes.contato_id),
    ativo = true,
    bloqueado_em = case
      when whatsapp_supressoes.ativo then whatsapp_supressoes.bloqueado_em
      else excluded.bloqueado_em
    end,
    bloqueio_origem = excluded.bloqueio_origem,
    palavra_chave = excluded.palavra_chave,
    mensagem_id = excluded.mensagem_id,
    mensagem_externa_id = excluded.mensagem_externa_id,
    integracao_whatsapp_id = excluded.integracao_whatsapp_id,
    desbloqueado_em = null,
    desbloqueado_por = null,
    motivo_desbloqueio = null,
    metadata_json = whatsapp_supressoes.metadata_json || excluded.metadata_json,
    updated_at = now()
  returning id into v_supressao_id;

  if p_contexto_id is not null then
    update public.whatsapp_opt_out_contextos
    set
      status = 'opt_out',
      respondido_em = now(),
      resposta_mensagem_id = p_mensagem_id,
      resposta_mensagem_externa_id = p_mensagem_externa_id,
      updated_at = now()
    where id = p_contexto_id
      and empresa_id = p_empresa_id;
  end if;

  insert into public.whatsapp_supressao_eventos (
    empresa_id,
    supressao_id,
    contato_id,
    telefone_normalizado,
    integracao_whatsapp_id,
    contexto_id,
    mensagem_id,
    mensagem_externa_id,
    evento,
    origem,
    palavra_chave,
    metadata_json
  )
  values (
    p_empresa_id,
    v_supressao_id,
    p_contato_id,
    p_telefone_normalizado,
    p_integracao_whatsapp_id,
    p_contexto_id,
    p_mensagem_id,
    p_mensagem_externa_id,
    case when v_ja_bloqueado then 'opt_out_repetido' else 'opt_out' end,
    'webhook_whatsapp',
    p_palavra_chave,
    coalesce(p_metadata_json, '{}'::jsonb)
  )
  on conflict (empresa_id, mensagem_externa_id, evento) do nothing;

  return query
  select v_supressao_id, v_ja_bloqueado;
end;
$$;

revoke all on function public.registrar_whatsapp_opt_out(
  uuid,
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  text,
  text,
  jsonb
) from public, anon, authenticated;

grant execute on function public.registrar_whatsapp_opt_out(
  uuid,
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  text,
  text,
  jsonb
) to service_role;
