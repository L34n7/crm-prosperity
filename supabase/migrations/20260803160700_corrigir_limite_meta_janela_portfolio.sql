-- Corrige o controle preventivo de disparos para seguir uma janela móvel de
-- 24 horas, compartilhar o consumo no portfólio empresarial e separar a
-- restrição antispam 131048 do tier diário de contatos únicos.

create or replace function public.whatsapp_meta_portfolio_key(
  p_integracao_whatsapp_id uuid
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(btrim(i.business_portfolio_id), ''),
    case
      when nullif(btrim(i.waba_id), '') is not null
        then 'waba:' || btrim(i.waba_id)
      else null
    end,
    case
      when nullif(btrim(i.phone_number_id), '') is not null
        then 'phone:' || btrim(i.phone_number_id)
      else null
    end,
    'integracao:' || i.id::text
  )
  from public.integracoes_whatsapp i
  where i.id = p_integracao_whatsapp_id;
$$;

alter table public.whatsapp_meta_conversas_iniciadas
  add column if not exists business_portfolio_id text,
  add column if not exists status_meta text,
  add column if not exists meta_timestamp timestamptz,
  add column if not exists erro_codigo_meta integer,
  add column if not exists liberado_em timestamptz;

update public.whatsapp_meta_conversas_iniciadas r
set business_portfolio_id = public.whatsapp_meta_portfolio_key(
  r.integracao_whatsapp_id
)
where r.business_portfolio_id is null
   or btrim(r.business_portfolio_id) = '';

alter table public.whatsapp_meta_conversas_iniciadas
  alter column business_portfolio_id set not null;

create or replace function public.preencher_whatsapp_meta_portfolio_reserva()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.business_portfolio_id := public.whatsapp_meta_portfolio_key(
    new.integracao_whatsapp_id
  );

  if new.business_portfolio_id is null then
    raise exception 'Nao foi possivel identificar o portfolio empresarial da integracao %.',
      new.integracao_whatsapp_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_preencher_whatsapp_meta_portfolio_reserva
  on public.whatsapp_meta_conversas_iniciadas;

create trigger trg_preencher_whatsapp_meta_portfolio_reserva
before insert or update of integracao_whatsapp_id
on public.whatsapp_meta_conversas_iniciadas
for each row
execute function public.preencher_whatsapp_meta_portfolio_reserva();

drop index if exists public.idx_whatsapp_meta_conversas_iniciadas_limite;

create index if not exists idx_whatsapp_meta_conversas_iniciadas_portfolio_limite
  on public.whatsapp_meta_conversas_iniciadas (
    empresa_id,
    business_portfolio_id,
    janela_expira_em,
    status,
    telefone_normalizado
  );

create table if not exists public.whatsapp_meta_antispam_bloqueios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  business_portfolio_id text not null,
  integracao_whatsapp_id uuid references public.integracoes_whatsapp(id) on delete set null,
  erro_codigo_meta integer not null default 131048,
  motivo text not null,
  ativo boolean not null default true,
  bloqueado_em timestamptz not null default now(),
  ultima_ocorrencia_em timestamptz not null default now(),
  bloqueado_ate timestamptz not null,
  ocorrencias integer not null default 1,
  campanha_id uuid references public.whatsapp_disparo_campanhas(id) on delete set null,
  item_id uuid references public.whatsapp_disparo_itens(id) on delete set null,
  mensagem_externa_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_meta_antispam_codigo_check
    check (erro_codigo_meta = 131048),
  constraint whatsapp_meta_antispam_ocorrencias_check
    check (ocorrencias > 0),
  constraint whatsapp_meta_antispam_periodo_check
    check (bloqueado_ate > bloqueado_em)
);

alter table public.whatsapp_meta_antispam_bloqueios enable row level security;

create unique index if not exists whatsapp_meta_antispam_bloqueio_ativo_uidx
  on public.whatsapp_meta_antispam_bloqueios (
    empresa_id,
    business_portfolio_id
  )
  where ativo = true;

create index if not exists idx_whatsapp_meta_antispam_expiracao
  on public.whatsapp_meta_antispam_bloqueios (
    empresa_id,
    business_portfolio_id,
    bloqueado_ate
  )
  where ativo = true;

comment on table public.whatsapp_meta_antispam_bloqueios is
  'Restricoes temporarias locais separadas do tier de contatos unicos. O erro Meta 131048 nao consome o saldo de 24h, mas pausa novos disparos por protecao.';

create or replace function public.whatsapp_meta_timestamp_item(
  p_metadata jsonb,
  p_fallback timestamptz
)
returns timestamptz
language plpgsql
stable
as $$
declare
  v_timestamp text;
begin
  v_timestamp := nullif(
    btrim(coalesce(p_metadata #>> '{webhook_status_raw,timestamp}', '')),
    ''
  );

  if v_timestamp ~ '^[0-9]+([.][0-9]+)?$' then
    return to_timestamp(v_timestamp::numeric);
  end if;

  v_timestamp := nullif(
    btrim(coalesce(p_metadata ->> 'status_meta_recebido_em', '')),
    ''
  );

  if v_timestamp is not null then
    begin
      return v_timestamp::timestamptz;
    exception when others then
      null;
    end;
  end if;

  return coalesce(p_fallback, now());
end;
$$;

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
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portfolio_id text;
  v_usados integer := 0;
  v_antispam_ate timestamptz;
begin
  if p_empresa_id is null or p_integracao_whatsapp_id is null then
    raise exception 'Empresa e integracao sao obrigatorias.';
  end if;

  if coalesce(p_limite, 0) <= 0 then
    raise exception 'Limite de mensagens/conversas Meta invalido.';
  end if;

  v_portfolio_id := public.whatsapp_meta_portfolio_key(
    p_integracao_whatsapp_id
  );

  if v_portfolio_id is null then
    raise exception 'Portfolio empresarial nao encontrado para a integracao.';
  end if;

  update public.whatsapp_meta_antispam_bloqueios b
  set
    ativo = false,
    updated_at = now(),
    metadata_json = coalesce(b.metadata_json, '{}'::jsonb) || jsonb_build_object(
      'liberado_automaticamente_em', now(),
      'motivo_liberacao', 'fim_cooldown_protetivo_24h'
    )
  where b.empresa_id = p_empresa_id
    and b.business_portfolio_id = v_portfolio_id
    and b.ativo = true
    and b.bloqueado_ate <= now();

  select count(distinct r.telefone_normalizado)::integer
    into v_usados
  from public.whatsapp_meta_conversas_iniciadas r
  where r.empresa_id = p_empresa_id
    and r.business_portfolio_id = v_portfolio_id
    and r.janela_expira_em > now()
    and r.status in ('reservado', 'processando', 'enviado');

  select max(b.bloqueado_ate)
    into v_antispam_ate
  from public.whatsapp_meta_antispam_bloqueios b
  where b.empresa_id = p_empresa_id
    and b.business_portfolio_id = v_portfolio_id
    and b.ativo = true
    and b.bloqueado_ate > now();

  return query
    select
      v_portfolio_id,
      v_usados,
      greatest(p_limite - v_usados, 0),
      v_antispam_ate is not null,
      v_antispam_ate;
end;
$$;

-- Mantem a assinatura original para nao quebrar as chamadas atuais do CRM.
create or replace function public.reservar_whatsapp_meta_limite(
  p_empresa_id uuid,
  p_integracao_whatsapp_id uuid,
  p_phone_number_id text,
  p_telefones text[],
  p_limite integer,
  p_origem text default 'disparo_template'::text,
  p_template_id uuid default null::uuid,
  p_template_nome text default null::text,
  p_usuario_id uuid default null::uuid,
  p_metadata_json jsonb default '{}'::jsonb
)
returns table(
  ok boolean,
  limite integer,
  usados integer,
  reservados integer,
  restantes integer,
  telefones_bloqueados text[],
  reserva_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portfolio_id text;
  v_telefones text[];
  v_novos text[];
  v_usados integer := 0;
  v_restantes integer := 0;
  v_bloqueados text[] := array[]::text[];
  v_reserva_ids uuid[] := array[]::uuid[];
  v_antispam_ate timestamptz;
begin
  if p_empresa_id is null or p_integracao_whatsapp_id is null then
    raise exception 'Empresa e integracao sao obrigatorias.';
  end if;

  if coalesce(p_limite, 0) <= 0 then
    raise exception 'Limite de mensagens/conversas Meta invalido.';
  end if;

  v_portfolio_id := public.whatsapp_meta_portfolio_key(
    p_integracao_whatsapp_id
  );

  if v_portfolio_id is null then
    raise exception 'Portfolio empresarial nao encontrado para a integracao.';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_empresa_id::text),
    hashtext(v_portfolio_id)
  );

  update public.whatsapp_meta_antispam_bloqueios b
  set
    ativo = false,
    updated_at = now(),
    metadata_json = coalesce(b.metadata_json, '{}'::jsonb) || jsonb_build_object(
      'liberado_automaticamente_em', now(),
      'motivo_liberacao', 'fim_cooldown_protetivo_24h'
    )
  where b.empresa_id = p_empresa_id
    and b.business_portfolio_id = v_portfolio_id
    and b.ativo = true
    and b.bloqueado_ate <= now();

  select max(b.bloqueado_ate)
    into v_antispam_ate
  from public.whatsapp_meta_antispam_bloqueios b
  where b.empresa_id = p_empresa_id
    and b.business_portfolio_id = v_portfolio_id
    and b.ativo = true
    and b.bloqueado_ate > now();

  select count(distinct r.telefone_normalizado)::integer
    into v_usados
  from public.whatsapp_meta_conversas_iniciadas r
  where r.empresa_id = p_empresa_id
    and r.business_portfolio_id = v_portfolio_id
    and r.janela_expira_em > now()
    and r.status in ('reservado', 'processando', 'enviado');

  v_restantes := greatest(p_limite - v_usados, 0);

  if v_antispam_ate is not null then
    return query
      select
        false,
        p_limite,
        v_usados,
        0,
        v_restantes,
        array[
          '__META_ANTISPAM_131048__:' ||
          to_char(
            v_antispam_ate at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          )
        ]::text[],
        array[]::uuid[];
    return;
  end if;

  select coalesce(array_agg(distinct telefone), array[]::text[])
    into v_telefones
  from (
    select regexp_replace(coalesce(item, ''), '[^0-9]', '', 'g') as telefone
    from unnest(coalesce(p_telefones, array[]::text[])) as t(item)
  ) normalizados
  where char_length(telefone) >= 10;

  if coalesce(array_length(v_telefones, 1), 0) = 0 then
    return query
      select
        true,
        p_limite,
        v_usados,
        0,
        v_restantes,
        array[]::text[],
        array[]::uuid[];
    return;
  end if;

  select coalesce(array_agg(telefone), array[]::text[])
    into v_novos
  from unnest(v_telefones) as t(telefone)
  where not exists (
    select 1
    from public.whatsapp_meta_conversas_iniciadas existentes
    where existentes.empresa_id = p_empresa_id
      and existentes.business_portfolio_id = v_portfolio_id
      and existentes.telefone_normalizado = telefone
      and existentes.janela_expira_em > now()
      and existentes.status in ('reservado', 'processando', 'enviado')
  );

  if coalesce(array_length(v_novos, 1), 0) > v_restantes then
    select coalesce(array_agg(telefone), array[]::text[])
      into v_bloqueados
    from (
      select telefone, row_number() over () as rn
      from unnest(v_novos) as t(telefone)
    ) ordenados
    where rn > v_restantes;

    return query
      select
        false,
        p_limite,
        v_usados,
        0,
        v_restantes,
        v_bloqueados,
        array[]::uuid[];
    return;
  end if;

  if coalesce(array_length(v_novos, 1), 0) > 0 then
    with inseridos as (
      insert into public.whatsapp_meta_conversas_iniciadas (
        empresa_id,
        integracao_whatsapp_id,
        business_portfolio_id,
        phone_number_id,
        telefone_normalizado,
        template_id,
        template_nome,
        usuario_id,
        origem,
        status,
        metadata_json
      )
      select
        p_empresa_id,
        p_integracao_whatsapp_id,
        v_portfolio_id,
        nullif(p_phone_number_id, ''),
        telefone,
        p_template_id,
        p_template_nome,
        p_usuario_id,
        coalesce(nullif(p_origem, ''), 'disparo_template'),
        'reservado',
        coalesce(p_metadata_json, '{}'::jsonb) || jsonb_build_object(
          'business_portfolio_id', v_portfolio_id,
          'limite_escopo', 'portfolio_empresarial',
          'janela_tipo', 'movel_24h'
        )
      from unnest(v_novos) as t(telefone)
      returning id
    )
    select coalesce(array_agg(id), array[]::uuid[])
      into v_reserva_ids
    from inseridos;
  end if;

  return query
    select
      true,
      p_limite,
      v_usados,
      coalesce(array_length(v_novos, 1), 0),
      greatest(
        p_limite - v_usados - coalesce(array_length(v_novos, 1), 0),
        0
      ),
      array[]::text[],
      coalesce(v_reserva_ids, array[]::uuid[]);
end;
$$;

create or replace function public.sincronizar_whatsapp_meta_reserva_por_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_telefone text;
  v_portfolio_id text;
  v_reserva_id uuid;
  v_status_meta text;
  v_meta_timestamp timestamptz;
  v_erro_codigo integer;
  v_bloqueio_ate timestamptz;
  v_novo_antispam boolean := false;
begin
  v_telefone := regexp_replace(
    coalesce(new.telefone_normalizado, new.numero, ''),
    '[^0-9]',
    '',
    'g'
  );

  if char_length(v_telefone) < 10 then
    return new;
  end if;

  v_portfolio_id := public.whatsapp_meta_portfolio_key(
    new.integracao_whatsapp_id
  );

  if v_portfolio_id is null then
    return new;
  end if;

  v_status_meta := lower(
    btrim(coalesce(new.metadata_json ->> 'ultimo_status_meta', ''))
  );
  v_meta_timestamp := public.whatsapp_meta_timestamp_item(
    coalesce(new.metadata_json, '{}'::jsonb),
    coalesce(new.processed_at, new.updated_at, now())
  );
  v_erro_codigo := new.erro_codigo_meta;

  select r.id
    into v_reserva_id
  from public.whatsapp_meta_conversas_iniciadas r
  where r.empresa_id = new.empresa_id
    and r.business_portfolio_id = v_portfolio_id
    and r.telefone_normalizado = v_telefone
    and r.status in ('reservado', 'processando', 'enviado')
  order by r.created_at desc
  limit 1
  for update;

  if new.status in ('falha', 'cancelado') then
    if v_reserva_id is not null then
      update public.whatsapp_meta_conversas_iniciadas r
      set
        status = case
          when new.status = 'cancelado' then 'cancelado'
          else 'falha'
        end,
        status_meta = nullif(v_status_meta, ''),
        meta_timestamp = v_meta_timestamp,
        erro_codigo_meta = v_erro_codigo,
        liberado_em = now(),
        updated_at = now(),
        metadata_json = coalesce(r.metadata_json, '{}'::jsonb) || jsonb_build_object(
          'item_disparo_id', new.id,
          'campanha_disparo_id', new.campanha_id,
          'status_item', new.status,
          'erro_codigo_meta', v_erro_codigo,
          'reserva_liberada_por_falha', new.status = 'falha',
          'reserva_liberada_em', now()
        )
      where r.id = v_reserva_id;
    end if;

    if tg_op = 'INSERT' then
      v_novo_antispam := v_erro_codigo = 131048;
    else
      v_novo_antispam := v_erro_codigo = 131048 and (
        old.erro_codigo_meta is distinct from 131048
        or old.status is distinct from new.status
      );
    end if;

    if v_novo_antispam then
      -- A Meta nao envia a expiracao do 131048 no webhook. O CRM aplica um
      -- cooldown protetivo local de 24h, separado do saldo do tier.
      v_bloqueio_ate := v_meta_timestamp + interval '24 hours';

      insert into public.whatsapp_meta_antispam_bloqueios (
        empresa_id,
        business_portfolio_id,
        integracao_whatsapp_id,
        erro_codigo_meta,
        motivo,
        ativo,
        bloqueado_em,
        ultima_ocorrencia_em,
        bloqueado_ate,
        ocorrencias,
        campanha_id,
        item_id,
        mensagem_externa_id,
        metadata_json,
        updated_at
      )
      values (
        new.empresa_id,
        v_portfolio_id,
        new.integracao_whatsapp_id,
        131048,
        coalesce(
          nullif(new.erro, ''),
          'A Meta restringiu temporariamente o envio por taxa de spam.'
        ),
        true,
        v_meta_timestamp,
        v_meta_timestamp,
        v_bloqueio_ate,
        1,
        new.campanha_id,
        new.id,
        new.message_id,
        jsonb_build_object(
          'origem', 'webhook_status_meta',
          'politica_local', 'cooldown_protetivo_24h',
          'webhook_status_raw', new.metadata_json -> 'webhook_status_raw'
        ),
        now()
      )
      on conflict (empresa_id, business_portfolio_id) where ativo = true
      do update set
        integracao_whatsapp_id = excluded.integracao_whatsapp_id,
        motivo = excluded.motivo,
        ultima_ocorrencia_em = excluded.ultima_ocorrencia_em,
        bloqueado_ate = greatest(
          public.whatsapp_meta_antispam_bloqueios.bloqueado_ate,
          excluded.bloqueado_ate
        ),
        ocorrencias = public.whatsapp_meta_antispam_bloqueios.ocorrencias + 1,
        campanha_id = excluded.campanha_id,
        item_id = excluded.item_id,
        mensagem_externa_id = excluded.mensagem_externa_id,
        metadata_json = coalesce(
          public.whatsapp_meta_antispam_bloqueios.metadata_json,
          '{}'::jsonb
        ) || excluded.metadata_json,
        updated_at = now();

      update public.whatsapp_disparo_campanhas c
      set
        status = 'pausada_por_erro_meta',
        pausa_motivo = 'Campanha pausada porque a Meta aplicou a restricao antispam 131048.',
        erro = coalesce(
          nullif(new.erro, ''),
          'Spam Rate Limit Hit (Meta 131048).'
        ),
        paused_at = coalesce(c.paused_at, now()),
        updated_at = now(),
        metadata_json = coalesce(c.metadata_json, '{}'::jsonb) || jsonb_build_object(
          'erro_codigo_meta', 131048,
          'pausa_automatica', true,
          'bloqueio_antispam_separado_do_tier', true,
          'bloqueado_ate', v_bloqueio_ate
        )
      where c.id = new.campanha_id
        and c.status in ('pendente', 'enviando');

      update public.whatsapp_disparo_itens i
      set
        status = 'cancelado',
        erro = 'Cancelado preventivamente apos restricao antispam Meta 131048.',
        locked_at = null,
        processed_at = now(),
        updated_at = now(),
        metadata_json = coalesce(i.metadata_json, '{}'::jsonb) || jsonb_build_object(
          'motivo_cancelamento', 'whatsapp_meta_antispam_131048',
          'bloqueado_ate', v_bloqueio_ate
        )
      where i.campanha_id = new.campanha_id
        and i.id <> new.id
        and i.status in ('pendente', 'processando');
    end if;

    return new;
  end if;

  if new.status = 'enviado' and v_reserva_id is not null then
    update public.whatsapp_meta_conversas_iniciadas r
    set
      status = 'enviado',
      status_meta = coalesce(nullif(v_status_meta, ''), r.status_meta, 'accepted'),
      meta_timestamp = case
        when v_status_meta in ('entregue', 'delivered', 'lida', 'read')
             and coalesce(r.status_meta, '') not in ('entregue', 'delivered', 'lida', 'read')
          then v_meta_timestamp
        when v_status_meta in ('enviada', 'sent')
             and coalesce(r.status_meta, '') not in ('entregue', 'delivered', 'lida', 'read')
          then v_meta_timestamp
        else coalesce(r.meta_timestamp, v_meta_timestamp)
      end,
      enviado_em = case
        when v_status_meta in ('entregue', 'delivered', 'lida', 'read')
             and coalesce(r.status_meta, '') not in ('entregue', 'delivered', 'lida', 'read')
          then v_meta_timestamp
        else coalesce(r.enviado_em, v_meta_timestamp)
      end,
      janela_expira_em = case
        when v_status_meta in ('entregue', 'delivered', 'lida', 'read')
             and coalesce(r.status_meta, '') not in ('entregue', 'delivered', 'lida', 'read')
          then v_meta_timestamp + interval '24 hours'
        when v_status_meta in ('enviada', 'sent')
             and coalesce(r.status_meta, '') not in ('entregue', 'delivered', 'lida', 'read')
          then v_meta_timestamp + interval '24 hours'
        when nullif(v_status_meta, '') is null
          then greatest(
            r.janela_expira_em,
            coalesce(new.processed_at, now()) + interval '24 hours'
          )
        else r.janela_expira_em
      end,
      erro_codigo_meta = null,
      liberado_em = null,
      updated_at = now(),
      metadata_json = coalesce(r.metadata_json, '{}'::jsonb) || jsonb_build_object(
        'item_disparo_id', new.id,
        'campanha_disparo_id', new.campanha_id,
        'status_item', new.status,
        'ultimo_status_meta', nullif(v_status_meta, ''),
        'meta_timestamp', v_meta_timestamp,
        'janela_recalculada_por_evento_meta', nullif(v_status_meta, '') is not null
      )
    where r.id = v_reserva_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sincronizar_whatsapp_meta_reserva_item_insert
  on public.whatsapp_disparo_itens;

drop trigger if exists trg_sincronizar_whatsapp_meta_reserva_item_update
  on public.whatsapp_disparo_itens;

create trigger trg_sincronizar_whatsapp_meta_reserva_item_insert
after insert
on public.whatsapp_disparo_itens
for each row
execute function public.sincronizar_whatsapp_meta_reserva_por_item();

create trigger trg_sincronizar_whatsapp_meta_reserva_item_update
after update of status, erro_codigo_meta, metadata_json, processed_at
on public.whatsapp_disparo_itens
for each row
execute function public.sincronizar_whatsapp_meta_reserva_por_item();

-- Reconcilia reservas antigas com o resultado definitivo dos itens. Falhas
-- deixam de ocupar o tier imediatamente; sucessos passam a usar o timestamp
-- real recebido da Meta quando disponivel.
with referencias as (
  select
    r.id as reserva_id,
    i.id as item_id,
    i.campanha_id,
    i.status as item_status,
    i.erro_codigo_meta,
    lower(btrim(coalesce(i.metadata_json ->> 'ultimo_status_meta', ''))) as status_meta,
    public.whatsapp_meta_timestamp_item(
      coalesce(i.metadata_json, '{}'::jsonb),
      coalesce(i.processed_at, i.updated_at, r.enviado_em, r.reservado_em)
    ) as meta_timestamp
  from public.whatsapp_meta_conversas_iniciadas r
  join public.whatsapp_disparo_itens i
    on i.id::text = r.metadata_json ->> 'item_disparo_id'
)
update public.whatsapp_meta_conversas_iniciadas r
set
  status = case
    when ref.item_status = 'falha' then 'falha'
    when ref.item_status = 'cancelado' then 'cancelado'
    when ref.item_status = 'enviado' then 'enviado'
    else r.status
  end,
  status_meta = nullif(ref.status_meta, ''),
  meta_timestamp = ref.meta_timestamp,
  erro_codigo_meta = ref.erro_codigo_meta,
  liberado_em = case
    when ref.item_status in ('falha', 'cancelado') then now()
    else null
  end,
  enviado_em = case
    when ref.item_status = 'enviado' then ref.meta_timestamp
    else r.enviado_em
  end,
  janela_expira_em = case
    when ref.item_status = 'enviado'
      then ref.meta_timestamp + interval '24 hours'
    else r.janela_expira_em
  end,
  updated_at = now(),
  metadata_json = coalesce(r.metadata_json, '{}'::jsonb) || jsonb_build_object(
    'reconciliado_migracao', true,
    'reconciliado_em', now(),
    'status_item', ref.item_status,
    'erro_codigo_meta', ref.erro_codigo_meta,
    'meta_timestamp', ref.meta_timestamp
  )
from referencias ref
where r.id = ref.reserva_id;

-- Registra separadamente restricoes 131048 ja existentes, sem recolocar as
-- mensagens que falharam no consumo do tier de 24 horas.
insert into public.whatsapp_meta_antispam_bloqueios (
  empresa_id,
  business_portfolio_id,
  integracao_whatsapp_id,
  erro_codigo_meta,
  motivo,
  ativo,
  bloqueado_em,
  ultima_ocorrencia_em,
  bloqueado_ate,
  ocorrencias,
  campanha_id,
  item_id,
  mensagem_externa_id,
  metadata_json,
  updated_at
)
select distinct on (i.empresa_id, public.whatsapp_meta_portfolio_key(i.integracao_whatsapp_id))
  i.empresa_id,
  public.whatsapp_meta_portfolio_key(i.integracao_whatsapp_id),
  i.integracao_whatsapp_id,
  131048,
  coalesce(
    nullif(i.erro, ''),
    'A Meta restringiu temporariamente o envio por taxa de spam.'
  ),
  public.whatsapp_meta_timestamp_item(
    coalesce(i.metadata_json, '{}'::jsonb),
    coalesce(i.processed_at, i.updated_at, now())
  ) + interval '24 hours' > now(),
  public.whatsapp_meta_timestamp_item(
    coalesce(i.metadata_json, '{}'::jsonb),
    coalesce(i.processed_at, i.updated_at, now())
  ),
  public.whatsapp_meta_timestamp_item(
    coalesce(i.metadata_json, '{}'::jsonb),
    coalesce(i.processed_at, i.updated_at, now())
  ),
  public.whatsapp_meta_timestamp_item(
    coalesce(i.metadata_json, '{}'::jsonb),
    coalesce(i.processed_at, i.updated_at, now())
  ) + interval '24 hours',
  1,
  i.campanha_id,
  i.id,
  i.message_id,
  jsonb_build_object(
    'origem', 'reconciliacao_migracao',
    'politica_local', 'cooldown_protetivo_24h',
    'webhook_status_raw', i.metadata_json -> 'webhook_status_raw'
  ),
  now()
from public.whatsapp_disparo_itens i
where i.erro_codigo_meta = 131048
order by
  i.empresa_id,
  public.whatsapp_meta_portfolio_key(i.integracao_whatsapp_id),
  coalesce(i.processed_at, i.updated_at) desc
on conflict (empresa_id, business_portfolio_id) where ativo = true
  do update set
    integracao_whatsapp_id = excluded.integracao_whatsapp_id,
    motivo = excluded.motivo,
    ultima_ocorrencia_em = excluded.ultima_ocorrencia_em,
    bloqueado_ate = greatest(
      public.whatsapp_meta_antispam_bloqueios.bloqueado_ate,
      excluded.bloqueado_ate
    ),
    ocorrencias = public.whatsapp_meta_antispam_bloqueios.ocorrencias + 1,
    campanha_id = excluded.campanha_id,
    item_id = excluded.item_id,
    mensagem_externa_id = excluded.mensagem_externa_id,
    metadata_json = coalesce(
      public.whatsapp_meta_antispam_bloqueios.metadata_json,
      '{}'::jsonb
    ) || excluded.metadata_json,
    updated_at = now();

grant execute on function public.whatsapp_meta_portfolio_key(uuid)
  to authenticated, service_role;
grant execute on function public.obter_resumo_whatsapp_meta_limite(uuid, uuid, integer)
  to authenticated, service_role;
grant execute on function public.reservar_whatsapp_meta_limite(
  uuid, uuid, text, text[], integer, text, uuid, text, uuid, jsonb
) to authenticated, service_role;

notify pgrst, 'reload schema';
