-- Amplia a ferramenta existente de conhecimento do Agente IA com dados operacionais
-- do próprio tenant e registra interesses/preferências coletados no contato.

create or replace function public.agente_ia_buscar_conhecimento(
  p_empresa_id uuid,
  p_agente_id uuid,
  p_consulta text,
  p_limite integer default 5
)
returns table(
  id uuid,
  titulo text,
  categoria text,
  trecho text,
  rank real
)
language sql
stable
set search_path to 'public'
as $function$
  with termos as (
    select array(
      select termo
      from (
        select distinct termo
        from unnest(
          tsvector_to_array(
            to_tsvector('portuguese'::regconfig, coalesce(p_consulta, ''))
          )
        ) as termo
        where length(termo) >= 2
        limit 32
      ) relevantes
    ) as itens
  ), consulta as (
    select case
      when coalesce(cardinality(itens), 0) = 0 then null::tsquery
      else to_tsquery(
        'portuguese'::regconfig,
        (select string_agg(quote_literal(item), ' | ') from unnest(itens) as item)
      )
    end as q
    from termos
  ), documentos as (
    select
      c.*,
      c.search_vector || setweight(
        to_tsvector(
          'portuguese'::regconfig,
          coalesce(array_to_string(c.palavras_chave, ' '), '')
        ),
        'A'
      ) as vetor_busca
    from public.agente_ia_conhecimentos c
    where c.empresa_id = p_empresa_id
      and c.agente_id = p_agente_id
      and c.ativo = true
  ), conhecimento as (
    select
      d.id,
      d.titulo,
      d.categoria,
      left(d.conteudo, 1600) as trecho,
      case
        when consulta.q is null then 0::real
        else ts_rank_cd(d.vetor_busca, consulta.q)::real
      end as rank,
      coalesce(d.prioridade, 0)::integer as prioridade_ordenacao,
      d.updated_at
    from documentos d
    cross join consulta
    where consulta.q is null or d.vetor_busca @@ consulta.q
  ), produtos_estoque as (
    select
      e.id,
      e.nome as titulo,
      'produto_estoque'::text as categoria,
      left(
        concat_ws(
          ' | ',
          'DADO ATUAL DO ESTOQUE',
          'Produto: ' || e.nome,
          case when nullif(trim(coalesce(e.sku, '')), '') is not null then 'SKU: ' || e.sku end,
          case when nullif(trim(coalesce(e.codigo, '')), '') is not null then 'Código: ' || e.codigo end,
          case when nullif(trim(coalesce(e.codigo_barras, '')), '') is not null then 'Código de barras: ' || e.codigo_barras end,
          case when nullif(trim(coalesce(e.descricao, '')), '') is not null then 'Descrição: ' || e.descricao end,
          'Saldo atual: ' || coalesce(e.saldo::text, '0') || ' ' || coalesce(nullif(e.unidade, ''), 'un'),
          case when e.preco_venda is not null then 'Preço de venda atual: R$ ' || e.preco_venda::text else 'Preço de venda: não cadastrado' end
        ),
        1600
      ) as trecho,
      ts_rank_cd(
        to_tsvector(
          'portuguese'::regconfig,
          concat_ws(
            ' ',
            e.nome,
            e.sku,
            e.codigo,
            e.codigo_barras,
            e.descricao
          )
        ),
        consulta.q
      )::real as rank,
      90 as prioridade_ordenacao,
      e.updated_at
    from public.estoque_itens e
    cross join consulta
    where e.empresa_id = p_empresa_id
      and e.ativo = true
      and consulta.q is not null
      and to_tsvector(
        'portuguese'::regconfig,
        concat_ws(' ', e.nome, e.sku, e.codigo, e.codigo_barras, e.descricao)
      ) @@ consulta.q
  ), servicos as (
    select
      s.id,
      s.nome as titulo,
      'servico'::text as categoria,
      left(
        concat_ws(
          ' | ',
          'DADO ATUAL DO SERVIÇO',
          'Serviço: ' || s.nome,
          case when nullif(trim(coalesce(s.codigo, '')), '') is not null then 'Código: ' || s.codigo end,
          case when nullif(trim(coalesce(s.categoria, '')), '') is not null then 'Categoria: ' || s.categoria end,
          case when nullif(trim(coalesce(s.descricao, '')), '') is not null then 'Descrição: ' || s.descricao end,
          'Preço atual: R$ ' || coalesce(s.preco::text, '0'),
          case when s.duracao_minutos is not null then 'Duração: ' || s.duracao_minutos::text || ' minutos' end
        ),
        1600
      ) as trecho,
      ts_rank_cd(
        to_tsvector(
          'portuguese'::regconfig,
          concat_ws(' ', s.nome, s.codigo, s.categoria, s.descricao, s.tipo)
        ),
        consulta.q
      )::real as rank,
      80 as prioridade_ordenacao,
      s.updated_at
    from public.catalogo_servicos s
    cross join consulta
    where s.empresa_id = p_empresa_id
      and s.ativo = true
      and consulta.q is not null
      and to_tsvector(
        'portuguese'::regconfig,
        concat_ws(' ', s.nome, s.codigo, s.categoria, s.descricao, s.tipo)
      ) @@ consulta.q
  ), imoveis_disponiveis as (
    select
      i.id,
      i.titulo,
      'imovel'::text as categoria,
      left(
        concat_ws(
          ' | ',
          'DADO ATUAL DO IMÓVEL',
          'Imóvel: ' || i.titulo,
          case when nullif(trim(coalesce(i.codigo, '')), '') is not null then 'Código: ' || i.codigo end,
          'Tipo: ' || coalesce(i.tipo, 'não informado'),
          'Finalidade: ' || coalesce(i.finalidade, 'não informada'),
          'Status: ' || coalesce(i.status, 'não informado'),
          case when i.valor is not null then 'Valor: R$ ' || i.valor::text end,
          case when i.valor_condominio is not null then 'Condomínio: R$ ' || i.valor_condominio::text end,
          case when i.valor_iptu is not null then 'IPTU: R$ ' || i.valor_iptu::text end,
          case when nullif(trim(coalesce(i.bairro, '')), '') is not null then 'Bairro: ' || i.bairro end,
          case when nullif(trim(coalesce(i.cidade, '')), '') is not null then 'Cidade: ' || i.cidade end,
          case when nullif(trim(coalesce(i.estado, '')), '') is not null then 'Estado: ' || i.estado end,
          case when i.quartos is not null then 'Quartos: ' || i.quartos::text end,
          case when i.suites is not null then 'Suítes: ' || i.suites::text end,
          case when i.banheiros is not null then 'Banheiros: ' || i.banheiros::text end,
          case when i.vagas is not null then 'Vagas: ' || i.vagas::text end,
          case when i.area_m2 is not null then 'Área: ' || i.area_m2::text || ' m²' end,
          case when nullif(trim(coalesce(i.descricao, '')), '') is not null then 'Descrição: ' || i.descricao end,
          case when i.caracteristicas <> '{}'::jsonb then 'Características: ' || left(i.caracteristicas::text, 450) end
        ),
        1600
      ) as trecho,
      ts_rank_cd(
        to_tsvector(
          'portuguese'::regconfig,
          concat_ws(
            ' ',
            i.titulo,
            i.codigo,
            i.tipo,
            i.finalidade,
            i.bairro,
            i.cidade,
            i.estado,
            i.descricao,
            i.caracteristicas::text
          )
        ),
        consulta.q
      )::real as rank,
      85 as prioridade_ordenacao,
      i.updated_at
    from public.imoveis i
    cross join consulta
    where i.empresa_id = p_empresa_id
      and lower(coalesce(i.status, '')) = 'disponivel'
      and consulta.q is not null
      and to_tsvector(
        'portuguese'::regconfig,
        concat_ws(
          ' ',
          i.titulo,
          i.codigo,
          i.tipo,
          i.finalidade,
          i.bairro,
          i.cidade,
          i.estado,
          i.descricao,
          i.caracteristicas::text
        )
      ) @@ consulta.q
  ), resultados as (
    select * from conhecimento
    union all
    select * from produtos_estoque
    union all
    select * from servicos
    union all
    select * from imoveis_disponiveis
  )
  select
    r.id,
    r.titulo,
    r.categoria,
    r.trecho,
    r.rank
  from resultados r
  order by r.rank desc, r.prioridade_ordenacao desc, r.updated_at desc
  limit least(greatest(coalesce(p_limite, 5), 1), 5);
$function$;

comment on function public.agente_ia_buscar_conhecimento(uuid, uuid, text, integer) is
  'Busca conhecimento aprovado e dados operacionais atuais de estoque/produtos, serviços e imóveis, sempre limitados à empresa do agente.';

create or replace function public.agente_ia_registrar_interesse_preferencia(
  p_empresa_id uuid,
  p_agente_id uuid,
  p_conversa_id uuid,
  p_texto text
)
returns table(
  registro_id uuid,
  numero integer,
  texto_registrado text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_contato_id uuid;
  v_texto text;
  v_valor text;
  v_id uuid;
  v_numero integer;
  v_existente text;
begin
  v_texto := regexp_replace(trim(coalesce(p_texto, '')), '\s+', ' ', 'g');
  v_texto := regexp_replace(
    v_texto,
    '^interesse/preferências coletado pelo Agente IA\s*[:\-]?\s*',
    '',
    'i'
  );
  v_texto := left(trim(v_texto), 180);

  if v_texto = '' then
    raise exception 'Interesse ou preferência vazio.';
  end if;

  select c.contato_id
    into v_contato_id
  from public.conversas c
  join public.agentes_ia a
    on a.id = p_agente_id
   and a.empresa_id = p_empresa_id
  where c.id = p_conversa_id
    and c.empresa_id = p_empresa_id
  limit 1;

  if v_contato_id is null then
    raise exception 'Conversa, contato ou agente inválido para a empresa.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_empresa_id::text || ':' || v_contato_id::text || ':observacoes_capturadas',
      0
    )
  );

  v_valor := 'interesse/preferências coletado pelo Agente IA: ' || v_texto;

  select cic.id, cic.sequencia, cic.valor
    into v_id, v_numero, v_existente
  from public.contato_informacoes_captura cic
  where cic.empresa_id = p_empresa_id
    and cic.contato_id = v_contato_id
    and cic.ativo = true
    and cic.variavel_origem = 'agente_ia_interesse_preferencia'
    and lower(trim(coalesce(cic.valor, ''))) = lower(v_valor)
  order by cic.capturado_em desc
  limit 1;

  if v_id is not null then
    return query select v_id, v_numero, v_existente;
    return;
  end if;

  select coalesce(max(cic.sequencia), 0) + 1
    into v_numero
  from public.contato_informacoes_captura cic
  where cic.contato_id = v_contato_id
    and cic.tipo = 'texto';

  insert into public.contato_informacoes_captura (
    empresa_id,
    contato_id,
    conversa_id,
    tipo,
    nome_campo,
    sequencia,
    valor,
    variavel_origem,
    ativo,
    metadata_json
  ) values (
    p_empresa_id,
    v_contato_id,
    p_conversa_id,
    'texto',
    'OBSERVAÇÕES CAPTURADAS',
    v_numero,
    v_valor,
    'agente_ia_interesse_preferencia',
    true,
    jsonb_build_object(
      'origem', 'agente_ia',
      'agente_id', p_agente_id,
      'tipo_registro', 'interesse_preferencia'
    )
  )
  returning id into v_id;

  return query select v_id, v_numero, v_valor;
end;
$function$;

revoke all on function public.agente_ia_registrar_interesse_preferencia(uuid, uuid, uuid, text) from public;
revoke all on function public.agente_ia_registrar_interesse_preferencia(uuid, uuid, uuid, text) from anon;
revoke all on function public.agente_ia_registrar_interesse_preferencia(uuid, uuid, uuid, text) from authenticated;
grant execute on function public.agente_ia_registrar_interesse_preferencia(uuid, uuid, uuid, text) to service_role;

comment on function public.agente_ia_registrar_interesse_preferencia(uuid, uuid, uuid, text) is
  'Registra interesse/preferência do Agente IA em OBSERVAÇÕES CAPTURADAS do contato com numeração sequencial e deduplicação.';

create or replace function public.agente_ia_capturar_interesses_estado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_interesse text;
  v_estado_anterior jsonb := '{}'::jsonb;
begin
  if tg_op = 'UPDATE' then
    v_estado_anterior := coalesce(old.estado_json, '{}'::jsonb);
  end if;

  for v_interesse in
    select trim(novo.valor)
    from jsonb_array_elements_text(
      coalesce(new.estado_json -> 'interesses', '[]'::jsonb)
    ) as novo(valor)
    where nullif(trim(novo.valor), '') is not null
      and not exists (
        select 1
        from jsonb_array_elements_text(
          coalesce(v_estado_anterior -> 'interesses', '[]'::jsonb)
        ) as anterior(valor)
        where lower(trim(anterior.valor)) = lower(trim(novo.valor))
      )
  loop
    perform public.agente_ia_registrar_interesse_preferencia(
      new.empresa_id,
      new.agente_id,
      new.conversa_id,
      v_interesse
    );
  end loop;

  return new;
end;
$function$;

drop trigger if exists trg_agente_ia_capturar_interesses_estado
  on public.agente_ia_conversa_estados;

create trigger trg_agente_ia_capturar_interesses_estado
after insert or update of estado_json
on public.agente_ia_conversa_estados
for each row
execute function public.agente_ia_capturar_interesses_estado();

create index if not exists contato_captura_agente_interesse_idx
  on public.contato_informacoes_captura (empresa_id, contato_id, sequencia desc)
  where variavel_origem = 'agente_ia_interesse_preferencia' and ativo = true;
