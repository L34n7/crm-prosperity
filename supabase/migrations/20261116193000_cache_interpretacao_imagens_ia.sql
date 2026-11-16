-- Cache de visão por empresa e conteúdo: evita cobranças duplicadas sob concorrência.
-- A análise é factual e não incorpora legenda; sha256 permite reutilizar conteúdo reenviado.
create table if not exists public.agente_ia_interpretacoes_imagem_cache (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  chave text not null,
  mensagem_origem_id uuid not null,
  status text not null default 'processando' check (status in ('processando','concluido','falha')),
  resumo text,
  modelo text,
  mime_type text,
  lock_token uuid,
  bloqueado_ate timestamptz not null default now(),
  tentativas integer not null default 1,
  erro text,
  analisado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (empresa_id,chave),
  check (length(chave) <= 160),
  check (resumo is null or length(resumo) <= 1200)
);
create index if not exists agente_ia_interpretacoes_imagem_cache_estado_idx
  on public.agente_ia_interpretacoes_imagem_cache (status,bloqueado_ate)
  where status <> 'concluido';
alter table public.agente_ia_interpretacoes_imagem_cache enable row level security;
revoke all on table public.agente_ia_interpretacoes_imagem_cache from public,anon,authenticated;
grant select,insert,update,delete on public.agente_ia_interpretacoes_imagem_cache to service_role;

-- Reaproveita as interpretações existentes. Escolhe a mais recente por hash, dentro da empresa.
insert into public.agente_ia_interpretacoes_imagem_cache
(empresa_id,chave,mensagem_origem_id,status,resumo,modelo,mime_type,lock_token,bloqueado_ate,tentativas,analisado_em)
select distinct on (m.empresa_id,chave_calculada.chave)
  m.empresa_id,chave_calculada.chave,m.id,'concluido',
  left(m.metadata_json#>>'{agente_ia_interpretacao_imagem,resumo}',1200),
  m.metadata_json#>>'{agente_ia_interpretacao_imagem,modelo}',
  m.metadata_json#>>'{agente_ia_interpretacao_imagem,mime_type}',
  null,now(),1,
  coalesce((case when (m.metadata_json#>>'{agente_ia_interpretacao_imagem,analisado_em}')
    ~ '^\d{4}-\d{2}-\d{2}T' then (m.metadata_json#>>'{agente_ia_interpretacao_imagem,analisado_em}')::timestamptz
    else null end),m.created_at)
from public.mensagens m
cross join lateral (
 select case when (m.metadata_json->>'sha256') ~ '^[A-Za-z0-9+/]{43}=$'
 then 'v2:sha256:'||(m.metadata_json->>'sha256')
 else 'v2:mensagem:'||m.id::text end as chave
) chave_calculada
where m.tipo_mensagem='imagem'
  and m.metadata_json#>>'{agente_ia_interpretacao_imagem,status}'='concluido'
  and length(coalesce(m.metadata_json#>>'{agente_ia_interpretacao_imagem,resumo}',''))>0
order by m.empresa_id,chave_calculada.chave,m.created_at desc
on conflict (empresa_id,chave) do nothing;

-- Reserva atômica. ON CONFLICT toma o lock exclusivo da linha e reavalia sua condição.
-- Apenas uma execução recebe "reservado". As demais recebem "aguardar" ou "concluido".
create or replace function public.agente_ia_imagem_cache_reservar(
  p_empresa uuid,p_chave text,p_mensagem uuid,p_lock uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_row public.agente_ia_interpretacoes_imagem_cache%rowtype;
begin
  if p_empresa is null or p_mensagem is null or p_lock is null
    or p_chave is null or length(p_chave)>160
    or p_chave !~ '^v2:(sha256:[A-Za-z0-9+/]{43}=|mensagem:[0-9a-f-]{36})$' then
    raise exception 'Parâmetros inválidos para cache de imagem.';
  end if;
  if not exists(select 1 from public.mensagens
    where empresa_id=p_empresa and id=p_mensagem and tipo_mensagem='imagem') then
    raise exception 'Imagem não pertence à empresa indicada.';
  end if;
  insert into public.agente_ia_interpretacoes_imagem_cache
    (empresa_id,chave,mensagem_origem_id,status,lock_token,bloqueado_ate)
  values(p_empresa,p_chave,p_mensagem,'processando',p_lock,now()+interval '3 minutes')
  on conflict (empresa_id,chave) do update set
    status='processando',resumo=null,lock_token=excluded.lock_token,
    bloqueado_ate=excluded.bloqueado_ate,
    atualizado_em=now(),tentativas=public.agente_ia_interpretacoes_imagem_cache.tentativas+1,
    mensagem_origem_id=excluded.mensagem_origem_id,erro=null
  where public.agente_ia_interpretacoes_imagem_cache.status <> 'concluido'
    and public.agente_ia_interpretacoes_imagem_cache.bloqueado_ate <= now()
  returning * into v_row;
  if found then return jsonb_build_object('status','reservado'); end if;
  select * into v_row from public.agente_ia_interpretacoes_imagem_cache
    where empresa_id=p_empresa and chave=p_chave;
  if v_row.status='concluido' and nullif(v_row.resumo,'') is not null then
    return jsonb_build_object('status','concluido','resumo',v_row.resumo);
  end if;
  return jsonb_build_object('status','aguardar','bloqueado_ate',v_row.bloqueado_ate);
end;
$$;

create or replace function public.agente_ia_imagem_cache_finalizar(
  p_empresa uuid,p_chave text,p_lock uuid,p_resumo text,p_modelo text,p_mime_type text)
returns boolean language plpgsql security invoker set search_path=''
as $$
declare v_id uuid;
begin
  if nullif(btrim(coalesce(p_resumo,'')),'') is null then return false; end if;
  update public.agente_ia_interpretacoes_imagem_cache set
    status='concluido',resumo=left(btrim(p_resumo),1200),
    modelo=left(coalesce(p_modelo,''),120),mime_type=left(coalesce(p_mime_type,''),120),
    lock_token=null,bloqueado_ate=now(),analisado_em=now(),
    atualizado_em=now(),erro=null
  where empresa_id=p_empresa and chave=p_chave
    and status='processando' and lock_token=p_lock
  returning mensagem_origem_id into v_id;
  return found;
end;
$$;

create or replace function public.agente_ia_imagem_cache_falhar(
  p_empresa uuid,p_chave text,p_lock uuid,p_erro text)
returns boolean language plpgsql security invoker set search_path=''
as $$
declare v_id uuid;
begin
  update public.agente_ia_interpretacoes_imagem_cache set
    status='falha',erro=left(coalesce(p_erro,''),250),lock_token=null,
    bloqueado_ate=now()+interval '15 seconds',atualizado_em=now()
  where empresa_id=p_empresa and chave=p_chave and status='processando'
    and lock_token=p_lock
  returning mensagem_origem_id into v_id;
  return found;
end;
$$;

-- Ao usar um resumo em outra mensagem com o mesmo hash, anexa-o ao histórico
-- com atualização atômica em JSONB (não substitui metadados escritos por webhooks).
create or replace function public.agente_ia_imagem_cache_aplicar(
  p_empresa uuid,p_chave text,p_mensagem uuid)
returns text language plpgsql security invoker set search_path=''
as $$
declare v_row public.agente_ia_interpretacoes_imagem_cache%rowtype;
begin
  select * into v_row from public.agente_ia_interpretacoes_imagem_cache
    where empresa_id=p_empresa and chave=p_chave and status='concluido'
      and nullif(resumo,'') is not null;
  if not found then return null; end if;
  update public.mensagens m set metadata_json=jsonb_set(
    coalesce(m.metadata_json,'{}'::jsonb),
    '{agente_ia_interpretacao_imagem}',
    jsonb_build_object('versao',2,'status','concluido',
      'resumo',v_row.resumo,'modelo',v_row.modelo,'mime_type',v_row.mime_type,
      'media_id',coalesce(m.metadata_json->>'media_id',m.metadata_json#>>'{image,id}'),
      'analisado_em',v_row.analisado_em),
    true)
  where m.empresa_id=p_empresa and m.id=p_mensagem and m.tipo_mensagem='imagem'
    and (m.metadata_json#>>'{agente_ia_interpretacao_imagem,resumo}') is distinct from v_row.resumo;
  if not exists(select 1 from public.mensagens m
    where m.empresa_id=p_empresa and m.id=p_mensagem and m.tipo_mensagem='imagem')
  then return null; end if;
  return v_row.resumo;
end;
$$;

revoke all on function public.agente_ia_imagem_cache_reservar(uuid,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.agente_ia_imagem_cache_finalizar(uuid,text,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.agente_ia_imagem_cache_falhar(uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function public.agente_ia_imagem_cache_aplicar(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.agente_ia_imagem_cache_reservar(uuid,text,uuid,uuid) to service_role;
grant execute on function public.agente_ia_imagem_cache_finalizar(uuid,text,uuid,text,text,text) to service_role;
grant execute on function public.agente_ia_imagem_cache_falhar(uuid,text,uuid,text) to service_role;
grant execute on function public.agente_ia_imagem_cache_aplicar(uuid,text,uuid) to service_role;
