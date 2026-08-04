-- Reduz o cooldown de numeros recusados com erro 131026 para 24 horas,
-- marca o contato com "revisao" e limpa a marca apos um envio aceito.

with referencias as (
  select
    c.id,
    coalesce(c.ultima_ocorrencia_em, c.bloqueado_em, c.created_at, now())
      as referencia
  from public.whatsapp_disparo_cooldowns c
  where c.erro_codigo_meta = 131026
     or c.motivo = 'meta_131026'
)
update public.whatsapp_disparo_cooldowns c
set
  expira_em = r.referencia + interval '24 hours',
  ativo = r.referencia + interval '24 hours' > now(),
  metadata_json =
    (coalesce(c.metadata_json, '{}'::jsonb) - 'cooldown_dias') ||
    jsonb_build_object(
      'cooldown_horas', 24,
      'politica', 'numero_invalido_131026_24h_revisao',
      'ajustado_em', now()
    ),
  updated_at = now()
from referencias r
where c.id = r.id;

-- A marca de revisao permanece mesmo depois que o cooldown expirar. Ela sera
-- removida apenas quando um disparo para o contato for aceito com sucesso.
update public.contatos contato
set
  telefone_revisar = true,
  updated_at = now()
where exists (
  select 1
  from public.whatsapp_disparo_cooldowns cooldown
  where (cooldown.erro_codigo_meta = 131026 or cooldown.motivo = 'meta_131026')
    and cooldown.empresa_id = contato.empresa_id
    and (
      cooldown.contato_id = contato.id
      or cooldown.telefone_normalizado = regexp_replace(
        coalesce(contato.telefone, ''),
        '[^0-9]',
        '',
        'g'
      )
    )
);

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
    expira_em = v_referencia + interval '24 hours',
    ativo = true,
    contato_id = coalesce(new.contato_id, c.contato_id),
    integracao_whatsapp_id = new.integracao_whatsapp_id,
    campanha_id = new.campanha_id,
    item_id = new.id,
    mensagem_externa_id = coalesce(new.message_id, c.mensagem_externa_id),
    erro_codigo_meta = 131026,
    ultima_ocorrencia_em = v_referencia,
    metadata_json =
      (coalesce(c.metadata_json, '{}'::jsonb) - 'cooldown_dias') ||
      jsonb_build_object(
        'cooldown_horas', 24,
        'politica', 'numero_invalido_131026_24h_revisao',
        'erro', new.erro,
        'ultima_campanha_id', new.campanha_id,
        'ultimo_item_id', new.id
      ),
    updated_at = now()
  where c.empresa_id = new.empresa_id
    and c.telefone_normalizado = v_telefone
    and c.motivo = 'meta_131026'
    and c.ativo = true;

  update public.contatos contato
  set
    telefone_revisar = true,
    updated_at = now()
  where contato.empresa_id = new.empresa_id
    and (
      (new.contato_id is not null and contato.id = new.contato_id)
      or regexp_replace(
        coalesce(contato.telefone, ''),
        '[^0-9]',
        '',
        'g'
      ) = v_telefone
    );

  return new;
end;
$$;

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
      'motivo_liberacao', 'fim_cooldown_numero_invalido_24h'
    )
  where c.ativo = true
    and c.motivo = 'meta_131026'
    and c.expira_em <= now();

  update public.whatsapp_disparo_itens i
  set
    status = 'cancelado',
    erro = 'Envio bloqueado por 24 horas: o numero esta marcado para revisao apos erro 131026 da Meta.',
    locked_at = null,
    processed_at = now(),
    updated_at = now(),
    metadata_json = coalesce(i.metadata_json, '{}'::jsonb) || jsonb_build_object(
      'motivo_cancelamento', 'numero_invalido_131026_cooldown_24h',
      'cooldown_escopo', 'contato',
      'contato_em_revisao', true,
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

create or replace function public.limpar_revisao_telefone_apos_disparo_enviado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_telefone text;
begin
  if new.status <> 'enviado' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'enviado' then
    return new;
  end if;

  v_telefone := regexp_replace(
    coalesce(new.telefone_normalizado, new.numero, ''),
    '[^0-9]',
    '',
    'g'
  );

  update public.contatos contato
  set
    telefone_revisar = false,
    updated_at = now()
  where contato.empresa_id = new.empresa_id
    and contato.telefone_revisar = true
    and (
      (new.contato_id is not null and contato.id = new.contato_id)
      or (
        char_length(v_telefone) >= 10
        and regexp_replace(
          coalesce(contato.telefone, ''),
          '[^0-9]',
          '',
          'g'
        ) = v_telefone
      )
    );

  update public.whatsapp_disparo_cooldowns cooldown
  set
    ativo = false,
    updated_at = now(),
    metadata_json = coalesce(cooldown.metadata_json, '{}'::jsonb) ||
      jsonb_build_object(
        'liberado_em', now(),
        'motivo_liberacao', 'disparo_enviado_com_sucesso'
      )
  where cooldown.empresa_id = new.empresa_id
    and cooldown.motivo = 'meta_131026'
    and cooldown.ativo = true
    and (
      (new.contato_id is not null and cooldown.contato_id = new.contato_id)
      or (
        char_length(v_telefone) >= 10
        and cooldown.telefone_normalizado = v_telefone
      )
    );

  return new;
end;
$$;

drop trigger if exists trg_limpar_revisao_telefone_apos_disparo_enviado
  on public.whatsapp_disparo_itens;

create trigger trg_limpar_revisao_telefone_apos_disparo_enviado
after insert or update of status
on public.whatsapp_disparo_itens
for each row
execute function public.limpar_revisao_telefone_apos_disparo_enviado();

-- Aplica imediatamente o novo cooldown de 24 horas aos itens ainda pendentes,
-- sem pausar ou cancelar a campanha inteira.
select public.cancelar_itens_numero_invalido_em_cooldown(null);

do $$
declare
  v_campanha uuid;
begin
  for v_campanha in
    select distinct i.campanha_id
    from public.whatsapp_disparo_itens i
    where i.status = 'cancelado'
      and i.metadata_json ->> 'motivo_cancelamento' =
        'numero_invalido_131026_cooldown_24h'
  loop
    perform public.recalcular_whatsapp_disparo_campanha(v_campanha);
  end loop;
end;
$$;
