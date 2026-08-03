create or replace function public.agenda_automacoes_cancelar_substituidas(
  p_empresa_id uuid,
  p_agenda_id uuid,
  p_agendamento_id uuid default null,
  p_incluir_processando boolean default false,
  p_motivo text default 'Execução substituída após alteração das regras da agenda.'
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_total integer := 0;
begin
  update public.agenda_automacao_execucoes
     set status = 'cancelado',
         proxima_tentativa_em = null,
         bloqueado_em = null,
         cancelado_manualmente = false,
         cancelado_por = null,
         cancelado_em = now(),
         erro = left(coalesce(nullif(trim(p_motivo), ''), 'Execução substituída durante o replanejamento.'), 1500),
         resultado_json = coalesce(resultado_json, '{}'::jsonb) || jsonb_build_object(
           'substituida', true,
           'substituida_em', now(),
           'motivo_substituicao', coalesce(nullif(trim(p_motivo), ''), 'Execução substituída durante o replanejamento.')
         ),
         updated_at = now()
   where empresa_id = p_empresa_id
     and agenda_id = p_agenda_id
     and (p_agendamento_id is null or agendamento_id = p_agendamento_id)
     and cancelado_manualmente = false
     and (
       status in ('pendente', 'erro')
       or (p_incluir_processando and status = 'processando')
     );

  get diagnostics v_total = row_count;
  return v_total;
end;
$function$;

create or replace function public.agenda_automacoes_replanejar_agenda(
  p_empresa_id uuid,
  p_agenda_id uuid
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_agendamento record;
  v_total integer := 0;
begin
  if not exists (
    select 1
      from public.agenda_calendarios
     where id = p_agenda_id
       and empresa_id = p_empresa_id
  ) then
    raise exception 'Agenda não encontrada para a empresa informada.';
  end if;

  perform public.agenda_automacoes_cancelar_substituidas(
    p_empresa_id,
    p_agenda_id,
    null,
    true,
    'Execução substituída após alteração das regras da agenda.'
  );

  for v_agendamento in
    select id
      from public.agenda_agendamentos
     where empresa_id = p_empresa_id
       and agenda_id = p_agenda_id
       and status in ('agendado', 'confirmado', 'realizado')
       and fim_at >= now() - interval '7 days'
       and inicio_at <= now() + interval '365 days'
  loop
    v_total := v_total + public.agenda_automacoes_planejar_agendamento_id(
      p_empresa_id,
      v_agendamento.id,
      false
    );
  end loop;

  return v_total;
end;
$function$;

create or replace function public.agenda_automacao_regras_substituir(
  p_empresa_id uuid,
  p_agenda_id uuid,
  p_regras jsonb
)
returns setof public.agenda_automacao_regras
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not exists (
    select 1 from public.agenda_calendarios
     where id = p_agenda_id and empresa_id = p_empresa_id
  ) then
    raise exception 'Agenda não encontrada para a empresa informada.';
  end if;
  if jsonb_typeof(coalesce(p_regras, '[]'::jsonb)) <> 'array' then
    raise exception 'As regras devem ser enviadas em formato de lista.';
  end if;
  if jsonb_array_length(coalesce(p_regras, '[]'::jsonb)) > 30 then
    raise exception 'Uma agenda pode possuir no máximo 30 regras de automação.';
  end if;

  perform public.agenda_automacoes_cancelar_substituidas(
    p_empresa_id,
    p_agenda_id,
    null,
    true,
    'Execução substituída após alteração das regras da agenda.'
  );

  delete from public.agenda_automacao_regras
   where empresa_id = p_empresa_id and agenda_id = p_agenda_id;

  insert into public.agenda_automacao_regras (
    empresa_id, agenda_id, tipo, canal, ativo, antecedencia_minutos,
    momento_referencia, ordem, integracao_whatsapp_id, whatsapp_template_id,
    fluxo_id, configuracao_json, updated_at
  )
  select
    p_empresa_id, p_agenda_id, item.tipo, item.canal,
    coalesce(item.ativo, false),
    least(greatest(coalesce(item.antecedencia_minutos, 0), 0), 525600),
    case when item.tipo = 'pos_atendimento' then 'apos_fim' else 'antes_inicio' end,
    least(greatest(coalesce(item.ordem, 0), 0), 50),
    item.integracao_whatsapp_id, item.whatsapp_template_id, item.fluxo_id,
    coalesce(item.configuracao_json, '{}'::jsonb) || jsonb_build_object(
      'etapa', 4,
      'execucao_habilitada', true
    ),
    now()
  from jsonb_to_recordset(coalesce(p_regras, '[]'::jsonb)) as item(
    tipo text,
    canal text,
    ativo boolean,
    antecedencia_minutos integer,
    momento_referencia text,
    ordem integer,
    integracao_whatsapp_id uuid,
    whatsapp_template_id uuid,
    fluxo_id uuid,
    configuracao_json jsonb
  )
  where item.tipo = any (array[
    'confirmacao'::text, 'lembrete'::text,
    'aviso_responsavel'::text, 'pos_atendimento'::text
  ])
    and item.canal = any (array[
      'whatsapp'::text, 'email'::text, 'sistema'::text, 'fluxo'::text
    ]);

  perform public.agenda_automacoes_replanejar_agenda(p_empresa_id, p_agenda_id);

  return query
  select regra.* from public.agenda_automacao_regras regra
   where regra.empresa_id = p_empresa_id and regra.agenda_id = p_agenda_id
   order by regra.tipo, regra.ordem, regra.canal;
end;
$function$;

do $block$
declare
  v_agenda record;
begin
  for v_agenda in
    select distinct empresa_id, agenda_id
      from public.agenda_automacao_regras
  loop
    perform public.agenda_automacoes_replanejar_agenda(
      v_agenda.empresa_id,
      v_agenda.agenda_id
    );
  end loop;
end;
$block$;
