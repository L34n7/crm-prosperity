create table if not exists public.rotina_mensagem_saida_outbox (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  mensagem_id uuid not null references public.mensagens(id) on delete cascade,
  status text not null default 'pendente'
    check (status in ('pendente','processado','ignorado')),
  qstash_message_id text,
  qstash_publicado_em timestamptz,
  ultimo_erro text,
  processado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mensagem_id)
);

create index if not exists rotina_mensagem_saida_outbox_pendentes_idx
  on public.rotina_mensagem_saida_outbox (status, updated_at, created_at)
  where status = 'pendente';

alter table public.rotina_mensagem_saida_outbox enable row level security;
revoke all on table public.rotina_mensagem_saida_outbox from anon, authenticated;
grant select, insert, update, delete on table public.rotina_mensagem_saida_outbox to service_role;

create or replace function public.rotina_registrar_mensagem_saida_outbox()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.remetente_tipo = 'contato' or new.status_envio = 'falha' then
    return new;
  end if;

  if not exists (
    select 1
    from public.rotina_automacao_assinaturas a
    where a.empresa_id = new.empresa_id
      and a.evento = 'mensagem.enviada'
      and a.quantidade_automacoes > 0
  ) then
    return new;
  end if;

  insert into public.rotina_mensagem_saida_outbox (
    empresa_id,
    conversa_id,
    mensagem_id,
    status
  ) values (
    new.empresa_id,
    new.conversa_id,
    new.id,
    'pendente'
  )
  on conflict (mensagem_id) do nothing;

  return new;
end;
$$;

drop trigger if exists mensagens_rotina_saida_outbox on public.mensagens;
create trigger mensagens_rotina_saida_outbox
after insert on public.mensagens
for each row execute function public.rotina_registrar_mensagem_saida_outbox();

revoke execute on function public.rotina_registrar_mensagem_saida_outbox()
  from public, anon, authenticated;
grant execute on function public.rotina_registrar_mensagem_saida_outbox()
  to service_role;

comment on table public.rotina_mensagem_saida_outbox is
  'Fallback central para eventos mensagem.enviada. Só recebe mensagens quando existe automação ativa assinando esse evento.';
