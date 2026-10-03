-- Eventos persistentes de conclusão de campanhas de disparo.
-- Só campanhas que entrarem em estado terminal após esta migration gerarão
-- evento, evitando abrir modais retroativos de campanhas históricas.

create table if not exists public.whatsapp_disparo_resultado_eventos (
  campanha_id uuid primary key
    references public.whatsapp_disparo_campanhas(id) on delete cascade,
  empresa_id uuid not null,
  integracao_whatsapp_id uuid not null,
  status_final text not null,
  finalizado_em timestamptz not null default now(),
  disponivel_em timestamptz not null default (now() + interval '8 seconds'),
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_disparo_resultado_eventos_empresa_disponivel_idx
  on public.whatsapp_disparo_resultado_eventos
  (empresa_id, disponivel_em desc);

create index if not exists whatsapp_disparo_resultado_eventos_integracao_idx
  on public.whatsapp_disparo_resultado_eventos
  (integracao_whatsapp_id, disponivel_em desc);

create table if not exists public.whatsapp_disparo_resultado_visualizacoes (
  campanha_id uuid not null
    references public.whatsapp_disparo_campanhas(id) on delete cascade,
  usuario_id uuid not null,
  empresa_id uuid not null,
  exibido_em timestamptz not null default now(),
  primary key (campanha_id, usuario_id)
);

create index if not exists whatsapp_disparo_resultado_visualizacoes_usuario_idx
  on public.whatsapp_disparo_resultado_visualizacoes
  (usuario_id, exibido_em desc);

alter table public.whatsapp_disparo_resultado_eventos enable row level security;
alter table public.whatsapp_disparo_resultado_visualizacoes enable row level security;

create or replace function public.registrar_whatsapp_disparo_resultado_evento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status_terminal boolean;
  v_status_anterior_terminal boolean;
begin
  v_status_terminal := new.status = any(array[
    'concluida',
    'pausada_por_falhas',
    'pausada_por_lista_invalida',
    'pausada_por_erro_meta',
    'pausada_por_conta_bloqueada',
    'cancelada',
    'erro'
  ]::text[]);

  if not v_status_terminal then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_status_anterior_terminal := old.status = any(array[
      'concluida',
      'pausada_por_falhas',
      'pausada_por_lista_invalida',
      'pausada_por_erro_meta',
      'pausada_por_conta_bloqueada',
      'cancelada',
      'erro'
    ]::text[]);

    if v_status_anterior_terminal then
      return new;
    end if;
  end if;

  insert into public.whatsapp_disparo_resultado_eventos (
    campanha_id,
    empresa_id,
    integracao_whatsapp_id,
    status_final,
    finalizado_em,
    disponivel_em
  )
  values (
    new.id,
    new.empresa_id,
    new.integracao_whatsapp_id,
    new.status,
    coalesce(new.finished_at, new.paused_at, new.updated_at, now()),
    now() + interval '8 seconds'
  )
  on conflict (campanha_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_whatsapp_disparo_resultado_evento
  on public.whatsapp_disparo_campanhas;

create trigger trg_whatsapp_disparo_resultado_evento
after insert or update of status
on public.whatsapp_disparo_campanhas
for each row
execute function public.registrar_whatsapp_disparo_resultado_evento();

create or replace function public.reivindicar_whatsapp_disparo_resultados(
  p_usuario_id uuid,
  p_empresa_id uuid,
  p_integracao_ids uuid[],
  p_limite integer default 25
)
returns table (campanha_id uuid)
language sql
security definer
set search_path = public
as $$
  with candidatas as (
    select e.campanha_id
    from public.whatsapp_disparo_resultado_eventos e
    where e.empresa_id = p_empresa_id
      and e.disponivel_em <= now()
      and e.integracao_whatsapp_id = any(
        coalesce(p_integracao_ids, '{}'::uuid[])
      )
      and not exists (
        select 1
        from public.whatsapp_disparo_resultado_visualizacoes v
        where v.campanha_id = e.campanha_id
          and v.usuario_id = p_usuario_id
      )
    order by e.finalizado_em asc, e.campanha_id asc
    limit least(greatest(coalesce(p_limite, 25), 1), 50)
  ),
  reivindicadas as (
    insert into public.whatsapp_disparo_resultado_visualizacoes (
      campanha_id,
      usuario_id,
      empresa_id,
      exibido_em
    )
    select
      c.campanha_id,
      p_usuario_id,
      p_empresa_id,
      now()
    from candidatas c
    on conflict (campanha_id, usuario_id) do nothing
    returning campanha_id
  )
  select r.campanha_id
  from reivindicadas r;
$$;

revoke all on function public.reivindicar_whatsapp_disparo_resultados(
  uuid, uuid, uuid[], integer
) from public;

grant execute on function public.reivindicar_whatsapp_disparo_resultados(
  uuid, uuid, uuid[], integer
) to service_role;
