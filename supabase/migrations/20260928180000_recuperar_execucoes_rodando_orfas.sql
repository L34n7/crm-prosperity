-- Limpa resíduos de execuções antigas que ficaram em "rodando"
-- sem job técnico ou agendamento ativo capaz de retomá-las.
-- O motor passa a aplicar a mesma proteção de forma orientada a evento.

with orfas as (
  select e.id
  from public.automacao_execucoes e
  where e.status = 'rodando'
    and e.updated_at < now() - interval '10 minutes'
    and not exists (
      select 1
      from public.fila_processamento_auto f
      where f.execucao_id = e.id
        and f.status in ('pendente', 'executando')
        and f.tipo_job <> 'arbitragem_hibrida'
    )
    and not exists (
      select 1
      from public.automacao_agendamentos a
      where a.execucao_id = e.id
        and a.status in ('pendente', 'executando')
    )
),
recuperadas as (
  update public.automacao_execucoes e
     set status = 'erro',
         finished_at = now(),
         updated_at = now(),
         metadata_json = coalesce(e.metadata_json, '{}'::jsonb)
           || jsonb_build_object(
                'motivo_erro', 'execucao_rodando_orfa',
                'execucao_orfa',
                jsonb_build_object(
                  'detectada_em', now(),
                  'origem', 'limpeza_migration_20260928',
                  'limite_minutos', 10
                )
              )
    from orfas o
   where e.id = o.id
  returning e.id, e.empresa_id, e.fluxo_id, e.no_atual_id
)
insert into public.automacao_execucao_logs (
  empresa_id,
  execucao_id,
  fluxo_id,
  no_id,
  tipo_evento,
  descricao,
  entrada_json,
  saida_json,
  created_at
)
select
  r.empresa_id,
  r.id,
  r.fluxo_id,
  r.no_atual_id,
  'execucao_rodando_orfa_recuperada',
  'Execução órfã antiga marcada como erro durante a limpeza de resíduos.',
  jsonb_build_object('limite_minutos', 10),
  jsonb_build_object('status', 'erro'),
  now()
from recuperadas r;
