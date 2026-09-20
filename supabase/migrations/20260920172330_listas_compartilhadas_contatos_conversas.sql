create table if not exists public.conversas_listas_contatos (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  lista_id uuid not null references public.conversas_listas(id) on delete cascade,
  contato_id uuid not null references public.contatos(id) on delete cascade,
  criado_por uuid not null,
  created_at timestamptz not null default now(),
  primary key (lista_id, contato_id)
);

create index if not exists conversas_listas_contatos_empresa_lista_idx
  on public.conversas_listas_contatos (empresa_id, lista_id, contato_id);

create index if not exists conversas_listas_contatos_contato_idx
  on public.conversas_listas_contatos (contato_id, lista_id);

alter table public.conversas_listas_contatos enable row level security;
revoke all on table public.conversas_listas_contatos from anon, authenticated;

insert into public.conversas_listas_contatos (
  empresa_id, lista_id, contato_id, criado_por, created_at
)
select distinct on (cli.lista_id, c.contato_id)
  cli.empresa_id, cli.lista_id, c.contato_id, cli.criado_por, cli.created_at
from public.conversas_listas_itens cli
join public.conversas c
  on c.id = cli.conversa_id
 and c.empresa_id = cli.empresa_id
order by cli.lista_id, c.contato_id, cli.created_at asc, cli.id asc
on conflict (lista_id, contato_id) do nothing;

create or replace function public.sincronizar_lista_contato_para_conversas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.conversas_listas_itens (
      empresa_id, lista_id, conversa_id, criado_por
    )
    select new.empresa_id, new.lista_id, c.id, new.criado_por
    from public.conversas c
    where c.empresa_id = new.empresa_id
      and c.contato_id = new.contato_id
    on conflict (lista_id, conversa_id) do nothing;
    return new;
  end if;

  if tg_op = 'DELETE' then
    delete from public.conversas_listas_itens cli
    using public.conversas c
    where cli.empresa_id = old.empresa_id
      and cli.lista_id = old.lista_id
      and c.id = cli.conversa_id
      and c.empresa_id = old.empresa_id
      and c.contato_id = old.contato_id;
    return old;
  end if;

  return null;
end;
$$;

create or replace function public.sincronizar_item_lista_para_contato()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_contato_id uuid;
begin
  select c.contato_id
    into v_contato_id
  from public.conversas c
  where c.id = new.conversa_id
    and c.empresa_id = new.empresa_id;

  if v_contato_id is not null then
    insert into public.conversas_listas_contatos (
      empresa_id, lista_id, contato_id, criado_por
    )
    values (
      new.empresa_id, new.lista_id, v_contato_id, new.criado_por
    )
    on conflict (lista_id, contato_id) do nothing;
  end if;

  return new;
end;
$$;

create or replace function public.sincronizar_nova_conversa_com_listas_contato()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.conversas_listas_itens (
    empresa_id, lista_id, conversa_id, criado_por
  )
  select
    new.empresa_id,
    membro.lista_id,
    new.id,
    case
      when exists (
        select 1
        from public.usuarios u
        where u.id = membro.criado_por
          and u.empresa_id = new.empresa_id
      ) then membro.criado_por
      else (
        select u.id
        from public.usuarios u
        where u.empresa_id = new.empresa_id
        order by u.id
        limit 1
      )
    end
  from public.conversas_listas_contatos membro
  where membro.empresa_id = new.empresa_id
    and membro.contato_id = new.contato_id
    and (
      exists (
        select 1
        from public.usuarios u
        where u.id = membro.criado_por
          and u.empresa_id = new.empresa_id
      )
      or exists (
        select 1
        from public.usuarios u
        where u.empresa_id = new.empresa_id
      )
    )
  on conflict (lista_id, conversa_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_lista_contato_sincronizar_conversas
  on public.conversas_listas_contatos;
create trigger trg_lista_contato_sincronizar_conversas
  after insert or delete on public.conversas_listas_contatos
  for each row execute function public.sincronizar_lista_contato_para_conversas();

drop trigger if exists trg_item_lista_sincronizar_contato
  on public.conversas_listas_itens;
create trigger trg_item_lista_sincronizar_contato
  after insert on public.conversas_listas_itens
  for each row execute function public.sincronizar_item_lista_para_contato();

drop trigger if exists trg_nova_conversa_sincronizar_listas_contato
  on public.conversas;
create trigger trg_nova_conversa_sincronizar_listas_contato
  after insert on public.conversas
  for each row execute function public.sincronizar_nova_conversa_com_listas_contato();

create or replace function public.listar_contatos_operacionais_contexto_lista_compartilhada(
  p_empresa_id uuid,
  p_lista_id uuid,
  p_integracao_whatsapp_id uuid,
  p_mensagem_data_inicio date,
  p_mensagem_data_fim date,
  p_ultimo_atendente_id uuid,
  p_filtrar_por_integracao boolean
)
returns table (
  id uuid, empresa_id uuid, nome text, whatsapp_profile_name text,
  telefone text, email text, origem text, campanha text, campo_contato text,
  rastreamento_origem_id uuid, rastreamento_campanha_id uuid,
  rastreamento_link_id uuid, rastreamento_clique_id uuid, observacoes text,
  telefone_revisar boolean, classificacao text,
  classificacao_atualizada_em timestamptz, classificacao_evento_id uuid,
  classificacao_protocolo_id uuid, contato_novo boolean,
  campanha_exibicao text, campanha_status text, campanha_origem_nome text,
  telefone_normalizado text, origem_exibicao text, opt_in_whatsapp boolean,
  whatsapp_opt_out boolean, whatsapp_opt_out_geral boolean,
  whatsapp_opt_out_marketing boolean, whatsapp_opt_out_utility boolean,
  conversa_id uuid, conversa_status text, conversa_ultima_mensagem_em timestamptz,
  conversa_encerrada_em timestamptz, protocolo_atual text,
  protocolo_resultado text, contato_novo_no_inicio boolean,
  iniciado_com_bot boolean, finalizado_com_bot boolean,
  finalizado_por_tipo text, finalizado_por_usuario_id uuid,
  finalizado_por_usuario_nome text, contexto_integracao_whatsapp_id uuid,
  contexto_integracao_nome text, contexto_integracao_numero text,
  ultima_mensagem_contato_em timestamptz, ultimo_atendente_id uuid,
  ultimo_atendente_nome text, created_at timestamptz, updated_at timestamptz
)
language sql
stable
set search_path = public, pg_temp
as $$
  select base.*
  from public.listar_contatos_operacionais_contexto(
    p_empresa_id,
    p_integracao_whatsapp_id,
    p_mensagem_data_inicio,
    p_mensagem_data_fim,
    p_ultimo_atendente_id,
    p_filtrar_por_integracao
  ) base
  where exists (
    select 1
    from public.conversas_listas_contatos membro
    where membro.empresa_id = p_empresa_id
      and membro.lista_id = p_lista_id
      and membro.contato_id = base.id
  );
$$;

revoke all on function public.sincronizar_lista_contato_para_conversas()
  from public, anon, authenticated;
revoke all on function public.sincronizar_item_lista_para_contato()
  from public, anon, authenticated;
revoke all on function public.sincronizar_nova_conversa_com_listas_contato()
  from public, anon, authenticated;
