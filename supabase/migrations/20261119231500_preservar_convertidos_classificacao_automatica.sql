-- Preservar estagio Convertido de qualquer reclassificacao automatica,
-- independentemente da origem; somente alteracoes explicitas do usuario podem reverter.

CREATE OR REPLACE FUNCTION public.crmar_lead_classificar(p_empresa_id uuid, p_contato_id uuid, p_classificacao text, p_origem text DEFAULT 'sistema'::text, p_motivo text DEFAULT NULL::text, p_conversa_id uuid DEFAULT NULL::uuid, p_mensagem_id uuid DEFAULT NULL::uuid, p_valor_conversao numeric DEFAULT NULL::numeric)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_atual text;
begin
  if p_classificacao not in ('novo','qualificado','convertido','perdido') then
    raise exception 'Classificacao comercial invalida';
  end if;
  select classificacao into v_atual
    from public.contatos where id=p_contato_id and empresa_id=p_empresa_id for update;
  if not found then return false; end if;
  if v_atual is not distinct from p_classificacao then return false; end if;
  -- O RPC pertence exclusivamente ao classificador automatico.
  -- Convertido (por IA, regras ou atendente) nao pode sair desse status.
  if v_atual = 'convertido' then return false; end if;
  perform set_config('crm.classificacao_origem',left(coalesce(p_origem,'sistema'),40),true);
  perform set_config('crm.classificacao_motivo',left(coalesce(p_motivo,''),220),true);
  perform set_config('crm.classificacao_conversa_id',coalesce(p_conversa_id::text,''),true);
  perform set_config('crm.classificacao_mensagem_id',coalesce(p_mensagem_id::text,''),true);
  perform set_config('crm.classificacao_valor',
    case when p_valor_conversao is not null and p_valor_conversao between 0 and 999999999
      then p_valor_conversao::text else '' end,true);
  update public.contatos set
    classificacao=p_classificacao,
    classificacao_atualizada_em=now(),
    status_lead=case p_classificacao when 'convertido' then 'cliente' else p_classificacao end,
    updated_at=now()
  where id=p_contato_id and empresa_id=p_empresa_id;
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.recalcular_classificacao_contato(p_contato_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_protocolo record;
  v_evento record;
  v_classificacao text;
  v_status_lead text;
begin
  if p_contato_id is null then
    return;
  end if;

  -- Eventos de rastreamento e recálculos de protocolos nunca rebaixam
  -- um contato convertido, inclusive quando o status foi definido manualmente.
  select classificacao into v_classificacao
    from public.contatos where id=p_contato_id for update;
  if v_classificacao = 'convertido' then return; end if;

  select
    cp.id,
    cp.resultado,
    cp.resultado_em,
    cp.resultado_evento_id,
    coalesce(cp.started_at, cp.created_at) as iniciado_em
  into v_protocolo
  from public.conversa_protocolos cp
  where cp.contato_id = p_contato_id
  order by coalesce(cp.started_at, cp.created_at) desc, cp.created_at desc
  limit 1;

  if v_protocolo.id is not null then
    v_classificacao := case
      when v_protocolo.resultado = 'convertido' then 'convertido'
      when v_protocolo.resultado = 'perdido' then 'perdido'
      else 'qualificado'
    end;

    v_status_lead := case
      when v_classificacao = 'convertido' then 'cliente'
      else v_classificacao
    end;

    update public.contatos
    set
      classificacao = v_classificacao,
      status_lead = v_status_lead,
      classificacao_atualizada_em =
        coalesce(v_protocolo.resultado_em, v_protocolo.iniciado_em, now()),
      classificacao_evento_id = v_protocolo.resultado_evento_id,
      classificacao_protocolo_id = v_protocolo.id,
      updated_at = now()
    where id = p_contato_id;

    return;
  end if;

  select
    e.id,
    public.rastreamento_classificacao_evento(e.tipo, e.metadata_json)
      as classificacao,
    e.ocorrido_em
  into v_evento
  from public.rastreamento_eventos e
  where e.contato_id = p_contato_id
    and e.conversa_protocolo_id is null
    and public.rastreamento_classificacao_evento(
      e.tipo,
      e.metadata_json
    ) is not null
  order by e.ocorrido_em desc, e.created_at desc, e.id desc
  limit 1;

  v_classificacao := case
    when v_evento.classificacao in ('convertido', 'perdido')
      then v_evento.classificacao
    else 'qualificado'
  end;

  v_status_lead := case
    when v_classificacao = 'convertido' then 'cliente'
    else v_classificacao
  end;

  update public.contatos
  set
    classificacao = v_classificacao,
    status_lead = v_status_lead,
    classificacao_atualizada_em = coalesce(v_evento.ocorrido_em, now()),
    classificacao_evento_id = v_evento.id,
    classificacao_protocolo_id = null,
    updated_at = now()
  where id = p_contato_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.crmar_lead_enfileirar_mensagem()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_ativo boolean;
begin
  if new.remetente_tipo <> 'contato' or new.conversa_id is null then return new; end if;
  if new.created_at < now() - interval '1 day'
    or coalesce(new.metadata_json->>'historico_importado','false')='true'
    or new.origem in ('historico_coexistence','coexistence_history') then return new; end if;
  select coalesce(classificacao_automatica_ativa,true) into v_ativo
    from public.configuracoes_empresa where empresa_id=new.empresa_id;
  if v_ativo is false then return new; end if;
  -- Evita até mesmo gerar trabalho e consumo de IA em mensagens de pós-venda.
  if exists (
    select 1 from public.conversas c
    join public.contatos ct on ct.id=c.contato_id and ct.empresa_id=c.empresa_id
    where c.id=new.conversa_id and c.empresa_id=new.empresa_id
      and ct.classificacao='convertido'
  ) then return new; end if;
  insert into public.lead_classificacao_pendencias(empresa_id,conversa_id,mensagem_id)
    values(new.empresa_id,new.conversa_id,new.id)
    on conflict (mensagem_id) do nothing;
  return new;
end;
$function$
;
