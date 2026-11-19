-- Evita reclassificar retroativamente atendimentos antigos. A regra de 23h
-- acompanha somente novas atividades após a implantação da classificação.
create or replace function public.crmar_lead_classificar_inativos(p_limite integer default 100)
returns table(empresa_id uuid,contato_id uuid,conversa_id uuid)
language plpgsql security definer set search_path=public,pg_temp as $$
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
$$;

