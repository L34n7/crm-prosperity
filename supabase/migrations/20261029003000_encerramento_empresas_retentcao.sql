-- Política de encerramento de clientes CRM / White Label.
-- Somente endpoints administrativos que usam service_role executam as funções.
alter table public.empresas
  add column if not exists cancelada_em timestamptz,
  add column if not exists exclusao_prevista_em timestamptz,
  add column if not exists encerramento_por uuid,
  add column if not exists encerramento_contexto jsonb,
  add column if not exists encerramento_backup_estado text,
  add column if not exists encerramento_backup_path text,
  add column if not exists encerramento_backup_gerado_em timestamptz,
  add column if not exists encerramento_backup_erro text;

alter table public.empresas
  drop constraint if exists empresas_encerramento_backup_estado_check;
alter table public.empresas
  add constraint empresas_encerramento_backup_estado_check
  check (encerramento_backup_estado is null or encerramento_backup_estado in
    ('pendente', 'processando', 'pronto', 'erro'));

create index if not exists empresas_encerramento_pendente_idx
  on public.empresas (exclusao_prevista_em)
  where status = 'cancelada';

-- Histórico mínimo que não depende da FK da empresa, para futura reconciliação financeira.
create table if not exists public.empresa_encerramento_financeiro (
  empresa_id uuid primary key,
  empresa_nome text not null,
  white_label_id uuid,
  cancelada_em timestamptz,
  excluida_em timestamptz not null default now(),
  assinatura_status text,
  pagamentos jsonb not null default '[]'::jsonb
);
alter table public.empresa_encerramento_financeiro enable row level security;
revoke all on public.empresa_encerramento_financeiro from public, anon, authenticated;
grant select, insert, update on public.empresa_encerramento_financeiro to service_role;

insert into storage.buckets(id, name, public, file_size_limit)
values ('empresa-encerramentos', 'empresa-encerramentos', false, 104857600)
on conflict (id) do update set public = false;

create or replace function public.encerrar_empresa_admin(
  p_empresa_id uuid, p_usuario_id uuid default null
) returns jsonb language plpgsql security invoker
set search_path = 'public' as $$
declare
  v_empresa public.empresas%rowtype;
  v_contexto jsonb;
  v_agora timestamptz := now();
begin
  select * into v_empresa from public.empresas where id = p_empresa_id for update;
  if not found then raise exception 'Empresa não encontrada.'; end if;
  if v_empresa.status = 'cancelada' then
    return jsonb_build_object('ok',true,'ja_cancelada',true,'empresa_id',p_empresa_id);
  end if;
  if v_empresa.white_label_tipo = 'gestora' and exists (
    select 1 from public.empresas
    where white_label_id = v_empresa.white_label_id
      and white_label_tipo = 'cliente' and status <> 'cancelada'
  ) then
    raise exception 'Encerre os clientes vinculados ao White Label antes de encerrar a gestora.';
  end if;
  select jsonb_build_object(
    'usuarios_ativos', coalesce((select jsonb_agg(id) from public.usuarios where empresa_id=p_empresa_id and status='ativo'),'[]'::jsonb),
    'fluxos_ativos', coalesce((select jsonb_agg(id) from public.automacao_fluxos where empresa_id=p_empresa_id and status='ativo'),'[]'::jsonb),
    'agenda_regras_ativas', coalesce((select jsonb_agg(id) from public.agenda_automacao_regras where empresa_id=p_empresa_id and ativo),'[]'::jsonb),
    'rotinas_gatilhos_ativos', coalesce((select jsonb_agg(id) from public.rotina_automacao_gatilhos where empresa_id=p_empresa_id and ativo),'[]'::jsonb)
  ) into v_contexto;

  update public.empresas set
    status = 'cancelada', cancelada_em = v_agora,
    exclusao_prevista_em = v_agora + interval '90 days',
    encerramento_por = p_usuario_id, encerramento_contexto = v_contexto,
    encerramento_backup_estado = 'pendente',
    encerramento_backup_path = null, encerramento_backup_gerado_em = null,
    encerramento_backup_erro = null,
    updated_at = v_agora
  where id = p_empresa_id;

  update public.usuarios set status='inativo',updated_at=v_agora where empresa_id=p_empresa_id;
  delete from public.usuario_sessoes where empresa_id=p_empresa_id;
  -- Bloqueio local imediato. Nunca revoga o token global da aplicação Meta.
  update public.integracoes_whatsapp set
    status='desconectada', token_ref=null, config_json='{}'::jsonb,
    webhook_verificado=false, updated_at=v_agora,
    coex_status=case when modo_integracao='coexistence' then 'desconectado' else coex_status end
  where empresa_id=p_empresa_id;
  update public.automacao_fluxos set status='pausado',updated_at=v_agora where empresa_id=p_empresa_id and status='ativo';
  update public.agenda_automacao_regras set ativo=false,updated_at=v_agora where empresa_id=p_empresa_id and ativo;
  update public.rotina_automacao_gatilhos set ativo=false,updated_at=v_agora where empresa_id=p_empresa_id and ativo;
  update public.rotina_automacao_jobs set status='cancelado',cancelado_em=v_agora,origem_cancelamento='encerramento_empresa',updated_at=v_agora
   where empresa_id=p_empresa_id and status in ('pendente','processando');
  update public.agenda_automacao_execucoes set status='cancelado',updated_at=v_agora
   where empresa_id=p_empresa_id and status in ('pendente','processando');
  update public.whatsapp_disparo_campanhas set status='cancelada',updated_at=v_agora
   where empresa_id=p_empresa_id and status not in ('concluida','cancelada');
  return jsonb_build_object('ok',true,'empresa_id',p_empresa_id,
    'cancelada_em',v_agora,'exclusao_prevista_em',v_agora+interval '90 days');
end $$;

revoke all on function public.encerrar_empresa_admin(uuid,uuid) from public,anon,authenticated;
grant execute on function public.encerrar_empresa_admin(uuid,uuid) to service_role;

create or replace function public.restaurar_empresa_admin(
  p_empresa_id uuid
) returns jsonb language plpgsql security invoker
set search_path = 'public' as $$
declare
  v_empresa public.empresas%rowtype;
begin
  select * into v_empresa from public.empresas where id=p_empresa_id for update;
  if not found then raise exception 'Empresa não encontrada.'; end if;
  if v_empresa.status <> 'cancelada' then raise exception 'Somente empresas canceladas podem ser restauradas.'; end if;
  if v_empresa.exclusao_prevista_em is null or v_empresa.exclusao_prevista_em <= now() then
    raise exception 'O prazo de restauração não está disponível ou expirou.';
  end if;
  update public.empresas set status='ativa',
    cancelada_em=null,exclusao_prevista_em=null,encerramento_por=null,
    encerramento_backup_estado=null,encerramento_backup_erro=null,
    updated_at=now() where id=p_empresa_id;
  update public.usuarios set status='ativo',updated_at=now()
    where empresa_id=p_empresa_id and id in (
      select value::uuid from jsonb_array_elements_text(coalesce(v_empresa.encerramento_contexto->'usuarios_ativos','[]'::jsonb))
    );
  -- Integrações não são reconectadas, e automações não são religadas sem revisão.
  return jsonb_build_object('ok',true,'empresa_id',p_empresa_id,
    'reconectar_whatsapp',true,'reativar_automacoes_manualmente',true);
end $$;
revoke all on function public.restaurar_empresa_admin(uuid) from public,anon,authenticated;
grant execute on function public.restaurar_empresa_admin(uuid) to service_role;
