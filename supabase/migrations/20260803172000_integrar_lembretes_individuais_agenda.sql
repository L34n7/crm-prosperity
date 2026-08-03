-- Integra lembretes específicos do compromisso ao mesmo motor das automações da agenda.

alter table public.agenda_automacao_execucoes
  add column if not exists agenda_lembrete_id uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'agenda_automacao_execucoes_agenda_lembrete_id_fkey'
       and conrelid = 'public.agenda_automacao_execucoes'::regclass
  ) then
    alter table public.agenda_automacao_execucoes
      add constraint agenda_automacao_execucoes_agenda_lembrete_id_fkey
      foreign key (agenda_lembrete_id)
      references public.agenda_lembretes(id)
      on delete set null;
  end if;
end $$;

alter table public.agenda_automacao_execucoes
  drop constraint if exists agenda_automacao_execucoes_tipo_check;

alter table public.agenda_automacao_execucoes
  add constraint agenda_automacao_execucoes_tipo_check
  check (tipo = any (array[
    'confirmacao'::text,
    'lembrete'::text,
    'aviso_responsavel'::text,
    'pos_atendimento'::text,
    'lembrete_individual'::text
  ]));

create index if not exists agenda_automacao_execucoes_lembrete_idx
  on public.agenda_automacao_execucoes (empresa_id, agenda_lembrete_id, status)
  where agenda_lembrete_id is not null;

create or replace function public.agenda_lembrete_planejar_id(
  p_empresa_id uuid,
  p_lembrete_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lembrete public.agenda_lembretes%rowtype;
  v_agendamento public.agenda_agendamentos%rowtype;
  v_dest record;
  v_chave text;
  v_total integer := 0;
  v_agora timestamptz := now();
  v_metadata jsonb;
  v_integracao_id uuid;
  v_template_id uuid;
  v_destino_valido boolean;
begin
  select * into v_lembrete
    from public.agenda_lembretes
   where id = p_lembrete_id
     and empresa_id = p_empresa_id;

  if not found then
    return 0;
  end if;

  select * into v_agendamento
    from public.agenda_agendamentos
   where id = v_lembrete.agendamento_id
     and empresa_id = p_empresa_id;

  update public.agenda_automacao_execucoes
     set status = 'cancelado',
         bloqueado_em = null,
         proxima_tentativa_em = null,
         erro = 'Execução substituída após alteração do lembrete individual.',
         updated_at = v_agora
   where empresa_id = p_empresa_id
     and (
       agenda_lembrete_id = p_lembrete_id
       or payload_json ->> 'agenda_lembrete_id' = p_lembrete_id::text
     )
     and status in ('pendente', 'processando', 'erro')
     and cancelado_manualmente = false;

  if v_agendamento.id is null then
    update public.agenda_lembretes
       set status = 'cancelado',
           erro = 'O agendamento relacionado não foi encontrado.',
           updated_at = v_agora
     where id = p_lembrete_id and empresa_id = p_empresa_id;
    return 0;
  end if;

  if v_lembrete.ativo is not true
     or v_lembrete.status = 'enviado'
     or v_agendamento.status in ('cancelado', 'faltou') then
    update public.agenda_lembretes
       set status = case when v_lembrete.status = 'enviado' then 'enviado' else 'cancelado' end,
           erro = case
             when v_agendamento.status in ('cancelado', 'faltou')
               then 'Lembrete cancelado porque o compromisso não está mais ativo.'
             else erro
           end,
           updated_at = v_agora
     where id = p_lembrete_id and empresa_id = p_empresa_id;
    return 0;
  end if;

  if v_lembrete.agendado_para < v_agora then
    update public.agenda_lembretes
       set status = 'falha',
           erro = 'O horário programado deste lembrete já passou. Ele não foi enviado retroativamente.',
           updated_at = v_agora
     where id = p_lembrete_id and empresa_id = p_empresa_id;
    return 0;
  end if;

  v_metadata := coalesce(v_lembrete.metadata_json, '{}'::jsonb);
  begin
    v_integracao_id := nullif(v_metadata ->> 'integracao_whatsapp_id', '')::uuid;
  exception when others then
    v_integracao_id := null;
  end;
  begin
    v_template_id := nullif(v_metadata ->> 'whatsapp_template_id', '')::uuid;
  exception when others then
    v_template_id := null;
  end;

  if v_lembrete.canal = 'whatsapp'
     and (v_integracao_id is null or v_template_id is null) then
    update public.agenda_lembretes
       set status = 'falha',
           erro = 'Selecione uma integração e um template aprovado para o lembrete pelo WhatsApp.',
           updated_at = v_agora
     where id = p_lembrete_id and empresa_id = p_empresa_id;
    return 0;
  end if;

  for v_dest in
    select * from (
      select
        'responsavel:' || u.id::text as chave,
        u.id as usuario_id,
        u.nome::text as nome,
        lower(coalesce(u.email, ''))::text as email,
        regexp_replace(coalesce(u.telefone, ''), '\D', '', 'g')::text as telefone
      from public.usuarios u
      where v_lembrete.destinatario_tipo = 'responsavel'
        and u.empresa_id = p_empresa_id
        and u.id = v_agendamento.responsavel_id
        and u.status = 'ativo'

      union all

      select
        'cliente:' || coalesce(v_agendamento.contato_id::text, v_agendamento.id::text) as chave,
        null::uuid as usuario_id,
        coalesce(nullif(v_agendamento.nome_cliente, ''), c.nome, 'Cliente')::text as nome,
        lower(coalesce(nullif(v_agendamento.email_cliente, ''), c.email, ''))::text as email,
        regexp_replace(
          coalesce(nullif(v_agendamento.telefone_cliente, ''), c.telefone, ''),
          '\D', '', 'g'
        )::text as telefone
      from (select 1) base
      left join public.contatos c
        on c.id = v_agendamento.contato_id
       and c.empresa_id = p_empresa_id
      where v_lembrete.destinatario_tipo = 'cliente'

      union all

      select
        'participante:' || p.id::text as chave,
        p.usuario_id,
        coalesce(nullif(p.nome, ''), u.nome, 'Participante')::text as nome,
        lower(coalesce(nullif(p.email, ''), u.email, ''))::text as email,
        regexp_replace(
          coalesce(nullif(p.telefone, ''), u.telefone, ''),
          '\D', '', 'g'
        )::text as telefone
      from public.agenda_participantes p
      left join public.usuarios u
        on u.id = p.usuario_id
       and u.empresa_id = p_empresa_id
       and u.status = 'ativo'
      where v_lembrete.destinatario_tipo = 'participantes'
        and p.empresa_id = p_empresa_id
        and p.agendamento_id = v_agendamento.id
        and coalesce(p.status, 'pendente') <> 'recusado'
    ) destinos
  loop
    v_destino_valido := case v_lembrete.canal
      when 'sistema' then v_dest.usuario_id is not null
      when 'email' then v_dest.email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
      when 'whatsapp' then length(v_dest.telefone) >= 10
      else false
    end;

    if not v_destino_valido then
      continue;
    end if;

    v_chave := concat_ws(
      ':',
      'agenda',
      'lembrete-individual',
      v_lembrete.id::text,
      v_lembrete.canal,
      v_dest.chave,
      floor(extract(epoch from v_lembrete.agendado_para))::bigint::text
    );

    insert into public.agenda_automacao_execucoes (
      empresa_id,
      agenda_id,
      agendamento_id,
      agenda_lembrete_id,
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
      v_lembrete.id,
      null,
      'lembrete_individual',
      v_lembrete.canal,
      v_chave,
      v_lembrete.agendado_para,
      'pendente',
      0,
      5,
      v_lembrete.agendado_para,
      null,
      null,
      null,
      null,
      jsonb_build_object(
        'origem', 'lembrete_individual',
        'origem_disparo', 'lembrete_individual',
        'agenda_lembrete_id', v_lembrete.id,
        'agenda_inicio_at', v_agendamento.inicio_at,
        'agenda_fim_at', v_agendamento.fim_at,
        'destinatario_tipo', v_lembrete.destinatario_tipo,
        'destinatario', jsonb_build_object(
          'chave', v_dest.chave,
          'usuario_id', v_dest.usuario_id,
          'nome', v_dest.nome,
          'email', nullif(v_dest.email, ''),
          'telefone', nullif(v_dest.telefone, '')
        ),
        'integracao_whatsapp_id', v_integracao_id,
        'whatsapp_template_id', v_template_id,
        'configuracao_json', v_metadata,
        'planejado_em', v_agora
      ),
      '{}'::jsonb,
      false,
      null,
      null,
      v_agora
    )
    on conflict (chave_idempotencia) do update
       set agenda_lembrete_id = excluded.agenda_lembrete_id,
           agenda_id = excluded.agenda_id,
           agendamento_id = excluded.agendamento_id,
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
       and public.agenda_automacao_execucoes.status <> 'concluido';

    if found then
      v_total := v_total + 1;
    end if;
  end loop;

  if v_total = 0 then
    update public.agenda_lembretes
       set status = 'falha',
           erro = case
             when v_lembrete.canal = 'sistema'
               then 'Nenhum usuário interno válido foi encontrado para receber a notificação no sistema.'
             when v_lembrete.canal = 'email'
               then 'Nenhum destinatário com e-mail válido foi encontrado.'
             else 'Nenhum destinatário com telefone válido foi encontrado para o WhatsApp.'
           end,
           updated_at = v_agora
     where id = p_lembrete_id and empresa_id = p_empresa_id;
  else
    update public.agenda_lembretes
       set status = 'pendente',
           enviado_em = null,
           erro = null,
           metadata_json = v_metadata || jsonb_build_object(
             'execucoes_planejadas', v_total,
             'ultimo_planejamento_em', v_agora
           ),
           updated_at = v_agora
     where id = p_lembrete_id and empresa_id = p_empresa_id;
  end if;

  return v_total;
end;
$$;

create or replace function public.agenda_lembrete_planejar_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  perform public.agenda_lembrete_planejar_id(new.empresa_id, new.id);
  return new;
end;
$$;

drop trigger if exists agenda_lembrete_planejar_execucao on public.agenda_lembretes;
create trigger agenda_lembrete_planejar_execucao
after insert or update of canal, antecedencia_minutos, destinatario_tipo, ativo, agendado_para, metadata_json
on public.agenda_lembretes
for each row execute function public.agenda_lembrete_planejar_trigger();

create or replace function public.agenda_lembrete_cancelar_delete_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.agenda_automacao_execucoes
     set status = 'cancelado',
         bloqueado_em = null,
         proxima_tentativa_em = null,
         erro = 'Lembrete individual removido do agendamento.',
         updated_at = now()
   where empresa_id = old.empresa_id
     and (
       agenda_lembrete_id = old.id
       or payload_json ->> 'agenda_lembrete_id' = old.id::text
     )
     and status in ('pendente', 'processando', 'erro')
     and cancelado_manualmente = false;
  return old;
end;
$$;

drop trigger if exists agenda_lembrete_cancelar_execucao_delete on public.agenda_lembretes;
create trigger agenda_lembrete_cancelar_execucao_delete
before delete on public.agenda_lembretes
for each row execute function public.agenda_lembrete_cancelar_delete_trigger();

create or replace function public.agenda_lembretes_replanejar_agendamento_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status in ('cancelado', 'faltou') then
    update public.agenda_lembretes
       set status = 'cancelado',
           erro = 'Lembrete cancelado porque o compromisso não está mais ativo.',
           updated_at = now()
     where empresa_id = new.empresa_id
       and agendamento_id = new.id
       and status not in ('enviado', 'cancelado');

    update public.agenda_automacao_execucoes
       set status = 'cancelado',
           bloqueado_em = null,
           proxima_tentativa_em = null,
           erro = 'Lembrete cancelado porque o compromisso não está mais ativo.',
           updated_at = now()
     where empresa_id = new.empresa_id
       and agendamento_id = new.id
       and tipo = 'lembrete_individual'
       and status in ('pendente', 'processando', 'erro')
       and cancelado_manualmente = false;
  elsif new.inicio_at is distinct from old.inicio_at
     or new.agenda_id is distinct from old.agenda_id then
    update public.agenda_lembretes
       set agendado_para = new.inicio_at - make_interval(mins => antecedencia_minutos),
           status = 'pendente',
           enviado_em = null,
           erro = null,
           updated_at = now()
     where empresa_id = new.empresa_id
       and agendamento_id = new.id
       and ativo = true
       and status <> 'enviado';
  end if;
  return new;
end;
$$;

drop trigger if exists agenda_lembretes_replanejar_agendamento on public.agenda_agendamentos;
create trigger agenda_lembretes_replanejar_agendamento
after update of inicio_at, agenda_id, status
on public.agenda_agendamentos
for each row execute function public.agenda_lembretes_replanejar_agendamento_trigger();

create or replace function public.agenda_automacoes_planejar_agendamento_id(
  p_empresa_id uuid,
  p_agendamento_id uuid,
  p_reagendado boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

    v_proxima_tentativa := greatest(v_executar_em, v_agora);
    v_chave := concat_ws(
      ':', 'agenda', v_agendamento.id::text, v_regra.tipo,
      v_regra.canal, v_regra.ordem::text,
      floor(extract(epoch from v_referencia))::bigint::text,
      v_regra.antecedencia_minutos::text
    );
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
$$;

do $$
begin
  if to_regprocedure('public.agenda_etapa1_listar_base(uuid,timestamp with time zone,timestamp with time zone)') is null then
    alter function public.agenda_etapa1_listar(uuid, timestamp with time zone, timestamp with time zone)
      rename to agenda_etapa1_listar_base;
  end if;
end $$;

create or replace function public.agenda_etapa1_listar(
  p_agenda_id uuid,
  p_inicio timestamp with time zone,
  p_fim timestamp with time zone
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_agendamentos jsonb;
begin
  v_result := public.agenda_etapa1_listar_base(p_agenda_id, p_inicio, p_fim);

  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'lembretes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', l.id,
          'canal', l.canal,
          'antecedencia_minutos', l.antecedencia_minutos,
          'destinatario_tipo', l.destinatario_tipo,
          'ativo', l.ativo,
          'status', l.status,
          'agendado_para', l.agendado_para,
          'enviado_em', l.enviado_em,
          'erro', l.erro,
          'metadata_json', l.metadata_json
        ) order by l.antecedencia_minutos desc, l.created_at)
        from public.agenda_lembretes l
        where l.empresa_id = (v_result ->> 'empresa_id')::uuid
          and l.agendamento_id = (item ->> 'id')::uuid
      ), '[]'::jsonb)
    )
  ), '[]'::jsonb)
  into v_agendamentos
  from jsonb_array_elements(coalesce(v_result -> 'agendamentos', '[]'::jsonb)) item;

  return jsonb_set(v_result, '{agendamentos}', v_agendamentos, true);
end;
$$;

update public.agenda_lembretes l
   set status = case
         when a.status in ('cancelado', 'faltou') then 'cancelado'
         else 'falha'
       end,
       erro = case
         when a.status in ('cancelado', 'faltou')
           then 'Lembrete cancelado porque o compromisso não está mais ativo.'
         else 'O horário programado deste lembrete já passou. Ele não foi enviado retroativamente.'
       end,
       updated_at = now()
  from public.agenda_agendamentos a
 where a.id = l.agendamento_id
   and a.empresa_id = l.empresa_id
   and l.status = 'pendente'
   and l.agendado_para < now();
