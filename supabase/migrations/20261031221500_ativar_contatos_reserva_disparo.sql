-- Contingência para campanhas WhatsApp: reservas somente após falhas definitivas.
-- Os contatos adicionais ficam em metadata_json; não entram na fila nem
-- consomem capacidade da Meta até serem efetivamente ativados.
create or replace function public.ativar_contatos_reserva_disparo(
  p_campanha_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campanha public.whatsapp_disparo_campanhas%rowtype;
  v_candidatos jsonb;
  v_candidato jsonb;
  v_cursor integer;
  v_tamanho integer;
  v_alvo integer;
  v_ativos integer;
  v_falhas_aptas integer;
  v_permitidos integer;
  v_ativados integer := 0;
  v_numero text;
  v_phone_number_id text;
  v_reserva record;
  v_ids uuid[] := array[]::uuid[];
  v_expira timestamptz;
begin
  select * into v_campanha
  from public.whatsapp_disparo_campanhas
  where id = p_campanha_id for update;

  if not found or v_campanha.status not in ('pendente', 'enviando', 'concluida')
    or coalesce(v_campanha.metadata_json->>'contingencia_reserva_ativa', 'false') <> 'true'
    or coalesce(v_campanha.limite_meta, 0) <= 0 then
    return 0;
  end if;

  v_expira := nullif(v_campanha.metadata_json->>'contingencia_expira_em', '')::timestamptz;
  if v_expira is not null and v_expira < now() then return 0; end if;

  v_candidatos := coalesce(v_campanha.metadata_json->'contingencia_reserva_contatos', '[]'::jsonb);
  if jsonb_typeof(v_candidatos) <> 'array' then return 0; end if;
  v_tamanho := jsonb_array_length(v_candidatos);
  v_cursor := greatest(0, coalesce((v_campanha.metadata_json->>'contingencia_reserva_cursor')::integer, 0));
  if v_cursor >= v_tamanho then return 0; end if;

  v_alvo := greatest(0, coalesce((v_campanha.metadata_json->>'contingencia_meta_contatos_principais')::integer, 0));
  if v_alvo = 0 then return 0; end if;

  -- Se a Meta restringiu o remetente, não escalar a falha substituindo
  -- destinatários. O operador deve tratar primeiro o bloqueio.
  if exists (
    select 1 from public.whatsapp_disparo_itens i
    where i.campanha_id = p_campanha_id
      and i.erro_codigo_meta in (131048, 131031, 133010)
      and i.processed_at > now() - interval '24 hours'
  ) then
    return 0;
  end if;

  -- Uma campanha concluída não pode reabrir enquanto outra ocupa a integração.
  if v_campanha.status = 'concluida' and exists (
    select 1 from public.whatsapp_disparo_campanhas outra
    where outra.integracao_whatsapp_id = v_campanha.integracao_whatsapp_id
      and outra.id <> p_campanha_id and outra.status in ('pendente', 'enviando')
  ) then
    return 0;
  end if;

  select
    count(*) filter (where status in ('pendente', 'processando', 'enviado'))::integer,
    count(*) filter (
      where status = 'falha' and erro_codigo_meta in (131026, 130472, 131049)
    )::integer
  into v_ativos, v_falhas_aptas
  from public.whatsapp_disparo_itens
  where campanha_id = p_campanha_id;

  -- O cursor equivale a quantas substituições já foram tentadas.
  -- Assim não se transforma um problema sistêmico numa cascata de envios.
  v_permitidos := least(
    greatest(v_alvo - v_ativos, 0),
    greatest(v_falhas_aptas - v_cursor, 0),
    v_tamanho - v_cursor,
    10
  );
  if v_permitidos <= 0 then return 0; end if;

  select phone_number_id into v_phone_number_id
  from public.integracoes_whatsapp
  where id = v_campanha.integracao_whatsapp_id
    and empresa_id = v_campanha.empresa_id;

  while v_ativados < v_permitidos loop
    v_candidato := v_candidatos->v_cursor;
    v_numero := regexp_replace(coalesce(v_candidato->>'numero', ''), '[^0-9]', '', 'g');
    if length(v_numero) < 10 then
      v_cursor := v_cursor + 1;
      continue;
    end if;

    select * into v_reserva
    from public.reservar_whatsapp_meta_limite(
      v_campanha.empresa_id,
      v_campanha.integracao_whatsapp_id,
      coalesce(v_phone_number_id, ''),
      array[v_numero],
      v_campanha.limite_meta,
      'disparo_template_contingencia',
      v_campanha.template_id,
      v_campanha.template_nome,
      v_campanha.usuario_id,
      jsonb_build_object('campanha_disparo_id', p_campanha_id, 'origem', 'contatos_reserva')
    );

    -- Sem capacidade: nada é enfileirado, nem se ultrapassa o limite da Meta.
    if not coalesce(v_reserva.ok, false) then exit; end if;

    insert into public.whatsapp_disparo_itens (
      campanha_id, empresa_id, integracao_whatsapp_id, template_id,
      usuario_id, contato_id, numero, telefone_normalizado, nome_contato,
      variaveis, status, consome_limite_meta, next_attempt_at, metadata_json
    ) values (
      p_campanha_id, v_campanha.empresa_id, v_campanha.integracao_whatsapp_id,
      v_campanha.template_id, v_campanha.usuario_id,
      nullif(v_candidato->>'contato_id', '')::uuid, v_numero, v_numero,
      nullif(v_candidato->>'nome_contato', ''),
      coalesce(v_candidato->'variaveis', '[]'::jsonb),
      'pendente', true, now(),
      jsonb_build_object(
        'origem', 'contingencia_automatica',
        'contato_reserva', true,
        'ordem_reserva', v_cursor + 1
      )
    );

    v_ids := v_ids || coalesce(v_reserva.reserva_ids, array[]::uuid[]);
    v_ativados := v_ativados + 1;
    v_cursor := v_cursor + 1;
  end loop;

  if v_cursor > coalesce((v_campanha.metadata_json->>'contingencia_reserva_cursor')::integer, 0) then
    update public.whatsapp_disparo_campanhas
    set
      status = case when status = 'concluida' and v_ativados > 0 then 'pendente' else status end,
      finished_at = case when v_ativados > 0 then null else finished_at end,
      total_pendentes = total_pendentes + v_ativados,
      total_itens = total_itens + v_ativados,
      limite_meta_reserva_ids = coalesce(limite_meta_reserva_ids, array[]::uuid[]) || v_ids,
      metadata_json = jsonb_set(
        coalesce(metadata_json, '{}'::jsonb),
        '{contingencia_reserva_cursor}',
        to_jsonb(v_cursor)
      ),
      updated_at = now()
    where id = p_campanha_id;
  end if;

  return v_ativados;
end;
$$;

revoke all on function public.ativar_contatos_reserva_disparo(uuid)
  from public, anon, authenticated;
grant execute on function public.ativar_contatos_reserva_disparo(uuid)
  to service_role;
