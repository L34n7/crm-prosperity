-- Centraliza a linguagem comercial do lead para todos os módulos:
-- novo, qualificado, convertido e perdido.

alter table public.contatos
  add column if not exists classificacao text,
  add column if not exists classificacao_atualizada_em timestamptz,
  add column if not exists classificacao_evento_id uuid,
  add column if not exists classificacao_protocolo_id uuid;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
      from pg_constraint
     where conrelid = 'public.contatos'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike any (array[
         '%status_lead%',
         '%classificacao%'
       ])
  loop
    execute format('alter table public.contatos drop constraint if exists %I', constraint_record.conname);
  end loop;
end $$;

update public.contatos
   set classificacao = case
     when lower(coalesce(classificacao, '')) = 'cliente' then 'convertido'
     when lower(coalesce(classificacao, '')) in ('novo', 'qualificado', 'convertido', 'perdido') then lower(classificacao)
     when lower(coalesce(status_lead, '')) = 'cliente' then 'convertido'
     when lower(coalesce(status_lead, '')) = 'em_atendimento' then 'qualificado'
     when lower(coalesce(status_lead, '')) in ('novo', 'qualificado', 'convertido', 'perdido') then lower(status_lead)
     else 'novo'
   end,
       classificacao_atualizada_em = coalesce(classificacao_atualizada_em, updated_at, created_at, now())
 where classificacao is null
    or lower(classificacao) not in ('novo', 'qualificado', 'convertido', 'perdido', 'cliente');

update public.contatos
   set status_lead = case
     when classificacao = 'convertido' then 'cliente'
     when classificacao in ('novo', 'qualificado', 'perdido') then classificacao
     else coalesce(status_lead, 'novo')
   end
 where status_lead is null
    or lower(status_lead) not in ('novo', 'qualificado', 'cliente', 'perdido');

alter table public.contatos
  add constraint contatos_classificacao_check
    check (classificacao is null or classificacao in ('novo', 'qualificado', 'convertido', 'perdido')),
  add constraint contatos_status_lead_check
    check (status_lead is null or status_lead in ('novo', 'em_atendimento', 'qualificado', 'cliente', 'perdido'));

create index if not exists contatos_empresa_classificacao_idx
  on public.contatos (empresa_id, classificacao);

create index if not exists contatos_empresa_classificacao_atualizada_idx
  on public.contatos (empresa_id, classificacao_atualizada_em desc);

create or replace function public.rastreamento_classificacao_evento(
  p_tipo text,
  p_metadata jsonb
)
returns text
language sql
immutable
as $$
  select case
    when p_tipo = 'lead_criado'
      then 'novo'
    when p_tipo in (
      'protocolo_iniciado',
      'conversa_iniciada',
      'primeira_mensagem_recebida',
      'lead_qualificado',
      'fluxo_iniciado',
      'fluxo_transferido_atendimento'
    ) then 'qualificado'
    when p_tipo in (
      'venda_realizada',
      'agendamento_criado',
      'agendamento_confirmado',
      'agendamento_remarcado',
      'agendamento_realizado',
      'entrada_grupo_confirmada',
      'pagamento_confirmado',
      'objetivo_concluido'
    ) then 'convertido'
    when p_tipo in (
      'venda_perdida',
      'agendamento_cancelado',
      'agendamento_faltou',
      'fluxo_incompleto_timeout',
      'conversa_encerrada_24h',
      'sem_interesse',
      'objetivo_nao_concluido'
    ) then 'perdido'
    when p_tipo = 'fluxo_finalizado'
      and coalesce(p_metadata->>'resultado_fluxo', '') = 'positivo'
      then 'convertido'
    when p_tipo = 'fluxo_finalizado'
      and coalesce(p_metadata->>'resultado_fluxo', '') = 'negativo'
      then 'perdido'
    when p_tipo = 'fluxo_finalizado'
      and coalesce(p_metadata->>'resultado_fluxo', '') = 'neutro'
      then 'qualificado'
    when p_tipo = 'conversa_encerrada_manual'
      and coalesce(p_metadata->>'resultado', '') = 'convertido'
      then 'convertido'
    when p_tipo = 'conversa_encerrada_manual'
      and coalesce(p_metadata->>'resultado', '') = 'perdido'
      then 'perdido'
    when p_tipo = 'conversa_encerrada_manual'
      then 'qualificado'
    else null
  end;
$$;

create or replace function public.recalcular_classificacao_contato(
  p_contato_id uuid
)
returns void
language plpgsql
as $$
declare
  v_protocolo record;
  v_evento record;
  v_classificacao text;
begin
  if p_contato_id is null then
    return;
  end if;

  select
    cp.id,
    cp.resultado,
    cp.resultado_em,
    cp.resultado_evento_id,
    coalesce(cp.started_at, cp.created_at) as iniciado_em
  into v_protocolo
  from public.conversa_protocolos cp
  where cp.contato_id = p_contato_id
  order by coalesce(cp.started_at, cp.created_at) desc, cp.created_at desc
  limit 1;

  if v_protocolo.id is not null then
    v_classificacao := case
      when v_protocolo.resultado = 'convertido' then 'convertido'
      when v_protocolo.resultado = 'perdido' then 'perdido'
      else 'qualificado'
    end;

    update public.contatos
    set
      classificacao = v_classificacao,
      status_lead = case
        when v_classificacao = 'convertido' then 'cliente'
        else v_classificacao
      end,
      classificacao_atualizada_em =
        coalesce(v_protocolo.resultado_em, v_protocolo.iniciado_em, now()),
      classificacao_evento_id = v_protocolo.resultado_evento_id,
      classificacao_protocolo_id = v_protocolo.id
    where id = p_contato_id;

    return;
  end if;

  select
    e.id,
    public.rastreamento_classificacao_evento(e.tipo, e.metadata_json)
      as classificacao,
    e.ocorrido_em
  into v_evento
  from public.rastreamento_eventos e
  where e.contato_id = p_contato_id
    and e.conversa_protocolo_id is null
    and public.rastreamento_classificacao_evento(
      e.tipo,
      e.metadata_json
    ) is not null
  order by e.ocorrido_em desc, e.created_at desc, e.id desc
  limit 1;

  v_classificacao := case
    when v_evento.classificacao in ('novo', 'qualificado', 'convertido', 'perdido')
      then v_evento.classificacao
    else null
  end;

  update public.contatos
  set
    classificacao = v_classificacao,
    status_lead = case
      when v_classificacao = 'convertido' then 'cliente'
      else coalesce(v_classificacao, status_lead)
    end,
    classificacao_atualizada_em = v_evento.ocorrido_em,
    classificacao_evento_id = v_evento.id,
    classificacao_protocolo_id = null
  where id = p_contato_id;
end;
$$;
