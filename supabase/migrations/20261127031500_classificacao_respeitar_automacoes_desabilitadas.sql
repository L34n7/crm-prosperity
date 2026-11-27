-- Não classificar automaticamente contatos com "Desabilitar automações":
-- respeita o escopo global e também o contato dentro da integração WhatsApp.
-- Preserve as restrições anteriores de convertidos, o início da regra de
-- inatividade em 19/11/2026 e os demais casos protegidos.
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
  -- Não enfileirar mensagens de contatos convertidos ou com automações
  -- desabilitadas (globalmente ou apenas na integração desta conversa).
  if exists (
    select 1 from public.conversas c
    join public.contatos ct on ct.id=c.contato_id and ct.empresa_id=c.empresa_id
    left join public.contato_automacoes_integracoes ci
      on ci.empresa_id=c.empresa_id and ci.contato_id=c.contato_id
      and ci.integracao_whatsapp_id=c.integracao_whatsapp_id
    where c.id=new.conversa_id and c.empresa_id=new.empresa_id
      and (
        ct.classificacao='convertido'
        or coalesce(ct.automacoes_desabilitadas,false)
        or coalesce(ci.desabilitadas,false)
      )
  ) then return new; end if;
  insert into public.lead_classificacao_pendencias(empresa_id,conversa_id,mensagem_id)
    values(new.empresa_id,new.conversa_id,new.id)
    on conflict (mensagem_id) do nothing;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.crmar_lead_classificar_inativos(p_limite integer DEFAULT 100)
 RETURNS TABLE(empresa_id uuid, contato_id uuid, conversa_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform set_config('crm.classificacao_origem','inatividade',true);
  perform set_config('crm.classificacao_motivo','Sem resposta apos o prazo configurado',true);
  perform set_config('crm.classificacao_conversa_id','',true);
  perform set_config('crm.classificacao_mensagem_id','',true);
  perform set_config('crm.classificacao_valor','',true);
  return query
    with candidatos as (
      select ct.id as contato_id, ct.empresa_id, c.id as conversa_id
      from public.conversas c
      join public.contatos ct on ct.id=c.contato_id and ct.empresa_id=c.empresa_id
      left join public.configuracoes_empresa ce on ce.empresa_id=c.empresa_id
      left join public.contato_automacoes_integracoes ci
        on ci.empresa_id=c.empresa_id and ci.contato_id=c.contato_id
        and ci.integracao_whatsapp_id=c.integracao_whatsapp_id
      join lateral (
        select m.remetente_tipo,m.created_at
        from public.mensagens m
        where m.conversa_id=c.id and m.empresa_id=c.empresa_id
        order by m.created_at desc,m.id desc limit 1
      ) ultima on true
      where c.status in ('aberta','bot','fila','em_atendimento','aguardando_cliente')
        and c.last_message_at is not null
        and c.last_message_at < now()-make_interval(hours=>coalesce(ce.classificacao_inatividade_horas,23))
        and ultima.remetente_tipo <> 'contato'
        and ultima.created_at >= timestamptz '2026-11-19 23:00:00+00'
        and ultima.created_at < now()-make_interval(hours=>coalesce(ce.classificacao_inatividade_horas,23))
        and coalesce(ce.classificacao_automatica_ativa,true)=true
        and not coalesce(ct.automacoes_desabilitadas,false)
        and not coalesce(ci.desabilitadas,false)
        and ct.classificacao in ('novo','qualificado')
      order by c.last_message_at asc
      limit least(greatest(p_limite,1),150)
      for update of ct skip locked
    ), atualizados as (
      update public.contatos ct set
        classificacao='perdido',
        classificacao_atualizada_em=now(),
        status_lead='perdido',
        updated_at=now()
      from candidatos v
      where ct.id=v.contato_id and ct.empresa_id=v.empresa_id
        and ct.classificacao in ('novo','qualificado')
      returning ct.id,ct.empresa_id
    )
    select v.empresa_id,v.contato_id,v.conversa_id
    from candidatos v join atualizados a on a.id=v.contato_id and a.empresa_id=v.empresa_id;
end;
$function$;


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

  -- Checagem final dentro da transação: o operador pode ter desabilitado
  -- as automações após o processamento começar e antes do RPC ser chamado.
  if p_origem in ('ia','regra','automatica') and p_conversa_id is not null and exists (
    select 1 from public.conversas c
    join public.contatos ct on ct.id=c.contato_id and ct.empresa_id=c.empresa_id
    left join public.contato_automacoes_integracoes ci
      on ci.empresa_id=c.empresa_id and ci.contato_id=c.contato_id
      and ci.integracao_whatsapp_id=c.integracao_whatsapp_id
    where c.empresa_id=p_empresa_id and c.id=p_conversa_id
      and c.contato_id=p_contato_id
      and (coalesce(ct.automacoes_desabilitadas,false)
        or coalesce(ci.desabilitadas,false))
  ) then return false; end if;

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
$function$;


-- Apenas altera a apresentação do nicho; o código seguro_veicular não muda.
UPDATE public.nichos
SET nome = 'Proteção veicular'
WHERE codigo = 'seguro_veicular'
  AND nome IS DISTINCT FROM 'Proteção veicular';
