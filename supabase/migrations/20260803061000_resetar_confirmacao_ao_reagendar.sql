create or replace function public.preparar_feedback_agendamento()
returns trigger
language plpgsql
as $function$
begin
  if (
    new.inicio_at is distinct from old.inicio_at
    or new.fim_at is distinct from old.fim_at
    or new.agenda_id is distinct from old.agenda_id
  ) then
    new.feedback_elegivel_em := now();
    new.feedback_solicitado_em := null;
    new.feedback_respondido_em := null;
    new.feedback_resultado := null;
    new.fedback_respondido_por := null;

    -- Uma nova data ou horário exige uma nova confirmação e permite que o
    -- planejador recrie confirmação, lembretes e avisos para o compromisso.
    if new.status in ('agendado', 'confirmado') then
      new.confirmacao_status := 'pendente';
    end if;
  end if;

  if new.status is distinct from old.status
    and new.status in ('realizado', 'faltou', 'cancelado')
  then
    new.feedback_respondido_em := coalesce(new.feedback_respondido_em, now());
    new.feedback_resultado := new.status;
  end if;

  return new;
end;
$function$;

-- Repara compromissos futuros que já haviam sido reagendados antes desta
-- correção e permaneceram presos em solicitação de reagendamento/cancelamento.
-- A alteração de confirmacao_status aciona o planejador existente e recria as
-- execuções pendentes conforme a data e as regras atuais do calendário.
with compromissos_reagendados as (
  select distinct a.id
    from public.agenda_agendamentos a
   where a.status in ('agendado', 'confirmado')
     and a.inicio_at > now()
     and a.confirmacao_status in (
       'reagendamento_solicitado',
       'cancelamento_solicitado'
    )
     and exists (
       select 1
         from public.agenda_historico h
       where h.agendamento_id = a.id
         and h.acao = 'reagendado'
         and nullif(h.dados_novos ->> 'inicio_at', '')::timestamptz = a.inicio_at
    )
)
update public.agenda_agendamentos a
   set confirmacao_status = 'pendente',
       updated_at = now()
  from compromissos_reagendados r
 where a.id = r.id;
