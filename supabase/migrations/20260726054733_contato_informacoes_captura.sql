create table if not exists public.contato_informacoes_captura (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  contato_id uuid not null references public.contatos(id) on delete cascade,
  tipo text not null
    check (
      tipo in (
        'nome',
        'email',
        'telefone',
        'cpf',
        'cnpj',
        'data',
        'cep',
        'numero',
        'moeda',
        'texto'
      )
    ),
  nome_campo text not null,
  sequencia integer not null check (sequencia >= 0),
  valor text not null check (btrim(valor) <> ''),
  valor_normalizado text not null check (btrim(valor_normalizado) <> ''),
  precisao_data text
    check (precisao_data in ('completa', 'dia_mes', 'mes_ano')),
  fluxo_id uuid references public.automacao_fluxos(id) on delete set null,
  no_id uuid references public.automacao_nos(id) on delete set null,
  execucao_id uuid references public.automacao_execucoes(id) on delete set null,
  variavel_origem text,
  capturado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references public.usuarios(id) on delete set null,
  atualizado_por uuid references public.usuarios(id) on delete set null,
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id) on delete set null,
  ativo boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  constraint contato_informacoes_captura_tipo_precisao_data_check
    check (
      (tipo = 'data' and precisao_data is not null)
      or (tipo <> 'data' and precisao_data is null)
    )
);

create index if not exists contato_informacoes_captura_empresa_contato_idx
  on public.contato_informacoes_captura (
    empresa_id,
    contato_id,
    ativo,
    capturado_em desc
  );

create index if not exists contato_informacoes_captura_empresa_capturado_idx
  on public.contato_informacoes_captura (empresa_id, capturado_em desc);

create index if not exists contato_informacoes_captura_fluxo_idx
  on public.contato_informacoes_captura (fluxo_id, capturado_em desc)
  where fluxo_id is not null;

create unique index if not exists contato_informacoes_captura_sequencia_unique
  on public.contato_informacoes_captura (
    empresa_id,
    contato_id,
    tipo,
    sequencia
  );

create unique index if not exists contato_informacoes_captura_valor_ativo_unique
  on public.contato_informacoes_captura (
    empresa_id,
    contato_id,
    tipo,
    valor_normalizado
  )
  where ativo = true;

create or replace function public.contato_informacoes_captura_preparar()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_nome_base text;
  v_usuario_id uuid;
begin
  if tg_op = 'UPDATE' then
    if new.empresa_id <> old.empresa_id
      or new.contato_id <> old.contato_id
      or new.tipo <> old.tipo
      or new.sequencia <> old.sequencia
    then
      raise exception using
        errcode = '23514',
        message = 'Empresa, contato, tipo e sequência da captura não podem ser alterados.';
    end if;

    new.nome_campo := old.nome_campo;
    new.capturado_em := old.capturado_em;
  end if;

  if not exists (
    select 1
    from public.contatos contato
    where contato.id = new.contato_id
      and contato.empresa_id = new.empresa_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'O contato informado não pertence à empresa da captura.';
  end if;

  if new.fluxo_id is not null and not exists (
    select 1
    from public.automacao_fluxos fluxo
    where fluxo.id = new.fluxo_id
      and fluxo.empresa_id = new.empresa_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'O fluxo informado não pertence à empresa da captura.';
  end if;

  if new.no_id is not null and not exists (
    select 1
    from public.automacao_nos no_origem
    where no_origem.id = new.no_id
      and no_origem.empresa_id = new.empresa_id
      and (new.fluxo_id is null or no_origem.fluxo_id = new.fluxo_id)
  ) then
    raise exception using
      errcode = '23503',
      message = 'O bloco informado não pertence à empresa ou ao fluxo da captura.';
  end if;

  if new.execucao_id is not null and not exists (
    select 1
    from public.automacao_execucoes execucao
    where execucao.id = new.execucao_id
      and execucao.empresa_id = new.empresa_id
      and (execucao.contato_id is null or execucao.contato_id = new.contato_id)
      and (new.fluxo_id is null or execucao.fluxo_id = new.fluxo_id)
  ) then
    raise exception using
      errcode = '23503',
      message = 'A execução informada não pertence à origem da captura.';
  end if;

  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(
      hashtextextended(
        new.empresa_id::text
          || ':'
          || new.contato_id::text
          || ':'
          || new.tipo,
        0
      )
    );

    if new.sequencia is null then
      select coalesce(max(informacao.sequencia), -1) + 1
        into new.sequencia
      from public.contato_informacoes_captura informacao
      where informacao.empresa_id = new.empresa_id
        and informacao.contato_id = new.contato_id
        and informacao.tipo = new.tipo;
    end if;

    v_nome_base := case new.tipo
      when 'nome' then 'Nome'
      when 'email' then 'E-mail'
      when 'telefone' then 'Telefone'
      when 'cpf' then 'CPF'
      when 'cnpj' then 'CNPJ'
      when 'data' then 'Data'
      when 'cep' then 'CEP'
      when 'numero' then 'Número'
      when 'moeda' then 'Moeda'
      else 'Observação'
    end;

    new.nome_campo := case
      when new.sequencia = 0 then v_nome_base
      else v_nome_base || ' ' || new.sequencia::text
    end;
  end if;

  select usuario.id
    into v_usuario_id
  from public.usuarios usuario
  where usuario.auth_user_id = auth.uid()
    and usuario.empresa_id = new.empresa_id
    and usuario.status = 'ativo'
  limit 1;

  if tg_op = 'INSERT' then
    new.criado_por := coalesce(new.criado_por, v_usuario_id);
    new.atualizado_por := coalesce(new.atualizado_por, new.criado_por);
  else
    new.atualizado_por := coalesce(new.atualizado_por, v_usuario_id);
  end if;

  if tg_op = 'UPDATE' and old.ativo = true and new.ativo = false then
    new.excluido_em := coalesce(new.excluido_em, now());
    new.excluido_por := coalesce(new.excluido_por, v_usuario_id);
  elsif tg_op = 'UPDATE' and old.ativo = false and new.ativo = true then
    new.excluido_em := null;
    new.excluido_por := null;
  end if;

  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists contato_informacoes_captura_preparar_trigger
  on public.contato_informacoes_captura;

create trigger contato_informacoes_captura_preparar_trigger
before insert or update on public.contato_informacoes_captura
for each row execute function public.contato_informacoes_captura_preparar();

alter table public.contato_informacoes_captura enable row level security;

revoke all on table public.contato_informacoes_captura
  from public, anon, authenticated;

grant select on table public.contato_informacoes_captura
  to authenticated;

grant all on table public.contato_informacoes_captura
  to service_role;

drop policy if exists contato_informacoes_captura_empresa_select
  on public.contato_informacoes_captura;

create policy contato_informacoes_captura_empresa_select
  on public.contato_informacoes_captura
  for select
  to authenticated
  using (
    empresa_id = (select public.usuario_empresa_id_atual())
  );

revoke all on function public.contato_informacoes_captura_preparar()
  from public, anon, authenticated;

grant execute on function public.contato_informacoes_captura_preparar()
  to service_role;

comment on table public.contato_informacoes_captura is
  'Informações validadas capturadas por fluxos e vinculadas permanentemente ao contato.';

comment on column public.contato_informacoes_captura.sequencia is
  'Sequência estável por contato e tipo; exclusões lógicas não liberam números já utilizados.';

comment on column public.contato_informacoes_captura.valor_normalizado is
  'Valor canônico utilizado para impedir duplicidades entre capturas ativas do mesmo tipo.';

comment on column public.contato_informacoes_captura.precisao_data is
  'Preserva se a captura contém data completa, apenas dia/mês ou apenas mês/ano.';
