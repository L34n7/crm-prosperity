-- Classificacao comercial nativa, com historico auditavel e fila independente do agente.
alter table public.configuracoes_empresa
  add column if not exists classificacao_automatica_ativa boolean not null default true,
  add column if not exists classificacao_modo text not null default 'hibrido',
  add column if not exists classificacao_inatividade_horas integer not null default 23;
alter table public.configuracoes_empresa
  drop constraint if exists configuracoes_empresa_classificacao_modo_check;
alter table public.configuracoes_empresa
  add constraint configuracoes_empresa_classificacao_modo_check
  check (classificacao_modo in ('hibrido','regras'));
alter table public.configuracoes_empresa
  drop constraint if exists configuracoes_empresa_classificacao_inatividade_horas_check;
alter table public.configuracoes_empresa
  add constraint configuracoes_empresa_classificacao_inatividade_horas_check
  check (classificacao_inatividade_horas between 1 and 168);

alter table public.contatos drop constraint if exists contatos_classificacao_check;
alter table public.contatos
  add constraint contatos_classificacao_check
  check (classificacao is null or classificacao in ('novo','qualificado','convertido','perdido'));
alter table public.contatos alter column classificacao set default 'novo';
alter table public.contatos alter column status_lead set default 'novo';

create table if not exists public.lead_classificacao_historico (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  contato_id uuid not null,
  conversa_id uuid,
  mensagem_id uuid,
  classificacao_anterior text,
  classificacao_nova text not null check (classificacao_nova in ('novo','qualificado','convertido','perdido')),
  origem text not null default 'sistema',
  motivo text,
  valor_conversao numeric(14,2),
  criado_em timestamptz not null default now()
);
create index if not exists lead_classificacao_historico_contato_idx
  on public.lead_classificacao_historico(empresa_id,contato_id,criado_em desc);
create unique index if not exists lead_classificacao_historico_inicio_idx
  on public.lead_classificacao_historico(contato_id) where origem='inicio';

create table if not exists public.lead_classificacao_pendencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  conversa_id uuid not null,
  mensagem_id uuid not null unique,
  status text not null default 'pendente'
    check(status in ('pendente','processando','concluido','erro')),
  tentativas integer not null default 0,
  bloqueado_em timestamptz,
  processado_em timestamptz,
  erro text,
  criado_em timestamptz not null default now()
);
create index if not exists lead_classificacao_pendencias_fila_idx
  on public.lead_classificacao_pendencias(criado_em)
  where status in ('pendente','processando');
create index if not exists lead_classificacao_pendencias_empresa_idx
  on public.lead_classificacao_pendencias(empresa_id,conversa_id);

alter table public.lead_classificacao_historico enable row level security;
alter table public.lead_classificacao_pendencias enable row level security;
revoke all on public.lead_classificacao_historico from public, anon, authenticated;
revoke all on public.lead_classificacao_pendencias from public, anon, authenticated;
grant select,insert,update,delete on public.lead_classificacao_historico to service_role;
grant select,insert,update,delete on public.lead_classificacao_pendencias to service_role;

create or replace function public.crmar_lead_registrar_mudanca_classificacao()
returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
declare v_origem text; v_motivo text; v_conversa uuid; v_mensagem uuid; v_valor numeric;
begin
  if tg_op='INSERT' then
    if new.classificacao in ('novo','qualificado','convertido','perdido') then
      insert into public.lead_classificacao_historico
      (empresa_id,contato_id,classificacao_anterior,classificacao_nova,origem,motivo)
      values(new.empresa_id,new.id,null,new.classificacao,'inicio','Cadastro do contato')
      on conflict do nothing;
    end if;
    return new;
  end if;
  if new.classificacao is distinct from old.classificacao
    and new.classificacao in ('novo','qualificado','convertido','perdido') then
    v_origem:=coalesce(nullif(current_setting('crm.classificacao_origem',true),''),'sistema');
    v_motivo:=nullif(current_setting('crm.classificacao_motivo',true),'');
    v_conversa:=nullif(current_setting('crm.classificacao_conversa_id',true),'')::uuid;
    v_mensagem:=nullif(current_setting('crm.classificacao_mensagem_id',true),'')::uuid;
    v_valor:=nullif(current_setting('crm.classificacao_valor',true),'')::numeric;
    insert into public.lead_classificacao_historico
      (empresa_id,contato_id,conversa_id,mensagem_id,classificacao_anterior,
      classificacao_nova,origem,motivo,valor_conversao)
    values (new.empresa_id,new.id,v_conversa,v_mensagem,old.classificacao,
      new.classificacao,v_origem,v_motivo,v_valor);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_lead_classificacao_inicial on public.contatos;
create trigger trg_lead_classificacao_inicial
after insert on public.contatos for each row
execute function public.crmar_lead_registrar_mudanca_classificacao();
drop trigger if exists trg_lead_classificacao_alterada on public.contatos;
create trigger trg_lead_classificacao_alterada
after update of classificacao on public.contatos for each row
when (old.classificacao is distinct from new.classificacao)
execute function public.crmar_lead_registrar_mudanca_classificacao();

-- O gatilho captura mensagens recebidas de agentes, fluxos, humanos e WhatsApp Business App.
-- Apenas enfileira: chamadas OpenAI nunca ocorrem dentro de transacoes de mensagens.
create or replace function public.crmar_lead_enfileirar_mensagem()
returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
declare v_ativo boolean;
begin
  if new.remetente_tipo <> 'contato' or new.conversa_id is null then return new; end if;
  if new.created_at < now() - interval '1 day'
    or coalesce(new.metadata_json->>'historico_importado','false')='true'
    or new.origem in ('historico_coexistence','coexistence_history') then return new; end if;
  select coalesce(classificacao_automatica_ativa,true) into v_ativo
    from public.configuracoes_empresa where empresa_id=new.empresa_id;
  if v_ativo is false then return new; end if;
  insert into public.lead_classificacao_pendencias(empresa_id,conversa_id,mensagem_id)
    values(new.empresa_id,new.conversa_id,new.id)
    on conflict (mensagem_id) do nothing;
  return new;
end;
$$;
drop trigger if exists trg_lead_enfileirar_mensagem on public.mensagens;
create trigger trg_lead_enfileirar_mensagem
after insert on public.mensagens for each row
execute function public.crmar_lead_enfileirar_mensagem();

create or replace function public.crmar_lead_reivindicar_pendencias(p_limite integer default 30)
returns setof public.lead_classificacao_pendencias
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  return query
    with candidatos as (
      select id from public.lead_classificacao_pendencias
      where status='pendente'
         or (status='processando' and bloqueado_em<now()-interval '10 minutes')
      order by criado_em asc
      limit least(greatest(p_limite,1),100)
      for update skip locked
    )
    update public.lead_classificacao_pendencias p
      set status='processando',bloqueado_em=now(),tentativas=tentativas+1
      from candidatos c where p.id=c.id
      returning p.*;
end;
$$;

create or replace function public.crmar_lead_classificar(
  p_empresa_id uuid, p_contato_id uuid, p_classificacao text,
  p_origem text default 'sistema', p_motivo text default null,
  p_conversa_id uuid default null, p_mensagem_id uuid default null,
  p_valor_conversao numeric default null
) returns boolean language plpgsql security definer
set search_path=public,pg_temp as $$
declare v_atual text;
begin
  if p_classificacao not in ('novo','qualificado','convertido','perdido') then
    raise exception 'Classificacao comercial invalida';
  end if;
  select classificacao into v_atual
    from public.contatos where id=p_contato_id and empresa_id=p_empresa_id for update;
  if not found then return false; end if;
  if v_atual is not distinct from p_classificacao then return false; end if;
  perform set_config('crm.classificacao_origem',left(coalesce(p_origem,'sistema'),40),true);
  perform set_config('crm.classificacao_motivo',left(coalesce(p_motivo,''),220),true);
  perform set_config('crm.classificacao_conversa_id',coalesce(p_conversa_id::text,''),true);
  perform set_config('crm.classificacao_mensagem_id',coalesce(p_mensagem_id::text,''),true);
  perform set_config('crm.classificacao_valor',
    case when p_valor_conversao is not null and p_valor_conversao between 0 and 999999999
      then p_valor_conversao::text else '' end,true);
  update public.contatos set
    classificacao=p_classificacao,
    classificacao_atualizada_em=now(),
    status_lead=case p_classificacao when 'convertido' then 'cliente' else p_classificacao end,
    updated_at=now()
  where id=p_contato_id and empresa_id=p_empresa_id;
  return true;
end;
$$;

-- Atualiza apenas contatos cujo ULTIMO registro foi uma saida sem resposta.
-- Executa-se separadamente da fila para nao disputar com mensagens recebidas.
create or replace function public.crmar_lead_classificar_inativos(p_limite integer default 100)
returns table(empresa_id uuid,contato_id uuid,conversa_id uuid)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform set_config('crm.classificacao_origem','inatividade',true);
  perform set_config('crm.classificacao_motivo','Sem resposta apos o prazo configurado',true);
  perform set_config('crm.classificacao_conversa_id','',true);
  perform set_config('crm.classificacao_mensagem_id','',true);
  perform set_config('crm.classificacao_valor','',true);
  return query
    with candidatos as (
      select ct.id as contato_id, ct.empresa_id, c.id as conversa_id
      from public.conversas c
      join public.contatos ct on ct.id=c.contato_id and ct.empresa_id=c.empresa_id
      left join public.configuracoes_empresa ce on ce.empresa_id=c.empresa_id
      join lateral (
        select m.remetente_tipo,m.created_at
        from public.mensagens m
        where m.conversa_id=c.id and m.empresa_id=c.empresa_id
        order by m.created_at desc,m.id desc limit 1
      ) ultima on true
      where c.status in ('aberta','bot','fila','em_atendimento','aguardando_cliente')
        and c.last_message_at is not null
        and c.last_message_at < now()-make_interval(hours=>coalesce(ce.classificacao_inatividade_horas,23))
        and ultima.remetente_tipo <> 'contato'
        and ultima.created_at < now()-make_interval(hours=>coalesce(ce.classificacao_inatividade_horas,23))
        and coalesce(ce.classificacao_automatica_ativa,true)=true
        and ct.classificacao in ('novo','qualificado')
      order by c.last_message_at asc
      limit least(greatest(p_limite,1),150)
      for update of ct skip locked
    ), atualizados as (
      update public.contatos ct set
        classificacao='perdido',
        classificacao_atualizada_em=now(),
        status_lead='perdido',
        updated_at=now()
      from candidatos v
      where ct.id=v.contato_id and ct.empresa_id=v.empresa_id
        and ct.classificacao in ('novo','qualificado')
      returning ct.id,ct.empresa_id
    )
    select v.empresa_id,v.contato_id,v.conversa_id
    from candidatos v join atualizados a on a.id=v.contato_id and a.empresa_id=v.empresa_id;
end;
$$;

revoke all on function public.crmar_lead_registrar_mudanca_classificacao() from public,anon,authenticated;
revoke all on function public.crmar_lead_enfileirar_mensagem() from public,anon,authenticated;
revoke all on function public.crmar_lead_reivindicar_pendencias(integer) from public,anon,authenticated;
revoke all on function public.crmar_lead_classificar(uuid,uuid,text,text,text,uuid,uuid,numeric) from public,anon,authenticated;
revoke all on function public.crmar_lead_classificar_inativos(integer) from public,anon,authenticated;
grant execute on function public.crmar_lead_reivindicar_pendencias(integer) to service_role;
grant execute on function public.crmar_lead_classificar(uuid,uuid,text,text,text,uuid,uuid,numeric) to service_role;
grant execute on function public.crmar_lead_classificar_inativos(integer) to service_role;
