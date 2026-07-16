-- Mantém o bloqueio sempre em sete dias após o vencimento e registra os avisos
-- financeiros enviados, evitando reenvios duplicados entre execuções do cron.
create table if not exists public.assinatura_avisos_email (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null check (tipo in ('pre_vencimento', 'vencida', 'bloqueada')),
  vencimento_em timestamptz not null,
  tentativa smallint not null check (tentativa between 1 and 2),
  destinatario text not null,
  enviado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, tipo, vencimento_em, tentativa)
);

create index if not exists assinatura_avisos_email_consulta_idx
  on public.assinatura_avisos_email (empresa_id, tipo, vencimento_em, enviado_em desc);

create or replace function public.sincronizar_assinatura_empresa(p_empresa_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa public.empresas;
  v_status_calculado text;
  v_agora timestamptz := now();
  v_bloqueio_em timestamptz;
begin
  select * into v_empresa
  from public.empresas
  where id = p_empresa_id
  for update;

  if not found then
    raise exception 'Empresa nao encontrada para controle de assinatura.';
  end if;

  v_bloqueio_em := case
    when v_empresa.assinatura_vencimento_em is not null
      then v_empresa.assinatura_vencimento_em + interval '7 days'
    else v_empresa.assinatura_bloqueio_em
  end;

  v_status_calculado := case
    when v_bloqueio_em is not null and v_agora >= v_bloqueio_em then 'bloqueada'
    when v_empresa.assinatura_vencimento_em is not null and v_agora >= v_empresa.assinatura_vencimento_em then 'vencida'
    else 'ativa'
  end;

  update public.empresas
  set
    assinatura_status = v_status_calculado,
    assinatura_bloqueio_em = v_bloqueio_em,
    updated_at = v_agora
  where id = p_empresa_id
    and (
      assinatura_status is distinct from v_status_calculado
      or assinatura_bloqueio_em is distinct from v_bloqueio_em
    );

  if v_status_calculado in ('vencida', 'bloqueada') then
    update public.empresa_tokens_ia
    set saldo_mensal_restante = 0, saldo_avulso_restante = 0, tokens_restantes = 0, updated_at = v_agora
    where empresa_id = p_empresa_id;
  end if;

  if v_status_calculado = 'bloqueada' then
    update public.automacao_fluxos set status = 'pausado', updated_at = v_agora
    where empresa_id = p_empresa_id and status = 'ativo';

    update public.empresas
    set assinatura_fluxos_pausados_em = coalesce(assinatura_fluxos_pausados_em, v_agora)
    where id = p_empresa_id;
  end if;

  return v_status_calculado;
end;
$$;
