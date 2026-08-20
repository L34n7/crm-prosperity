create or replace function public.atomopay_preservar_status_terminal()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_novo text := lower(btrim(coalesce(new.status, '')));
  v_antigo text := case when tg_op = 'UPDATE' then lower(btrim(coalesce(old.status, ''))) else '' end;
begin
  if lower(coalesce(new.gateway, '')) <> 'atomo' then
    return new;
  end if;

  if v_novo = 'canceled' then
    new.status := 'cancelled';
    v_novo := 'cancelled';
  end if;

  if tg_op = 'UPDATE' then
    if v_antigo in ('paid', 'approved', 'completed')
       and v_novo in ('', 'waiting_payment', 'pending', 'cancelled', 'canceled', 'unpaid') then
      new.status := old.status;
      new.paid_at := old.paid_at;
      new.payload := old.payload;
    elsif v_antigo = 'cancelled'
       and v_novo in ('', 'waiting_payment', 'pending', 'unpaid') then
      new.status := old.status;
      new.payload := old.payload;
    elsif v_antigo = 'refunded' and v_novo <> 'refunded' then
      new.status := old.status;
      new.refunded_at := old.refunded_at;
      new.payload := old.payload;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists atomopay_preservar_status_terminal on public.pagamentos;
create trigger atomopay_preservar_status_terminal
before insert or update of status, payload on public.pagamentos
for each row execute function public.atomopay_preservar_status_terminal();

create or replace function public.atomopay_reconciliar_pix_pendentes(
  p_limite integer default 200,
  p_idade_minutos integer default 1560
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 200), 1), 1000);
  v_idade integer := greatest(coalesce(p_idade_minutos, 1560), 60);
  v_atualizados integer := 0;
begin
  with candidatos as (
    select id
    from public.pagamentos
    where lower(coalesce(gateway, '')) = 'atomo'
      and lower(coalesce(metodo, '')) = 'pix'
      and lower(coalesce(status, '')) in ('waiting_payment', 'pending')
      and created_at <= now() - make_interval(mins => v_idade)
    order by created_at
    limit v_limite
    for update skip locked
  )
  update public.pagamentos p
  set status = 'cancelled',
      updated_at = now(),
      payload = coalesce(p.payload, '{}'::jsonb) || jsonb_build_object(
        '_crm_reconciliacao', jsonb_build_object(
          'origem', 'expiracao_pix_local',
          'reconciliado_em', now(),
          'status_anterior', p.status,
          'motivo', format('PIX Atomo permaneceu pendente por mais de %s minutos sem webhook terminal.', v_idade)
        )
      )
  from candidatos c
  where p.id = c.id;

  get diagnostics v_atualizados = row_count;

  return jsonb_build_object(
    'ok', true,
    'atualizados', v_atualizados,
    'idade_minutos', v_idade,
    'limite', v_limite
  );
end;
$$;

revoke all on function public.atomopay_reconciliar_pix_pendentes(integer, integer) from public;
grant execute on function public.atomopay_reconciliar_pix_pendentes(integer, integer) to service_role;
