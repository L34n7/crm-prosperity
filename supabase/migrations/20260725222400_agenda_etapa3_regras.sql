create or replace function public.agenda_automacao_regras_substituir(
  p_empresa_id uuid,
  p_agenda_id uuid,
  p_regras jsonb
)
returns setof public.agenda_automacao_regras
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if not exists (
    select 1
      from public.agenda_calendarios
     where id = p_agenda_id
       and empresa_id = p_empresa_id
  ) then
    raise exception 'Agenda não encontrada para a empresa informada.';
  end if;

  if jsonb_typeof(coalesce(p_regras, '[]'::jsonb)) <> 'array' then
    raise exception 'As regras devem ser enviadas em formato de lista.';
  end if;

  if jsonb_array_length(coalesce(p_regras, '[]'::jsonb)) > 30 then
    raise exception 'Uma agenda pode possuir no máximo 30 regras de automação.';
  end if;

  update public.agenda_automacao_execucoes
     set status = 'cancelado',
         bloqueado_em = null,
         erro = 'Execução substituída após alteração das regras da agenda.',
         updated_at = now()
   where empresa_id = p_empresa_id
     and agenda_id = p_agenda_id
     and status in ('pendente', 'erro');

  delete from public.agenda_automacao_regras
   where empresa_id = p_empresa_id
     and agenda_id = p_agenda_id;

  insert into public.agenda_automacao_regras (
    empresa_id,
    agenda_id,
    tipo,
    canal,
    ativo,
    antecedencia_minutos,
    momento_referencia,
    ordem,
    integracao_whatsapp_id,
    whatsapp_template_id,
    fluxo_id,
    configuracao_json,
    updated_at
  )
  select
    p_empresa_id,
    p_agenda_id,
    item.tipo,
    item.canal,
    coalesce(item.ativo, false),
    least(greatest(coalesce(item.antecedencia_minutos, 0), 0), 525600),
    case when item.tipo = 'pos_atendimento' then 'apos_fim' else 'antes_inicio' end,
    least(greatest(coalesce(item.ordem, 0), 0), 50),
    item.integracao_whatsapp_id,
    item.whatsapp_template_id,
    item.fluxo_id,
    coalesce(item.configuracao_json, '{}'::jsonb) || jsonb_build_object(
      'etapa', 3,
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
    'confirmacao'::text,
    'lembrete'::text,
    'aviso_responsavel'::text,
    'pos_atendimento'::text
  ])
    and item.canal = any (array[
      'whatsapp'::text,
      'email'::text,
      'sistema'::text,
      'fluxo'::text
    ]);

  perform public.agenda_automacoes_replanejar_agenda(p_empresa_id, p_agenda_id);

  return query
  select regra.*
    from public.agenda_automacao_regras regra
   where regra.empresa_id = p_empresa_id
     and regra.agenda_id = p_agenda_id
   order by regra.tipo, regra.ordem, regra.canal;
end;
$function$;

revoke all on function public.agenda_automacoes_planejar_agendamento_id(uuid, uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.agenda_automacoes_replanejar_agenda(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.agenda_automacoes_reconciliar(integer)
  from public, anon, authenticated;
revoke all on function public.agenda_automacoes_reivindicar(integer)
  from public, anon, authenticated;
revoke all on function public.agenda_automacao_regras_substituir(uuid, uuid, jsonb)
  from public, anon, authenticated;

grant execute on function public.agenda_automacoes_planejar_agendamento_id(uuid, uuid, boolean)
  to service_role;
grant execute on function public.agenda_automacoes_replanejar_agenda(uuid, uuid)
  to service_role;
grant execute on function public.agenda_automacoes_reconciliar(integer)
  to service_role;
grant execute on function public.agenda_automacoes_reivindicar(integer)
  to service_role;
grant execute on function public.agenda_automacao_regras_substituir(uuid, uuid, jsonb)
  to service_role;

comment on table public.agenda_automacao_execucoes is
  'Fila idempotente das Etapas 1 e 3 para confirmação, lembrete, aviso ao responsável e pós-atendimento.';
comment on table public.agenda_automacao_regras is
  'Regras por agenda com execução automática habilitada pelas Etapas 1 e 3.';

update public.agenda_automacao_regras
   set configuracao_json = coalesce(configuracao_json, '{}'::jsonb) || jsonb_build_object(
         'etapa', 3,
         'execucao_habilitada', true
       ),
       updated_at = now();

do $block$
declare
  v_agenda record;
begin
  for v_agenda in
    select distinct empresa_id, agenda_id
      from public.agenda_automacao_regras
     where ativo = true
  loop
    perform public.agenda_automacoes_replanejar_agenda(
      v_agenda.empresa_id,
      v_agenda.agenda_id
    );
  end loop;
end;
$block$;
