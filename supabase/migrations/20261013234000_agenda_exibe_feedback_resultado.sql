-- Expõe no carregamento da Agenda quando o resultado do atendimento já foi respondido.
-- Usado apenas para sinalização visual de resultado pendente/registrado no calendário.

create or replace function public.agenda_etapa1_listar_base(
  p_agenda_id uuid,
  p_inicio timestamp with time zone,
  p_fim timestamp with time zone
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_usuario_id uuid;
  v_empresa_id uuid;
  v_agendamentos jsonb;
  v_tipos jsonb;
  v_responsaveis jsonb;
begin
  select u.id,u.empresa_id into v_usuario_id,v_empresa_id
  from public.usuarios u
  where u.auth_user_id=auth.uid() and u.status='ativo' and u.empresa_id is not null
  limit 1;

  if v_usuario_id is null or v_empresa_id is null then
    raise exception 'Usuário não autenticado ou sem empresa ativa.' using errcode='42501';
  end if;

  if not exists(
    select 1
    from public.agenda_calendarios a
    where a.id=p_agenda_id and a.empresa_id=v_empresa_id
  ) then
    raise exception 'Agenda não encontrada.' using errcode='P0002';
  end if;

  perform public.agenda_etapa1_assegurar_tipos_padrao(v_empresa_id,v_usuario_id);

  select coalesce(jsonb_agg(to_jsonb(item) order by item.inicio_at),'[]'::jsonb)
  into v_agendamentos
  from (
    select
      a.id,a.empresa_id,a.agenda_id,a.contato_id,a.conversa_id,a.titulo,
      a.nome_cliente,a.telefone_cliente,a.email_cliente,a.inicio_at,a.fim_at,
      a.status,a.origem,a.observacoes,a.metadata_json,a.tipo_id,a.responsavel_id,
      a.local,a.link_reuniao,a.cor,a.prioridade,a.confirmacao_status,a.resultado,
      a.observacoes_internas,a.concluido_em,a.cancelado_em,a.feedback_respondido_em,
      a.created_at,a.updated_at,
      case when c.id is null then null else jsonb_build_object(
        'id',c.id,'nome',c.nome,'telefone',c.telefone,'email',c.email,
        'empresa',c.empresa,'classificacao',c.classificacao,'status_lead',c.status_lead,
        'ultima_interacao_at',c.ultima_interacao_at
      ) end as contato,
      case when r.id is null then null else jsonb_build_object(
        'id',r.id,'nome',r.nome,'email',r.email,'avatar_url',r.avatar_url
      ) end as responsavel,
      case when t.id is null then null else jsonb_build_object(
        'id',t.id,'nome',t.nome,'cor',t.cor,'icone',t.icone
      ) end as tipo,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',v.id,'entidade_tipo',v.entidade_tipo,'entidade_id',v.entidade_id,
          'papel',v.papel,'titulo',v.titulo,'subtitulo',v.subtitulo,
          'imagem_url',v.imagem_url,'principal',v.principal,'dados_json',v.dados_json
        ) order by v.principal desc,v.created_at)
        from public.agenda_vinculos v
        where v.empresa_id=v_empresa_id and v.agendamento_id=a.id
      ),'[]'::jsonb) as vinculos,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',p.id,'usuario_id',p.usuario_id,'contato_id',p.contato_id,
          'nome',p.nome,'email',p.email,'telefone',p.telefone,'papel',p.papel,
          'tipo',p.tipo,'status',p.status
        ) order by p.created_at)
        from public.agenda_participantes p
        where p.empresa_id=v_empresa_id and p.agendamento_id=a.id
      ),'[]'::jsonb) as participantes,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',l.id,'canal',l.canal,'antecedencia_minutos',l.antecedencia_minutos,
          'destinatario_tipo',l.destinatario_tipo,'ativo',l.ativo,'status',l.status,
          'agendado_para',l.agendado_para,'enviado_em',l.enviado_em,'erro',l.erro
        ) order by l.antecedencia_minutos desc,l.created_at)
        from public.agenda_lembretes l
        where l.empresa_id=v_empresa_id and l.agendamento_id=a.id
      ),'[]'::jsonb) as lembretes,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',h.id,'usuario_id',h.usuario_id,'usuario_nome',hu.nome,
          'acao',h.acao,'descricao',h.descricao,'status_anterior',h.status_anterior,
          'status_novo',h.status_novo,'created_at',h.created_at
        ) order by h.created_at desc)
        from (
          select * from public.agenda_historico hh
          where hh.empresa_id=v_empresa_id and hh.agendamento_id=a.id
          order by hh.created_at desc limit 30
        ) h
        left join public.usuarios hu on hu.id=h.usuario_id
      ),'[]'::jsonb) as historico
    from public.agenda_agendamentos a
    left join public.contatos c on c.id=a.contato_id and c.empresa_id=v_empresa_id
    left join public.usuarios r on r.id=a.responsavel_id and r.empresa_id=v_empresa_id
    left join public.agenda_tipos t on t.id=a.tipo_id and t.empresa_id=v_empresa_id
    where a.empresa_id=v_empresa_id and a.agenda_id=p_agenda_id
      and a.inicio_at<p_fim and a.fim_at>p_inicio
  ) item;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'nome',t.nome,'descricao',t.descricao,'cor',t.cor,'icone',t.icone,
    'ativo',t.ativo,'ordem',t.ordem,'padrao',t.padrao
  ) order by t.ordem,t.nome),'[]'::jsonb)
  into v_tipos
  from public.agenda_tipos t
  where t.empresa_id=v_empresa_id and t.ativo=true;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',u.id,'nome',u.nome,'email',u.email,'avatar_url',u.avatar_url
  ) order by u.nome),'[]'::jsonb)
  into v_responsaveis
  from public.usuarios u
  where u.empresa_id=v_empresa_id and u.status='ativo';

  return jsonb_build_object(
    'usuario_atual_id',v_usuario_id,
    'empresa_id',v_empresa_id,
    'agendamentos',v_agendamentos,
    'tipos',v_tipos,
    'responsaveis',v_responsaveis
  );
end;
$function$;
