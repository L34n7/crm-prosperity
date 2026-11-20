-- Classificacoes Convertido passam a integrar o Resultado Comercial do rastreamento.
-- Eventos ja registrados por checkout, fluxo ou encerramento nao sao duplicados.
create or replace function public.crmar_lead_resultado_comercial_convertido()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_conversa_id uuid;
  v_protocolo_id uuid;
  v_valor numeric(14,2);
  v_origem text;
  v_motivo text;
  v_chave text;
begin
  if new.classificacao <> 'convertido'
     or old.classificacao is not distinct from new.classificacao then
    return new;
  end if;

  -- Quando a classificacao foi gerada por um evento comercial existente,
  -- como fechamento manual ou confirmacao de pagamento, nao registre outra conversao.
  if new.classificacao_evento_id is not null
     and new.classificacao_evento_id is distinct from old.classificacao_evento_id
     and exists (
       select 1 from public.rastreamento_eventos e
       where e.id = new.classificacao_evento_id
         and e.empresa_id = new.empresa_id
         and e.contato_id = new.id
         and public.rastreamento_classificacao_evento(e.tipo,e.metadata_json) = 'convertido'
     ) then
    return new;
  end if;

  v_conversa_id := nullif(current_setting('crm.classificacao_conversa_id',true),'')::uuid;
  if v_conversa_id is not null and not exists (
    select 1 from public.conversas c
    where c.id = v_conversa_id and c.empresa_id = new.empresa_id
      and c.contato_id = new.id
  ) then
    v_conversa_id := null;
  end if;

  -- Alteracoes manuais no Kanban nao informam conversa: associe a mais recente.
  if v_conversa_id is null then
    select c.id into v_conversa_id
    from public.conversas c
    where c.empresa_id = new.empresa_id and c.contato_id = new.id
    order by c.last_message_at desc nulls last, c.created_at desc, c.id desc
    limit 1;
  end if;

  if v_conversa_id is not null then
    select cp.id into v_protocolo_id
    from public.conversa_protocolos cp
    where cp.empresa_id = new.empresa_id
      and cp.conversa_id = v_conversa_id
    order by coalesce(cp.started_at, cp.created_at) desc, cp.created_at desc, cp.id desc
    limit 1;
  end if;

  -- Se o protocolo ja registra conversao (inclusive venda manual), nao some
  -- outra receita nem substitua um resultado comercial ja existente.
  if v_protocolo_id is not null and exists (
    select 1 from public.rastreamento_eventos e
    where e.empresa_id = new.empresa_id
      and e.contato_id = new.id
      and e.conversa_protocolo_id = v_protocolo_id
      and public.rastreamento_classificacao_evento(e.tipo,e.metadata_json) = 'convertido'
  ) then
    return new;
  end if;

  v_valor := nullif(current_setting('crm.classificacao_valor',true),'')::numeric;
  if v_valor is not null and (v_valor <= 0 or v_valor > 999999999) then
    v_valor := null;
  end if;
  v_origem := coalesce(nullif(current_setting('crm.classificacao_origem',true),''),'sistema');
  v_motivo := nullif(current_setting('crm.classificacao_motivo',true),'');
  v_chave := 'lead_convertido:' || new.id::text || ':' ||
    extract(epoch from coalesce(new.classificacao_atualizada_em, now()))::text;

  -- Objetivo concluido e um tipo de conversao comercial ja reconhecido pelos
  -- relatórios. Nao equivale a comprovante de pagamento nem presume venda quitada.
  insert into public.rastreamento_eventos (
    empresa_id, tipo, contato_id, conversa_id, conversa_protocolo_id, valor,
    origem_registro, idempotency_key, metadata_json, ocorrido_em
  ) values (
    new.empresa_id, 'objetivo_concluido', new.id, v_conversa_id,
    v_protocolo_id, v_valor, 'classificacao', v_chave,
    jsonb_build_object(
      'origem_interface','classificacao_leads',
      'origem_classificacao',v_origem,
      'observacao',coalesce(v_motivo,'Contato classificado como Convertido'),
      'resultado','convertido',
      'confirmacao','classificacao_comercial',
      'pagamento_confirmado',false,
      'valor_informado',(v_valor is not null),
      'conversa_protocolo_id',v_protocolo_id
    ),
    now()
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  return new;
end;
$$;

drop trigger if exists trg_z_lead_resultado_comercial_convertido on public.contatos;
create trigger trg_z_lead_resultado_comercial_convertido
after update of classificacao on public.contatos
for each row
when (old.classificacao is distinct from new.classificacao and new.classificacao='convertido')
execute function public.crmar_lead_resultado_comercial_convertido();

revoke all on function public.crmar_lead_resultado_comercial_convertido()
  from public, anon, authenticated;
