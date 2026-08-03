-- Ajusta a proteção de disparos: cooldown somente no contato que falhou,
-- campanha continua com até 3 falhas e pausa apenas na 4ª falha ou banimento.

update public.whatsapp_meta_antispam_bloqueios
set ativo = false,
    updated_at = now(),
    metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
      'desativado_em', now(),
      'motivo', 'bloqueio_global_131048_removido'
    )
where ativo = true;

create or replace function public.obter_resumo_whatsapp_meta_limite(
  p_empresa_id uuid,
  p_integracao_whatsapp_id uuid,
  p_limite integer
)
returns table(
  portfolio_id text,
  usados integer,
  restantes integer,
  antispam_bloqueado boolean,
  antispam_bloqueado_ate timestamptz
)
language plpgsql security definer set search_path = public
as $$
declare v_portfolio_id text; v_usados integer := 0;
begin
  if p_empresa_id is null or p_integracao_whatsapp_id is null then
    raise exception 'Empresa e integracao sao obrigatorias.';
  end if;
  if coalesce(p_limite, 0) <= 0 then
    raise exception 'Limite de mensagens/conversas Meta invalido.';
  end if;
  v_portfolio_id := public.whatsapp_meta_portfolio_key(p_integracao_whatsapp_id);
  if v_portfolio_id is null then
    raise exception 'Portfolio empresarial nao encontrado para a integracao.';
  end if;
  select count(distinct r.telefone_normalizado)::integer into v_usados
  from public.whatsapp_meta_conversas_iniciadas r
  where r.empresa_id = p_empresa_id
    and r.business_portfolio_id = v_portfolio_id
    and r.janela_expira_em > now()
    and r.status in ('reservado', 'processando', 'enviado');
  return query select v_portfolio_id, v_usados,
    greatest(p_limite - v_usados, 0), false, null::timestamptz;
end;
$$;

create or replace function public.reservar_whatsapp_meta_limite(
  p_empresa_id uuid,
  p_integracao_whatsapp_id uuid,
  p_phone_number_id text,
  p_telefones text[],
  p_limite integer,
  p_origem text default 'disparo_template',
  p_template_id uuid default null,
  p_template_nome text default null,
  p_usuario_id uuid default null,
  p_metadata_json jsonb default '{}'::jsonb
)
returns table(ok boolean, limite integer, usados integer, reservados integer,
  restantes integer, telefones_bloqueados text[], reserva_ids uuid[])
language plpgsql security definer set search_path = public
as $$
declare
  v_portfolio_id text; v_telefones text[]; v_novos text[];
  v_usados integer := 0; v_restantes integer := 0;
  v_bloqueados text[] := array[]::text[];
  v_reserva_ids uuid[] := array[]::uuid[];
begin
  if p_empresa_id is null or p_integracao_whatsapp_id is null then
    raise exception 'Empresa e integracao sao obrigatorias.';
  end if;
  if coalesce(p_limite, 0) <= 0 then
    raise exception 'Limite de mensagens/conversas Meta invalido.';
  end if;
  v_portfolio_id := public.whatsapp_meta_portfolio_key(p_integracao_whatsapp_id);
  if v_portfolio_id is null then
    raise exception 'Portfolio empresarial nao encontrado para a integracao.';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_empresa_id::text), hashtext(v_portfolio_id));
  select count(distinct r.telefone_normalizado)::integer into v_usados
  from public.whatsapp_meta_conversas_iniciadas r
  where r.empresa_id = p_empresa_id
    and r.business_portfolio_id = v_portfolio_id
    and r.janela_expira_em > now()
    and r.status in ('reservado', 'processando', 'enviado');
  v_restantes := greatest(p_limite - v_usados, 0);
  select coalesce(array_agg(distinct telefone), array[]::text[]) into v_telefones
  from (
    select regexp_replace(coalesce(item, ''), '[^0-9]', '', 'g') telefone
    from unnest(coalesce(p_telefones, array[]::text[])) t(item)
  ) n where char_length(telefone) >= 10;
  if coalesce(array_length(v_telefones, 1), 0) = 0 then
    return query select true, p_limite, v_usados, 0, v_restantes,
      array[]::text[], array[]::uuid[];
    return;
  end if;
  select coalesce(array_agg(telefone), array[]::text[]) into v_novos
  from unnest(v_telefones) t(telefone)
  where not exists (
    select 1 from public.whatsapp_meta_conversas_iniciadas r
    where r.empresa_id = p_empresa_id
      and r.business_portfolio_id = v_portfolio_id
      and r.telefone_normalizado = telefone
      and r.janela_expira_em > now()
      and r.status in ('reservado', 'processando', 'enviado')
  );
  if coalesce(array_length(v_novos, 1), 0) > v_restantes then
    select coalesce(array_agg(telefone), array[]::text[]) into v_bloqueados
    from (select telefone, row_number() over () rn from unnest(v_novos) t(telefone)) x
    where rn > v_restantes;
    return query select false, p_limite, v_usados, 0, v_restantes,
      v_bloqueados, array[]::uuid[];
    return;
  end if;
  if coalesce(array_length(v_novos, 1), 0) > 0 then
    with inseridos as (
      insert into public.whatsapp_meta_conversas_iniciadas (
        empresa_id, integracao_whatsapp_id, business_portfolio_id,
        phone_number_id, telefone_normalizado, template_id, template_nome,
        usuario_id, origem, status, metadata_json
      )
      select p_empresa_id, p_integracao_whatsapp_id, v_portfolio_id,
        nullif(p_phone_number_id, ''), telefone, p_template_id, p_template_nome,
        p_usuario_id, coalesce(nullif(p_origem, ''), 'disparo_template'),
        'reservado', coalesce(p_metadata_json, '{}'::jsonb) || jsonb_build_object(
          'business_portfolio_id', v_portfolio_id,
          'limite_escopo', 'portfolio_empresarial', 'janela_tipo', 'movel_24h')
      from unnest(v_novos) t(telefone) returning id
    )
    select coalesce(array_agg(id), array[]::uuid[]) into v_reserva_ids from inseridos;
  end if;
  return query select true, p_limite, v_usados,
    coalesce(array_length(v_novos, 1), 0),
    greatest(p_limite - v_usados - coalesce(array_length(v_novos, 1), 0), 0),
    array[]::text[], coalesce(v_reserva_ids, array[]::uuid[]);
end;
$$;

create or replace function public.sincronizar_whatsapp_meta_reserva_por_item()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_telefone text; v_portfolio_id text; v_reserva_id uuid;
  v_status_meta text; v_meta_timestamp timestamptz;
  v_erro_codigo integer; v_categoria text; v_nova_falha boolean := false;
begin
  v_telefone := regexp_replace(coalesce(new.telefone_normalizado, new.numero, ''), '[^0-9]', '', 'g');
  if char_length(v_telefone) < 10 then return new; end if;
  v_portfolio_id := public.whatsapp_meta_portfolio_key(new.integracao_whatsapp_id);
  if v_portfolio_id is null then return new; end if;
  v_status_meta := lower(btrim(coalesce(new.metadata_json ->> 'ultimo_status_meta', '')));
  v_meta_timestamp := public.whatsapp_meta_timestamp_item(
    coalesce(new.metadata_json, '{}'::jsonb), coalesce(new.processed_at, new.updated_at, now()));
  v_erro_codigo := new.erro_codigo_meta;
  select lower(coalesce(t.categoria, 'marketing')) into v_categoria
  from public.whatsapp_templates t where t.id = new.template_id;
  v_categoria := case when v_categoria = 'utility' then 'utility' else 'marketing' end;
  select r.id into v_reserva_id
  from public.whatsapp_meta_conversas_iniciadas r
  where r.empresa_id = new.empresa_id
    and r.business_portfolio_id = v_portfolio_id
    and r.telefone_normalizado = v_telefone
    and r.status in ('reservado', 'processando', 'enviado')
  order by r.created_at desc limit 1 for update;
  if new.status in ('falha', 'cancelado') then
    if v_reserva_id is not null then
      update public.whatsapp_meta_conversas_iniciadas r
      set status = case when new.status = 'cancelado' then 'cancelado' else 'falha' end,
          status_meta = nullif(v_status_meta, ''), meta_timestamp = v_meta_timestamp,
          erro_codigo_meta = v_erro_codigo, liberado_em = now(), updated_at = now(),
          metadata_json = coalesce(r.metadata_json, '{}'::jsonb) || jsonb_build_object(
            'item_disparo_id', new.id, 'campanha_disparo_id', new.campanha_id,
            'status_item', new.status, 'erro_codigo_meta', v_erro_codigo,
            'reserva_liberada_em', now())
      where r.id = v_reserva_id;
    end if;
    v_nova_falha := new.status = 'falha' and v_erro_codigo is not null and (
      tg_op = 'INSERT' or old.status is distinct from 'falha'
      or old.erro_codigo_meta is distinct from v_erro_codigo);
    if v_nova_falha then
      insert into public.whatsapp_disparo_cooldowns (
        empresa_id, contato_id, telefone_normalizado, integracao_whatsapp_id,
        categoria, motivo, ativo, bloqueado_em, expira_em, ocorrencias_janela,
        janela_inicio_em, ultima_ocorrencia_em, campanha_id, item_id,
        mensagem_externa_id, erro_codigo_meta, metadata_json, updated_at
      ) values (
        new.empresa_id, new.contato_id, v_telefone, new.integracao_whatsapp_id,
        v_categoria, 'meta_' || v_erro_codigo::text, true,
        v_meta_timestamp, v_meta_timestamp + interval '24 hours', 1,
        v_meta_timestamp, v_meta_timestamp, new.campanha_id, new.id,
        new.message_id, v_erro_codigo, jsonb_build_object(
          'origem', 'falha_disparo_meta', 'cooldown_escopo', 'contato',
          'cooldown_horas', 24, 'erro', new.erro), now()
      )
      on conflict (empresa_id, telefone_normalizado, categoria, motivo) where ativo = true
      do update set
        contato_id = excluded.contato_id,
        integracao_whatsapp_id = excluded.integracao_whatsapp_id,
        expira_em = greatest(public.whatsapp_disparo_cooldowns.expira_em, excluded.expira_em),
        ocorrencias_janela = public.whatsapp_disparo_cooldowns.ocorrencias_janela + 1,
        ultima_ocorrencia_em = excluded.ultima_ocorrencia_em,
        campanha_id = excluded.campanha_id, item_id = excluded.item_id,
        mensagem_externa_id = excluded.mensagem_externa_id,
        erro_codigo_meta = excluded.erro_codigo_meta,
        metadata_json = coalesce(public.whatsapp_disparo_cooldowns.metadata_json, '{}'::jsonb)
          || excluded.metadata_json, updated_at = now();
    end if;
    return new;
  end if;
  if new.status = 'enviado' and v_reserva_id is not null then
    update public.whatsapp_meta_conversas_iniciadas r
    set status = 'enviado',
        status_meta = coalesce(nullif(v_status_meta, ''), r.status_meta, 'accepted'),
        meta_timestamp = case
          when v_status_meta in ('entregue','delivered','lida','read','enviada','sent')
            then v_meta_timestamp else coalesce(r.meta_timestamp, v_meta_timestamp) end,
        enviado_em = coalesce(r.enviado_em, v_meta_timestamp),
        janela_expira_em = case
          when v_status_meta in ('entregue','delivered','lida','read','enviada','sent')
            then v_meta_timestamp + interval '24 hours'
          when nullif(v_status_meta, '') is null
            then greatest(r.janela_expira_em, coalesce(new.processed_at, now()) + interval '24 hours')
          else r.janela_expira_em end,
        erro_codigo_meta = null, liberado_em = null, updated_at = now()
    where r.id = v_reserva_id;
  end if;
  return new;
end;
$$;

create or replace function public.impedir_pausa_prematura_campanha()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_falhas integer;
begin
  if new.status like 'pausada_%'
     and new.status <> 'pausada_por_conta_bloqueada'
     and old.status in ('pendente','enviando') then
    select count(*)::integer into v_falhas
    from public.whatsapp_disparo_itens i
    where i.campanha_id = old.id and i.status = 'falha';
    if v_falhas <= 3 then
      raise exception 'Campanha deve continuar: apenas % falha(s).', v_falhas;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_impedir_pausa_prematura_campanha on public.whatsapp_disparo_campanhas;
create trigger trg_impedir_pausa_prematura_campanha
before update of status on public.whatsapp_disparo_campanhas
for each row execute function public.impedir_pausa_prematura_campanha();

create or replace function public.pausar_campanha_apos_quarta_falha()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_falhas integer;
begin
  if new.status = 'falha' and (tg_op = 'INSERT' or old.status is distinct from 'falha') then
    select count(*)::integer into v_falhas
    from public.whatsapp_disparo_itens i
    where i.campanha_id = new.campanha_id and i.status = 'falha';
    if v_falhas > 3 then
      update public.whatsapp_disparo_campanhas c
      set status = 'pausada_por_falhas',
          pausa_motivo = 'Campanha pausada automaticamente após mais de 3 falhas.',
          erro = 'Foram registradas ' || v_falhas || ' falhas na campanha.',
          paused_at = coalesce(c.paused_at, now()), updated_at = now(),
          metadata_json = coalesce(c.metadata_json, '{}'::jsonb) || jsonb_build_object(
            'pausa_automatica', true, 'total_falhas_no_momento_pausa', v_falhas,
            'regra_pausa', 'mais_de_3_falhas')
      where c.id = new.campanha_id and c.status in ('pendente','enviando');
      update public.whatsapp_disparo_itens i
      set status = 'cancelado', erro = 'Cancelado porque a campanha ultrapassou 3 falhas.',
          locked_at = null, processed_at = now(), updated_at = now(),
          metadata_json = coalesce(i.metadata_json, '{}'::jsonb) || jsonb_build_object(
            'motivo_cancelamento', 'campanha_mais_de_3_falhas')
      where i.campanha_id = new.campanha_id and i.id <> new.id
        and i.status in ('pendente','processando');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pausar_campanha_apos_quarta_falha on public.whatsapp_disparo_itens;
create trigger trg_pausar_campanha_apos_quarta_falha
after insert or update of status on public.whatsapp_disparo_itens
for each row execute function public.pausar_campanha_apos_quarta_falha();

create or replace function public.cancelar_itens_em_cooldown_disparo(p_item_id uuid default null)
returns integer language plpgsql security definer set search_path = public
as $$
declare v_total integer := 0;
begin
  update public.whatsapp_disparo_cooldowns set ativo = false, updated_at = now()
  where ativo = true and expira_em <= now();
  with cancelados as (
    update public.whatsapp_disparo_itens i
    set status = 'cancelado',
        erro = 'Envio cancelado: contato em cooldown devido a falha anterior.',
        locked_at = null, processed_at = now(), updated_at = now(),
        metadata_json = coalesce(i.metadata_json, '{}'::jsonb) || jsonb_build_object(
          'motivo_cancelamento', 'contato_em_cooldown', 'cooldown_verificado_em', now())
    from public.whatsapp_templates t
    where i.template_id = t.id and i.status = 'pendente'
      and (p_item_id is null or i.id = p_item_id)
      and exists (
        select 1 from public.whatsapp_disparo_cooldowns cd
        where cd.empresa_id = i.empresa_id
          and cd.telefone_normalizado = coalesce(nullif(i.telefone_normalizado, ''),
            regexp_replace(i.numero, '[^0-9]', '', 'g'))
          and cd.categoria = case when lower(coalesce(t.categoria, 'marketing')) = 'utility'
            then 'utility' else 'marketing' end
          and cd.ativo = true and cd.expira_em > now()
      ) returning i.id
  ) select count(*)::integer into v_total from cancelados;
  return v_total;
end;
$$;

create or replace function public.reivindicar_whatsapp_disparo_item(p_item_id uuid)
returns setof public.whatsapp_disparo_itens
language plpgsql security definer set search_path = public
as $$
begin
  perform public.cancelar_itens_em_cooldown_disparo(p_item_id);
  return query
    with candidato as (
      select i.id from public.whatsapp_disparo_itens i
      join public.whatsapp_disparo_campanhas c on c.id = i.campanha_id
      where i.id = p_item_id and i.status = 'pendente'
        and coalesce(i.next_attempt_at, i.created_at) <= now()
        and i.tentativas < i.max_tentativas
        and c.status in ('pendente','enviando')
      limit 1 for update of i skip locked
    ), atualizado as (
      update public.whatsapp_disparo_itens i
      set status = 'processando', tentativas = i.tentativas + 1,
          locked_at = now(), updated_at = now()
      from candidato c where i.id = c.id returning i.*
    ), campanha_atualizada as (
      update public.whatsapp_disparo_campanhas c
      set status = 'enviando', started_at = coalesce(c.started_at, now()), updated_at = now()
      from (select distinct campanha_id from atualizado) a
      where c.id = a.campanha_id and c.status = 'pendente' returning c.id
    )
    select a.* from atualizado a left join campanha_atualizada c on c.id = a.campanha_id;
end;
$$;

create or replace function public.reivindicar_whatsapp_disparo_itens(
  p_limite integer default 10,
  p_lock_timeout_minutos integer default 5,
  p_apenas_sem_qstash boolean default false
)
returns setof public.whatsapp_disparo_itens
language plpgsql security definer set search_path = public
as $$
declare
  v_limite integer := least(greatest(coalesce(p_limite,10),1),100);
  v_timeout integer := least(greatest(coalesce(p_lock_timeout_minutos,5),1),60);
  v_lock_expirado timestamptz := now() - make_interval(mins => v_timeout);
begin
  perform public.cancelar_itens_em_cooldown_disparo(null);
  update public.whatsapp_disparo_itens i
  set status = 'pendente', locked_at = null, next_attempt_at = now() + interval '30 seconds',
      erro = coalesce(i.erro, 'Lock de processamento expirado. Item liberado para nova tentativa.'),
      updated_at = now()
  from public.whatsapp_disparo_campanhas c
  where i.campanha_id = c.id and i.status = 'processando'
    and i.locked_at < v_lock_expirado and c.status in ('pendente','enviando')
    and i.tentativas < i.max_tentativas;
  return query
    with candidatos as (
      select i.id from public.whatsapp_disparo_itens i
      join public.whatsapp_disparo_campanhas c on c.id = i.campanha_id
      where i.status = 'pendente'
        and coalesce(i.next_attempt_at, i.created_at) <= now()
        and i.tentativas < i.max_tentativas
        and c.status in ('pendente','enviando')
        and (not p_apenas_sem_qstash or i.qstash_message_id is null)
      order by i.next_attempt_at asc, i.created_at asc
      limit v_limite for update of i skip locked
    ), atualizados as (
      update public.whatsapp_disparo_itens i
      set status = 'processando', tentativas = i.tentativas + 1,
          locked_at = now(), updated_at = now()
      from candidatos c where i.id = c.id returning i.*
    ), campanhas_atualizadas as (
      update public.whatsapp_disparo_campanhas c
      set status = 'enviando', started_at = coalesce(c.started_at, now()), updated_at = now()
      from (select distinct campanha_id from atualizados) a
      where c.id = a.campanha_id and c.status = 'pendente' returning c.id
    )
    select a.* from atualizados a
    left join campanhas_atualizadas c on c.id = a.campanha_id;
end;
$$;

grant execute on function public.cancelar_itens_em_cooldown_disparo(uuid) to service_role;
grant execute on function public.reivindicar_whatsapp_disparo_item(uuid) to authenticated, service_role;
grant execute on function public.reivindicar_whatsapp_disparo_itens(integer, integer, boolean) to authenticated, service_role;
