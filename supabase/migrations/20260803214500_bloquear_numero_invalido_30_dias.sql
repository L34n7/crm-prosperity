-- Bloqueia por 30 dias os destinatarios recusados pela Meta com erro 131026
-- (numero invalido, incorreto ou sem WhatsApp). O bloqueio e individual:
-- o item e cancelado antes do envio e a campanha continua normalmente.

-- Ajusta os cooldowns 131026 ja existentes para 30 dias a partir da ultima
-- ocorrencia conhecida.
update public.whatsapp_disparo_cooldowns
set
  expira_em = greatest(
    expira_em,
    coalesce(ultima_ocorrencia_em, bloqueado_em, created_at, now())
      + interval '30 days'
  ),
  ativo = true,
  metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
    'cooldown_horas', 720,
    'cooldown_dias', 30,
    'politica', 'numero_invalido_131026_30_dias',
    'ajustado_em', now()
  ),
  updated_at = now()
where erro_codigo_meta = 131026
   or motivo = 'meta_131026';

-- O trigger geral de sincronizacao cria o cooldown individual. Este trigger,
-- executado depois dele, amplia especificamente o 131026 para 30 dias.
create or replace function public.estender_cooldown_numero_invalido_131026()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_telefone text;
  v_referencia timestamptz;
begin
  if new.status <> 'falha' or new.erro_codigo_meta is distinct from 131026 then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'falha'
     and old.erro_codigo_meta = 131026 then
    return new;
  end if;

  v_telefone := regexp_replace(
    coalesce(new.telefone_normalizado, new.numero, ''),
    '[^0-9]',
    '',
    'g'
  );

  if char_length(v_telefone) < 10 then
    return new;
  end if;

  v_referencia := coalesce(new.processed_at, new.updated_at, now());

  update public.whatsapp_disparo_cooldowns c
  set
    expira_em = greatest(c.expira_em, v_referencia + interval '30 days'),
    ativo = true,
    contato_id = coalesce(new.contato_id, c.contato_id),
    integracao_whatsapp_id = new.integracao_whatsapp_id,
    campanha_id = new.campanha_id,
    item_id = new.id,
    mensagem_externa_id = coalesce(new.message_id, c.mensagem_externa_id),
    erro_codigo_meta = 131026,
    ultima_ocorrencia_em = v_referencia,
    metadata_json = coalesce(c.metadata_json, '{}'::jsonb) || jsonb_build_object(
      'cooldown_horas', 720,
      'cooldown_dias', 30,
      'politica', 'numero_invalido_131026_30_dias',
      'erro', new.erro,
      'ultima_campanha_id', new.campanha_id,
      'ultimo_item_id', new.id
    ),
    updated_at = now()
  where c.empresa_id = new.empresa_id
    and c.telefone_normalizado = v_telefone
    and c.motivo = 'meta_131026'
    and c.ativo = true;

  return new;
end;
$$;

drop trigger if exists trg_z_estender_cooldown_numero_invalido_131026
  on public.whatsapp_disparo_itens;

create trigger trg_z_estender_cooldown_numero_invalido_131026
after insert or update of status, erro_codigo_meta
on public.whatsapp_disparo_itens
for each row
execute function public.estender_cooldown_numero_invalido_131026();

-- Cancela itens pendentes que estejam no bloqueio de numero invalido antes de
-- reivindica-los. Assim nenhuma requisicao e enviada para a Meta e o restante
-- da campanha continua.
create or replace function public.cancelar_itens_numero_invalido_em_cooldown(
  p_item_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
begin
  update public.whatsapp_disparo_cooldowns c
  set
    ativo = false,
    updated_at = now(),
    metadata_json = coalesce(c.metadata_json, '{}'::jsonb) || jsonb_build_object(
      'liberado_automaticamente_em', now(),
      'motivo_liberacao', 'fim_cooldown_numero_invalido_30_dias'
    )
  where c.ativo = true
    and c.motivo = 'meta_131026'
    and c.expira_em <= now();

  update public.whatsapp_disparo_itens i
  set
    status = 'cancelado',
    erro = 'Envio bloqueado por 30 dias: a Meta identificou este numero como invalido, incorreto ou sem WhatsApp.',
    locked_at = null,
    processed_at = now(),
    updated_at = now(),
    metadata_json = coalesce(i.metadata_json, '{}'::jsonb) || jsonb_build_object(
      'motivo_cancelamento', 'numero_invalido_131026_cooldown_30_dias',
      'cooldown_escopo', 'contato',
      'cancelado_antes_envio_meta', true,
      'cancelado_em', now()
    )
  where i.status = 'pendente'
    and (p_item_id is null or i.id = p_item_id)
    and exists (
      select 1
      from public.whatsapp_disparo_cooldowns c
      where c.empresa_id = i.empresa_id
        and c.telefone_normalizado = regexp_replace(
          coalesce(i.telefone_normalizado, i.numero, ''),
          '[^0-9]',
          '',
          'g'
        )
        and c.motivo = 'meta_131026'
        and c.ativo = true
        and c.expira_em > now()
    );

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

create or replace function public.reivindicar_whatsapp_disparo_item(
  p_item_id uuid
)
returns setof public.whatsapp_disparo_itens
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.cancelar_itens_numero_invalido_em_cooldown(p_item_id);

  return query
    with candidato as (
      select i.id
      from public.whatsapp_disparo_itens i
      join public.whatsapp_disparo_campanhas c on c.id = i.campanha_id
      where i.id = p_item_id
        and i.status = 'pendente'
        and coalesce(i.next_attempt_at, i.created_at) <= now()
        and i.tentativas < i.max_tentativas
        and c.status in ('pendente', 'enviando')
      limit 1
      for update of i skip locked
    ),
    atualizado as (
      update public.whatsapp_disparo_itens i
      set
        status = 'processando',
        tentativas = i.tentativas + 1,
        locked_at = now(),
        updated_at = now()
      from candidato c
      where i.id = c.id
      returning i.*
    ),
    campanha_atualizada as (
      update public.whatsapp_disparo_campanhas c
      set
        status = 'enviando',
        started_at = coalesce(c.started_at, now()),
        updated_at = now()
      from (select distinct campanha_id from atualizado) a
      where c.id = a.campanha_id
        and c.status = 'pendente'
      returning c.id
    )
    select a.*
    from atualizado a
    left join campanha_atualizada c on c.id = a.campanha_id;
end;
$$;

create or replace function public.reivindicar_whatsapp_disparo_itens(
  p_limite integer default 10,
  p_lock_timeout_minutos integer default 5,
  p_apenas_sem_qstash boolean default false
)
returns setof public.whatsapp_disparo_itens
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 10), 1), 100);
  v_timeout integer := least(greatest(coalesce(p_lock_timeout_minutos, 5), 1), 60);
  v_lock_expirado timestamptz := now() - make_interval(mins => v_timeout);
begin
  update public.whatsapp_disparo_itens i
  set
    status = 'pendente',
    locked_at = null,
    next_attempt_at = now() + interval '30 seconds',
    erro = coalesce(i.erro, 'Lock de processamento expirado. Item liberado para nova tentativa.'),
    updated_at = now()
  from public.whatsapp_disparo_campanhas c
  where i.campanha_id = c.id
    and i.status = 'processando'
    and i.locked_at < v_lock_expirado
    and c.status in ('pendente', 'enviando')
    and i.tentativas < i.max_tentativas;

  perform public.cancelar_itens_numero_invalido_em_cooldown(null);

  return query
    with candidatos as (
      select i.id
      from public.whatsapp_disparo_itens i
      join public.whatsapp_disparo_campanhas c on c.id = i.campanha_id
      where i.status = 'pendente'
        and coalesce(i.next_attempt_at, i.created_at) <= now()
        and i.tentativas < i.max_tentativas
        and c.status in ('pendente', 'enviando')
        and (
          not p_apenas_sem_qstash
          or i.qstash_message_id is null
        )
      order by i.next_attempt_at asc, i.created_at asc
      limit v_limite
      for update of i skip locked
    ),
    atualizados as (
      update public.whatsapp_disparo_itens i
      set
        status = 'processando',
        tentativas = i.tentativas + 1,
        locked_at = now(),
        updated_at = now()
      from candidatos c
      where i.id = c.id
      returning i.*
    ),
    campanhas_atualizadas as (
      update public.whatsapp_disparo_campanhas c
      set
        status = 'enviando',
        started_at = coalesce(c.started_at, now()),
        updated_at = now()
      from (select distinct campanha_id from atualizados) a
      where c.id = a.campanha_id
        and c.status = 'pendente'
      returning c.id
    )
    select a.*
    from atualizados a
    left join campanhas_atualizadas c on c.id = a.campanha_id;
end;
$$;

-- Aplica imediatamente o bloqueio aos itens ainda pendentes em campanhas
-- ativas, sem interromper as campanhas.
select public.cancelar_itens_numero_invalido_em_cooldown(null);

-- Recalcula campanhas afetadas pelo cancelamento individual preventivo.
do $$
declare
  v_campanha uuid;
begin
  for v_campanha in
    select distinct i.campanha_id
    from public.whatsapp_disparo_itens i
    where i.status = 'cancelado'
      and i.metadata_json ->> 'motivo_cancelamento' =
        'numero_invalido_131026_cooldown_30_dias'
  loop
    perform public.recalcular_whatsapp_disparo_campanha(v_campanha);
  end loop;
end;
$$;
