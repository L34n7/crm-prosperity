-- Etapa 2 do estoque ERP: catalogo operacional, agenda, reservas automaticas,
-- consumo por lote/FEFO, imoveis e rastreabilidade clinica.

alter table public.catalogo_servicos
  add column if not exists unidade text not null default 'un',
  add column if not exists duracao_minutos integer,
  add column if not exists categoria text,
  add column if not exists deposito_padrao_id uuid references public.estoque_depositos(id) on delete set null,
  add column if not exists exige_lote boolean not null default false,
  add column if not exists permite_ajuste_consumo boolean not null default true,
  add column if not exists versao integer not null default 1;

alter table public.catalogo_servicos
  drop constraint if exists catalogo_servicos_duracao_check;
alter table public.catalogo_servicos
  add constraint catalogo_servicos_duracao_check
  check (duracao_minutos is null or duracao_minutos between 5 and 1440);

alter table public.catalogo_servico_insumos
  add column if not exists deposito_padrao_id uuid references public.estoque_depositos(id) on delete set null,
  add column if not exists obrigatorio boolean not null default true,
  add column if not exists permite_substituicao boolean not null default false,
  add column if not exists grupo_substituicao text,
  add column if not exists perda_percentual numeric(7,4) not null default 0,
  add column if not exists ordem integer not null default 0,
  add column if not exists observacao text;

alter table public.catalogo_servico_insumos
  drop constraint if exists catalogo_servico_insumos_perda_check;
alter table public.catalogo_servico_insumos
  add constraint catalogo_servico_insumos_perda_check
  check (perda_percentual between 0 and 100);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.catalogo_servicos'::regclass
      and conname = 'catalogo_servicos_empresa_id_id_key'
  ) then
    alter table public.catalogo_servicos
      add constraint catalogo_servicos_empresa_id_id_key unique (empresa_id, id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.estoque_itens'::regclass
      and conname = 'estoque_itens_empresa_id_id_key'
  ) then
    alter table public.estoque_itens
      add constraint estoque_itens_empresa_id_id_key unique (empresa_id, id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.agenda_agendamentos'::regclass
      and conname = 'agenda_agendamentos_empresa_id_id_key'
  ) then
    alter table public.agenda_agendamentos
      add constraint agenda_agendamentos_empresa_id_id_key unique (empresa_id, id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.imoveis_externos'::regclass
      and conname = 'imoveis_externos_empresa_id_id_key'
  ) then
    alter table public.imoveis_externos
      add constraint imoveis_externos_empresa_id_id_key unique (empresa_id, id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.imoveis'::regclass
      and conname = 'imoveis_empresa_id_id_key'
  ) then
    alter table public.imoveis
      add constraint imoveis_empresa_id_id_key unique (empresa_id, id);
  end if;
end $$;

create table if not exists public.agenda_catalogo_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  agendamento_id uuid not null,
  origem_tipo text not null check (origem_tipo in ('catalogo','imovel','imovel_externo')),
  catalogo_servico_id uuid,
  imovel_id uuid,
  imovel_externo_id uuid,
  deposito_id uuid,
  quantidade_planejada numeric(18,6) not null default 1 check (quantidade_planejada > 0),
  quantidade_real numeric(18,6) check (quantidade_real is null or quantidade_real > 0),
  status_estoque text not null default 'planejado'
    check (status_estoque in ('planejado','reservado','consumido','liberado','estornado','nao_aplicavel')),
  nome_snapshot text not null,
  tipo_snapshot text not null,
  preco_snapshot numeric(18,2) not null default 0,
  custo_previsto numeric(18,2) not null default 0,
  dente text,
  dados_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.usuarios(id) on delete set null,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, id),
  foreign key (empresa_id, agendamento_id)
    references public.agenda_agendamentos(empresa_id, id) on delete cascade,
  foreign key (empresa_id, catalogo_servico_id)
    references public.catalogo_servicos(empresa_id, id) on delete restrict,
  foreign key (empresa_id, imovel_id)
    references public.imoveis(empresa_id, id) on delete restrict,
  foreign key (empresa_id, imovel_externo_id)
    references public.imoveis_externos(empresa_id, id) on delete restrict,
  foreign key (empresa_id, deposito_id)
    references public.estoque_depositos(empresa_id, id) on delete restrict,
  constraint agenda_catalogo_itens_origem_check check (
    (origem_tipo = 'catalogo' and catalogo_servico_id is not null and imovel_id is null and imovel_externo_id is null)
    or (origem_tipo = 'imovel' and catalogo_servico_id is null and imovel_id is not null and imovel_externo_id is null)
    or (origem_tipo = 'imovel_externo' and catalogo_servico_id is null and imovel_id is null and imovel_externo_id is not null)
  ),
  constraint agenda_catalogo_itens_dente_check check (dente is null or dente ~ '^[0-9]{2}$')
);

create index if not exists agenda_catalogo_itens_agendamento_idx
  on public.agenda_catalogo_itens (empresa_id, agendamento_id, created_at);
create index if not exists agenda_catalogo_itens_catalogo_idx
  on public.agenda_catalogo_itens (empresa_id, catalogo_servico_id)
  where catalogo_servico_id is not null;

alter table public.estoque_reservas
  add column if not exists agenda_catalogo_item_id uuid references public.agenda_catalogo_itens(id) on delete restrict,
  add column if not exists saldo_id uuid references public.estoque_saldos(id) on delete restrict,
  add column if not exists liberada_em timestamptz,
  add column if not exists consumida_em timestamptz,
  add column if not exists updated_by uuid references public.usuarios(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists estoque_reservas_agenda_item_idx
  on public.estoque_reservas (empresa_id, agenda_catalogo_item_id, status);

create table if not exists public.estoque_consumos_clinicos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  agendamento_id uuid not null,
  agenda_catalogo_item_id uuid not null,
  documento_id uuid not null references public.estoque_documentos(id) on delete restrict,
  movimento_id uuid not null references public.estoque_movimentacoes(id) on delete restrict,
  estoque_item_id uuid not null,
  lote_id uuid,
  paciente_id uuid,
  pessoa_id uuid,
  profissional_id uuid references public.usuarios(id) on delete set null,
  prontuario_atendimento_id uuid references public.prontuario_atendimentos(id) on delete set null,
  dente text,
  quantidade numeric(18,6) not null check (quantidade > 0),
  status text not null default 'consumido' check (status in ('consumido','estornado')),
  consumido_em timestamptz not null default now(),
  estornado_em timestamptz,
  created_at timestamptz not null default now(),
  foreign key (empresa_id, agendamento_id)
    references public.agenda_agendamentos(empresa_id, id) on delete restrict,
  foreign key (empresa_id, agenda_catalogo_item_id)
    references public.agenda_catalogo_itens(empresa_id, id) on delete restrict,
  foreign key (empresa_id, estoque_item_id)
    references public.estoque_itens(empresa_id, id) on delete restrict,
  foreign key (empresa_id, lote_id)
    references public.estoque_lotes(empresa_id, id) on delete restrict,
  constraint estoque_consumos_clinicos_dente_check check (dente is null or dente ~ '^[0-9]{2}$')
);

create index if not exists estoque_consumos_clinicos_paciente_idx
  on public.estoque_consumos_clinicos (empresa_id, paciente_id, consumido_em desc)
  where paciente_id is not null;
create index if not exists estoque_consumos_clinicos_agendamento_idx
  on public.estoque_consumos_clinicos (empresa_id, agendamento_id, consumido_em desc);
create index if not exists estoque_consumos_clinicos_lote_idx
  on public.estoque_consumos_clinicos (empresa_id, lote_id)
  where lote_id is not null;

create or replace function public.estoque_agenda_liberar_reservas(
  p_empresa_id uuid,
  p_agendamento_id uuid,
  p_usuario_id uuid default null,
  p_motivo text default null
) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_reserva public.estoque_reservas%rowtype;
  v_total integer := 0;
begin
  for v_reserva in
    select * from public.estoque_reservas
    where empresa_id = p_empresa_id
      and origem_tipo = 'agenda'
      and origem_id = p_agendamento_id
      and status = 'ativa'
    order by estoque_item_id, id
    for update
  loop
    update public.estoque_saldos
       set saldo_reservado = saldo_reservado - v_reserva.quantidade,
           versao = versao + 1,
           updated_at = now()
     where id = v_reserva.saldo_id
       and empresa_id = p_empresa_id
       and saldo_reservado >= v_reserva.quantidade;
    if not found then
      raise exception 'Inconsistencia ao liberar reserva de estoque.';
    end if;
    update public.estoque_reservas
       set status = 'liberada', liberada_em = now(), updated_by = p_usuario_id, updated_at = now()
     where id = v_reserva.id;
    v_total := v_total + 1;
  end loop;

  update public.agenda_catalogo_itens
     set status_estoque = case when origem_tipo = 'catalogo' then 'liberado' else 'nao_aplicavel' end,
         updated_by = p_usuario_id,
         updated_at = now(),
         dados_json = dados_json || jsonb_build_object('ultima_liberacao_motivo', coalesce(p_motivo, 'alteracao_agendamento'))
   where empresa_id = p_empresa_id and agendamento_id = p_agendamento_id
     and status_estoque = 'reservado';
  return v_total;
end $$;

create or replace function public.estoque_agenda_reservar(
  p_empresa_id uuid,
  p_agendamento_id uuid,
  p_usuario_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_agenda_item public.agenda_catalogo_itens%rowtype;
  v_componente record;
  v_saldo record;
  v_deposito_id uuid;
  v_necessario numeric(18,6);
  v_alocar numeric(18,6);
  v_total_reservas integer := 0;
begin
  perform 1 from public.agenda_agendamentos
   where empresa_id = p_empresa_id and id = p_agendamento_id for update;
  if not found then raise exception 'Agendamento nao encontrado.'; end if;

  perform public.estoque_agenda_liberar_reservas(
    p_empresa_id, p_agendamento_id, p_usuario_id, 'recalculo_da_reserva'
  );

  for v_agenda_item in
    select * from public.agenda_catalogo_itens
     where empresa_id = p_empresa_id and agendamento_id = p_agendamento_id
     order by id for update
  loop
    if v_agenda_item.origem_tipo <> 'catalogo' then
      update public.agenda_catalogo_itens set status_estoque='nao_aplicavel', updated_at=now()
       where id=v_agenda_item.id;
      continue;
    end if;

    for v_componente in
      select x.estoque_item_id,
             sum(x.quantidade)::numeric(18,6) quantidade,
             max(x.deposito_padrao_id::text)::uuid deposito_padrao_id
      from (
        select c.estoque_item_id,
               coalesce(v_agenda_item.quantidade_real,v_agenda_item.quantidade_planejada)::numeric quantidade,
               c.deposito_padrao_id
          from public.catalogo_servicos c
         where c.empresa_id=p_empresa_id and c.id=v_agenda_item.catalogo_servico_id
           and c.tipo='produto' and c.estoque_item_id is not null
        union all
        select ci.estoque_item_id,
               (ci.quantidade * (1 + ci.perda_percentual / 100) * coalesce(v_agenda_item.quantidade_real,v_agenda_item.quantidade_planejada))::numeric,
               coalesce(ci.deposito_padrao_id, c.deposito_padrao_id)
          from public.catalogo_servico_insumos ci
          join public.catalogo_servicos c on c.empresa_id=ci.empresa_id and c.id=ci.catalogo_servico_id
         where ci.empresa_id=p_empresa_id and ci.catalogo_servico_id=v_agenda_item.catalogo_servico_id
           and ci.obrigatorio
      ) x
      group by x.estoque_item_id
      order by x.estoque_item_id
    loop
      v_necessario := v_componente.quantidade;
      select coalesce(v_agenda_item.deposito_id, v_componente.deposito_padrao_id,
        (select id from public.estoque_depositos where empresa_id=p_empresa_id and principal and ativo limit 1))
        into v_deposito_id;
      if v_deposito_id is null then raise exception 'Nenhum deposito ativo disponivel.'; end if;

      for v_saldo in
        select s.*, l.validade, l.bloqueado
          from public.estoque_saldos s
          left join public.estoque_lotes l on l.id=s.lote_id and l.empresa_id=s.empresa_id
         where s.empresa_id=p_empresa_id
           and s.estoque_item_id=v_componente.estoque_item_id
           and s.deposito_id=v_deposito_id
           and s.saldo_fisico-s.saldo_reservado > 0
           and coalesce(l.bloqueado,false)=false
           and (l.validade is null or l.validade >= current_date)
         order by l.validade asc nulls last, s.updated_at, s.id
         for update of s
      loop
        exit when v_necessario <= 0;
        v_alocar := least(v_necessario, v_saldo.saldo_fisico-v_saldo.saldo_reservado);
        update public.estoque_saldos set saldo_reservado=saldo_reservado+v_alocar,
          versao=versao+1, updated_at=now() where id=v_saldo.id;
        insert into public.estoque_reservas(
          empresa_id,estoque_item_id,deposito_id,lote_id,quantidade,status,
          origem_tipo,origem_id,created_by,agenda_catalogo_item_id,saldo_id,updated_by
        ) values (
          p_empresa_id,v_componente.estoque_item_id,v_deposito_id,v_saldo.lote_id,v_alocar,'ativa',
          'agenda',p_agendamento_id,p_usuario_id,v_agenda_item.id,v_saldo.id,p_usuario_id
        );
        v_necessario := v_necessario-v_alocar;
        v_total_reservas := v_total_reservas+1;
      end loop;
      if v_necessario > 0 then
        raise exception 'Saldo insuficiente para reservar o item %. Faltam %.',
          (select nome from public.estoque_itens where id=v_componente.estoque_item_id), v_necessario;
      end if;
    end loop;
    update public.agenda_catalogo_itens set status_estoque='reservado', updated_by=p_usuario_id, updated_at=now()
     where id=v_agenda_item.id;
  end loop;
  return jsonb_build_object('reservas',v_total_reservas,'agendamento_id',p_agendamento_id);
end $$;

create or replace function public.estoque_agenda_consumir(
  p_empresa_id uuid,
  p_agendamento_id uuid,
  p_usuario_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_documento_id uuid;
  v_ciclo integer;
  v_reserva record;
  v_movimento_id uuid;
  v_antes numeric(18,6);
  v_depois numeric(18,6);
  v_paciente_id uuid;
  v_pessoa_id uuid;
  v_profissional_id uuid;
  v_total integer := 0;
begin
  select id into v_documento_id from public.estoque_documentos
   where empresa_id=p_empresa_id and origem_tipo='agenda' and origem_id=p_agendamento_id
     and tipo='consumo' and status='confirmado'
   order by confirmado_em desc nulls last limit 1;
  if v_documento_id is not null then
    return jsonb_build_object('documento_id',v_documento_id,'idempotente',true);
  end if;
  select count(*)+1 into v_ciclo from public.estoque_documentos
   where empresa_id=p_empresa_id and origem_tipo='agenda' and origem_id=p_agendamento_id and tipo='consumo';

  if not exists(select 1 from public.estoque_reservas where empresa_id=p_empresa_id
    and origem_tipo='agenda' and origem_id=p_agendamento_id and status='ativa') then
    perform public.estoque_agenda_reservar(p_empresa_id,p_agendamento_id,p_usuario_id);
  end if;

  select p.id, p.pessoa_id, a.responsavel_id
    into v_paciente_id, v_pessoa_id, v_profissional_id
    from public.agenda_agendamentos a
    left join public.contatos c on c.id=a.contato_id and c.empresa_id=a.empresa_id
    left join public.pacientes p on p.pessoa_id=c.pessoa_id and p.empresa_id=a.empresa_id
   where a.empresa_id=p_empresa_id and a.id=p_agendamento_id;

  insert into public.estoque_documentos(
    empresa_id,tipo,status,origem_tipo,origem_id,idempotency_key,observacao,confirmado_em,created_by
  ) values (
    p_empresa_id,'consumo','confirmado','agenda',p_agendamento_id,
    'agenda:'||p_agendamento_id::text||':consumo:'||v_ciclo::text,'Consumo automatico do agendamento',now(),p_usuario_id
  ) returning id into v_documento_id;

  for v_reserva in
    select r.*, s.custo_medio, ai.catalogo_servico_id, ai.dente
      from public.estoque_reservas r
      join public.estoque_saldos s on s.id=r.saldo_id and s.empresa_id=r.empresa_id
      join public.agenda_catalogo_itens ai on ai.id=r.agenda_catalogo_item_id and ai.empresa_id=r.empresa_id
     where r.empresa_id=p_empresa_id and r.origem_tipo='agenda'
       and r.origem_id=p_agendamento_id and r.status='ativa'
     order by r.estoque_item_id,r.id for update of r,s
  loop
    select coalesce(sum(saldo_fisico),0) into v_antes from public.estoque_saldos
     where empresa_id=p_empresa_id and estoque_item_id=v_reserva.estoque_item_id;
    update public.estoque_saldos
       set saldo_fisico=saldo_fisico-v_reserva.quantidade,
           saldo_reservado=saldo_reservado-v_reserva.quantidade,
           versao=versao+1,updated_at=now()
     where id=v_reserva.saldo_id and empresa_id=p_empresa_id
       and saldo_fisico>=v_reserva.quantidade and saldo_reservado>=v_reserva.quantidade;
    if not found then raise exception 'Saldo reservado inconsistente durante o consumo.'; end if;
    select coalesce(sum(saldo_fisico),0) into v_depois from public.estoque_saldos
     where empresa_id=p_empresa_id and estoque_item_id=v_reserva.estoque_item_id;

    insert into public.estoque_documento_itens(
      empresa_id,documento_id,estoque_item_id,deposito_origem_id,lote_id,quantidade,custo_unitario
    ) values (p_empresa_id,v_documento_id,v_reserva.estoque_item_id,v_reserva.deposito_id,
      v_reserva.lote_id,v_reserva.quantidade,v_reserva.custo_medio);
    insert into public.estoque_movimentacoes(
      empresa_id,estoque_item_id,tipo,quantidade,saldo_anterior,saldo_posterior,
      catalogo_servico_id,origem_id,observacao,created_by,documento_id,deposito_id,lote_id,custo_unitario
    ) values (
      p_empresa_id,v_reserva.estoque_item_id,'execucao',v_reserva.quantidade,v_antes,v_depois,
      v_reserva.catalogo_servico_id,p_agendamento_id::text,'Consumo automatico do agendamento',
      p_usuario_id,v_documento_id,v_reserva.deposito_id,v_reserva.lote_id,v_reserva.custo_medio
    ) returning id into v_movimento_id;
    update public.estoque_reservas set status='consumida',consumida=quantidade,
      consumida_em=now(),updated_by=p_usuario_id,updated_at=now() where id=v_reserva.id;
    update public.estoque_itens set saldo=v_depois,updated_by=p_usuario_id,versao=versao+1
      where empresa_id=p_empresa_id and id=v_reserva.estoque_item_id;

    if v_paciente_id is not null then
      insert into public.estoque_consumos_clinicos(
        empresa_id,agendamento_id,agenda_catalogo_item_id,documento_id,movimento_id,
        estoque_item_id,lote_id,paciente_id,pessoa_id,profissional_id,dente,quantidade
      ) values (
        p_empresa_id,p_agendamento_id,v_reserva.agenda_catalogo_item_id,v_documento_id,v_movimento_id,
        v_reserva.estoque_item_id,v_reserva.lote_id,v_paciente_id,v_pessoa_id,
        coalesce(v_profissional_id,p_usuario_id),v_reserva.dente,v_reserva.quantidade
      );
    end if;
    v_total:=v_total+1;
  end loop;

  update public.agenda_catalogo_itens set status_estoque=case when origem_tipo='catalogo' then 'consumido' else 'nao_aplicavel' end,
    updated_by=p_usuario_id,updated_at=now()
   where empresa_id=p_empresa_id and agendamento_id=p_agendamento_id;
  return jsonb_build_object('documento_id',v_documento_id,'itens',v_total);
end $$;

create or replace function public.estoque_agenda_estornar(
  p_empresa_id uuid,
  p_agendamento_id uuid,
  p_usuario_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_original_id uuid;
  v_estorno_id uuid;
  v_item record;
  v_antes numeric(18,6);
  v_depois numeric(18,6);
begin
  select id into v_original_id from public.estoque_documentos
   where empresa_id=p_empresa_id and origem_tipo='agenda' and origem_id=p_agendamento_id
     and tipo='consumo' and status='confirmado'
   order by confirmado_em desc nulls last limit 1;
  if v_original_id is null then return jsonb_build_object('sem_consumo',true); end if;
  select id into v_estorno_id from public.estoque_documentos
   where empresa_id=p_empresa_id and idempotency_key='agenda:'||p_agendamento_id::text||':estorno:'||v_original_id::text;
  if v_estorno_id is not null then return jsonb_build_object('documento_id',v_estorno_id,'idempotente',true); end if;

  insert into public.estoque_documentos(
    empresa_id,tipo,status,origem_tipo,origem_id,idempotency_key,observacao,confirmado_em,estornado_por_id,created_by
  ) values (
    p_empresa_id,'estorno','confirmado','agenda',p_agendamento_id,
    'agenda:'||p_agendamento_id::text||':estorno:'||v_original_id::text,'Estorno automatico por reabertura do agendamento',
    now(),v_original_id,p_usuario_id
  ) returning id into v_estorno_id;

  for v_item in select * from public.estoque_documento_itens
    where empresa_id=p_empresa_id and documento_id=v_original_id order by estoque_item_id,id
  loop
    select coalesce(sum(saldo_fisico),0) into v_antes from public.estoque_saldos
      where empresa_id=p_empresa_id and estoque_item_id=v_item.estoque_item_id;
    perform public.estoque_aplicar_delta(p_empresa_id,v_item.estoque_item_id,
      v_item.deposito_origem_id,v_item.lote_id,v_item.quantidade,coalesce(v_item.custo_unitario,0));
    select coalesce(sum(saldo_fisico),0) into v_depois from public.estoque_saldos
      where empresa_id=p_empresa_id and estoque_item_id=v_item.estoque_item_id;
    insert into public.estoque_documento_itens(
      empresa_id,documento_id,estoque_item_id,deposito_destino_id,lote_id,quantidade,custo_unitario
    ) values (p_empresa_id,v_estorno_id,v_item.estoque_item_id,v_item.deposito_origem_id,
      v_item.lote_id,v_item.quantidade,v_item.custo_unitario);
    insert into public.estoque_movimentacoes(
      empresa_id,estoque_item_id,tipo,quantidade,saldo_anterior,saldo_posterior,
      origem_id,observacao,created_by,documento_id,deposito_id,lote_id,custo_unitario
    ) values (p_empresa_id,v_item.estoque_item_id,'estorno',v_item.quantidade,v_antes,v_depois,
      p_agendamento_id::text,'Estorno automatico do agendamento',p_usuario_id,v_estorno_id,
      v_item.deposito_origem_id,v_item.lote_id,v_item.custo_unitario);
  end loop;
  update public.estoque_documentos set status='estornado',estornado_por_id=v_estorno_id where id=v_original_id;
  update public.estoque_consumos_clinicos set status='estornado',estornado_em=now()
   where empresa_id=p_empresa_id and agendamento_id=p_agendamento_id and status='consumido';
  update public.agenda_catalogo_itens set status_estoque='estornado',updated_by=p_usuario_id,updated_at=now()
   where empresa_id=p_empresa_id and agendamento_id=p_agendamento_id and origem_tipo='catalogo';
  return jsonb_build_object('documento_id',v_estorno_id,'documento_original_id',v_original_id);
end $$;

create or replace function public.estoque_agenda_processar_estado(
  p_empresa_id uuid,
  p_agendamento_id uuid,
  p_usuario_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_status text; v_consumido boolean;
begin
  select status into v_status from public.agenda_agendamentos
   where empresa_id=p_empresa_id and id=p_agendamento_id for update;
  if v_status is null then raise exception 'Agendamento nao encontrado.'; end if;
  select exists(select 1 from public.estoque_documentos where empresa_id=p_empresa_id
    and origem_tipo='agenda' and origem_id=p_agendamento_id and tipo='consumo' and status='confirmado')
    into v_consumido;
  if v_status='realizado' then
    return public.estoque_agenda_consumir(p_empresa_id,p_agendamento_id,p_usuario_id);
  end if;
  if v_consumido then perform public.estoque_agenda_estornar(p_empresa_id,p_agendamento_id,p_usuario_id); end if;
  if v_status='confirmado' then
    return public.estoque_agenda_reservar(p_empresa_id,p_agendamento_id,p_usuario_id);
  end if;
  perform public.estoque_agenda_liberar_reservas(p_empresa_id,p_agendamento_id,p_usuario_id,'status_'||v_status);
  return jsonb_build_object('status',v_status,'reservas_liberadas',true);
end $$;

create or replace function public.estoque_agenda_status_trigger()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' or new.status is distinct from old.status then
    perform public.estoque_agenda_processar_estado(new.empresa_id,new.id,new.updated_by);
  end if;
  return new;
end $$;

drop trigger if exists agenda_agendamentos_estoque_estado on public.agenda_agendamentos;
create trigger agenda_agendamentos_estoque_estado
after insert or update of status on public.agenda_agendamentos
for each row execute function public.estoque_agenda_status_trigger();

create or replace function public.agenda_estoque_sincronizar_itens(
  p_empresa_id uuid,
  p_agendamento_id uuid,
  p_itens jsonb,
  p_usuario_id uuid
) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_item jsonb; v_origem text; v_id uuid; v_catalogo public.catalogo_servicos%rowtype;
  v_imovel public.imoveis%rowtype; v_externo public.imoveis_externos%rowtype; v_total integer:=0;
  v_quantidade numeric; v_quantidade_real numeric; v_deposito uuid; v_dente text;
begin
  if exists(select 1 from public.estoque_documentos where empresa_id=p_empresa_id
    and origem_tipo='agenda' and origem_id=p_agendamento_id and tipo='consumo' and status='confirmado') then
    raise exception 'Estorne ou reabra o atendimento antes de alterar os itens executados.';
  end if;
  perform public.estoque_agenda_liberar_reservas(p_empresa_id,p_agendamento_id,p_usuario_id,'alteracao_dos_itens');
  delete from public.agenda_catalogo_itens where empresa_id=p_empresa_id and agendamento_id=p_agendamento_id;
  for v_item in select value from jsonb_array_elements(coalesce(p_itens,'[]'::jsonb))
  loop
    v_origem:=coalesce(nullif(trim(v_item->>'origem_tipo'),''),'catalogo');
    begin v_id:=nullif(v_item->>'entidade_id','')::uuid; exception when others then v_id:=null; end;
    begin v_quantidade:=greatest((v_item->>'quantidade_planejada')::numeric,0.000001); exception when others then v_quantidade:=1; end;
    begin v_quantidade_real:=nullif(v_item->>'quantidade_real','')::numeric; exception when others then v_quantidade_real:=null; end;
    begin v_deposito:=nullif(v_item->>'deposito_id','')::uuid; exception when others then v_deposito:=null; end;
    v_dente:=nullif(regexp_replace(coalesce(v_item->>'dente',''),'[^0-9]','','g'),'');
    if v_dente is not null and v_dente !~ '^[0-9]{2}$' then raise exception 'Informe um dente valido.'; end if;
    if v_deposito is not null and not exists(select 1 from public.estoque_depositos where empresa_id=p_empresa_id and id=v_deposito and ativo) then
      raise exception 'Deposito selecionado nao pertence a empresa.';
    end if;
    if v_origem='catalogo' then
      select * into v_catalogo from public.catalogo_servicos where empresa_id=p_empresa_id and id=v_id and ativo;
      if not found then raise exception 'Produto, servico ou procedimento nao encontrado.'; end if;
      insert into public.agenda_catalogo_itens(
        empresa_id,agendamento_id,origem_tipo,catalogo_servico_id,deposito_id,quantidade_planejada,
        quantidade_real,nome_snapshot,tipo_snapshot,preco_snapshot,custo_previsto,dente,dados_json,created_by,updated_by
      ) select p_empresa_id,p_agendamento_id,'catalogo',v_catalogo.id,coalesce(v_deposito,v_catalogo.deposito_padrao_id),
        v_quantidade,v_quantidade_real,v_catalogo.nome,v_catalogo.tipo,v_catalogo.preco,
        coalesce(sum(i.custo_unitario*ci.quantidade*(1+ci.perda_percentual/100)*v_quantidade),0),v_dente,
        jsonb_build_object('catalogo_versao',v_catalogo.versao,'duracao_minutos',v_catalogo.duracao_minutos),p_usuario_id,p_usuario_id
        from (select 1) base
        left join public.catalogo_servico_insumos ci on ci.empresa_id=p_empresa_id and ci.catalogo_servico_id=v_catalogo.id
        left join public.estoque_itens i on i.empresa_id=p_empresa_id and i.id=ci.estoque_item_id;
    elsif v_origem='imovel' then
      select * into v_imovel from public.imoveis where empresa_id=p_empresa_id and id=v_id and status<>'arquivado';
      if not found then raise exception 'Imovel nao encontrado.'; end if;
      insert into public.agenda_catalogo_itens(
        empresa_id,agendamento_id,origem_tipo,imovel_id,quantidade_planejada,status_estoque,
        nome_snapshot,tipo_snapshot,preco_snapshot,dados_json,created_by,updated_by
      ) values (p_empresa_id,p_agendamento_id,'imovel',v_imovel.id,1,'nao_aplicavel',v_imovel.titulo,'imovel',
        coalesce(v_imovel.valor,0),jsonb_build_object('codigo',v_imovel.codigo,'status',v_imovel.status,
        'endereco',concat_ws(', ',v_imovel.logradouro,v_imovel.numero,v_imovel.bairro,v_imovel.cidade,v_imovel.estado)),p_usuario_id,p_usuario_id);
    elsif v_origem='imovel_externo' then
      select * into v_externo from public.imoveis_externos where empresa_id=p_empresa_id and id=v_id and status<>'arquivado';
      if not found then raise exception 'Imovel externo nao encontrado.'; end if;
      insert into public.agenda_catalogo_itens(
        empresa_id,agendamento_id,origem_tipo,imovel_externo_id,quantidade_planejada,status_estoque,
        nome_snapshot,tipo_snapshot,preco_snapshot,dados_json,created_by,updated_by
      ) values (p_empresa_id,p_agendamento_id,'imovel_externo',v_externo.id,1,'nao_aplicavel',v_externo.titulo,'imovel',
        coalesce(v_externo.valor_venda,v_externo.valor,v_externo.valor_locacao,0),jsonb_build_object('codigo',coalesce(v_externo.codigo,v_externo.external_id),
        'canal',v_externo.canal_nome,'status',v_externo.status,'endereco',concat_ws(', ',v_externo.logradouro,v_externo.numero,v_externo.bairro,v_externo.cidade,v_externo.estado)),p_usuario_id,p_usuario_id);
    else raise exception 'Origem do item do agendamento invalida.';
    end if;
    v_total:=v_total+1;
  end loop;
  return v_total;
end $$;

create or replace function public.agenda_etapa2_salvar_agendamento(
  p_agenda_id uuid,
  p_agendamento_id uuid default null,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_result jsonb; v_id uuid; v_usuario_id uuid; v_empresa_id uuid;
  v_status_anterior text; v_status_desejado text;
begin
  select id,empresa_id into v_usuario_id,v_empresa_id from public.usuarios
   where auth_user_id=auth.uid() and status='ativo' and empresa_id is not null limit 1;
  if v_usuario_id is null then raise exception 'Usuario nao autenticado ou sem empresa ativa.' using errcode='42501'; end if;
  v_status_desejado:=coalesce(nullif(trim(p_payload->>'status'),''),'agendado');
  if p_agendamento_id is not null then
    select status into v_status_anterior from public.agenda_agendamentos
     where empresa_id=v_empresa_id and id=p_agendamento_id and agenda_id=p_agenda_id;
  end if;
  if p_agendamento_id is not null and v_status_anterior<>'realizado' then
    perform public.agenda_estoque_sincronizar_itens(v_empresa_id,p_agendamento_id,p_payload->'catalogo_itens',v_usuario_id);
  end if;
  if p_agendamento_id is null and v_status_desejado<>'agendado' then
    v_result:=public.agenda_etapa1_salvar_agendamento(
      p_agenda_id,null,p_payload||jsonb_build_object('status','agendado')
    );
  else
    v_result:=public.agenda_etapa1_salvar_agendamento(p_agenda_id,p_agendamento_id,p_payload);
  end if;
  v_id:=(v_result->>'id')::uuid;
  if p_agendamento_id is null then
    perform public.agenda_estoque_sincronizar_itens(v_empresa_id,v_id,p_payload->'catalogo_itens',v_usuario_id);
    if v_status_desejado<>'agendado' then
      v_result:=public.agenda_etapa1_salvar_agendamento(p_agenda_id,v_id,p_payload);
    end if;
  elsif v_status_anterior='realizado' and v_status_desejado<>'realizado' then
    perform public.agenda_estoque_sincronizar_itens(v_empresa_id,v_id,p_payload->'catalogo_itens',v_usuario_id);
  end if;
  perform public.estoque_agenda_processar_estado(v_empresa_id,v_id,v_usuario_id);
  return v_result||jsonb_build_object('estoque_integrado',true);
end $$;

create or replace function public.catalogo_salvar_ficha(
  p_empresa_id uuid,
  p_usuario_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_item jsonb; v_tipo text; v_estoque_item_id uuid; v_deposito_id uuid;
  v_nome text; v_quantidade numeric; v_perda numeric; v_ordem integer:=0;
begin
  begin v_id:=nullif(p_payload->>'id','')::uuid; exception when others then v_id:=null; end;
  v_nome:=trim(coalesce(p_payload->>'nome',''));
  v_tipo:=coalesce(nullif(trim(p_payload->>'tipo'),''),'servico');
  begin v_estoque_item_id:=nullif(p_payload->>'estoque_item_id','')::uuid; exception when others then v_estoque_item_id:=null; end;
  begin v_deposito_id:=nullif(p_payload->>'deposito_padrao_id','')::uuid; exception when others then v_deposito_id:=null; end;
  if v_nome='' then raise exception 'Informe o nome do produto ou servico.'; end if;
  if v_tipo not in ('produto','servico','procedimento','imovel') then raise exception 'Tipo de catalogo invalido.'; end if;
  if v_tipo='produto' and v_estoque_item_id is null then raise exception 'Vincule o produto ao item de estoque.'; end if;
  if v_estoque_item_id is not null and not exists(select 1 from public.estoque_itens where empresa_id=p_empresa_id and id=v_estoque_item_id and ativo) then
    raise exception 'Item de estoque invalido.';
  end if;
  if v_deposito_id is not null and not exists(select 1 from public.estoque_depositos where empresa_id=p_empresa_id and id=v_deposito_id and ativo) then
    raise exception 'Deposito padrao invalido.';
  end if;

  if v_id is null then
    insert into public.catalogo_servicos(
      empresa_id,codigo,nome,descricao,tipo,preco,unidade,duracao_minutos,categoria,
      deposito_padrao_id,exige_lote,permite_ajuste_consumo,estoque_item_id,imovel_id,created_by,updated_by
    ) values (
      p_empresa_id,nullif(trim(p_payload->>'codigo'),''),v_nome,nullif(trim(p_payload->>'descricao'),''),v_tipo,
      greatest(coalesce((p_payload->>'preco')::numeric,0),0),coalesce(nullif(trim(p_payload->>'unidade'),''),'un'),
      nullif(p_payload->>'duracao_minutos','')::integer,nullif(trim(p_payload->>'categoria'),''),v_deposito_id,
      coalesce((p_payload->>'exige_lote')::boolean,false),coalesce((p_payload->>'permite_ajuste_consumo')::boolean,true),
      case when v_tipo='produto' then v_estoque_item_id else null end,
      case when v_tipo='imovel' then nullif(p_payload->>'imovel_id','')::uuid else null end,p_usuario_id,p_usuario_id
    ) returning id into v_id;
  else
    update public.catalogo_servicos set
      codigo=nullif(trim(p_payload->>'codigo'),''),nome=v_nome,descricao=nullif(trim(p_payload->>'descricao'),''),tipo=v_tipo,
      preco=greatest(coalesce((p_payload->>'preco')::numeric,0),0),unidade=coalesce(nullif(trim(p_payload->>'unidade'),''),'un'),
      duracao_minutos=nullif(p_payload->>'duracao_minutos','')::integer,categoria=nullif(trim(p_payload->>'categoria'),''),
      deposito_padrao_id=v_deposito_id,exige_lote=coalesce((p_payload->>'exige_lote')::boolean,false),
      permite_ajuste_consumo=coalesce((p_payload->>'permite_ajuste_consumo')::boolean,true),
      estoque_item_id=case when v_tipo='produto' then v_estoque_item_id else null end,
      imovel_id=case when v_tipo='imovel' then nullif(p_payload->>'imovel_id','')::uuid else null end,
      versao=versao+1,updated_by=p_usuario_id,updated_at=now()
    where empresa_id=p_empresa_id and id=v_id and ativo;
    if not found then raise exception 'Item do catalogo nao encontrado.'; end if;
  end if;

  delete from public.catalogo_servico_insumos where empresa_id=p_empresa_id and catalogo_servico_id=v_id;
  if v_tipo<>'produto' then
    for v_item in select value from jsonb_array_elements(coalesce(p_payload->'composicao','[]'::jsonb))
    loop
      begin v_estoque_item_id:=nullif(v_item->>'estoque_item_id','')::uuid; exception when others then v_estoque_item_id:=null; end;
      begin v_deposito_id:=nullif(v_item->>'deposito_padrao_id','')::uuid; exception when others then v_deposito_id:=null; end;
      begin v_quantidade:=(v_item->>'quantidade')::numeric; exception when others then v_quantidade:=0; end;
      begin v_perda:=greatest(0,least(100,coalesce((v_item->>'perda_percentual')::numeric,0))); exception when others then v_perda:=0; end;
      if v_estoque_item_id is null or v_quantidade<=0 then raise exception 'Composicao de insumos invalida.'; end if;
      if not exists(select 1 from public.estoque_itens where empresa_id=p_empresa_id and id=v_estoque_item_id and ativo) then
        raise exception 'Um dos insumos nao pertence a empresa.';
      end if;
      if v_deposito_id is not null and not exists(select 1 from public.estoque_depositos where empresa_id=p_empresa_id and id=v_deposito_id and ativo) then
        raise exception 'Deposito de um insumo invalido.';
      end if;
      insert into public.catalogo_servico_insumos(
        empresa_id,catalogo_servico_id,estoque_item_id,quantidade,deposito_padrao_id,obrigatorio,
        permite_substituicao,grupo_substituicao,perda_percentual,ordem,observacao
      ) values (
        p_empresa_id,v_id,v_estoque_item_id,v_quantidade,v_deposito_id,
        coalesce((v_item->>'obrigatorio')::boolean,true),coalesce((v_item->>'permite_substituicao')::boolean,false),
        nullif(trim(v_item->>'grupo_substituicao'),''),v_perda,v_ordem,nullif(trim(v_item->>'observacao'),'')
      );
      v_ordem:=v_ordem+1;
    end loop;
  end if;
  return jsonb_build_object('id',v_id,'versao_atualizada',true);
end $$;

do $$ begin
  if to_regprocedure('public.agenda_etapa2_listar_base(uuid,timestamp with time zone,timestamp with time zone)') is null then
    alter function public.agenda_etapa1_listar(uuid,timestamp with time zone,timestamp with time zone)
      rename to agenda_etapa2_listar_base;
  end if;
end $$;

create or replace function public.agenda_etapa1_listar(
  p_agenda_id uuid,p_inicio timestamptz,p_fim timestamptz
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_result jsonb; v_agendamentos jsonb;
begin
  v_result:=public.agenda_etapa2_listar_base(p_agenda_id,p_inicio,p_fim);
  select coalesce(jsonb_agg(item||jsonb_build_object('catalogo_itens',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',ai.id,'origem_tipo',ai.origem_tipo,'entidade_id',coalesce(ai.catalogo_servico_id,ai.imovel_id,ai.imovel_externo_id),
      'catalogo_servico_id',ai.catalogo_servico_id,'imovel_id',ai.imovel_id,'imovel_externo_id',ai.imovel_externo_id,
      'deposito_id',ai.deposito_id,'quantidade_planejada',ai.quantidade_planejada,'quantidade_real',ai.quantidade_real,
      'status_estoque',ai.status_estoque,'nome',ai.nome_snapshot,'tipo',ai.tipo_snapshot,'preco',ai.preco_snapshot,
      'custo_previsto',ai.custo_previsto,'dente',ai.dente,'dados',ai.dados_json
    ) order by ai.created_at)
    from public.agenda_catalogo_itens ai where ai.empresa_id=(v_result->>'empresa_id')::uuid and ai.agendamento_id=(item->>'id')::uuid
  ),'[]'::jsonb))), '[]'::jsonb) into v_agendamentos
  from jsonb_array_elements(coalesce(v_result->'agendamentos','[]'::jsonb)) item;
  return jsonb_set(v_result,'{agendamentos}',v_agendamentos,true);
end $$;

alter table public.agenda_catalogo_itens enable row level security;
alter table public.estoque_consumos_clinicos enable row level security;
revoke all on public.agenda_catalogo_itens from anon,authenticated;
revoke all on public.estoque_consumos_clinicos from anon,authenticated;
grant select on public.agenda_catalogo_itens to authenticated;
create policy agenda_catalogo_itens_empresa_select on public.agenda_catalogo_itens
  for select to authenticated using (empresa_id=public.usuario_empresa_id_atual());

revoke execute on function public.estoque_agenda_liberar_reservas(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke execute on function public.estoque_agenda_reservar(uuid,uuid,uuid) from public,anon,authenticated;
revoke execute on function public.estoque_agenda_consumir(uuid,uuid,uuid) from public,anon,authenticated;
revoke execute on function public.estoque_agenda_estornar(uuid,uuid,uuid) from public,anon,authenticated;
revoke execute on function public.estoque_agenda_processar_estado(uuid,uuid,uuid) from public,anon,authenticated;
revoke execute on function public.agenda_estoque_sincronizar_itens(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
revoke execute on function public.catalogo_salvar_ficha(uuid,uuid,jsonb) from public,anon,authenticated;
revoke execute on function public.estoque_agenda_status_trigger() from public,anon,authenticated;
grant execute on function public.estoque_agenda_liberar_reservas(uuid,uuid,uuid,text) to service_role;
grant execute on function public.estoque_agenda_reservar(uuid,uuid,uuid) to service_role;
grant execute on function public.estoque_agenda_consumir(uuid,uuid,uuid) to service_role;
grant execute on function public.estoque_agenda_estornar(uuid,uuid,uuid) to service_role;
grant execute on function public.estoque_agenda_processar_estado(uuid,uuid,uuid) to service_role;
grant execute on function public.agenda_estoque_sincronizar_itens(uuid,uuid,jsonb,uuid) to service_role;
grant execute on function public.catalogo_salvar_ficha(uuid,uuid,jsonb) to service_role;
revoke execute on function public.agenda_etapa2_salvar_agendamento(uuid,uuid,jsonb) from public,anon;
grant execute on function public.agenda_etapa2_salvar_agendamento(uuid,uuid,jsonb) to authenticated,service_role;
revoke execute on function public.agenda_etapa2_listar_base(uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.agenda_etapa2_listar_base(uuid,timestamptz,timestamptz) to service_role;
revoke execute on function public.agenda_etapa1_listar(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.agenda_etapa1_listar(uuid,timestamptz,timestamptz) to authenticated,service_role;

insert into public.permissoes(codigo,descricao) values
 ('catalogo.visualizar','Visualizar produtos, servicos, procedimentos e imoveis na operacao'),
 ('catalogo.gerenciar','Gerenciar fichas tecnicas e integracoes do catalogo')
on conflict(codigo) do update set descricao=excluded.descricao;

insert into public.perfil_permissoes(perfil_empresa_id,permissao_codigo)
select p.id,x.codigo from public.perfis_empresa p cross join
 (values('catalogo.visualizar'),('catalogo.gerenciar')) x(codigo)
where lower(p.nome)='administrador' on conflict do nothing;

