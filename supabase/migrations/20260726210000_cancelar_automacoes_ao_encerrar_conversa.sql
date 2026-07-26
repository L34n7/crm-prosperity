-- Garante que encerrar uma conversa finalize também as automações vinculadas.
-- A proteção fica no banco para cobrir interface, API, cron e operações administrativas.

create or replace function public.cancelar_automacoes_ativas_da_conversa(
  p_empresa_id uuid,
  p_conversa_id uuid,
  p_motivo text,
  p_cancelado_em timestamptz default now(),
  p_usuario_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_execucao record;
  v_execucao_ids uuid[] := array[]::uuid[];
  v_total integer := 0;
begin
  if p_empresa_id is null or p_conversa_id is null then
    return 0;
  end if;

  for v_execucao in
    update public.automacao_execucoes as execucao
       set status = 'cancelado',
           finished_at = coalesce(p_cancelado_em, now()),
           updated_at = coalesce(p_cancelado_em, now()),
           metadata_json = coalesce(execucao.metadata_json, '{}'::jsonb)
             || jsonb_strip_nulls(
                  jsonb_build_object(
                    'motivo_cancelamento', coalesce(nullif(btrim(p_motivo), ''), 'conversa_encerrada'),
                    'cancelado_em', coalesce(p_cancelado_em, now()),
                    'usuario_responsavel_id', p_usuario_id,
                    'origem_cancelamento', 'encerramento_conversa'
                  )
                )
     where execucao.empresa_id = p_empresa_id
       and execucao.conversa_id = p_conversa_id
       and execucao.status in ('rodando', 'aguardando')
    returning
      execucao.id,
      execucao.empresa_id,
      execucao.fluxo_id,
      execucao.no_atual_id
  loop
    v_execucao_ids := array_append(v_execucao_ids, v_execucao.id);
    v_total := v_total + 1;

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
    ) values (
      v_execucao.empresa_id,
      v_execucao.id,
      v_execucao.fluxo_id,
      v_execucao.no_atual_id,
      'execucao_cancelada_conversa_encerrada',
      'Execução cancelada porque a conversa foi encerrada.',
      jsonb_strip_nulls(
        jsonb_build_object(
          'conversa_id', p_conversa_id,
          'motivo', coalesce(nullif(btrim(p_motivo), ''), 'conversa_encerrada'),
          'usuario_responsavel_id', p_usuario_id
        )
      ),
      jsonb_build_object(
        'status', 'cancelado',
        'cancelado_em', coalesce(p_cancelado_em, now())
      ),
      coalesce(p_cancelado_em, now())
    );
  end loop;

  if cardinality(v_execucao_ids) > 0 then
    update public.automacao_agendamentos as agendamento
       set status = 'cancelado',
           locked_at = null,
           payload_json = coalesce(agendamento.payload_json, '{}'::jsonb)
             || jsonb_build_object(
                  'motivo_cancelamento', coalesce(nullif(btrim(p_motivo), ''), 'conversa_encerrada'),
                  'cancelado_em', coalesce(p_cancelado_em, now())
                )
     where agendamento.empresa_id = p_empresa_id
       and agendamento.execucao_id = any(v_execucao_ids)
       and agendamento.status in ('pendente', 'executando');
  end if;

  update public.fila_processamento_auto as job
     set status = 'cancelado',
         locked_at = null,
         updated_at = coalesce(p_cancelado_em, now()),
         payload_json = coalesce(job.payload_json, '{}'::jsonb)
           || jsonb_build_object(
                'motivo_cancelamento', coalesce(nullif(btrim(p_motivo), ''), 'conversa_encerrada'),
                'cancelado_em', coalesce(p_cancelado_em, now())
              )
   where job.empresa_id = p_empresa_id
     and (
       job.conversa_id = p_conversa_id
       or (
         cardinality(v_execucao_ids) > 0
         and job.execucao_id = any(v_execucao_ids)
       )
     )
     and job.status in ('pendente', 'executando');

  return v_total;
end;
$$;

revoke all on function public.cancelar_automacoes_ativas_da_conversa(uuid, uuid, text, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.cancelar_automacoes_ativas_da_conversa(uuid, uuid, text, timestamptz, uuid)
  to service_role;

create or replace function public.cancelar_automacoes_ao_encerrar_conversa()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status_encerrados constant text[] := array[
    'encerrado_manual',
    'encerrado_24h',
    'encerrado_aut'
  ];
begin
  if new.status = any(v_status_encerrados)
     and not (coalesce(old.status, '') = any(v_status_encerrados)) then
    perform public.cancelar_automacoes_ativas_da_conversa(
      new.empresa_id,
      new.id,
      case new.status
        when 'encerrado_manual' then 'conversa_encerrada_manualmente'
        when 'encerrado_24h' then 'conversa_encerrada_janela_24h'
        when 'encerrado_aut' then 'conversa_encerrada_automaticamente'
        else 'conversa_encerrada'
      end,
      coalesce(new.closed_at, new.updated_at, now()),
      null
    );
  end if;

  return new;
end;
$$;

revoke all on function public.cancelar_automacoes_ao_encerrar_conversa()
  from public, anon, authenticated;
grant execute on function public.cancelar_automacoes_ao_encerrar_conversa()
  to service_role;

drop trigger if exists trg_cancelar_automacoes_ao_encerrar_conversa
  on public.conversas;

create trigger trg_cancelar_automacoes_ao_encerrar_conversa
after update of status on public.conversas
for each row
execute function public.cancelar_automacoes_ao_encerrar_conversa();

-- Corrige resíduos anteriores sem depender de IDs específicos.
do $$
declare
  v_conversa record;
begin
  for v_conversa in
    select distinct
      conversa.empresa_id,
      conversa.id as conversa_id,
      conversa.status,
      coalesce(conversa.closed_at, conversa.updated_at, now()) as cancelado_em
    from public.conversas as conversa
    join public.automacao_execucoes as execucao
      on execucao.empresa_id = conversa.empresa_id
     and execucao.conversa_id = conversa.id
     and execucao.status in ('rodando', 'aguardando')
    where conversa.status in ('encerrado_manual', 'encerrado_24h', 'encerrado_aut')
  loop
    perform public.cancelar_automacoes_ativas_da_conversa(
      v_conversa.empresa_id,
      v_conversa.conversa_id,
      'limpeza_residual_conversa_' || v_conversa.status,
      v_conversa.cancelado_em,
      null
    );
  end loop;
end;
$$;
