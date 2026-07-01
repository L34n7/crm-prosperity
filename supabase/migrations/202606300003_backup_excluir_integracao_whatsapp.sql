create table if not exists public.integracoes_whatsapp_backups (
  id uuid primary key default gen_random_uuid(),
  integracao_id_original uuid not null,
  empresa_id uuid not null,
  backup_json jsonb not null,
  contexto_json jsonb not null default '{}'::jsonb,
  excluida_por_usuario_id uuid,
  motivo text not null default 'desconexao_solicitada_no_perfil',
  created_at timestamptz not null default now()
);

alter table public.integracoes_whatsapp_backups
  add column if not exists contexto_json jsonb not null default '{}'::jsonb;

alter table public.conversas
  add column if not exists integracao_whatsapp_id_anterior uuid,
  add column if not exists integracao_whatsapp_phone_number_id_anterior text;

create index if not exists conversas_integracao_whatsapp_anterior_idx
  on public.conversas (
    empresa_id,
    integracao_whatsapp_phone_number_id_anterior
  )
  where integracao_whatsapp_id is null
    and integracao_whatsapp_phone_number_id_anterior is not null;

create index if not exists integracoes_whatsapp_backups_integracao_idx
  on public.integracoes_whatsapp_backups (integracao_id_original, created_at desc);

create index if not exists integracoes_whatsapp_backups_empresa_idx
  on public.integracoes_whatsapp_backups (empresa_id, created_at desc);

alter table public.integracoes_whatsapp_backups enable row level security;

revoke all on table public.integracoes_whatsapp_backups from anon, authenticated;
grant all on table public.integracoes_whatsapp_backups to service_role;

comment on table public.integracoes_whatsapp_backups is
  'Snapshot interno e restrito de integracoes WhatsApp removidas do CRM.';

create or replace function public.backup_e_excluir_integracao_whatsapp(
  p_integracao_id uuid,
  p_empresa_id uuid,
  p_usuario_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_integracao public.integracoes_whatsapp%rowtype;
  v_backup_id uuid;
  v_template_ids uuid[] := '{}'::uuid[];
  v_fluxo_ids uuid[] := '{}'::uuid[];
  v_execucao_ids uuid[] := '{}'::uuid[];
  v_contexto_json jsonb := '{}'::jsonb;
begin
  select i.*
    into v_integracao
  from public.integracoes_whatsapp i
  where i.id = p_integracao_id
    and i.empresa_id = p_empresa_id
    and i.provider = 'meta_official'
  for update;

  if v_integracao.id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Integracao WhatsApp nao encontrada para a empresa.';
  end if;

  select coalesce(array_agg(t.id), '{}'::uuid[])
    into v_template_ids
  from public.whatsapp_templates t
  where t.empresa_id = p_empresa_id
    and t.integracao_whatsapp_id = p_integracao_id;

  select coalesce(array_agg(distinct n.fluxo_id), '{}'::uuid[])
    into v_fluxo_ids
  from public.automacao_nos n
  where n.empresa_id = p_empresa_id
    and (
      (
        n.tipo_no = 'agendar_disparo'
        and exists (
          select 1
          from unnest(v_template_ids) template_id
          where template_id::text =
            coalesce(n.configuracao_json, '{}'::jsonb) ->> 'template_id'
        )
      )
      or (
        n.tipo_no = 'agenda_criar_agendamento'
        and exists (
          select 1
          from unnest(v_template_ids) template_id
          where template_id::text =
            coalesce(n.configuracao_json, '{}'::jsonb)
              ->> 'lembrete_agendamento_template_id'
        )
      )
    );

  select jsonb_build_object(
    'templates_whatsapp',
    coalesce(
      (
        select jsonb_agg(to_jsonb(t))
        from public.whatsapp_templates t
        where t.id = any(v_template_ids)
      ),
      '[]'::jsonb
    ),
    'fluxos_impactados',
    coalesce(
      (
        select jsonb_agg(to_jsonb(f))
        from public.automacao_fluxos f
        where f.id = any(v_fluxo_ids)
      ),
      '[]'::jsonb
    ),
    'nos_impactados',
    coalesce(
      (
        select jsonb_agg(to_jsonb(n))
        from public.automacao_nos n
        where n.empresa_id = p_empresa_id
          and (
            (
              n.tipo_no = 'agendar_disparo'
              and exists (
                select 1
                from unnest(v_template_ids) template_id
                where template_id::text =
                  coalesce(n.configuracao_json, '{}'::jsonb) ->> 'template_id'
              )
            )
            or (
              n.tipo_no = 'agenda_criar_agendamento'
              and exists (
                select 1
                from unnest(v_template_ids) template_id
                where template_id::text =
                  coalesce(n.configuracao_json, '{}'::jsonb)
                    ->> 'lembrete_agendamento_template_id'
              )
            )
          )
      ),
      '[]'::jsonb
    ),
    'conversas_ids',
    coalesce(
      (
        select jsonb_agg(c.id)
        from public.conversas c
        where c.empresa_id = p_empresa_id
          and c.integracao_whatsapp_id = p_integracao_id
      ),
      '[]'::jsonb
    )
  )
  into v_contexto_json;

  insert into public.integracoes_whatsapp_backups (
    integracao_id_original,
    empresa_id,
    backup_json,
    contexto_json,
    excluida_por_usuario_id
  )
  values (
    v_integracao.id,
    v_integracao.empresa_id,
    to_jsonb(v_integracao),
    v_contexto_json,
    p_usuario_id
  )
  returning id into v_backup_id;

  -- Fluxos que perderao templates deixam de iniciar novas execucoes.
  update public.automacao_fluxos
  set
    status = 'pausado',
    updated_at = now()
  where empresa_id = p_empresa_id
    and id = any(v_fluxo_ids)
    and status = 'ativo';

  -- Limpa somente a selecao do template e suas variaveis. As demais
  -- configuracoes dos blocos e o desenho do fluxo permanecem intactos.
  update public.automacao_nos n
  set
    configuracao_json = case
      when n.tipo_no = 'agendar_disparo' then
        jsonb_set(
          jsonb_set(
            coalesce(n.configuracao_json, '{}'::jsonb),
            '{template_id}',
            '""'::jsonb,
            true
          ),
          '{variaveis}',
          '[]'::jsonb,
          true
        )
      when n.tipo_no = 'agenda_criar_agendamento' then
        jsonb_set(
          jsonb_set(
            coalesce(n.configuracao_json, '{}'::jsonb),
            '{lembrete_agendamento_template_id}',
            '""'::jsonb,
            true
          ),
          '{lembrete_agendamento_variaveis}',
          '[]'::jsonb,
          true
        )
      else coalesce(n.configuracao_json, '{}'::jsonb)
    end,
    updated_at = now()
  where n.empresa_id = p_empresa_id
    and (
      (
        n.tipo_no = 'agendar_disparo'
        and exists (
          select 1
          from unnest(v_template_ids) template_id
          where template_id::text =
            coalesce(n.configuracao_json, '{}'::jsonb) ->> 'template_id'
        )
      )
      or (
        n.tipo_no = 'agenda_criar_agendamento'
        and exists (
          select 1
          from unnest(v_template_ids) template_id
          where template_id::text =
            coalesce(n.configuracao_json, '{}'::jsonb)
              ->> 'lembrete_agendamento_template_id'
        )
      )
    );

  select coalesce(array_agg(e.id), '{}'::uuid[])
    into v_execucao_ids
  from public.automacao_execucoes e
  where e.empresa_id = p_empresa_id
    and e.fluxo_id = any(v_fluxo_ids)
    and e.status in ('rodando', 'aguardando');

  update public.automacao_execucoes
  set
    status = 'cancelado',
    finished_at = now(),
    updated_at = now(),
    metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
      'motivo_cancelamento', 'integracao_whatsapp_desconectada',
      'integracao_whatsapp_id', p_integracao_id,
      'cancelado_em', now()
    )
  where empresa_id = p_empresa_id
    and id = any(v_execucao_ids);

  update public.automacao_agendamentos
  set status = 'cancelado'
  where empresa_id = p_empresa_id
    and execucao_id = any(v_execucao_ids)
    and status = 'pendente';

  update public.fila_processamento_auto
  set
    status = 'cancelado',
    updated_at = now()
  where empresa_id = p_empresa_id
    and execucao_id = any(v_execucao_ids)
    and status in ('pendente', 'executando');

  -- Historicos de negocio permanecem no CRM, apenas sem o vinculo removido.
  update public.conversas
  set
    integracao_whatsapp_id_anterior = p_integracao_id,
    integracao_whatsapp_phone_number_id_anterior =
      v_integracao.phone_number_id,
    integracao_whatsapp_id = null,
    updated_at = now()
  where empresa_id = p_empresa_id
    and integracao_whatsapp_id = p_integracao_id;

  update public.rastreamento_campanhas
  set
    integracao_whatsapp_id = null,
    updated_at = now()
  where empresa_id = p_empresa_id
    and integracao_whatsapp_id = p_integracao_id;

  update public.contato_atribuicoes_meta
  set
    integracao_whatsapp_id = null,
    updated_at = now()
  where empresa_id = p_empresa_id
    and integracao_whatsapp_id = p_integracao_id;

  -- Impede que um envio agendado recrie uma fila para a conexao removida.
  update public.automacao_agendamentos
  set
    status = 'cancelado',
    payload_json = coalesce(payload_json, '{}'::jsonb) || jsonb_build_object(
      'cancelado_em', now(),
      'cancelado_por', p_usuario_id,
      'origem_cancelamento', 'integracao_whatsapp_desconectada'
    )
  where empresa_id = p_empresa_id
    and tipo_agendamento = 'disparo_template'
    and status = 'pendente'
    and payload_json ->> 'integracao_whatsapp_id' = p_integracao_id::text;

  -- Os logs ficam disponiveis para auditoria mesmo apos filas e templates sairem.
  update public.whatsapp_disparos_logs l
  set
    integracao_whatsapp_id = null,
    campanha_disparo_id = null,
    item_disparo_id = null,
    template_id = null,
    metadata_json = coalesce(l.metadata_json, '{}'::jsonb) || jsonb_build_object(
      'integracao_whatsapp_id_desconectada', p_integracao_id,
      'integracao_whatsapp_desconectada_em', now()
    ),
    updated_at = now()
  where l.empresa_id = p_empresa_id
    and (
      l.integracao_whatsapp_id = p_integracao_id
      or l.campanha_disparo_id in (
        select c.id
        from public.whatsapp_disparo_campanhas c
        where c.integracao_whatsapp_id = p_integracao_id
      )
      or l.item_disparo_id in (
        select i.id
        from public.whatsapp_disparo_itens i
        where i.integracao_whatsapp_id = p_integracao_id
      )
      or l.template_id in (
        select t.id
        from public.whatsapp_templates t
        where t.integracao_whatsapp_id = p_integracao_id
      )
    );

  -- Remove primeiro os dados operacionais para respeitar as dependencias
  -- campanha -> template e item -> campanha.
  delete from public.whatsapp_disparo_itens
  where empresa_id = p_empresa_id
    and integracao_whatsapp_id = p_integracao_id;

  delete from public.whatsapp_disparo_campanhas
  where empresa_id = p_empresa_id
    and integracao_whatsapp_id = p_integracao_id;

  delete from public.whatsapp_templates
  where empresa_id = p_empresa_id
    and integracao_whatsapp_id = p_integracao_id;

  delete from public.integracoes_whatsapp
  where id = p_integracao_id
    and empresa_id = p_empresa_id;

  if not found then
    raise exception 'A integracao WhatsApp nao pode ser excluida.';
  end if;

  return v_backup_id;
end;
$$;

revoke all on function public.backup_e_excluir_integracao_whatsapp(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.backup_e_excluir_integracao_whatsapp(uuid, uuid, uuid)
  to service_role;

comment on function public.backup_e_excluir_integracao_whatsapp(uuid, uuid, uuid) is
  'Cria o backup e exclui uma integracao Meta do CRM na mesma transacao.';

create or replace function public.recuperar_conversas_whatsapp_ao_ativar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversas_recuperadas integer := 0;
begin
  if new.provider <> 'meta_official'
    or new.status <> 'ativa'
    or new.phone_number_id is null
    or btrim(new.phone_number_id) = ''
  then
    return new;
  end if;

  with candidatas as materialized (
    select
      c.id,
      row_number() over (
        partition by c.contato_id
        order by
          c.last_message_at desc nulls last,
          c.updated_at desc,
          c.created_at desc,
          c.id desc
      ) as ordem_contato
    from public.conversas c
    where c.empresa_id = new.empresa_id
      and c.integracao_whatsapp_id is null
      and c.integracao_whatsapp_phone_number_id_anterior =
        new.phone_number_id
  ),
  recuperadas as (
    update public.conversas c
    set
      integracao_whatsapp_id = new.id,
      updated_at = now()
    from candidatas candidata
    where c.id = candidata.id
      and candidata.ordem_contato = 1
      and not exists (
        select 1
        from public.conversas conversa_atual
        where conversa_atual.empresa_id = new.empresa_id
          and conversa_atual.contato_id = c.contato_id
          and conversa_atual.integracao_whatsapp_id = new.id
          and conversa_atual.id <> c.id
      )
    returning c.id
  )
  select count(*)::integer
    into v_conversas_recuperadas
  from recuperadas;

  update public.integracoes_whatsapp_backups backup
  set contexto_json =
    coalesce(backup.contexto_json, '{}'::jsonb) ||
    jsonb_build_object(
      'recuperacao_conversas',
      jsonb_build_object(
        'nova_integracao_id', new.id,
        'phone_number_id', new.phone_number_id,
        'quantidade', v_conversas_recuperadas,
        'recuperado_em', now()
      )
    )
  where backup.id = (
    select backup_anterior.id
    from public.integracoes_whatsapp_backups backup_anterior
    where backup_anterior.empresa_id = new.empresa_id
      and backup_anterior.backup_json ->> 'phone_number_id' =
        new.phone_number_id
    order by backup_anterior.created_at desc
    limit 1
  );

  return new;
end;
$$;

drop trigger if exists recuperar_conversas_whatsapp_ao_ativar
  on public.integracoes_whatsapp;

create trigger recuperar_conversas_whatsapp_ao_ativar
after update of status, phone_number_id
on public.integracoes_whatsapp
for each row
when (
  new.provider = 'meta_official'
  and new.status = 'ativa'
  and new.phone_number_id is not null
  and (
    old.status is distinct from new.status
    or old.phone_number_id is distinct from new.phone_number_id
  )
)
execute function public.recuperar_conversas_whatsapp_ao_ativar();

revoke all on function public.recuperar_conversas_whatsapp_ao_ativar()
  from public, anon, authenticated;
grant execute on function public.recuperar_conversas_whatsapp_ao_ativar()
  to service_role;

comment on function public.recuperar_conversas_whatsapp_ao_ativar() is
  'Revincula conversas ao ativar novamente o mesmo phone_number_id.';
