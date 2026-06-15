create table if not exists public.chat_macros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  titulo text not null,
  conteudo text not null,
  ativo boolean not null default true,
  ordem integer not null default 0,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_macros_titulo_tamanho_check
    check (char_length(btrim(titulo)) between 1 and 80),
  constraint chat_macros_conteudo_tamanho_check
    check (char_length(btrim(conteudo)) between 1 and 4000)
);

create index if not exists chat_macros_usuario_ativas_idx
  on public.chat_macros (empresa_id, usuario_id, ativo, ordem, updated_at desc);

create index if not exists chat_macros_empresa_idx
  on public.chat_macros (empresa_id);

comment on table public.chat_macros is
  'Textos salvos por usuario para respostas rapidas no chat.';
