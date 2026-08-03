create or replace function public.agenda_google_sync_enfileirar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operacao text;
begin
  if tg_op = 'UPDATE' and not (
    old.titulo is distinct from new.titulo or
    old.nome_cliente is distinct from new.nome_cliente or
    old.telefone_cliente is distinct from new.telefone_cliente or
    old.email_cliente is distinct from new.email_cliente or
    old.inicio_at is distinct from new.inicio_at or
    old.fim_at is distinct from new.fim_at or
    old.status is distinct from new.status or
    old.observacoes is distinct from new.observacoes or
    old.local is distinct from new.local or
    old.link_reuniao is distinct from new.link_reuniao
  ) then
    return new;
  end if;

  v_operacao := case when new.status = 'cancelado' then 'delete' else 'upsert' end;

  if exists (
    select 1
      from public.agenda_google_integracoes integracao
     where integracao.empresa_id = new.empresa_id
       and integracao.agenda_id = new.agenda_id
       and integracao.sync_ativo = true
  ) then
    insert into public.agenda_google_sync_fila (
      empresa_id,
      agenda_id,
      agendamento_id,
      operacao,
      status,
      tentativas,
      proxima_tentativa_em,
      bloqueado_em,
      erro,
      updated_at
    )
    values (
      new.empresa_id,
      new.agenda_id,
      new.id,
      v_operacao,
      'pendente',
      0,
      now(),
      null,
      null,
      now()
    )
    on conflict (agendamento_id) do update
      set empresa_id = excluded.empresa_id,
          agenda_id = excluded.agenda_id,
          operacao = excluded.operacao,
          status = 'pendente',
          tentativas = 0,
          proxima_tentativa_em = now(),
          bloqueado_em = null,
          erro = null,
          updated_at = now();
  end if;

  return new;
end;
$$;

create or replace function public.agenda_google_sync_reservar(p_limite integer default 30)
returns table(
  id uuid,
  empresa_id uuid,
  agenda_id uuid,
  agendamento_id uuid,
  operacao text,
  tentativas integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.agenda_google_sync_fila fila
     set status = 'pendente',
         bloqueado_em = null,
         updated_at = now()
   where fila.status = 'processando'
     and fila.bloqueado_em < now() - interval '15 minutes';

  return query
  with selecionados as (
    select fila.id
      from public.agenda_google_sync_fila fila
     where fila.status = 'pendente'
       and fila.proxima_tentativa_em <= now()
     order by
       case when fila.operacao = 'delete' then 0 else 1 end,
       fila.created_at asc
     for update skip locked
     limit least(greatest(coalesce(p_limite, 30), 1), 100)
  )
  update public.agenda_google_sync_fila fila
     set status = 'processando',
         tentativas = fila.tentativas + 1,
         bloqueado_em = now(),
         updated_at = now()
    from selecionados
   where fila.id = selecionados.id
  returning
    fila.id,
    fila.empresa_id,
    fila.agenda_id,
    fila.agendamento_id,
    fila.operacao,
    fila.tentativas;
end;
$$;

-- Reprocessa vínculos cancelados que ainda podem existir no Google Calendar.
insert into public.agenda_google_sync_fila (
  empresa_id,
  agenda_id,
  agendamento_id,
  operacao,
  status,
  tentativas,
  proxima_tentativa_em,
  bloqueado_em,
  erro,
  updated_at
)
select
  agendamento.empresa_id,
  agendamento.agenda_id,
  agendamento.id,
  'delete',
  'pendente',
  0,
  now(),
  null,
  null,
  now()
from public.agenda_agendamentos agendamento
join public.agenda_google_eventos vinculo
  on vinculo.agendamento_id = agendamento.id
join public.agenda_google_integracoes integracao
  on integracao.id = vinculo.integracao_id
 and integracao.empresa_id = agendamento.empresa_id
 and integracao.agenda_id = agendamento.agenda_id
 and integracao.sync_ativo = true
where agendamento.status = 'cancelado'
  and nullif(trim(vinculo.google_event_id), '') is not null
on conflict (agendamento_id) do update
  set empresa_id = excluded.empresa_id,
      agenda_id = excluded.agenda_id,
      operacao = 'delete',
      status = 'pendente',
      tentativas = 0,
      proxima_tentativa_em = now(),
      bloqueado_em = null,
      erro = null,
      updated_at = now();
