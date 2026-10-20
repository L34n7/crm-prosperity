alter table public.white_labels
  add column if not exists valor_mensal_centavos integer not null default 0;

alter table public.white_labels
  drop constraint if exists white_labels_valor_mensal_centavos_check;

alter table public.white_labels
  add constraint white_labels_valor_mensal_centavos_check
  check (valor_mensal_centavos >= 0);
