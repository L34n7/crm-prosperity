-- Segundo e-mail de retenção, 30 dias após o e-mail de cancelamento.
-- Exclusões operacionais continuam após 60 dias do cancelamento.
alter table public.empresas
  add column if not exists encerramento_retorno_email_estado text not null default 'pendente',
  add column if not exists encerramento_retorno_email_tentado_em timestamptz,
  add column if not exists encerramento_retorno_email_enviado_em timestamptz,
  add column if not exists encerramento_retorno_email_erro text;

alter table public.empresas drop constraint if exists empresas_encerramento_retorno_email_estado_check;
alter table public.empresas add constraint empresas_encerramento_retorno_email_estado_check
  check (encerramento_retorno_email_estado in ('pendente','processando','enviado','legado'));

-- Recomeça cada ciclo após restaurar e cancelar novamente.
create or replace function public.reiniciar_email_retorno_ao_cancelar_empresa()
returns trigger language plpgsql security invoker set search_path='public' as $$
begin
  if new.status='cancelada' and old.status is distinct from 'cancelada' then
    new.encerramento_retorno_email_estado := 'pendente';
    new.encerramento_retorno_email_tentado_em := null;
    new.encerramento_retorno_email_enviado_em := null;
    new.encerramento_retorno_email_erro := null;
  end if;
  return new;
end $$;

drop trigger if exists empresas_reiniciar_email_retorno on public.empresas;
create trigger empresas_reiniciar_email_retorno before update of status on public.empresas
  for each row execute function public.reiniciar_email_retorno_ao_cancelar_empresa();

revoke all on function public.reiniciar_email_retorno_ao_cancelar_empresa()
  from public,anon,authenticated;

-- Remove a carência transitória antiga das contas já elegíveis.
-- O cancelamento acontece via rotina, APÓS reconciliação do plano e pagamentos;
-- esta migração, por si só, não cancela empresas.
update public.empresas e
  set cancelamento_auto_nao_antes_em = null
  where e.status='ativa'
    and e.assinatura_status='bloqueada'
    and e.assinatura_bloqueio_em <= now()-interval '30 days'
    and e.restauracao_pendente_pagamento_em is null
    and e.cancelamento_auto_nao_antes_em is not null
    and not exists (
      select 1 from public.pagamentos p
      where p.empresa_id=e.id
        and p.status='paid'
        and p.paid_at>=e.assinatura_bloqueio_em
    );

create index if not exists empresas_retorno_email_pendente_idx
  on public.empresas(encerramento_email_enviado_em)
  where status='cancelada' and encerramento_retorno_email_estado='pendente';
