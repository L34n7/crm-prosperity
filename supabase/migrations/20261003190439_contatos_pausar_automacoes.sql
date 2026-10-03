alter table public.contatos
  add column if not exists automacoes_desabilitadas boolean not null default false,
  add column if not exists automacoes_desabilitadas_em timestamptz,
  add column if not exists automacoes_desabilitadas_por uuid references public.usuarios(id) on delete set null;

comment on column public.contatos.automacoes_desabilitadas is
  'Quando true, impede Fluxos, Rotinas e Agentes de IA de iniciarem ou continuarem atendimento automatico para o contato.';

comment on column public.contatos.automacoes_desabilitadas_em is
  'Data e hora em que as automacoes foram desabilitadas manualmente para o contato.';

comment on column public.contatos.automacoes_desabilitadas_por is
  'Usuario que desabilitou as automacoes para o contato.';
