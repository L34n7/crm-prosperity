-- Torna a arbitragem híbrida orientada a eventos para cancelamentos.
-- Mudanças para aguardando/finalizado são acordadas pelo motor da aplicação;
-- cancelamentos e erros são resolvidos imediatamente no banco.

create or replace function public.cancelar_arbitragens_hibridas_ao_encerrar_execucao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_agora timestamptz := coalesce(new.finished_at, new.updated_at, now());
begin
  if old.status is distinct from new.status
     and new.status in ('cancelado', 'erro') then
    update public.fila_processamento_auto as job
       set status = 'cancelado',
           locked_at = null,
           executed_at = coalesce(job.executed_at, v_agora),
           updated_at = v_agora,
           payload_json = coalesce(job.payload_json, '{}'::jsonb)
             || jsonb_build_object(
                  'motivo_cancelamento', 'execucao_' || new.status,
                  'cancelado_em', v_agora
                )
     where job.empresa_id = new.empresa_id
       and job.execucao_id = new.id
       and job.tipo_job = 'arbitragem_hibrida'
       and job.status in ('pendente', 'executando');
  end if;

  return new;
end;
$$;

revoke all on function public.cancelar_arbitragens_hibridas_ao_encerrar_execucao()
  from public, anon, authenticated;
grant execute on function public.cancelar_arbitragens_hibridas_ao_encerrar_execucao()
  to service_role;

drop trigger if exists trg_cancelar_arbitragens_hibridas_ao_encerrar_execucao
  on public.automacao_execucoes;

create trigger trg_cancelar_arbitragens_hibridas_ao_encerrar_execucao
after update of status on public.automacao_execucoes
for each row
when (old.status is distinct from new.status)
execute function public.cancelar_arbitragens_hibridas_ao_encerrar_execucao();
