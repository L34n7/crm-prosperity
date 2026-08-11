alter table public.imoveis_externos
  add column if not exists snapshot_hash text,
  add column if not exists disponibilidade_origem text not null default 'desconhecido',
  add column if not exists arquivado_por text;

update public.imoveis_externos
set disponibilidade_origem = case
  when replace(replace(lower(btrim(coalesce(status_origem, ''))), ' ', '_'), '-', '_') in (
    'disponivel', 'ativo', 'active', 'available', 'publicado', 'published'
  ) then 'disponivel'
  when replace(replace(lower(btrim(coalesce(status_origem, ''))), ' ', '_'), '-', '_') in (
    'indisponivel', 'inativo', 'inactive', 'unavailable', 'vendido', 'sold',
    'alugado', 'rented', 'locado', 'removed', 'removido', 'arquivado', 'archived',
    'excluido', 'deleted', 'off_market'
  ) then 'indisponivel'
  else 'desconhecido'
end;

update public.imoveis_externos
set
  status = 'arquivado',
  arquivado_por = case
    when status = 'arquivado' then arquivado_por
    else 'origem'
  end
where disponibilidade_origem = 'indisponivel'
  and status <> 'arquivado';

create unique index if not exists imoveis_externos_integracao_external_id_idx
  on public.imoveis_externos (integracao_id, external_id)
  where integracao_id is not null
    and external_id is not null
    and btrim(external_id) <> '';

create index if not exists imoveis_externos_empresa_disponibilidade_idx
  on public.imoveis_externos (empresa_id, disponibilidade_origem, status);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'imoveis_externos_disponibilidade_origem_check'
      and conrelid = 'public.imoveis_externos'::regclass
  ) then
    alter table public.imoveis_externos
      add constraint imoveis_externos_disponibilidade_origem_check
      check (disponibilidade_origem in ('disponivel', 'indisponivel', 'desconhecido'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'imoveis_externos_arquivado_por_check'
      and conrelid = 'public.imoveis_externos'::regclass
  ) then
    alter table public.imoveis_externos
      add constraint imoveis_externos_arquivado_por_check
      check (arquivado_por is null or arquivado_por in ('origem', 'usuario'));
  end if;
end
$$;

comment on column public.imoveis_externos.snapshot_hash is
  'Hash do snapshot normalizado mais recente recebido da origem para evitar updates redundantes.';
comment on column public.imoveis_externos.disponibilidade_origem is
  'Disponibilidade normalizada informada pelo sistema de origem: disponivel, indisponivel ou desconhecido.';
comment on column public.imoveis_externos.arquivado_por is
  'Origem do arquivamento: origem para webhook ou usuario para acao manual; null preserva estado legado/manual.';
