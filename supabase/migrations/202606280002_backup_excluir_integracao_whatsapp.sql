create table if not exists public.integracoes_whatsapp_backups (
  id uuid primary key default gen_random_uuid(),
  integracao_id_original uuid not null,
  empresa_id uuid not null,
  backup_json jsonb not null,
  excluida_por_usuario_id uuid,
  motivo text not null default 'desconexao_solicitada_no_perfil',
  created_at timestamptz not null default now()
);

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

  insert into public.integracoes_whatsapp_backups (
    integracao_id_original,
    empresa_id,
    backup_json,
    excluida_por_usuario_id
  )
  values (
    v_integracao.id,
    v_integracao.empresa_id,
    to_jsonb(v_integracao),
    p_usuario_id
  )
  returning id into v_backup_id;

  -- Historicos de negocio permanecem no CRM, apenas sem o vinculo removido.
  update public.conversas
  set
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
