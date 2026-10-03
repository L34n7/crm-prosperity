create table if not exists public.contato_automacoes_integracoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  contato_id uuid not null references public.contatos(id) on delete cascade,
  integracao_whatsapp_id uuid not null references public.integracoes_whatsapp(id) on delete cascade,
  desabilitadas boolean not null default false,
  desabilitadas_em timestamptz,
  desabilitadas_por uuid references public.usuarios(id) on delete set null,
  habilitadas_em timestamptz,
  habilitadas_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contato_automacoes_integracoes_unq
    unique (empresa_id, contato_id, integracao_whatsapp_id)
);

comment on table public.contato_automacoes_integracoes is
  'Controla a habilitacao de Fluxos, Rotinas e Agentes de IA por contato e por integracao WhatsApp.';

comment on column public.contato_automacoes_integracoes.desabilitadas is
  'Quando true, bloqueia automacoes somente para este contato nesta integracao WhatsApp.';

alter table public.contato_automacoes_integracoes enable row level security;
revoke all on table public.contato_automacoes_integracoes from anon, authenticated;

insert into public.contato_automacoes_integracoes (
  empresa_id,
  contato_id,
  integracao_whatsapp_id,
  desabilitadas,
  desabilitadas_em,
  desabilitadas_por,
  created_at,
  updated_at
)
select distinct
  c.empresa_id,
  c.id,
  conv.integracao_whatsapp_id,
  true,
  coalesce(c.automacoes_desabilitadas_em, now()),
  c.automacoes_desabilitadas_por,
  now(),
  now()
from public.contatos c
join public.conversas conv
  on conv.empresa_id = c.empresa_id
 and conv.contato_id = c.id
where c.automacoes_desabilitadas = true
  and conv.integracao_whatsapp_id is not null
on conflict (empresa_id, contato_id, integracao_whatsapp_id)
do update set
  desabilitadas = excluded.desabilitadas,
  desabilitadas_em = excluded.desabilitadas_em,
  desabilitadas_por = excluded.desabilitadas_por,
  updated_at = now();

update public.contatos
set
  automacoes_desabilitadas = false,
  automacoes_desabilitadas_em = null,
  automacoes_desabilitadas_por = null
where automacoes_desabilitadas = true;

comment on column public.contatos.automacoes_desabilitadas is
  'Legado: o bloqueio de automacoes passou a ser controlado por contato + integracao em contato_automacoes_integracoes.';
comment on column public.contatos.automacoes_desabilitadas_em is
  'Legado: data do antigo bloqueio global por contato.';
comment on column public.contatos.automacoes_desabilitadas_por is
  'Legado: usuario do antigo bloqueio global por contato.';
