alter table public.automacao_arquivo_analises
  drop constraint if exists automacao_arquivo_analises_fluxo_id_fkey;

alter table public.automacao_arquivo_analises
  add constraint automacao_arquivo_analises_fluxo_id_fkey
  foreign key (fluxo_id)
  references public.automacao_fluxos(id)
  on delete set null;

alter table public.automacao_arquivo_analises
  drop constraint if exists automacao_arquivo_analises_no_id_fkey;

alter table public.automacao_arquivo_analises
  add constraint automacao_arquivo_analises_no_id_fkey
  foreign key (no_id)
  references public.automacao_nos(id)
  on delete set null;

alter table public.automacao_arquivo_analises
  drop constraint if exists automacao_arquivo_analises_execucao_id_fkey;

alter table public.automacao_arquivo_analises
  add constraint automacao_arquivo_analises_execucao_id_fkey
  foreign key (execucao_id)
  references public.automacao_execucoes(id)
  on delete set null;
