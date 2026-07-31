alter table public.agenda_agendamentos
  drop constraint if exists agenda_agendamentos_confirmacao_status_check;
alter table public.agenda_agendamentos
  add constraint agenda_agendamentos_confirmacao_status_check
  check (confirmacao_status = any (array[
    'pendente'::text,
    'confirmado'::text,
    'recusado'::text,
    'dispensado'::text,
    'reagendamento_solicitado'::text,
    'cancelamento_solicitado'::text
  ]));
create table if not exists public.agenda_automacao_respostas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  agenda_id uuid not null references public.agenda_calendarios(id) on delete cascade,
  agendamento_id uuid not null references public.agenda_agendamentos(id) on delete cascade,
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  mensagem_id uuid not null references public.mensagens(id) on delete cascade,
  fluxo_id uuid references public.automacao_fluxos(id) on delete set null,
  acao text not null check (acao = any (array[
    'confirmar'::text,
    'cancelar'::text,
    'reagendar'::text
  ])),
  status text not null default 'pendente' check (status = any (array[
    'pendente'::text,
    'processando'::text,
    'concluido'::text,
    'cancelado'::text,
    'erro'::text
  ])),
  tentativas integer not null default 0 check (tentativas between 0 and 100),
  max_tentativas integer not null default 5 check (max_tentativas between 1 and 20),
  proxima_tentativa_em timestamptz,
  bloqueado_em timestamptz,
  executado_em timestamptz,
  automacao_execucao_id uuid references public.automacao_execucoes(id) on delete set null,
  erro text,
  payload_json jsonb not null default '{}'::jsonb,
  resultado_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mensagem_id)
);
create index if not exists agenda_automacao_respostas_fila_idx
  on public.agenda_automacao_respostas(status, proxima_tentativa_em, created_at)
  where status = 'pendente';
create index if not exists agenda_automacao_respostas_agendamento_idx
  on public.agenda_automacao_respostas(empresa_id, agendamento_id, acao, status);
alter table public.agenda_automacao_respostas enable row level security;
create or replace function public.agenda_automacoes_respostas_reivindicar(
  p_limite integer default 30
)
returns setof public.agenda_automacao_respostas
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 30), 1), 100);
begin
  update public.agenda_automacao_respostas
     set status = case when tentativas >= max_tentativas then 'erro' else 'pendente' end,
         proxima_tentativa_em = case
           when tentativas >= max_tentativas then proxima_tentativa_em
           else now()
         end,
         bloqueado_em = null,
         erro = case
           when tentativas >= max_tentativas then coalesce(erro, 'Limite de tentativas atingido após expiração do bloqueio.')
           else coalesce(erro, 'Bloqueio expirado; resposta liberada para nova tentativa.')
         end,
         updated_at = now()
   where status = 'processando'
     and bloqueado_em < now() - interval '10 minutes';
  return query
  with selecionados as (
    select resposta.id
      from public.agenda_automacao_respostas resposta
     where resposta.status = 'pendente'
       and coalesce(resposta.proxima_tentativa_em, resposta.created_at) <= now()
       and resposta.tentativas < resposta.max_tentativas
     order by coalesce(resposta.proxima_tentativa_em, resposta.created_at), resposta.created_at
     for update skip locked
     limit v_limite
  )
  update public.agenda_automacao_respostas resposta
     set status = 'processando',
         tentativas = resposta.tentativas + 1,
         bloqueado_em = now(),
         erro = null,
         updated_at = now()
    from selecionados
   where resposta.id = selecionados.id
  returning resposta.*;
end;
$function$;
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
  select * into v_agendamento
    from public.agenda_agendamentos
   where id = p_agendamento_id and empresa_id = p_empresa_id;
  if not found then return 0; end if;
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
  if v_agendamento.status in ('cancelado', 'faltou') then return 0; end if;
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
    if v_regra.tipo <> 'pos_atendimento' and v_referencia <= v_agora then continue; end if;
    v_executar_em := greatest(v_executar_em, v_agora);
    v_chave := concat_ws(':', 'agenda', v_agendamento.id::text, v_regra.tipo,
      v_regra.canal, v_regra.ordem::text,
      floor(extract(epoch from v_referencia))::bigint::text,
      v_regra.antecedencia_minutos::text);
    insert into public.agenda_automacao_execucoes (
      empresa_id, agenda_id, agendamento_id, regra_id, tipo, canal,
      chave_idempotencia, executar_em, status, tentativas, max_tentativas,
      proxima_tentativa_em, bloqueado_em, executado_em, mensagem_externa_id,
      erro, payload_json, resultado_json, cancelado_manualmente,
      cancelado_por, cancelado_em, updated_at
    ) values (
      p_empresa_id, v_agendamento.agenda_id, v_agendamento.id, v_regra.id,
      v_regra.tipo, v_regra.canal, v_chave, v_executar_em, 'pendente', 0, 5,
      v_executar_em, null, null, null, null,
      jsonb_build_object(
        'agenda_inicio_at', v_agendamento.inicio_at,
        'agenda_fim_at', v_agendamento.fim_at,
        'regra_atualizada_em', v_regra.updated_at,
        'planejado_em', v_agora,
        'reagendado', p_reagendado
      ),
      '{}'::jsonb, false, null, null, v_agora
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
    if found then v_planejados := v_planejados + 1; end if;
  end loop;
  return v_planejados;
end;
$function$;
create or replace function public.agenda_automacoes_processar_resposta_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_payload text;
  v_match text[];
  v_acao text;
  v_agendamento_id uuid;
  v_conversa record;
  v_agendamento public.agenda_agendamentos%rowtype;
  v_fluxo_id uuid;
  v_resposta_id uuid;
  v_resumo text;
begin
  if new.origem <> 'recebida' or new.remetente_tipo <> 'contato' then return new; end if;
  v_payload := coalesce(
    new.metadata_json #>> '{interactive,button_reply,id}',
    new.metadata_json #>> '{interactive,list_reply,id}',
    new.metadata_json #>> '{button,payload}',
    new.metadata_json #>> '{button_reply,id}',
    ''
  );
  v_match := regexp_match(v_payload, '^agenda_(confirmar|cancelar|reagendar):([0-9a-fA-F-]{36})$');
  if v_match is null then return new; end if;
  v_acao := v_match[1];
  begin v_agendamento_id := v_match[2]::uuid;
  exception when others then return new; end;
  select id, contato_id, integracao_whatsapp_id
    into v_conversa
    from public.conversas
   where id = new.conversa_id and empresa_id = new.empresa_id;
  select * into v_agendamento
    from public.agenda_agendamentos
   where id = v_agendamento_id and empresa_id = new.empresa_id;
  if v_conversa.id is null
     or v_agendamento.id is null
     or (v_agendamento.contato_id is not null
       and v_conversa.contato_id is distinct from v_agendamento.contato_id) then
    return new;
  end if;
  if v_agendamento.status not in ('agendado', 'confirmado') then return new; end if;
  select fluxo.id
    into v_fluxo_id
    from public.agenda_automacao_regras regra
    cross join lateral jsonb_array_elements(
      coalesce(regra.configuracao_json -> 'template_botoes', '[]'::jsonb)
    ) item
    join public.automacao_fluxos fluxo
      on fluxo.id::text = item ->> 'fluxo_id'
     and fluxo.empresa_id = new.empresa_id
     and fluxo.status = 'ativo'
   where regra.empresa_id = new.empresa_id
     and regra.agenda_id = v_agendamento.agenda_id
     and regra.tipo = 'confirmacao'
     and regra.canal = 'whatsapp'
     and regra.ativo = true
     and item ->> 'acao' = v_acao
   order by regra.ordem
   limit 1;
  if v_acao = 'confirmar' then
    update public.agenda_agendamentos
       set status = 'confirmado',
           confirmacao_status = 'confirmado',
           updated_at = now(),
           metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
             'confirmacao_whatsapp', jsonb_build_object(
               'acao', v_acao, 'mensagem_id', new.id, 'respondido_em', now()
             )
           )
     where id = v_agendamento.id and empresa_id = new.empresa_id;
    v_resumo := 'O cliente confirmou o agendamento pelo WhatsApp.';
  elsif v_acao = 'cancelar' then
    update public.agenda_agendamentos
       set confirmacao_status = 'cancelamento_solicitado',
           updated_at = now(),
           metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
             'cancelamento_whatsapp', jsonb_build_object(
               'acao', v_acao, 'mensagem_id', new.id, 'solicitado_em', now()
             )
           )
     where id = v_agendamento.id and empresa_id = new.empresa_id;
    v_resumo := 'O cliente iniciou a solicitação de cancelamento pelo WhatsApp.';
  else
    update public.agenda_agendamentos
       set confirmacao_status = 'reagendamento_solicitado',
           updated_at = now(),
           metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
             'reagendamento_whatsapp', jsonb_build_object(
               'acao', v_acao, 'mensagem_id', new.id, 'solicitado_em', now()
             )
           )
     where id = v_agendamento.id and empresa_id = new.empresa_id;
    v_resumo := 'O cliente iniciou a solicitação de reagendamento pelo WhatsApp.';
  end if;
  update public.agenda_automacao_execucoes
     set status = case when status = 'concluido' then status else 'cancelado' end,
         bloqueado_em = null,
         erro = case when status = 'concluido' then erro else 'Execução cancelada após resposta do cliente.' end,
         resultado_json = coalesce(resultado_json, '{}'::jsonb) || jsonb_build_object(
           'acao_resposta', v_acao, 'mensagem_resposta_id', new.id, 'respondido_em', now()
         ),
         updated_at = now()
   where empresa_id = new.empresa_id
     and agendamento_id = v_agendamento.id
     and (
       (v_acao = 'confirmar' and tipo = 'confirmacao')
       or (v_acao in ('cancelar', 'reagendar') and tipo in ('confirmacao', 'lembrete'))
     )
     and status in ('pendente', 'processando', 'concluido', 'erro');
  insert into public.agenda_automacao_respostas (
    empresa_id, agenda_id, agendamento_id, conversa_id, mensagem_id,
    fluxo_id, acao, status, proxima_tentativa_em, erro, payload_json
  ) values (
    new.empresa_id, v_agendamento.agenda_id, v_agendamento.id, new.conversa_id, new.id,
    v_fluxo_id, v_acao,
    case when v_fluxo_id is null then 'cancelado' else 'pendente' end,
    case when v_fluxo_id is null then null else now() end,
    case when v_fluxo_id is null then 'Nenhum fluxo ativo foi mapeado para esta ação.' else null end,
    jsonb_build_object(
      'payload', v_payload,
      'contato_id', v_agendamento.contato_id,
      'agenda_inicio_at', v_agendamento.inicio_at,
      'agenda_fim_at', v_agendamento.fim_at
    )
  )
  on conflict (mensagem_id) do update
     set updated_at = excluded.updated_at
  returning id into v_resposta_id;
  if v_agendamento.responsavel_id is not null then
    insert into public.notificacoes (
      empresa_id, usuario_id, conversa_id, contato_id, tipo, titulo, mensagem, lida, metadata_json
    ) values (
      new.empresa_id, v_agendamento.responsavel_id, new.conversa_id,
      v_agendamento.contato_id, 'automacao',
      case
        when v_acao = 'reagendar' then 'Reagendamento solicitado'
        when v_acao = 'cancelar' then 'Cancelamento solicitado'
        else 'Agendamento confirmado'
      end,
      v_resumo, false,
      jsonb_build_object(
        'tipo_notificacao', 'agenda_resposta_whatsapp',
        'agenda_agendamento_id', v_agendamento.id,
        'agenda_id', v_agendamento.agenda_id,
        'agenda_automacao_resposta_id', v_resposta_id,
        'acao', v_acao,
        'mensagem_id', new.id,
        'href', '/agendas?agenda=' || v_agendamento.agenda_id::text ||
          '&agendamento=' || v_agendamento.id::text
      )
    );
  end if;
  update public.mensagens
     set metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
       'agenda_acao_processada', true,
       'agenda_acao', v_acao,
       'agenda_agendamento_id', v_agendamento.id,
       'agenda_automacao_resposta_id', v_resposta_id,
       'agenda_acao_processada_em', now(),
       'automacao_processada', true,
       'automacao_processada_em', now(),
       'automacao_resultado', jsonb_build_object(
         'ok', true,
         'status', case when v_fluxo_id is null then 'agenda_acao_sem_fluxo' else 'agenda_fluxo_agendado' end,
         'acao', v_acao,
         'agendamento_id', v_agendamento.id,
         'fluxo_id', v_fluxo_id
       )
     )
   where id = new.id;
  return new;
end;
$function$;
drop trigger if exists agenda_automacoes_processar_resposta_trigger on public.mensagens;
create trigger agenda_automacoes_processar_resposta_trigger
after insert on public.mensagens
for each row execute function public.agenda_automacoes_processar_resposta_whatsapp();
revoke all on function public.agenda_automacoes_respostas_reivindicar(integer)
  from public, anon, authenticated;
grant execute on function public.agenda_automacoes_respostas_reivindicar(integer)
  to service_role;
comment on table public.agenda_automacao_respostas is
  'Fila idempotente dos fluxos iniciados pelas respostas dos botões de confirmação da agenda.';
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
  update public.agenda_automacao_execucoes
     set status = 'cancelado', bloqueado_em = null,
         erro = 'Execução substituída após alteração das regras da agenda.',
         updated_at = now()
   where empresa_id = p_empresa_id
     and agenda_id = p_agenda_id
     and status in ('pendente', 'erro')
     and cancelado_manualmente = false;
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
