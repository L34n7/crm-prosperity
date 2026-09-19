create table if not exists public.contatos_listas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  arquivo_nome text,
  origem_legada text,
  permitir_contatos_existentes boolean not null default false,
  usuario_id uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contatos_listas_nome_nao_vazio check (btrim(nome) <> '')
);

create unique index if not exists contatos_listas_empresa_nome_ci_uidx
  on public.contatos_listas (empresa_id, lower(btrim(nome)));

create unique index if not exists contatos_listas_empresa_origem_legada_uidx
  on public.contatos_listas (empresa_id, origem_legada)
  where origem_legada is not null;

create index if not exists contatos_listas_empresa_created_idx
  on public.contatos_listas (empresa_id, created_at desc);

alter table public.contatos_listas enable row level security;

create table if not exists public.contatos_lista_membros (
  lista_id uuid not null references public.contatos_listas(id) on delete cascade,
  contato_id uuid not null references public.contatos(id) on delete cascade,
  adicionado_em timestamptz not null default now(),
  primary key (lista_id, contato_id)
);

create index if not exists contatos_lista_membros_contato_idx
  on public.contatos_lista_membros (contato_id, lista_id);

alter table public.contatos_lista_membros enable row level security;

alter table public.contatos_importacoes
  add column if not exists lista_id uuid references public.contatos_listas(id) on delete set null,
  add column if not exists nome_lista text,
  add column if not exists arquivo_nome text,
  add column if not exists permitir_contatos_existentes boolean not null default false,
  add column if not exists membros_vinculados integer not null default 0;

create index if not exists contatos_importacoes_lista_idx
  on public.contatos_importacoes (lista_id)
  where lista_id is not null;

with origens_legado as (
  select
    contato.empresa_id,
    contato.origem as origem_legada,
    min(contato.created_at) as primeiro_contato_em,
    btrim(
      regexp_replace(
        contato.origem,
        '^Importação - (.*) - [0-9]{2}/[0-9]{2}/[0-9]{4} [0-9]{2}:[0-9]{2}$',
        '\1'
      )
    ) as arquivo_nome
  from public.contatos contato
  where contato.origem ~ '^Importação - .+ - [0-9]{2}/[0-9]{2}/[0-9]{4} [0-9]{2}:[0-9]{2}$'
  group by contato.empresa_id, contato.origem
),
origens_ranqueadas as (
  select
    origem.*,
    row_number() over (
      partition by origem.empresa_id, lower(origem.arquivo_nome)
      order by origem.primeiro_contato_em, origem.origem_legada
    ) as repeticao
  from origens_legado origem
),
listas_legado as (
  select
    origem.empresa_id,
    origem.origem_legada,
    origem.arquivo_nome,
    origem.primeiro_contato_em,
    case
      when origem.repeticao = 1 then origem.arquivo_nome
      else origem.arquivo_nome
        || ' ('
        || to_char(
          origem.primeiro_contato_em at time zone 'America/Sao_Paulo',
          'DD/MM/YYYY HH24:MI'
        )
        || ' #'
        || origem.repeticao::text
        || ')'
    end as nome_lista
  from origens_ranqueadas origem
)
insert into public.contatos_listas (
  empresa_id,
  nome,
  arquivo_nome,
  origem_legada,
  permitir_contatos_existentes,
  created_at,
  updated_at
)
select
  legado.empresa_id,
  legado.nome_lista,
  legado.arquivo_nome,
  legado.origem_legada,
  true,
  legado.primeiro_contato_em,
  legado.primeiro_contato_em
from listas_legado legado
where legado.arquivo_nome <> ''
on conflict do nothing;

insert into public.contatos_lista_membros (lista_id, contato_id, adicionado_em)
select
  lista.id,
  contato.id,
  contato.created_at
from public.contatos contato
join public.contatos_listas lista
  on lista.empresa_id = contato.empresa_id
 and lista.origem_legada = contato.origem
where lista.origem_legada is not null
on conflict (lista_id, contato_id) do nothing;

create or replace function public.processar_lote_importacao_contatos(
  p_importacao_id uuid,
  p_tamanho_lote integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_importacao public.contatos_importacoes%rowtype;
  v_lote jsonb;
  v_processados integer := 0;
  v_importados integer := 0;
  v_vinculados integer := 0;
  v_aceitos integer := 0;
  v_novo_cursor integer := 0;
  v_concluida boolean := false;
  v_erro text;
begin
  p_tamanho_lote := least(greatest(coalesce(p_tamanho_lote, 100), 1), 200);

  select *
  into v_importacao
  from public.contatos_importacoes
  where id = p_importacao_id
  for update skip locked;

  if not found then
    if exists (
      select 1
      from public.contatos_importacoes
      where id = p_importacao_id
        and status = 'concluida'
    ) then
      return jsonb_build_object(
        'ok', true,
        'concluida', true,
        'ignorada', true,
        'motivo', 'Importação já concluída.'
      );
    end if;

    if exists (
      select 1
      from public.contatos_importacoes
      where id = p_importacao_id
    ) then
      return jsonb_build_object(
        'ok', true,
        'concluida', false,
        'ocupada', true,
        'motivo', 'Outro worker está processando esta importação.'
      );
    end if;

    return jsonb_build_object(
      'ok', false,
      'concluida', false,
      'erro', 'Importação não encontrada.'
    );
  end if;

  if v_importacao.status = 'concluida' then
    return jsonb_build_object(
      'ok', true,
      'concluida', true,
      'ignorada', true,
      'motivo', 'Importação já concluída.'
    );
  end if;

  update public.contatos_importacoes
  set
    status = 'processando',
    tentativas = tentativas + 1,
    started_at = coalesce(started_at, now()),
    erro = null,
    updated_at = now()
  where id = p_importacao_id;

  select coalesce(jsonb_agg(item order by ordem), '[]'::jsonb)
  into v_lote
  from jsonb_array_elements(v_importacao.payload_json)
    with ordinality as itens(item, ordem)
  where ordem > v_importacao.cursor_atual
    and ordem <= v_importacao.cursor_atual + p_tamanho_lote;

  v_processados := jsonb_array_length(v_lote);

  if v_processados = 0 then
    update public.contatos_importacoes
    set
      status = 'concluida',
      cursor_atual = total,
      processados = total,
      payload_json = '[]'::jsonb,
      completed_at = coalesce(completed_at, now()),
      erro = null,
      updated_at = now()
    where id = p_importacao_id;

    return jsonb_build_object(
      'ok', true,
      'concluida', true,
      'processados_lote', 0,
      'importados_lote', 0,
      'vinculados_lista_lote', 0,
      'ignorados_lote', 0,
      'cursor_atual', v_importacao.total,
      'total', v_importacao.total
    );
  end if;

  begin
    with lote as (
      select
        nullif(btrim(item.nome), '') as nome,
        nullif(regexp_replace(coalesce(item.telefone, ''), '\D', '', 'g'), '') as telefone,
        nullif(lower(btrim(item.email)), '') as email,
        nullif(btrim(item.origem), '') as origem,
        nullif(btrim(item.campanha), '') as campanha,
        nullif(btrim(item.observacoes), '') as observacoes,
        coalesce(item.telefone_revisar, false) as telefone_revisar
      from jsonb_to_recordset(v_lote) as item(
        nome text,
        telefone text,
        email text,
        origem text,
        campanha text,
        observacoes text,
        telefone_revisar boolean
      )
    ),
    inseridos as (
      insert into public.contatos (
        empresa_id,
        nome,
        telefone,
        email,
        origem,
        campanha,
        classificacao,
        classificacao_atualizada_em,
        observacoes,
        telefone_revisar
      )
      select
        v_importacao.empresa_id,
        lote.nome,
        lote.telefone,
        lote.email,
        lote.origem,
        lote.campanha,
        null,
        null,
        lote.observacoes,
        lote.telefone_revisar
      from lote
      where lote.telefone is not null
        and length(lote.telefone) >= 8
      on conflict (empresa_id, telefone) do nothing
      returning id, telefone
    ),
    candidatos_lista as (
      select inserido.id as contato_id
      from inseridos inserido
      where v_importacao.lista_id is not null

      union

      select contato.id as contato_id
      from lote
      join public.contatos contato
        on contato.empresa_id = v_importacao.empresa_id
       and contato.telefone = lote.telefone
      where v_importacao.lista_id is not null
        and coalesce(v_importacao.permitir_contatos_existentes, false)
    ),
    membros_inseridos as (
      insert into public.contatos_lista_membros (lista_id, contato_id)
      select
        v_importacao.lista_id,
        candidato.contato_id
      from candidatos_lista candidato
      on conflict (lista_id, contato_id) do nothing
      returning contato_id
    )
    select
      (select count(*)::integer from inseridos),
      (select count(*)::integer from membros_inseridos)
    into v_importados, v_vinculados;
  exception
    when others then
      get stacked diagnostics v_erro = message_text;

      update public.contatos_importacoes
      set
        status = 'erro',
        erro = v_erro,
        updated_at = now()
      where id = p_importacao_id;

      return jsonb_build_object(
        'ok', false,
        'concluida', false,
        'erro', v_erro,
        'repetir', true
      );
  end;

  v_aceitos := greatest(v_importados, v_vinculados);
  v_novo_cursor := least(
    v_importacao.total,
    v_importacao.cursor_atual + v_processados
  );
  v_concluida := v_novo_cursor >= v_importacao.total;

  update public.contatos_importacoes
  set
    status = case when v_concluida then 'concluida' else 'pendente' end,
    cursor_atual = v_novo_cursor,
    processados = processados + v_processados,
    importados = importados + v_importados,
    membros_vinculados = membros_vinculados + v_vinculados,
    ignorados = ignorados + greatest(v_processados - v_aceitos, 0),
    payload_json = case when v_concluida then '[]'::jsonb else payload_json end,
    completed_at = case when v_concluida then now() else completed_at end,
    erro = null,
    updated_at = now()
  where id = p_importacao_id;

  return jsonb_build_object(
    'ok', true,
    'concluida', v_concluida,
    'processados_lote', v_processados,
    'importados_lote', v_importados,
    'vinculados_lista_lote', v_vinculados,
    'ignorados_lote', greatest(v_processados - v_aceitos, 0),
    'cursor_atual', v_novo_cursor,
    'total', v_importacao.total
  );
end;
$function$;

create or replace function public.listar_contatos_operacionais_contexto_lista(
  p_empresa_id uuid,
  p_lista_id uuid,
  p_integracao_whatsapp_id uuid default null,
  p_mensagem_data_inicio date default null,
  p_mensagem_data_fim date default null,
  p_ultimo_atendente_id uuid default null,
  p_filtrar_por_integracao boolean default false
)
returns table(
  id uuid,
  empresa_id uuid,
  nome text,
  whatsapp_profile_name text,
  telefone text,
  email text,
  origem text,
  campanha text,
  rastreamento_origem_id uuid,
  rastreamento_campanha_id uuid,
  rastreamento_link_id uuid,
  rastreamento_clique_id uuid,
  observacoes text,
  telefone_revisar boolean,
  classificacao text,
  classificacao_atualizada_em timestamptz,
  classificacao_evento_id uuid,
  classificacao_protocolo_id uuid,
  contato_novo boolean,
  campanha_exibicao text,
  campanha_status text,
  campanha_origem_nome text,
  telefone_normalizado text,
  origem_exibicao text,
  opt_in_whatsapp boolean,
  whatsapp_opt_out boolean,
  whatsapp_opt_out_geral boolean,
  whatsapp_opt_out_marketing boolean,
  whatsapp_opt_out_utility boolean,
  conversa_id uuid,
  conversa_status text,
  conversa_ultima_mensagem_em timestamptz,
  conversa_encerrada_em timestamptz,
  protocolo_atual text,
  protocolo_resultado text,
  contato_novo_no_inicio boolean,
  iniciado_com_bot boolean,
  finalizado_com_bot boolean,
  finalizado_por_tipo text,
  finalizado_por_usuario_id uuid,
  finalizado_por_usuario_nome text,
  contexto_integracao_whatsapp_id uuid,
  contexto_integracao_nome text,
  contexto_integracao_numero text,
  ultima_mensagem_contato_em timestamptz,
  ultimo_atendente_id uuid,
  ultimo_atendente_nome text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
set search_path to 'public'
as $function$
  select contexto.*
  from public.listar_contatos_operacionais_contexto(
    p_empresa_id,
    p_integracao_whatsapp_id,
    p_mensagem_data_inicio,
    p_mensagem_data_fim,
    p_ultimo_atendente_id,
    p_filtrar_por_integracao
  ) contexto
  where exists (
    select 1
    from public.contatos_lista_membros membro
    join public.contatos_listas lista
      on lista.id = membro.lista_id
    where membro.lista_id = p_lista_id
      and membro.contato_id = contexto.id
      and lista.empresa_id = p_empresa_id
  );
$function$;

create or replace function public.listar_contatos_operacionais_contexto_disparo_anterior_lista(
  p_empresa_id uuid,
  p_campanha_id uuid,
  p_lista_id uuid,
  p_integracao_whatsapp_id uuid default null,
  p_mensagem_data_inicio date default null,
  p_mensagem_data_fim date default null,
  p_ultimo_atendente_id uuid default null,
  p_filtrar_por_integracao boolean default false
)
returns table(
  id uuid,
  empresa_id uuid,
  nome text,
  whatsapp_profile_name text,
  telefone text,
  email text,
  origem text,
  campanha text,
  rastreamento_origem_id uuid,
  rastreamento_campanha_id uuid,
  rastreamento_link_id uuid,
  rastreamento_clique_id uuid,
  observacoes text,
  telefone_revisar boolean,
  classificacao text,
  classificacao_atualizada_em timestamptz,
  classificacao_evento_id uuid,
  classificacao_protocolo_id uuid,
  contato_novo boolean,
  campanha_exibicao text,
  campanha_status text,
  campanha_origem_nome text,
  telefone_normalizado text,
  origem_exibicao text,
  opt_in_whatsapp boolean,
  whatsapp_opt_out boolean,
  whatsapp_opt_out_geral boolean,
  whatsapp_opt_out_marketing boolean,
  whatsapp_opt_out_utility boolean,
  conversa_id uuid,
  conversa_status text,
  conversa_ultima_mensagem_em timestamptz,
  conversa_encerrada_em timestamptz,
  protocolo_atual text,
  protocolo_resultado text,
  contato_novo_no_inicio boolean,
  iniciado_com_bot boolean,
  finalizado_com_bot boolean,
  finalizado_por_tipo text,
  finalizado_por_usuario_id uuid,
  finalizado_por_usuario_nome text,
  contexto_integracao_whatsapp_id uuid,
  contexto_integracao_nome text,
  contexto_integracao_numero text,
  ultima_mensagem_contato_em timestamptz,
  ultimo_atendente_id uuid,
  ultimo_atendente_nome text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
set search_path to 'public'
as $function$
  select contexto.*
  from public.listar_contatos_operacionais_contexto_disparo_anterior(
    p_empresa_id,
    p_campanha_id,
    p_integracao_whatsapp_id,
    p_mensagem_data_inicio,
    p_mensagem_data_fim,
    p_ultimo_atendente_id,
    p_filtrar_por_integracao
  ) contexto
  where exists (
    select 1
    from public.contatos_lista_membros membro
    join public.contatos_listas lista
      on lista.id = membro.lista_id
    where membro.lista_id = p_lista_id
      and membro.contato_id = contexto.id
      and lista.empresa_id = p_empresa_id
  );
$function$;

revoke all on table public.contatos_listas from anon, authenticated;
revoke all on table public.contatos_lista_membros from anon, authenticated;

revoke all on function public.listar_contatos_operacionais_contexto_lista(
  uuid, uuid, uuid, date, date, uuid, boolean
) from public, anon, authenticated;
grant execute on function public.listar_contatos_operacionais_contexto_lista(
  uuid, uuid, uuid, date, date, uuid, boolean
) to service_role;

revoke all on function public.listar_contatos_operacionais_contexto_disparo_anterior_lista(
  uuid, uuid, uuid, uuid, date, date, uuid, boolean
) from public, anon, authenticated;
grant execute on function public.listar_contatos_operacionais_contexto_disparo_anterior_lista(
  uuid, uuid, uuid, uuid, date, date, uuid, boolean
) to service_role;
