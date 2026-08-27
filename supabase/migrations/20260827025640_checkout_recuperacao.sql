-- Recuperacao de checkouts pendentes sem duplicar lembretes.

alter table public.pagamento_gateway_transacoes
  add column if not exists recuperacao_enviada_em timestamptz;

create index if not exists pagamento_gateway_transacoes_recuperacao_idx
  on public.pagamento_gateway_transacoes (status, recuperacao_enviada_em, created_at)
  where status = 'aguardando_pagamento';

comment on column public.pagamento_gateway_transacoes.recuperacao_enviada_em is
  'Momento em que a mensagem unica de recuperacao do checkout foi enviada.';
