-- Corrige a trava atomica de idempotencia dos nos da automacao.
--
-- O motor grava o numero da visita no tipo_evento, por exemplo:
--   lock_execucao_no:1
--   lock_execucao_no:2
--
-- O indice anterior protegia somente o valor literal 'lock_execucao_no',
-- portanto nao impedia duas execucoes concorrentes do mesmo no/visita.
-- Mantemos a visita no identificador para permitir loops/revisitas legitimas
-- e passamos a tornar unico cada lock real gravado pelo motor.

-- Remove apenas marcadores de lock historicos excedentes. Os eventos reais
-- de execucao do no permanecem intactos no log de auditoria.
with locks_duplicados as (
  select
    id,
    row_number() over (
      partition by execucao_id, no_id, tipo_evento
      order by created_at asc, id asc
    ) as ordem
  from public.automacao_execucao_logs
  where tipo_evento = 'lock_execucao_no'
     or tipo_evento like 'lock_execucao_no:%'
)
delete from public.automacao_execucao_logs l
using locks_duplicados d
where l.id = d.id
  and d.ordem > 1;

-- Substitui o indice que apontava somente para o valor legado literal.
drop index if exists public.automacao_logs_lock_execucao_no_unico;

create unique index automacao_logs_lock_execucao_no_unico
  on public.automacao_execucao_logs (execucao_id, no_id, tipo_evento)
  where tipo_evento = 'lock_execucao_no'
     or tipo_evento like 'lock_execucao_no:%';

comment on index public.automacao_logs_lock_execucao_no_unico is
  'Impede atomicamente a execucao duplicada do mesmo no e da mesma visita. O sufixo :N preserva revisitas legitimas ao no.';
