alter table public.contatos
  add column if not exists interesse text;

comment on column public.contatos.interesse is
  'Interesse principal do contato, preenchido manualmente pelo usuário do CRM.';
