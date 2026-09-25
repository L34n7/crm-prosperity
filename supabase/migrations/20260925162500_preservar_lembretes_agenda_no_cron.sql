-- Mantém a proteção contra envio retroativo sem cancelar uma execução que já
-- havia sido planejada antes do horário previsto.
--
-- Durante a reconciliação periódica, o cron roda naturalmente alguns segundos
-- depois de executar_em. Nesse caso, uma execução já existente deve permanecer
-- válida para ser reivindicada pelo worker; somente uma NOVA execução cujo
-- horário já passou continua bloqueada como retroativa.

create or replace function public.agenda_automacoes_planejar_agendamento_id(
  p_empresa_id uuid,
  p_agendamento_id uuid,
  p_reagendado boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_agendamento public.agenda_agendamentos%rowtype;
  v_regra public.agenda_automacao_regras%rowtype;
  v_referencia timestamptz;
  v_executar_em timestamptz;
  v_proxima_tentativa timestamptz;
  v_chave text;
  v_chaves_desejadas text[] := array[]::text[];
  v_planejados integer := 0;
  v_agora timestamptz := now();
begin
  select * into v_agendamento
    from public.agenda_agendamentos
   where id = p_agendamento_id and empresa_id = p_empresa_id;
  if not found then return 0; end if;

  if v_agendamento.status in ('cancelado', 'faltou') then
    update public.agenda_automacao_execucoes
       set status = 'cancelado',
           bloqueado_em = null,
           proxima_tentativa_em = null,
           erro = 'Execução cancelada porque o compromisso não está mais ativo.',
           updated_at = v_agora
     where empresa_id = p_empresa_id
       and agendamento_id = p_agendamento_id
       and regra_id is not null
       and status in ('pendente', 'processando', 'erro')
       and cancelado_manualmente = false;
    return 0;
  end if;

  for v_regra in
    select regra.*
      from public.agenda_automacao_regras regra
     where regra.empresa_id = p_empresa_id
       and regra.agenda_id = v_agendamento.agenda_id
       and regra.ativo = true
       and coalesce((regra.configuracao_json ->> 'execucao_habilitada')::boolean, true) = true
     order by regra.tipo, regra.ordem, regra.canal
  loop
    if v_regra.tipo = 'confirmacao' then
      if v_agendamento.status not in ('agendado', 'confirmado')
         or v_agendamento.confirmacao_status <> 'pendente' then
        continue;
      end if;
      v_referencia := v_agendamento.inicio_at;
      v_executar_em := v_referencia - make_interval(mins => v_regra.antecedencia_minutos);
    elsif v_regra.tipo in ('lembrete', 'aviso_responsavel') then
      if v_agendamento.status not in ('agendado', 'confirmado')
         or v_agendamento.confirmacao_status in ('reagendamento_solicitado', 'cancelamento_solicitado')
         or v_agendamento.inicio_at <= v_agora then
        continue;
      end if;
      v_referencia := v_agendamento.inicio_at;
      v_executar_em := v_referencia - make_interval(mins => v_regra.antecedencia_minutos);
    else
      if v_agendamento.status not in ('agendado', 'confirmado', 'realizado') then
        continue;
      end if;
      v_referencia := v_agendamento.fim_at;
      v_executar_em := v_referencia + make_interval(mins => v_regra.antecedencia_minutos);
    end if;

    if v_regra.tipo <> 'pos_atendimento' and v_referencia <= v_agora then
      continue;
    end if;

    v_chave := concat_ws(
      ':', 'agenda', v_agendamento.id::text, v_regra.tipo,
      v_regra.canal, v_regra.ordem::text,
      floor(extract(epoch from v_referencia))::bigint::text,
      v_regra.antecedencia_minutos::text
    );

    if v_regra.tipo in ('confirmacao', 'lembrete', 'aviso_responsavel')
       and v_executar_em <= v_agora then
      -- Não cria lembrete retroativo novo. Porém, se esta execução já havia
      -- sido planejada antes do vencimento, preserva a chave durante a
      -- reconciliação para que ela seja reivindicada logo em seguida.
      if exists (
        select 1
          from public.agenda_automacao_execucoes execucao_existente
         where execucao_existente.empresa_id = p_empresa_id
           and execucao_existente.agendamento_id = p_agendamento_id
           and execucao_existente.regra_id = v_regra.id
           and execucao_existente.chave_idempotencia = v_chave
           and execucao_existente.executar_em = v_executar_em
           and execucao_existente.status in ('pendente', 'processando', 'erro')
           and execucao_existente.cancelado_manualmente = false
      ) then
        v_chaves_desejadas := array_append(v_chaves_desejadas, v_chave);
      end if;

      continue;
    end if;

    v_proxima_tentativa := greatest(v_executar_em, v_agora);
    v_chaves_desejadas := array_append(v_chaves_desejadas, v_chave);

    insert into public.agenda_automacao_execucoes (
      empresa_id, agenda_id, agendamento_id, regra_id, tipo, canal,
      chave_idempotencia, executar_em, status, tentativas, max_tentativas,
      proxima_tentativa_em, bloqueado_em, executado_em, mensagem_externa_id,
      erro, payload_json, resultado_json, cancelado_manualmente,
      cancelado_por, cancelado_em, updated_at
    ) values (
      p_empresa_id, v_agendamento.agenda_id, v_agendamento.id, v_regra.id,
      v_regra.tipo, v_regra.canal, v_chave, v_executar_em, 'pendente', 0, 5,
      v_proxima_tentativa, null, null, null, null,
      jsonb_build_object(
        'agenda_inicio_at', v_agendamento.inicio_at,
        'agenda_fim_at', v_agendamento.fim_at,
        'regra_atualizada_em', v_regra.updated_at,
        'planejado_em', v_agora,
        'reagendado', p_reagendado,
        'horario_original_programado', v_executar_em
      ),
      '{}'::jsonb, false, null, null, v_agora
    )
    on conflict (chave_idempotencia) do update
       set regra_id = excluded.regra_id,
           agenda_id = excluded.agenda_id,
           executar_em = excluded.executar_em,
           status = 'pendente',
           tentativas = 0,
           proxima_tentativa_em = excluded.proxima_tentativa_em,
           bloqueado_em = null,
           executado_em = null,
           mensagem_externa_id = null,
           erro = null,
           payload_json = excluded.payload_json,
           resultado_json = '{}'::jsonb,
           cancelado_manualmente = false,
           cancelado_por = null,
           cancelado_em = null,
           updated_at = excluded.updated_at
     where public.agenda_automacao_execucoes.cancelado_manualmente = false
       and public.agenda_automacao_execucoes.status <> 'concluido'
       and (
         public.agenda_automacao_execucoes.regra_id is distinct from excluded.regra_id
         or public.agenda_automacao_execucoes.executar_em is distinct from excluded.executar_em
         or public.agenda_automacao_execucoes.payload_json ->> 'agenda_inicio_at'
              is distinct from excluded.payload_json ->> 'agenda_inicio_at'
         or public.agenda_automacao_execucoes.payload_json ->> 'agenda_fim_at'
              is distinct from excluded.payload_json ->> 'agenda_fim_at'
         or public.agenda_automacao_execucoes.payload_json ->> 'regra_atualizada_em'
              is distinct from excluded.payload_json ->> 'regra_atualizada_em'
       );

    if found then v_planejados := v_planejados + 1; end if;
  end loop;

  update public.agenda_automacao_execucoes execucao
     set status = 'cancelado',
         bloqueado_em = null,
         proxima_tentativa_em = null,
         erro = case
           when p_reagendado then 'Execução substituída após alteração do agendamento.'
           else 'A regra não se aplica mais ao estado atual do agendamento.'
         end,
         updated_at = v_agora
   where execucao.empresa_id = p_empresa_id
     and execucao.agendamento_id = p_agendamento_id
     and execucao.regra_id is not null
     and execucao.status in ('pendente', 'processando', 'erro')
     and execucao.cancelado_manualmente = false
     and not (execucao.chave_idempotencia = any(v_chaves_desejadas));

  return v_planejados;
end;
$function$;
