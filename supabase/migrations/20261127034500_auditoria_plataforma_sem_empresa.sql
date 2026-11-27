
-- Eventos globais e provisionamento sem empresa: auditoria isolada da plataforma.
-- Nao expor ao tenant pelo Data API.
create table if not exists public.logs_auditoria_plataforma (
  id uuid primary key default gen_random_uuid(),
  categoria text not null,
  entidade text not null,
  entidade_id uuid not null,
  acao text not null,
  usuario_id uuid,
  antes jsonb,
  depois jsonb,
  detalhes jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists logs_auditoria_plataforma_recente_idx on public.logs_auditoria_plataforma (created_at desc);
alter table public.logs_auditoria_plataforma enable row level security;
revoke all on public.logs_auditoria_plataforma from PUBLIC,anon,authenticated;
grant select,insert,update,delete on public.logs_auditoria_plataforma to service_role;

CREATE OR REPLACE FUNCTION public.crm_auditoria_mutacao_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
  v_doc jsonb;
  v_empresa_id uuid;
  v_entidade_id uuid;
  v_ator_id uuid;
  v_ator_nome text;
  v_actor_hint uuid;
  v_ant jsonb := '{}'::jsonb;
  v_dep jsonb := '{}'::jsonb;
  v_campos text[] := '{}'::text[];
  v_todos text[];
  v_col text;
  v_categoria text;
  v_lista text;
  v_operacao text;
  v_chave text;
  v_fallback text;
  v_autor_origem text;
begin
  if TG_OP = 'INSERT' then
    v_new := to_jsonb(NEW);
    v_doc := v_new;
  elsif TG_OP = 'DELETE' then
    v_old := to_jsonb(OLD);
    v_doc := v_old;
  else
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_doc := v_new;
  end if;

  v_categoria := coalesce(nullif(TG_ARGV[0],''),'sistema');
  v_lista := coalesce(nullif(TG_ARGV[1],''),'*');
  if v_lista='*' then
    select coalesce(array_agg(k),array[]::text[]) into v_todos
    from jsonb_object_keys(v_doc || v_old) k;
  else
    v_todos := string_to_array(v_lista,',');
  end if;

  foreach v_col in array v_todos loop
    if v_col = any(array['id','empresa_id','created_at','updated_at','criado_em','atualizado_em','updated_by','created_by','ultima_sincronizacao_em','sync_at','last_sync_at'])
    then continue; end if;
    if not (v_doc ? v_col or v_old ? v_col) then continue; end if;
    if TG_OP='UPDATE' and v_old->v_col is not distinct from v_new->v_col then
      continue;
    end if;
    if TG_OP='INSERT' and (v_new->v_col is null or v_new->v_col='null'::jsonb) then
      continue;
    end if;
    v_campos := array_append(v_campos,v_col);
    if TG_OP <> 'INSERT' then
      v_ant := v_ant || jsonb_build_object(v_col,
        case when TG_TABLE_NAME='contato_informacoes_captura'
                       and v_col in ('valor','valor_normalizado')
                  and v_old->v_col is not null and v_old->v_col <> 'null'::jsonb
             then to_jsonb('[valor de contato protegido]'::text)
             else public.crm_auditoria_valor_seguro_v2(v_col,v_old->v_col) end);
    end if;
    if TG_OP <> 'DELETE' then
      v_dep := v_dep || jsonb_build_object(v_col,
        case when TG_TABLE_NAME='contato_informacoes_captura'
                       and v_col in ('valor','valor_normalizado')
                  and v_new->v_col is not null and v_new->v_col <> 'null'::jsonb
             then to_jsonb('[valor de contato protegido]'::text)
             else public.crm_auditoria_valor_seguro_v2(v_col,v_new->v_col) end);
    end if;
  end loop;

  if TG_OP='UPDATE' and coalesce(array_length(v_campos,1),0)=0 then return NEW; end if;

  -- Empresa gestora de white-label e/ou tenant normal; nunca mistura tenants.
  -- Planos globais repercutem em cada empresa vinculada ao plano.
  -- Sem cliente afetado, a futura vinculacao sera auditada no cadastro da empresa.
  if TG_TABLE_NAME='planos' then
    v_entidade_id := (v_doc->>'id')::uuid;
    for v_empresa_id in
      select e.id from public.empresas e where e.plano_id=v_entidade_id
    loop
      select u.id,u.nome into v_ator_id,v_ator_nome from public.usuarios u
      where u.id=auth.uid() and u.empresa_id=v_empresa_id limit 1;
      insert into public.logs_auditoria
      (empresa_id,categoria,entidade,entidade_id,acao,descricao,usuario_id,usuario_nome,antes,depois,detalhes,metadata)
      values(v_empresa_id,'financeiro','planos',v_entidade_id,
        case TG_OP when 'INSERT' then 'registro_criado' when 'DELETE' then 'registro_excluido' else 'registro_alterado' end,
        'Alteracao em plano global: '||array_to_string(v_campos,', '),
        v_ator_id,v_ator_nome,nullif(v_ant,'{}'::jsonb),nullif(v_dep,'{}'::jsonb),
        jsonb_build_object('campos_alterados',to_jsonb(v_campos),'tabela','planos'),
        jsonb_build_object('origem','auditoria_nativa_v2','escopo','plano_global_compartilhado'));
    end loop;
    if TG_OP='DELETE' then return OLD; end if;
    return NEW;
  end if;
  if TG_TABLE_NAME='empresas' then
    v_empresa_id := (v_doc->>'id')::uuid;
  elsif TG_TABLE_NAME='white_labels' then
    v_empresa_id := nullif(v_doc->>'empresa_gestora_id','')::uuid;
  elsif TG_TABLE_NAME='white_label_administradores' then
    select wl.empresa_gestora_id into v_empresa_id
      from public.white_labels wl
      where wl.id = nullif(v_doc->>'white_label_id','')::uuid;
  elsif TG_TABLE_NAME='imobiliario_integracoes_leads_visibilidade' then
    v_empresa_id := nullif(v_doc->>'empresa_visualizadora_id','')::uuid;
  elsif TG_TABLE_NAME='perfil_permissoes' then
    select pf.empresa_id into v_empresa_id
      from public.perfis_empresa pf
      where pf.id = nullif(v_doc->>'perfil_empresa_id','')::uuid;
  elsif TG_TABLE_NAME in ('usuarios_perfis','usuarios_setores','usuario_permissoes') then
    v_empresa_id := nullif(v_doc->>'empresa_id','')::uuid;
    if v_empresa_id is null then
      select u.empresa_id into v_empresa_id from public.usuarios u
      where u.id=nullif(v_doc->>'usuario_id','')::uuid;
    end if;
  else
    v_empresa_id := nullif(v_doc->>'empresa_id','')::uuid;
  end if;

  -- Excepcao segura: sem empresa vinculada, nao atrelar a empresa alheia.
  if v_empresa_id is null then
    -- Operacoes globais/transitorias nao pertencem ao log de outra empresa.
    -- Nunca impedir pagamentos, cadastros ou exclusoes por cascata.
    v_entidade_id := coalesce(nullif(v_doc->>'id','')::uuid,
      md5(TG_TABLE_NAME || ':' || v_doc::text)::uuid);
    insert into public.logs_auditoria_plataforma
    (categoria,entidade,entidade_id,acao,usuario_id,antes,depois,detalhes,metadata)
    values (v_categoria,TG_TABLE_NAME,v_entidade_id,
      case TG_OP when 'INSERT' then 'registro_criado'
        when 'DELETE' then 'registro_excluido' else 'registro_alterado' end,
      auth.uid(),nullif(v_ant,'{}'::jsonb),nullif(v_dep,'{}'::jsonb),
      jsonb_build_object('campos_alterados',to_jsonb(v_campos),'tabela',TG_TABLE_NAME),
      jsonb_build_object('origem','auditoria_nativa_v2','escopo','plataforma_sem_empresa'));
    if TG_OP='DELETE' then return OLD; end if;
    return NEW;
  end if;

  if v_doc ? 'id' and v_doc->>'id' is not null then
    v_entidade_id := (v_doc->>'id')::uuid;
    v_chave := v_doc->>'id';
  else
    -- Tabelas com PK composta usam identificador estavel, nao UUID arbitrario.
    v_chave := concat_ws(':',coalesce(v_doc->>'codigo',''),coalesce(v_doc->>'plano_codigo',''),
      coalesce(v_doc->>'modelo_id',''),coalesce(v_doc->>'categoria',''),
      coalesce(v_doc->>'faixa_id',''),coalesce(v_doc->>'usuario_id',''),
      coalesce(v_doc->>'tipo',''),coalesce(v_doc->>'item_id',''),
      coalesce(v_doc->>'codigo_fipe',''),coalesce(v_doc->>'nome',''));
    v_entidade_id := md5(TG_TABLE_NAME || ':' || v_empresa_id::text || ':' || v_chave)::uuid;
  end if;

  v_actor_hint := null;
  if v_doc ? 'updated_by' and v_doc->>'updated_by' is not null then
    begin v_actor_hint := (v_doc->>'updated_by')::uuid; exception when invalid_text_representation then null; end;
  elsif TG_OP='INSERT' and v_doc ? 'created_by' and v_doc->>'created_by' is not null then
    begin v_actor_hint := (v_doc->>'created_by')::uuid; exception when invalid_text_representation then null; end;
  end if;

  select u.id,u.nome into v_ator_id,v_ator_nome
  from public.usuarios u
  where u.empresa_id=v_empresa_id and u.id=coalesce(auth.uid(),v_actor_hint)
  limit 1;
  v_autor_origem := case when v_ator_id is not null then 'usuario_identificado' else 'sistema_api' end;
  v_operacao := case TG_OP when 'INSERT' then 'registro_criado'
    when 'DELETE' then 'registro_excluido' else 'registro_alterado' end;

  insert into public.logs_auditoria (
    empresa_id, categoria, entidade, entidade_id, acao, descricao,
    usuario_id, usuario_nome, antes, depois, detalhes, metadata
  )
  values(
    v_empresa_id,v_categoria,TG_TABLE_NAME,v_entidade_id,v_operacao,
    TG_TABLE_NAME || ': ' || array_to_string(v_campos,', '),
    v_ator_id,v_ator_nome,
    nullif(v_ant,'{}'::jsonb),nullif(v_dep,'{}'::jsonb),
    jsonb_build_object('campos_alterados',to_jsonb(v_campos),
      'operacao',TG_OP,'tabela',TG_TABLE_NAME,'chave_registro',v_chave),
    jsonb_build_object('origem','auditoria_nativa_v2','ator',v_autor_origem)
  );
  if TG_OP='DELETE' then return OLD; end if;
  return NEW;
end;
$function$;
