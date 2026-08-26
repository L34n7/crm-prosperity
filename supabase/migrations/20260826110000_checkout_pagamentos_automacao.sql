-- Checkout de pagamentos para automacoes de venda.

alter table public.automacao_nos
  drop constraint if exists automacao_nos_tipo_no_check;

alter table public.automacao_nos
  add constraint automacao_nos_tipo_no_check
  check (
    tipo_no = any (
      array[
        'inicio'::text,
        'enviar_texto'::text,
        'pergunta_opcoes'::text,
        'pergunta_livre_ia'::text,
        'transferir_setor'::text,
        'encerrar'::text,
        'enviar_imagem'::text,
        'enviar_video'::text,
        'enviar_audio'::text,
        'enviar_arquivo'::text,
        'enviar_botoes'::text,
        'botao_redirect'::text,
        'avaliacao'::text,
        'capturar_resposta'::text,
        'agendar_disparo'::text,
        'agenda_buscar_agendamento'::text,
        'agenda_escolher_horario'::text,
        'agenda_criar_agendamento'::text,
        'agenda_remarcar_agendamento'::text,
        'agenda_cancelar_agendamento'::text,
        'interpretar_arquivo_ia'::text,
        'consultar_estoque'::text,
        'checkout_pagamento'::text
      ]
    )
  ) not valid;

create table if not exists public.pagamento_gateway_transacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  execucao_id uuid not null references public.automacao_execucoes(id) on delete cascade,
  fluxo_id uuid not null references public.automacao_fluxos(id) on delete cascade,
  no_id uuid not null references public.automacao_nos(id) on delete cascade,
  visita integer not null default 1 check (visita > 0),
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  contato_id uuid references public.contatos(id) on delete set null,
  comercial_documento_id uuid references public.comercial_documentos(id) on delete restrict,
  comercial_pagamento_id uuid references public.comercial_pagamentos(id) on delete restrict,
  gateway text not null check (gateway in ('mercado_pago')),
  gateway_preference_id text,
  gateway_payment_id text,
  external_reference text not null,
  checkout_url text,
  valor numeric(14,2) not null check (valor > 0),
  status text not null default 'criando'
    check (status in ('criando','aguardando_pagamento','processando','aprovado','cancelado','expirado','erro')),
  expira_em timestamptz not null,
  aprovado_em timestamptz,
  cancelado_em timestamptz,
  payload_json jsonb not null default '{}'::jsonb,
  ultimo_erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, execucao_id, no_id, visita),
  unique (gateway, external_reference)
);

create unique index if not exists pagamento_gateway_transacoes_payment_uidx
  on public.pagamento_gateway_transacoes (gateway, gateway_payment_id)
  where gateway_payment_id is not null;

create index if not exists pagamento_gateway_transacoes_expiracao_idx
  on public.pagamento_gateway_transacoes (status, expira_em)
  where status = 'aguardando_pagamento';

create index if not exists pagamento_gateway_transacoes_documento_idx
  on public.pagamento_gateway_transacoes (empresa_id, comercial_documento_id)
  where comercial_documento_id is not null;

alter table public.pagamento_gateway_transacoes enable row level security;

comment on table public.pagamento_gateway_transacoes is
  'Transacoes de gateways externos geradas por checkout de automacoes e outros canais.';
