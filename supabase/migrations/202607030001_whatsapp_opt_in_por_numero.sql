create table if not exists public.whatsapp_contatos_opt_in_numeros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  contato_id uuid not null references public.contatos(id) on delete cascade,
  phone_number_id text not null,
  telefone_normalizado text not null,
  integracao_whatsapp_id uuid
    references public.integracoes_whatsapp(id) on delete set null,
  primeira_interacao_em timestamptz not null,
  ultima_interacao_em timestamptz not null,
  ativo boolean not null default true,
  origem text not null default 'mensagem_recebida',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (
    empresa_id,
    contato_id,
    phone_number_id,
    telefone_normalizado
  )
);

create index if not exists whatsapp_opt_in_numero_consulta_idx
  on public.whatsapp_contatos_opt_in_numeros (
    empresa_id,
    phone_number_id,
    contato_id,
    telefone_normalizado
  )
  where ativo = true;

alter table public.whatsapp_contatos_opt_in_numeros
  enable row level security;

revoke all on table public.whatsapp_contatos_opt_in_numeros
  from public, anon, authenticated;

grant all on table public.whatsapp_contatos_opt_in_numeros
  to service_role;

create or replace function public.registrar_whatsapp_opt_in_por_numero()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone_number_id text;
  v_telefone_normalizado text;
begin
  if new.last_inbound_message_at is null
    or new.empresa_id is null
    or new.contato_id is null
  then
    return new;
  end if;

  select nullif(btrim(integracao.phone_number_id), '')
    into v_phone_number_id
  from public.integracoes_whatsapp integracao
  where integracao.id = new.integracao_whatsapp_id
    and integracao.empresa_id = new.empresa_id;

  v_phone_number_id := coalesce(
    v_phone_number_id,
    nullif(btrim(new.integracao_whatsapp_phone_number_id_anterior), '')
  );

  select public.normalizar_telefone_whatsapp(contato.telefone)
    into v_telefone_normalizado
  from public.contatos contato
  where contato.id = new.contato_id
    and contato.empresa_id = new.empresa_id;

  if v_phone_number_id is null
    or coalesce(v_telefone_normalizado, '') = ''
  then
    return new;
  end if;

  insert into public.whatsapp_contatos_opt_in_numeros (
    empresa_id,
    contato_id,
    phone_number_id,
    telefone_normalizado,
    integracao_whatsapp_id,
    primeira_interacao_em,
    ultima_interacao_em,
    ativo,
    origem,
    metadata_json,
    updated_at
  )
  values (
    new.empresa_id,
    new.contato_id,
    v_phone_number_id,
    v_telefone_normalizado,
    new.integracao_whatsapp_id,
    new.last_inbound_message_at,
    new.last_inbound_message_at,
    true,
    'mensagem_recebida',
    jsonb_build_object('conversa_id', new.id),
    now()
  )
  on conflict (
    empresa_id,
    contato_id,
    phone_number_id,
    telefone_normalizado
  )
  do update set
    integracao_whatsapp_id = excluded.integracao_whatsapp_id,
    primeira_interacao_em = least(
      public.whatsapp_contatos_opt_in_numeros.primeira_interacao_em,
      excluded.primeira_interacao_em
    ),
    ultima_interacao_em = greatest(
      public.whatsapp_contatos_opt_in_numeros.ultima_interacao_em,
      excluded.ultima_interacao_em
    ),
    ativo = true,
    metadata_json =
      public.whatsapp_contatos_opt_in_numeros.metadata_json
      || excluded.metadata_json,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists registrar_whatsapp_opt_in_por_numero_trigger
  on public.conversas;

create trigger registrar_whatsapp_opt_in_por_numero_trigger
after insert or update of
  last_inbound_message_at,
  contato_id,
  integracao_whatsapp_id,
  integracao_whatsapp_phone_number_id_anterior
on public.conversas
for each row
when (new.last_inbound_message_at is not null)
execute function public.registrar_whatsapp_opt_in_por_numero();

revoke all on function public.registrar_whatsapp_opt_in_por_numero()
  from public, anon, authenticated;

grant execute on function public.registrar_whatsapp_opt_in_por_numero()
  to service_role;

with mensagens_webhook as (
  select
    mensagem_salva.empresa_id,
    conversa.contato_id,
    nullif(
      btrim(
        alteracao.item -> 'value' -> 'metadata' ->> 'phone_number_id'
      ),
      ''
    ) as phone_number_id,
    public.normalizar_telefone_whatsapp(mensagem.item ->> 'from')
      as telefone_normalizado,
    case
      when coalesce(mensagem.item ->> 'timestamp', '') ~ '^[0-9]+$'
        then to_timestamp(
          (mensagem.item ->> 'timestamp')::double precision
        )
      else evento.created_at
    end as interacao_em
  from public.whatsapp_webhook_eventos evento
  cross join lateral jsonb_array_elements(
    coalesce(evento.body_json -> 'entry', '[]'::jsonb)
  ) as entrada(item)
  cross join lateral jsonb_array_elements(
    coalesce(entrada.item -> 'changes', '[]'::jsonb)
  ) as alteracao(item)
  cross join lateral jsonb_array_elements(
    coalesce(alteracao.item -> 'value' -> 'messages', '[]'::jsonb)
  ) as mensagem(item)
  join public.mensagens mensagem_salva
    on mensagem_salva.mensagem_externa_id = mensagem.item ->> 'id'
  join public.conversas conversa
    on conversa.id = mensagem_salva.conversa_id
    and conversa.empresa_id = mensagem_salva.empresa_id
  where alteracao.item -> 'value' -> 'metadata' ->> 'phone_number_id'
    is not null
    and mensagem.item ->> 'from' is not null
    and conversa.contato_id is not null
),
opt_ins_webhook as (
  select
    registro.empresa_id,
    registro.contato_id,
    registro.phone_number_id,
    registro.telefone_normalizado,
    min(registro.interacao_em) as primeira_interacao_em,
    max(registro.interacao_em) as ultima_interacao_em
  from mensagens_webhook registro
  join public.contatos contato
    on contato.id = registro.contato_id
    and contato.empresa_id = registro.empresa_id
    and public.normalizar_telefone_whatsapp(contato.telefone) =
      registro.telefone_normalizado
  where registro.phone_number_id is not null
    and registro.telefone_normalizado <> ''
  group by
    registro.empresa_id,
    registro.contato_id,
    registro.phone_number_id,
    registro.telefone_normalizado
)
insert into public.whatsapp_contatos_opt_in_numeros (
  empresa_id,
  contato_id,
  phone_number_id,
  telefone_normalizado,
  integracao_whatsapp_id,
  primeira_interacao_em,
  ultima_interacao_em,
  ativo,
  origem,
  metadata_json,
  updated_at
)
select
  registro.empresa_id,
  registro.contato_id,
  registro.phone_number_id,
  registro.telefone_normalizado,
  integracao.id,
  registro.primeira_interacao_em,
  registro.ultima_interacao_em,
  true,
  'webhook_historico',
  jsonb_build_object('migracao', '202607030001'),
  now()
from opt_ins_webhook registro
left join lateral (
  select integracao_atual.id
  from public.integracoes_whatsapp integracao_atual
  where integracao_atual.empresa_id = registro.empresa_id
    and integracao_atual.phone_number_id = registro.phone_number_id
  order by integracao_atual.updated_at desc nulls last
  limit 1
) integracao on true
on conflict (
  empresa_id,
  contato_id,
  phone_number_id,
  telefone_normalizado
)
do update set
  primeira_interacao_em = least(
    public.whatsapp_contatos_opt_in_numeros.primeira_interacao_em,
    excluded.primeira_interacao_em
  ),
  ultima_interacao_em = greatest(
    public.whatsapp_contatos_opt_in_numeros.ultima_interacao_em,
    excluded.ultima_interacao_em
  ),
  ativo = true,
  origem = 'webhook_historico',
  updated_at = now();

insert into public.whatsapp_contatos_opt_in_numeros (
  empresa_id,
  contato_id,
  phone_number_id,
  telefone_normalizado,
  integracao_whatsapp_id,
  primeira_interacao_em,
  ultima_interacao_em,
  ativo,
  origem,
  metadata_json,
  updated_at
)
select
  conversa.empresa_id,
  conversa.contato_id,
  coalesce(
    nullif(
      btrim(conversa.integracao_whatsapp_phone_number_id_anterior),
      ''
    ),
    nullif(btrim(integracao.phone_number_id), '')
  ) as phone_number_id,
  public.normalizar_telefone_whatsapp(contato.telefone),
  (
    array_agg(
      conversa.integracao_whatsapp_id
      order by conversa.last_inbound_message_at desc
    ) filter (where conversa.integracao_whatsapp_id is not null)
  )[1],
  min(conversa.last_inbound_message_at),
  max(conversa.last_inbound_message_at),
  true,
  'backfill_conversas',
  jsonb_build_object('migracao', '202607030001'),
  now()
from public.conversas conversa
join public.contatos contato
  on contato.id = conversa.contato_id
  and contato.empresa_id = conversa.empresa_id
left join public.integracoes_whatsapp integracao
  on integracao.id = conversa.integracao_whatsapp_id
  and integracao.empresa_id = conversa.empresa_id
where conversa.last_inbound_message_at is not null
  and coalesce(
    nullif(
      btrim(conversa.integracao_whatsapp_phone_number_id_anterior),
      ''
    ),
    nullif(btrim(integracao.phone_number_id), '')
  ) is not null
  and public.normalizar_telefone_whatsapp(contato.telefone) <> ''
  and not exists (
    select 1
    from public.whatsapp_contatos_opt_in_numeros opt_in_exato
    where opt_in_exato.empresa_id = conversa.empresa_id
      and opt_in_exato.contato_id = conversa.contato_id
      and opt_in_exato.origem = 'webhook_historico'
  )
group by
  conversa.empresa_id,
  conversa.contato_id,
  coalesce(
    nullif(
      btrim(conversa.integracao_whatsapp_phone_number_id_anterior),
      ''
    ),
    nullif(btrim(integracao.phone_number_id), '')
  ),
  public.normalizar_telefone_whatsapp(contato.telefone)
on conflict (
  empresa_id,
  contato_id,
  phone_number_id,
  telefone_normalizado
)
do update set
  primeira_interacao_em = least(
    public.whatsapp_contatos_opt_in_numeros.primeira_interacao_em,
    excluded.primeira_interacao_em
  ),
  ultima_interacao_em = greatest(
    public.whatsapp_contatos_opt_in_numeros.ultima_interacao_em,
    excluded.ultima_interacao_em
  ),
  ativo = true,
  updated_at = now();

comment on table public.whatsapp_contatos_opt_in_numeros is
  'Opt-in comprovado pela interacao do contato com um phone_number_id especifico.';
