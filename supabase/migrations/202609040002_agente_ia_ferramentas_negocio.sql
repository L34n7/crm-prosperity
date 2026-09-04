-- Separa as capacidades de negócio do Agente IA em permissões/ferramentas independentes.
alter table public.agente_ia_ferramentas drop constraint if exists agente_ia_ferramentas_tipo_check;
alter table public.agente_ia_ferramentas add constraint agente_ia_ferramentas_tipo_check check (
  tipo = any (array[
    'consultar_conhecimento'::text,'consultar_agenda'::text,'criar_agendamento'::text,
    'remarcar_agendamento'::text,'cancelar_agendamento'::text,'consultar_contato'::text,
    'transferir_humano'::text,'consultar_produtos_estoque'::text,'informar_valor_produto'::text,
    'consultar_servicos'::text,'consultar_imoveis'::text,'registrar_interesse_preferencia'::text,
    'realizar_venda'::text
  ])
);

create or replace function public.agente_ia_buscar_conhecimento(p_empresa_id uuid,p_agente_id uuid,p_consulta text,p_limite integer default 5)
returns table(id uuid,titulo text,categoria text,trecho text,rank real)
language sql stable set search_path to 'public' as $function$
  with termos as (
    select array(select termo from (select distinct termo from unnest(tsvector_to_array(to_tsvector('portuguese'::regconfig,coalesce(p_consulta,'')))) termo where length(termo)>=2 limit 32) relevantes) itens
  ), consulta as (
    select case when coalesce(cardinality(itens),0)=0 then null::tsquery else to_tsquery('portuguese'::regconfig,(select string_agg(quote_literal(item),' | ') from unnest(itens) item)) end q from termos
  ), documentos as (
    select c.*,c.search_vector || setweight(to_tsvector('portuguese'::regconfig,coalesce(array_to_string(c.palavras_chave,' '),'')),'A') vetor_busca
    from public.agente_ia_conhecimentos c where c.empresa_id=p_empresa_id and c.agente_id=p_agente_id and c.ativo=true
  )
  select d.id,d.titulo,d.categoria,left(d.conteudo,1600),case when c.q is null then 0::real else ts_rank_cd(d.vetor_busca,c.q) end
  from documentos d cross join consulta c
  where c.q is null or d.vetor_busca @@ c.q
  order by d.prioridade desc,(case when c.q is null then 0::real else ts_rank_cd(d.vetor_busca,c.q) end) desc,d.updated_at desc
  limit least(greatest(coalesce(p_limite,5),1),5);
$function$;

create or replace function public.agente_ia_consultar_produtos_estoque(p_empresa_id uuid,p_consulta text,p_limite integer default 5)
returns table(id uuid,nome text,sku text,codigo text,codigo_barras text,descricao text,unidade text,saldo_disponivel numeric,rank real)
language sql stable set search_path to 'public' as $function$
  with termos as (
    select array(select termo from (select distinct termo from unnest(tsvector_to_array(to_tsvector('portuguese'::regconfig,coalesce(p_consulta,'')))) termo where length(termo)>=2 limit 24) t) itens
  ), consulta as (
    select case when coalesce(cardinality(itens),0)=0 then null::tsquery else to_tsquery('portuguese'::regconfig,(select string_agg(quote_literal(i),' | ') from unnest(itens) i)) end q from termos
  ), saldos as (
    select s.estoque_item_id,sum(coalesce(s.saldo_fisico,0)-coalesce(s.saldo_reservado,0)) disponivel
    from public.estoque_saldos s where s.empresa_id=p_empresa_id group by s.estoque_item_id
  ), produtos as (
    select e.*,coalesce(s.disponivel,e.saldo,0) disponivel,to_tsvector('portuguese'::regconfig,concat_ws(' ',e.nome,e.sku,e.codigo,e.codigo_barras,e.descricao)) vetor
    from public.estoque_itens e left join saldos s on s.estoque_item_id=e.id where e.empresa_id=p_empresa_id and e.ativo=true
  )
  select p.id,p.nome,p.sku,p.codigo,p.codigo_barras,left(p.descricao,500),p.unidade,p.disponivel,
         case when c.q is null then 0::real else ts_rank_cd(p.vetor,c.q)::real end
  from produtos p cross join consulta c where c.q is null or p.vetor @@ c.q
  order by (case when c.q is null then 0::real else ts_rank_cd(p.vetor,c.q)::real end) desc,p.updated_at desc
  limit least(greatest(coalesce(p_limite,5),1),8);
$function$;

create or replace function public.agente_ia_informar_valor_produto(p_empresa_id uuid,p_consulta text,p_limite integer default 5)
returns table(id uuid,nome text,sku text,codigo text,unidade text,preco_venda numeric,rank real)
language sql stable set search_path to 'public' as $function$
  with termos as (
    select array(select termo from (select distinct termo from unnest(tsvector_to_array(to_tsvector('portuguese'::regconfig,coalesce(p_consulta,'')))) termo where length(termo)>=2 limit 24) t) itens
  ), consulta as (
    select case when coalesce(cardinality(itens),0)=0 then null::tsquery else to_tsquery('portuguese'::regconfig,(select string_agg(quote_literal(i),' | ') from unnest(itens) i)) end q from termos
  ), produtos as (
    select e.*,to_tsvector('portuguese'::regconfig,concat_ws(' ',e.nome,e.sku,e.codigo,e.codigo_barras,e.descricao)) vetor
    from public.estoque_itens e where e.empresa_id=p_empresa_id and e.ativo=true
  )
  select p.id,p.nome,p.sku,p.codigo,p.unidade,p.preco_venda,case when c.q is null then 0::real else ts_rank_cd(p.vetor,c.q)::real end
  from produtos p cross join consulta c where c.q is null or p.vetor @@ c.q
  order by (case when c.q is null then 0::real else ts_rank_cd(p.vetor,c.q)::real end) desc,p.updated_at desc
  limit least(greatest(coalesce(p_limite,5),1),8);
$function$;

create or replace function public.agente_ia_consultar_servicos(p_empresa_id uuid,p_consulta text,p_limite integer default 5)
returns table(id uuid,nome text,codigo text,categoria text,descricao text,unidade text,preco numeric,duracao_minutos integer,rank real)
language sql stable set search_path to 'public' as $function$
  with termos as (
    select array(select termo from (select distinct termo from unnest(tsvector_to_array(to_tsvector('portuguese'::regconfig,coalesce(p_consulta,'')))) termo where length(termo)>=2 limit 24) t) itens
  ), consulta as (
    select case when coalesce(cardinality(itens),0)=0 then null::tsquery else to_tsquery('portuguese'::regconfig,(select string_agg(quote_literal(i),' | ') from unnest(itens) i)) end q from termos
  ), servicos as (
    select s.*,to_tsvector('portuguese'::regconfig,concat_ws(' ',s.nome,s.codigo,s.categoria,s.descricao,s.tipo)) vetor
    from public.catalogo_servicos s where s.empresa_id=p_empresa_id and s.ativo=true
  )
  select s.id,s.nome,s.codigo,s.categoria,left(s.descricao,500),s.unidade,s.preco,s.duracao_minutos,case when c.q is null then 0::real else ts_rank_cd(s.vetor,c.q)::real end
  from servicos s cross join consulta c where c.q is null or s.vetor @@ c.q
  order by (case when c.q is null then 0::real else ts_rank_cd(s.vetor,c.q)::real end) desc,s.updated_at desc
  limit least(greatest(coalesce(p_limite,5),1),8);
$function$;

create or replace function public.agente_ia_consultar_imoveis(
  p_empresa_id uuid,p_consulta text default null,p_finalidade text default null,p_cidade text default null,p_bairro text default null,
  p_valor_maximo numeric default null,p_quartos_minimos integer default null,p_vagas_minimas integer default null,p_limite integer default 5
)
returns table(id uuid,titulo text,codigo text,tipo text,finalidade text,valor numeric,valor_condominio numeric,valor_iptu numeric,bairro text,cidade text,estado text,quartos integer,suites integer,banheiros integer,vagas integer,area_m2 numeric,descricao text,caracteristicas jsonb,fotos jsonb,rank real)
language sql stable set search_path to 'public' as $function$
  with termos as (
    select array(select termo from (select distinct termo from unnest(tsvector_to_array(to_tsvector('portuguese'::regconfig,coalesce(p_consulta,'')))) termo where length(termo)>=2 limit 24) t) itens
  ), consulta as (
    select case when coalesce(cardinality(itens),0)=0 then null::tsquery else to_tsquery('portuguese'::regconfig,(select string_agg(quote_literal(i),' | ') from unnest(itens) i)) end q from termos
  ), base as (
    select i.*,to_tsvector('portuguese'::regconfig,concat_ws(' ',i.titulo,i.codigo,i.tipo,i.finalidade,i.bairro,i.cidade,i.estado,i.descricao,i.caracteristicas::text)) vetor
    from public.imoveis i where i.empresa_id=p_empresa_id and lower(coalesce(i.status,''))='disponivel'
      and (nullif(trim(coalesce(p_finalidade,'')),'') is null or lower(i.finalidade)=lower(trim(p_finalidade)))
      and (nullif(trim(coalesce(p_cidade,'')),'') is null or i.cidade ilike '%'||trim(p_cidade)||'%')
      and (nullif(trim(coalesce(p_bairro,'')),'') is null or i.bairro ilike '%'||trim(p_bairro)||'%')
      and (p_valor_maximo is null or i.valor is null or i.valor<=p_valor_maximo)
      and (p_quartos_minimos is null or coalesce(i.quartos,0)>=p_quartos_minimos)
      and (p_vagas_minimas is null or coalesce(i.vagas,0)>=p_vagas_minimas)
  )
  select b.id,b.titulo,b.codigo,b.tipo,b.finalidade,b.valor,b.valor_condominio,b.valor_iptu,b.bairro,b.cidade,b.estado,b.quartos,b.suites,b.banheiros,b.vagas,b.area_m2,left(b.descricao,700),b.caracteristicas,b.fotos,
         case when c.q is null then 0::real else ts_rank_cd(b.vetor,c.q)::real end
  from base b cross join consulta c where c.q is null or b.vetor @@ c.q
  order by (case when c.q is null then 0::real else ts_rank_cd(b.vetor,c.q)::real end) desc,b.updated_at desc
  limit least(greatest(coalesce(p_limite,5),1),8);
$function$;

create or replace function public.agente_ia_registrar_interesse_preferencia(p_empresa_id uuid,p_agente_id uuid,p_conversa_id uuid,p_texto text)
returns table(registro_id uuid,numero integer,texto_registrado text)
language plpgsql security definer set search_path to 'public' as $function$
declare v_contato_id uuid; v_texto text; v_valor text; v_id uuid; v_numero integer; v_existente text;
begin
  if not exists(select 1 from public.agente_ia_ferramentas f where f.empresa_id=p_empresa_id and f.agente_id=p_agente_id and f.tipo='registrar_interesse_preferencia' and f.ativo=true) then return; end if;
  v_texto:=regexp_replace(trim(coalesce(p_texto,'')),'\s+',' ','g');
  v_texto:=regexp_replace(v_texto,'^interesse/preferências coletado pelo Agente IA\s*[:\-]?\s*','','i');
  v_texto:=left(trim(v_texto),180); if v_texto='' then return; end if;
  select c.contato_id into v_contato_id from public.conversas c join public.agentes_ia a on a.id=p_agente_id and a.empresa_id=p_empresa_id where c.id=p_conversa_id and c.empresa_id=p_empresa_id limit 1;
  if v_contato_id is null then raise exception 'Conversa, contato ou agente inválido para a empresa.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_empresa_id::text||':'||v_contato_id::text||':observacoes_capturadas',0));
  v_valor:='interesse/preferências coletado pelo Agente IA: '||v_texto;
  select cic.id,cic.sequencia,cic.valor into v_id,v_numero,v_existente from public.contato_informacoes_captura cic where cic.empresa_id=p_empresa_id and cic.contato_id=v_contato_id and cic.ativo=true and cic.variavel_origem='agente_ia_interesse_preferencia' and lower(trim(coalesce(cic.valor,'')))=lower(v_valor) order by cic.capturado_em desc limit 1;
  if v_id is not null then return query select v_id,v_numero,v_existente; return; end if;
  select coalesce(max(cic.sequencia),0)+1 into v_numero from public.contato_informacoes_captura cic where cic.contato_id=v_contato_id and cic.tipo='texto';
  insert into public.contato_informacoes_captura(empresa_id,contato_id,conversa_id,tipo,nome_campo,sequencia,valor,variavel_origem,ativo,metadata_json)
  values(p_empresa_id,v_contato_id,p_conversa_id,'texto','OBSERVAÇÕES CAPTURADAS',v_numero,v_valor,'agente_ia_interesse_preferencia',true,jsonb_build_object('origem','agente_ia','agente_id',p_agente_id,'tipo_registro','interesse_preferencia')) returning id into v_id;
  return query select v_id,v_numero,v_valor;
end;$function$;

create or replace function public.agente_ia_capturar_interesses_estado()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_interesse text; v_estado_anterior jsonb:='{}'::jsonb;
begin
  if not exists(select 1 from public.agente_ia_ferramentas f where f.empresa_id=new.empresa_id and f.agente_id=new.agente_id and f.tipo='registrar_interesse_preferencia' and f.ativo=true) then return new; end if;
  if tg_op='UPDATE' then v_estado_anterior:=coalesce(old.estado_json,'{}'::jsonb); end if;
  for v_interesse in select trim(novo.valor) from jsonb_array_elements_text(coalesce(new.estado_json->'interesses','[]'::jsonb)) novo(valor) where nullif(trim(novo.valor),'') is not null and not exists(select 1 from jsonb_array_elements_text(coalesce(v_estado_anterior->'interesses','[]'::jsonb)) anterior(valor) where lower(trim(anterior.valor))=lower(trim(novo.valor))) loop
    perform public.agente_ia_registrar_interesse_preferencia(new.empresa_id,new.agente_id,new.conversa_id,v_interesse);
  end loop;
  return new;
end;$function$;

create or replace function public.agente_ia_realizar_venda(p_empresa_id uuid,p_agente_id uuid,p_conversa_id uuid,p_itens jsonb,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_contato_id uuid; v_item jsonb; v_produto public.estoque_itens%rowtype; v_quantidade numeric; v_deposito_id uuid; v_itens_normalizados jsonb:='[]'::jsonb; v_documento_id uuid; v_documento record; v_existente uuid;
begin
  if not exists(select 1 from public.agente_ia_ferramentas f where f.empresa_id=p_empresa_id and f.agente_id=p_agente_id and f.tipo='realizar_venda' and f.ativo=true) then raise exception 'Ferramenta de venda não habilitada para este agente.'; end if;
  if jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens)=0 or jsonb_array_length(p_itens)>10 then raise exception 'Informe de 1 a 10 itens para a venda.'; end if;
  if nullif(trim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'Chave de idempotência obrigatória.'; end if;
  select c.contato_id into v_contato_id from public.conversas c join public.agentes_ia a on a.id=p_agente_id and a.empresa_id=p_empresa_id where c.id=p_conversa_id and c.empresa_id=p_empresa_id limit 1;
  if v_contato_id is null then raise exception 'Conversa, contato ou agente inválido para a empresa.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_empresa_id::text||':'||p_idempotency_key,0));
  select d.id into v_existente from public.comercial_documentos d where d.empresa_id=p_empresa_id and d.idempotency_key=p_idempotency_key limit 1;
  if v_existente is not null then select d.id,d.numero,d.status,d.total into v_documento from public.comercial_documentos d where d.id=v_existente; return jsonb_build_object('ok',true,'idempotente',true,'documento_id',v_documento.id,'numero',v_documento.numero,'status',v_documento.status,'total',v_documento.total); end if;
  for v_item in select value from jsonb_array_elements(p_itens) loop
    if nullif(v_item->>'estoque_item_id','') is null then raise exception 'Produto da venda não informado.'; end if;
    v_quantidade:=greatest(0,coalesce((v_item->>'quantidade')::numeric,0)); if v_quantidade<=0 then raise exception 'Quantidade inválida para a venda.'; end if;
    select * into v_produto from public.estoque_itens e where e.empresa_id=p_empresa_id and e.id=(v_item->>'estoque_item_id')::uuid and e.ativo=true for share;
    if not found then raise exception 'Produto inválido ou inativo.'; end if;
    if v_produto.preco_venda is null or v_produto.preco_venda<0 then raise exception 'Produto % está sem preço de venda válido.',v_produto.nome; end if;
    select d.id into v_deposito_id from public.estoque_depositos d join (select s.deposito_id,sum(coalesce(s.saldo_fisico,0)-coalesce(s.saldo_reservado,0)) disponivel from public.estoque_saldos s left join public.estoque_lotes l on l.id=s.lote_id where s.empresa_id=p_empresa_id and s.estoque_item_id=v_produto.id and coalesce(l.bloqueado,false)=false and (l.validade is null or l.validade>=current_date) group by s.deposito_id) saldo on saldo.deposito_id=d.id and saldo.disponivel>=v_quantidade where d.empresa_id=p_empresa_id and d.ativo=true order by d.principal desc,saldo.disponivel desc,d.created_at asc limit 1;
    if v_deposito_id is null then raise exception 'Saldo disponível insuficiente para %.',v_produto.nome; end if;
    v_itens_normalizados:=v_itens_normalizados||jsonb_build_array(jsonb_build_object('estoque_item_id',v_produto.id,'quantidade',v_quantidade,'deposito_id',v_deposito_id));
  end loop;
  v_documento_id:=public.comercial_salvar_documento(p_empresa_id,null,'pedido_venda',null,v_contato_id,null,current_date,null,null,0,0,0,'Pedido criado pelo Agente IA '||p_agente_id::text,v_itens_normalizados,null);
  update public.comercial_documentos set idempotency_key=p_idempotency_key,observacao='Pedido criado automaticamente pelo Agente IA',updated_at=now() where empresa_id=p_empresa_id and id=v_documento_id;
  perform public.comercial_reservar_pedido(p_empresa_id,v_documento_id,null);
  select d.id,d.numero,d.status,d.total into v_documento from public.comercial_documentos d where d.id=v_documento_id;
  return jsonb_build_object('ok',true,'idempotente',false,'documento_id',v_documento.id,'numero',v_documento.numero,'status',v_documento.status,'total',v_documento.total,'itens',(select coalesce(jsonb_agg(jsonb_build_object('estoque_item_id',i.estoque_item_id,'descricao',i.descricao,'quantidade',i.quantidade,'unidade',i.unidade,'valor_unitario',i.valor_unitario,'total',i.total) order by i.created_at),'[]'::jsonb) from public.comercial_documento_itens i where i.empresa_id=p_empresa_id and i.documento_id=v_documento_id));
end;$function$;

revoke all on function public.agente_ia_consultar_produtos_estoque(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.agente_ia_informar_valor_produto(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.agente_ia_consultar_servicos(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.agente_ia_consultar_imoveis(uuid,text,text,text,text,numeric,integer,integer,integer) from public,anon,authenticated;
revoke all on function public.agente_ia_registrar_interesse_preferencia(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.agente_ia_realizar_venda(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.agente_ia_consultar_produtos_estoque(uuid,text,integer) to service_role;
grant execute on function public.agente_ia_informar_valor_produto(uuid,text,integer) to service_role;
grant execute on function public.agente_ia_consultar_servicos(uuid,text,integer) to service_role;
grant execute on function public.agente_ia_consultar_imoveis(uuid,text,text,text,text,numeric,integer,integer,integer) to service_role;
grant execute on function public.agente_ia_registrar_interesse_preferencia(uuid,uuid,uuid,text) to service_role;
grant execute on function public.agente_ia_realizar_venda(uuid,uuid,uuid,jsonb,text) to service_role;