create or replace function public.agenda_automacoes_replanejar_agenda(
  p_empresa_id uuid,
  p_agenda_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
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

  update public.agenda_automacao_execucoes
     set status = 'cancelado',
         bloqueado_em = null,
         erro = 'Execução substituída após alteração das regras da agenda.',
         updated_at = now()
   where empresa_id = p_empresa_id
     and agenda_id = p_agenda_id
     and status in ('pendente', 'erro');

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

create or replace function public.agenda_automacoes_reconciliar(
  p_limite integer default 500
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_agendamento record;
  v_total integer := 0;
  v_limite integer := least(greatest(coalesce(p_limite, 500), 1), 2000);
begin
  for v_agendamento in
    select agendamento.id, agendamento.empresa_id
      from public.agenda_agendamentos agendamento
      join public.agenda_calendarios agenda
        on agenda.id = agendamento.agenda_id
       and agenda.empresa_id = agendamento.empresa_id
     where agendamento.status in ('agendado', 'confirmado', 'realizado')
       and agenda.status = 'ativo'
       and agendamento.fim_at >= now() - interval '7 days'
       and agendamento.inicio_at <= now() + interval '365 days'
       and exists (
         select 1
           from public.agenda_automacao_regras regra
          where regra.empresa_id = agendamento.empresa_id
            and regra.agenda_id = agendamento.agenda_id
            and regra.ativo = true
       )
     order by agendamento.inicio_at
     limit v_limite
  loop
    v_total := v_total + public.agenda_automacoes_planejar_agendamento_id(
      v_agendamento.empresa_id,
      v_agendamento.id,
      false
    );
  end loop;

  return v_total;
end;
$function$;

create or replace function public.agenda_automacoes_reivindicar(
  p_limite integer default 50
)
returns setof public.agenda_automacao_execucoes
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 50), 1), 100);
begin
  update public.agenda_automacao_execucoes
     set status = case when tentativas >= max_tentativas then 'erro' else 'pendente' end,
         proxima_tentativa_em = case
           when tentativas >= max_tentativas then proxima_tentativa_em
           else now()
         end,
         bloqueado_em = null,
         erro = case
           when tentativas >= max_tentativas then coalesce(erro, 'Limite de tentativas atingido após expiração do bloqueio.')
           else coalesce(erro, 'Bloqueio expirado; execução liberada para nova tentativa.')
         end,
         updated_at = now()
   where status = 'processando'
     and bloqueado_em < now() - interval '10 minutes';

  return query
  with selecionados as (
    select execucao.id
      from public.agenda_automacao_execucoes execucao
     where execucao.status = 'pendente'
       and coalesce(execucao.proxima_tentativa_em, execucao.executar_em) <= now()
       and execucao.tentativas < execucao.max_tentativas
     order by coalesce(execucao.proxima_tentativa_em, execucao.executar_em), execucao.created_at
     for update skip locked
     limit v_limite
  )
  update public.agenda_automacao_execucoes execucao
     set status = 'processando',
         tentativas = execucao.tentativas + 1,
         bloqueado_em = now(),
         erro = null,
         updated_at = now()
    from selecionados
   where execucao.id = selecionados.id
  returning execucao.*;
end;
$function$;

create or replace function public.agenda_automacoes_planejar_agendamento_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  perform public.agenda_automacoes_planejar_agendamento_id(
    new.empresa_id,
    new.id,
    tg_op = 'UPDATE' and (
      old.inicio_at is distinct from new.inicio_at
      or old.fim_at is distinct from new.fim_at
      or old.agenda_id is distinct from new.agenda_id
    )
  );
  return new;
end;
$function$;

drop trigger if exists agenda_automacoes_planejar_agendamento_trigger
  on public.agenda_agendamentos;
create trigger agenda_automacoes_planejar_agendamento_trigger
after insert or update of
  agenda_id,
  contato_id,
  conversa_id,
  responsavel_id,
  telefone_cliente,
  email_cliente,
  inicio_at,
  fim_at,
  status,
  confirmacao_status
on public.agenda_agendamentos
for each row execute function public.agenda_automacoes_planejar_agendamento_trigger();
