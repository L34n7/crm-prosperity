-- Complementa a unificacao do estoque com o search_path imutavel e indices
-- que cobrem as chaves estrangeiras usadas nas operacoes ERP.

alter function public.estoque_movimento_imutavel() set search_path = public, pg_temp;

create index if not exists estoque_categorias_pai_fk_idx
  on public.estoque_categorias (categoria_pai_id) where categoria_pai_id is not null;
create index if not exists estoque_configuracoes_updated_by_fk_idx
  on public.estoque_configuracoes (updated_by) where updated_by is not null;
create index if not exists estoque_custos_documento_fk_idx
  on public.estoque_custos_historico (documento_id) where documento_id is not null;
create index if not exists estoque_custos_item_fk_idx
  on public.estoque_custos_historico (estoque_item_id);
create index if not exists estoque_depositos_created_by_fk_idx
  on public.estoque_depositos (created_by) where created_by is not null;
create index if not exists estoque_documento_itens_item_fk_idx
  on public.estoque_documento_itens (estoque_item_id);
create index if not exists estoque_documentos_created_by_fk_idx
  on public.estoque_documentos (created_by) where created_by is not null;
create index if not exists estoque_documentos_estornado_por_fk_idx
  on public.estoque_documentos (estornado_por_id) where estornado_por_id is not null;
create index if not exists estoque_itens_created_by_fk_idx
  on public.estoque_itens (created_by) where created_by is not null;
create index if not exists estoque_itens_updated_by_fk_idx
  on public.estoque_itens (updated_by) where updated_by is not null;
create index if not exists estoque_lotes_item_fk_idx
  on public.estoque_lotes (estoque_item_id);
create index if not exists estoque_movimentacoes_catalogo_fk_idx
  on public.estoque_movimentacoes (catalogo_servico_id) where catalogo_servico_id is not null;
create index if not exists estoque_movimentacoes_created_by_fk_idx
  on public.estoque_movimentacoes (created_by) where created_by is not null;
create index if not exists estoque_movimentacoes_deposito_fk_idx
  on public.estoque_movimentacoes (deposito_id) where deposito_id is not null;
create index if not exists estoque_movimentacoes_documento_fk_idx
  on public.estoque_movimentacoes (documento_id) where documento_id is not null;
create index if not exists estoque_movimentacoes_lote_fk_idx
  on public.estoque_movimentacoes (lote_id) where lote_id is not null;
create index if not exists estoque_saldos_deposito_fk_idx
  on public.estoque_saldos (empresa_id,deposito_id);
create index if not exists estoque_saldos_localizacao_fk_idx
  on public.estoque_saldos (empresa_id,localizacao_id) where localizacao_id is not null;
create index if not exists estoque_saldos_lote_fk_idx
  on public.estoque_saldos (empresa_id,lote_id) where lote_id is not null;
create index if not exists estoque_saldos_item_fk_idx
  on public.estoque_saldos (estoque_item_id);

do $$
begin
  if to_regclass('public.estoque_inventario_itens') is not null then
    execute 'create index if not exists estoque_inventario_itens_lote_fk_idx on public.estoque_inventario_itens (empresa_id,lote_id) where lote_id is not null';
    execute 'create index if not exists estoque_inventario_itens_item_fk_idx on public.estoque_inventario_itens (estoque_item_id)';
  end if;
  if to_regclass('public.estoque_inventarios') is not null then
    execute 'create index if not exists estoque_inventarios_deposito_fk_idx on public.estoque_inventarios (empresa_id,deposito_id)';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='estoque_reservas'
       and column_name='comercial_documento_item_id'
  ) then
    execute 'create index if not exists estoque_reservas_comercial_item_fk_idx on public.estoque_reservas (comercial_documento_item_id) where comercial_documento_item_id is not null';
  end if;
  if to_regclass('public.comercial_documento_itens') is not null then
    execute 'create index if not exists comercial_documento_itens_estoque_item_fk_idx on public.comercial_documento_itens (estoque_item_id) where estoque_item_id is not null';
  end if;
end;
$$;
