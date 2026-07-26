alter table public.agenda_automacao_execucoes
  add column if not exists cancelado_manualmente boolean not null default false,
  add column if not exists cancelado_por uuid references public.usuarios(id) on delete set null,
  add column if not exists cancelado_em timestamptz;

create index if not exists agenda_automacao_execucoes_cancelamento_idx
  on public.agenda_automacao_execucoes(empresa_id, cancelado_manualmente, status, executar_em);

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
  v_chave text;
  v_planejados integer := 0;
  v_agora timestamptz := now();
begin
  select *
    into v_agendamento
    from public.agenda_agendamentos
   where id = p_agendamento_id
     and empresa_id = p_empresa_id;

  if not found then
    return 0;
  end if;

  update public.agenda_automacao_execucoes
     set status = 'cancelado',
         bloqueado_em = null,
         erro = case
           when p_reagendado then 'Execução substituída após alteração do agendamento.'
           else 'Execução substituída durante o replanejamento.'
         end,
         updated_at = v_agora
   where empresa_id = p_empresa_id
     and agendamento_id = p_agendamento_id
     and status in ('pendente', 'erro')
     and cancelado_manualmente = false;

  if v_agendamento.status in ('cancelado', 'faltou') then
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

    v_executar_em := greatest(v_executar_em, v_agora);
    v_chave := concat_ws(':',
      'agenda',
      v_agendamento.id::text,
      v_regra.tipo,
      v_regra.canal,
      v_regra.ordem::text,
      floor(extract(epoch from v_referencia))::bigint::text,
      v_regra.antecedencia_minutos::text
    );

    insert into public.agenda_automacao_execucoes (
      empresa_id,
      agenda_id,
      agendamento_id,
      regra_id,
      tipo,
      canal,
      chave_idempotencia,
      executar_em,
      status,
      tentativas,
      max_tentativas,
      proxima_tentativa_em,
      bloqueado_em,
      executado_em,
      mensagem_externa_id,
      erro,
      payload_json,
      resultado_json,
      cancelado_manualmente,
      cancelado_por,
      cancelado_em,
      updated_at
    ) values (
      p_empresa_id,
      v_agendamento.agenda_id,
      v_agendamento.id,
      v_regra.id,
      v_regra.tipo,
      v_regra.canal,
      v_chave,
      v_executar_em,
      'pendente',
      0,
      5,
      v_executar_em,
      null,
      null,
      null,
      null,
      jsonb_build_object(
        'agenda_inicio_at', v_agendamento.inicio_at,
        'agenda_fim_at', v_agendamento.fim_at,
        'regra_atualizada_em', v_regra.updated_at,
        'planejado_em', v_agora,
        'reagendado', p_reagendado
      ),
      '{}'::jsonb,
      false,
      null,
      null,
      v_agora
    )
    on conflict (chave_idempotencia) do update
       set regra_id = excluded.regra_id,
           agenda_id = excluded.agenda_id,
           executar_em = excluded.executar_em,
           status = 'pendente',
           tentativas = 0,
           proxima_tentativa_em = excluded.executar_em,
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
     where public.agenda_automacao_execucoes.status in ('pendente', 'erro')
        or (
          public.agenda_automacao_execucoes.status = 'cancelado'
          and public.agenda_automacao_execucoes.cancelado_manualmente = false
        );

    if found then
      v_planejados := v_planejados + 1;
    end if;
  end loop;

  return v_planejados;
end;
$function$;

comment on column public.agenda_automacao_execucoes.cancelado_manualmente is
  'Impede que o reconciliador recrie uma execução cancelada manualmente na página de disparos agendados.';
