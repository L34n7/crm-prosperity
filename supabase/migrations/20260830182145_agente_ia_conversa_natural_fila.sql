-- Torna a busca de conhecimento tolerante a consultas naturais longas,
-- fortalece a fila concorrente do agente e remove o resumo textual legado.

create or replace function public.agente_ia_buscar_conhecimento(
  p_empresa_id uuid,
  p_agente_id uuid,
  p_consulta text,
  p_limite integer default 5
)
returns table(id uuid, titulo text, categoria text, trecho text, rank real)
language sql
stable
set search_path = public
as $$
  with termos as (
    select array(
      select termo
      from (
        select distinct termo
        from unnest(
          tsvector_to_array(
            to_tsvector('portuguese'::regconfig, coalesce(p_consulta, ''))
          )
        ) as termo
        where length(termo) >= 2
        limit 16
      ) relevantes
    ) as itens
  ), consulta as (
    select case
      when coalesce(cardinality(itens), 0) = 0 then null::tsquery
      else to_tsquery(
        'portuguese'::regconfig,
        (select string_agg(quote_literal(item), ' | ') from unnest(itens) as item)
      )
    end as q
    from termos
  )
  select
    c.id,
    c.titulo,
    c.categoria,
    left(c.conteudo, 1600) as trecho,
    case when consulta.q is null then 0::real else ts_rank_cd(c.search_vector, consulta.q) end as rank
  from public.agente_ia_conhecimentos c
  cross join consulta
  where c.empresa_id = p_empresa_id
    and c.agente_id = p_agente_id
    and c.ativo = true
    and (consulta.q is null or c.search_vector @@ consulta.q)
  order by c.prioridade desc, rank desc, c.updated_at desc
  limit least(greatest(coalesce(p_limite, 5), 1), 5);
$$;

create or replace function public.agente_ia_reservar_pendencia(
  p_pendencia_id uuid,
  p_lock_token uuid,
  p_forcar boolean default false
)
returns public.agente_ia_pendencias
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pendencia public.agente_ia_pendencias;
begin
  update public.agente_ia_pendencias
  set
    status = 'processando',
    lock_token = p_lock_token,
    locked_at = now(),
    tentativas = tentativas + 1,
    updated_at = now()
  where id = p_pendencia_id
    and (
      (status = 'pendente' and (p_forcar or processar_em <= now()))
      or (status = 'processando' and (locked_at is null or locked_at < now() - interval '2 minutes'))
    )
  returning * into v_pendencia;

  return v_pendencia;
end;
$$;

create or replace function public.agente_ia_finalizar_pendencia(
  p_pendencia_id uuid,
  p_lock_token uuid,
  p_versao bigint,
  p_status text default 'processado',
  p_erro text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual public.agente_ia_pendencias;
  v_reagendar boolean := false;
begin
  select * into v_atual
  from public.agente_ia_pendencias
  where id = p_pendencia_id
  for update;

  if v_atual.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
  end if;

  if v_atual.lock_token is distinct from p_lock_token then
    return jsonb_build_object(
      'ok', false,
      'motivo', 'lock_divergente',
      'status', v_atual.status,
      'versao', v_atual.versao
    );
  end if;

  if v_atual.versao > p_versao then
    v_reagendar := true;
    update public.agente_ia_pendencias
    set
      status = 'pendente',
      lock_token = null,
      locked_at = null,
      erro = null,
      processar_em = greatest(processar_em, now() + interval '250 milliseconds'),
      updated_at = now()
    where id = p_pendencia_id;
  else
    update public.agente_ia_pendencias
    set
      status = case when p_status in ('processado', 'erro', 'cancelado') then p_status else 'processado' end,
      conteudo_agregado = case when p_status in ('processado', 'erro', 'cancelado') then '' else conteudo_agregado end,
      mensagem_ids = case when p_status in ('processado', 'erro', 'cancelado') then '{}'::uuid[] else mensagem_ids end,
      lock_token = null,
      locked_at = null,
      erro = p_erro,
      updated_at = now()
    where id = p_pendencia_id;
  end if;

  select * into v_atual
  from public.agente_ia_pendencias
  where id = p_pendencia_id;

  return jsonb_build_object(
    'ok', true,
    'reagendar', v_reagendar,
    'status', v_atual.status,
    'versao', v_atual.versao,
    'processar_em', v_atual.processar_em
  );
end;
$$;

-- Estas RPCs de fila são exclusivamente server-side.
revoke execute on function public.agente_ia_reservar_pendencia(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.agente_ia_reservar_pendencia(uuid, uuid, boolean) to service_role;

revoke execute on function public.agente_ia_finalizar_pendencia(uuid, uuid, bigint, text, text) from public, anon, authenticated;
grant execute on function public.agente_ia_finalizar_pendencia(uuid, uuid, bigint, text, text) to service_role;

-- Remove o resumo textual repetitivo antigo. O estado estruturado será preservado.
update public.agente_ia_conversa_estados
set resumo = '',
    updated_at = now()
where resumo is not null;
