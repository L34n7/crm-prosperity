-- A exclusao de um fluxo percorre as FKs diretas e as tabelas filhas das
-- execucoes, blocos e conexoes. Sem estes indices, o Postgres pode fazer
-- varreduras completas e ultrapassar o statement_timeout do Supabase.

create index if not exists agenda_agendamentos_automacao_fluxo_exclusao_idx
  on public.agenda_agendamentos (automacao_fluxo_id, empresa_id)
  where automacao_fluxo_id is not null;

create index if not exists agenda_agendamentos_automacao_execucao_exclusao_idx
  on public.agenda_agendamentos (automacao_execucao_id)
  where automacao_execucao_id is not null;

create index if not exists agenda_agendamentos_automacao_no_exclusao_idx
  on public.agenda_agendamentos (automacao_no_id)
  where automacao_no_id is not null;

create index if not exists automacao_nos_fluxo_exclusao_idx
  on public.automacao_nos (fluxo_id);

create index if not exists automacao_conexoes_fluxo_exclusao_idx
  on public.automacao_conexoes (fluxo_id);

create index if not exists automacao_conexoes_origem_exclusao_idx
  on public.automacao_conexoes (no_origem_id);

create index if not exists automacao_conexoes_destino_exclusao_idx
  on public.automacao_conexoes (no_destino_id);

create index if not exists automacao_gatilhos_fluxo_exclusao_idx
  on public.automacao_gatilhos (fluxo_id);

create index if not exists automacao_execucoes_fluxo_exclusao_idx
  on public.automacao_execucoes (fluxo_id);

create index if not exists automacao_agendamentos_fluxo_exclusao_idx
  on public.automacao_agendamentos (fluxo_id);

create index if not exists automacao_agendamentos_execucao_exclusao_idx
  on public.automacao_agendamentos (execucao_id);

create index if not exists automacao_agendamentos_no_exclusao_idx
  on public.automacao_agendamentos (no_id);

create index if not exists automacao_execucao_logs_fluxo_exclusao_idx
  on public.automacao_execucao_logs (fluxo_id);

create index if not exists automacao_execucao_logs_execucao_exclusao_idx
  on public.automacao_execucao_logs (execucao_id);

create index if not exists automacao_execucao_logs_no_exclusao_idx
  on public.automacao_execucao_logs (no_id);

create index if not exists automacao_execucao_logs_conexao_exclusao_idx
  on public.automacao_execucao_logs (conexao_id);

create index if not exists automacao_variaveis_execucao_exclusao_idx
  on public.automacao_variaveis (execucao_id)
  where execucao_id is not null;

create index if not exists automacao_arquivo_analises_fluxo_exclusao_idx
  on public.automacao_arquivo_analises (fluxo_id);

create index if not exists automacao_arquivo_analises_execucao_exclusao_idx
  on public.automacao_arquivo_analises (execucao_id);

create index if not exists automacao_arquivo_analises_no_exclusao_idx
  on public.automacao_arquivo_analises (no_id);

create index if not exists automacao_versoes_automacao_exclusao_idx
  on public.automacao_versoes (automacao_id);
