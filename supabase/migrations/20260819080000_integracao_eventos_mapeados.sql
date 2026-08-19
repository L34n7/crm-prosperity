create table if not exists public.integracao_eventos_outbox (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  integracao_id uuid not null references public.integracoes_api_externas(id) on delete cascade,
  sistema text not null,
  recurso text not null,
  evento text not null,
  entidade_tipo text not null,
  entidade_id uuid not null,
  evento_chave text not null,
  payload_json jsonb not null default '{}'::jsonb,
  status text not null default 'pendente',
  tentativas integer not null default 0,
  max_tentativas integer not null default 5,
  processar_em timestamptz not null default now(),
  bloqueado_em timestamptz,
  processado_em timestamptz,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integracao_eventos_outbox_status_check
    check (status in ('pendente','processando','processado','ignorado','erro')),
  constraint integracao_eventos_outbox_empresa_evento_uidx
    unique (empresa_id, integracao_id, evento_chave)
);

create index if not exists integracao_eventos_outbox_pendentes_idx
  on public.integracao_eventos_outbox (status, processar_em, created_at)
  where status = 'pendente';

create index if not exists integracao_eventos_outbox_integracao_idx
  on public.integracao_eventos_outbox (integracao_id, created_at desc);

alter table public.integracao_eventos_outbox enable row level security;

create or replace function public.prosperity_publicar_evento_mapeado(
  p_recurso text,
  p_evento text,
  p_entidade_tipo text,
  p_entidade_id uuid,
  p_evento_chave text,
  p_payload_json jsonb default '{}'::jsonb
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer := 0;
begin
  if p_entidade_id is null or btrim(coalesce(p_evento, '')) = '' then
    return 0;
  end if;

  insert into public.integracao_eventos_outbox (
    empresa_id,
    integracao_id,
    sistema,
    recurso,
    evento,
    entidade_tipo,
    entidade_id,
    evento_chave,
    payload_json
  )
  select
    assinatura.empresa_id,
    integracao.id,
    'crm_prosperity',
    p_recurso,
    p_evento,
    p_entidade_tipo,
    p_entidade_id,
    concat(p_evento_chave, ':', integracao.id::text),
    coalesce(p_payload_json, '{}'::jsonb)
  from public.rotina_automacao_assinaturas assinatura
  join public.integracoes_api_externas integracao
    on integracao.empresa_id = assinatura.empresa_id
   and integracao.tipo = 'crm_prosperity'
   and integracao.status = 'ativa'
  where assinatura.evento = p_evento
    and assinatura.quantidade_automacoes > 0
  on conflict (empresa_id, integracao_id, evento_chave) do nothing;

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke all on function public.prosperity_publicar_evento_mapeado(text,text,text,uuid,text,jsonb) from public;

create or replace function public.trg_prosperity_eventos_pagamentos()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stamp text := coalesce(new.updated_at, new.created_at, now())::text;
  v_evento_payload text := lower(coalesce(new.payload->>'event', ''));
begin
  if tg_op = 'INSERT' then
    perform public.prosperity_publicar_evento_mapeado(
      'pagamentos',
      'prosperity.pagamento.criado',
      'pagamento',
      new.id,
      concat('prosperity.pagamento.criado:', new.id::text),
      jsonb_build_object('status_novo', new.status, 'metodo', new.metodo)
    );
  end if;

  if v_evento_payload = 'cart.abandoned' and (
    tg_op = 'INSERT' or lower(coalesce(old.payload->>'event', '')) is distinct from v_evento_payload
  ) then
    perform public.prosperity_publicar_evento_mapeado(
      'carrinhos_abandonados',
      'prosperity.carrinho.abandonado',
      'pagamento',
      new.id,
      concat('prosperity.carrinho.abandonado:', new.id::text),
      jsonb_build_object('abandonado_em', new.created_at)
    );
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform public.prosperity_publicar_evento_mapeado(
      'pagamentos',
      'prosperity.pagamento.status_alterado',
      'pagamento',
      new.id,
      concat('prosperity.pagamento.status_alterado:', new.id::text, ':', v_stamp),
      jsonb_build_object('status_anterior', old.status, 'status_novo', new.status, 'metodo', new.metodo)
    );
  end if;

  if new.status = 'paid' and (
    tg_op = 'INSERT' or old.status is distinct from new.status
  ) then
    perform public.prosperity_publicar_evento_mapeado(
      'pagamentos',
      'prosperity.pagamento.pago',
      'pagamento',
      new.id,
      concat('prosperity.pagamento.pago:', new.id::text),
      jsonb_build_object('status_anterior', case when tg_op = 'UPDATE' then old.status else null end, 'status_novo', new.status)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists prosperity_eventos_pagamentos on public.pagamentos;
create trigger prosperity_eventos_pagamentos
after insert or update on public.pagamentos
for each row execute function public.trg_prosperity_eventos_pagamentos();

create or replace function public.trg_prosperity_eventos_clientes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stamp text := coalesce(new.updated_at, new.created_at, now())::text;
begin
  if tg_op = 'INSERT' then
    perform public.prosperity_publicar_evento_mapeado(
      'clientes',
      'prosperity.cliente.criado',
      'lead_cadastro',
      new.id,
      concat('prosperity.cliente.criado:', new.id::text),
      '{}'::jsonb
    );
  elsif row(new.nome,new.email,new.telefone,new.status,new.pago,new.empresa_id,new.plano_slug)
        is distinct from
        row(old.nome,old.email,old.telefone,old.status,old.pago,old.empresa_id,old.plano_slug) then
    perform public.prosperity_publicar_evento_mapeado(
      'clientes',
      'prosperity.cliente.atualizado',
      'lead_cadastro',
      new.id,
      concat('prosperity.cliente.atualizado:', new.id::text, ':', v_stamp),
      '{}'::jsonb
    );
  end if;
  return new;
end;
$$;

drop trigger if exists prosperity_eventos_clientes on public.leads_cadastro;
create trigger prosperity_eventos_clientes
after insert or update on public.leads_cadastro
for each row execute function public.trg_prosperity_eventos_clientes();

create or replace function public.trg_prosperity_eventos_assinaturas()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stamp text := coalesce(new.updated_at, now())::text;
begin
  if new.assinatura_status is distinct from old.assinatura_status then
    perform public.prosperity_publicar_evento_mapeado(
      'assinaturas',
      'prosperity.assinatura.status_alterado',
      'empresa',
      new.id,
      concat('prosperity.assinatura.status_alterado:', new.id::text, ':', v_stamp),
      jsonb_build_object('status_anterior', old.assinatura_status, 'status_novo', new.assinatura_status)
    );
  end if;

  if new.assinatura_renovada_em is distinct from old.assinatura_renovada_em
     and new.assinatura_renovada_em is not null then
    perform public.prosperity_publicar_evento_mapeado(
      'assinaturas',
      'prosperity.assinatura.renovada',
      'empresa',
      new.id,
      concat('prosperity.assinatura.renovada:', new.id::text, ':', new.assinatura_renovada_em::text),
      jsonb_build_object('renovada_em', new.assinatura_renovada_em)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists prosperity_eventos_assinaturas on public.empresas;
create trigger prosperity_eventos_assinaturas
after update of assinatura_status, assinatura_renovada_em on public.empresas
for each row execute function public.trg_prosperity_eventos_assinaturas();

create or replace function public.trg_prosperity_eventos_onboarding()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stamp text := coalesce(new.updated_at, new.created_at, now())::text;
begin
  if tg_op = 'INSERT' then
    perform public.prosperity_publicar_evento_mapeado(
      'onboardings',
      'prosperity.onboarding.iniciado',
      'integracao_whatsapp',
      new.id,
      concat('prosperity.onboarding.iniciado:', new.id::text),
      jsonb_build_object('etapa_nova', new.onboarding_etapa, 'status_novo', new.onboarding_status)
    );
  end if;

  if tg_op = 'UPDATE' and new.onboarding_etapa is distinct from old.onboarding_etapa then
    perform public.prosperity_publicar_evento_mapeado(
      'onboardings',
      'prosperity.onboarding.etapa_alterada',
      'integracao_whatsapp',
      new.id,
      concat('prosperity.onboarding.etapa_alterada:', new.id::text, ':', v_stamp),
      jsonb_build_object('etapa_anterior', old.onboarding_etapa, 'etapa_nova', new.onboarding_etapa)
    );
  end if;

  if new.onboarding_status = 'erro' and (
    tg_op = 'INSERT' or old.onboarding_status is distinct from new.onboarding_status or old.onboarding_erro is distinct from new.onboarding_erro
  ) then
    perform public.prosperity_publicar_evento_mapeado(
      'onboardings',
      'prosperity.onboarding.erro',
      'integracao_whatsapp',
      new.id,
      concat('prosperity.onboarding.erro:', new.id::text, ':', v_stamp),
      jsonb_build_object('erro', new.onboarding_erro, 'etapa', new.onboarding_etapa)
    );
  end if;

  if new.setup_completed_at is not null and (
    tg_op = 'INSERT' or old.setup_completed_at is distinct from new.setup_completed_at
  ) then
    perform public.prosperity_publicar_evento_mapeado(
      'onboardings',
      'prosperity.onboarding.concluido',
      'integracao_whatsapp',
      new.id,
      concat('prosperity.onboarding.concluido:', new.id::text, ':', new.setup_completed_at::text),
      jsonb_build_object('concluido_em', new.setup_completed_at)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists prosperity_eventos_onboarding on public.integracoes_whatsapp;
create trigger prosperity_eventos_onboarding
after insert or update on public.integracoes_whatsapp
for each row execute function public.trg_prosperity_eventos_onboarding();
