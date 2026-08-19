-- Indices de cobertura das chaves estrangeiras do fluxo de compras.

create index if not exists comercial_fornecedor_itens_parceiro_idx
  on public.comercial_fornecedor_itens (empresa_id, parceiro_id);

create index if not exists comercial_recebimentos_deposito_idx
  on public.comercial_recebimentos_compra (empresa_id, deposito_id);
create index if not exists comercial_recebimentos_usuario_idx
  on public.comercial_recebimentos_compra (recebido_por)
  where recebido_por is not null;

create index if not exists comercial_recebimento_itens_pedido_item_idx
  on public.comercial_recebimento_compra_itens (pedido_item_id);
create index if not exists comercial_recebimento_itens_deposito_idx
  on public.comercial_recebimento_compra_itens (empresa_id, deposito_id);
create index if not exists comercial_recebimento_itens_localizacao_idx
  on public.comercial_recebimento_compra_itens (empresa_id, localizacao_id)
  where localizacao_id is not null;
create index if not exists comercial_recebimento_itens_lote_idx
  on public.comercial_recebimento_compra_itens (empresa_id, lote_id)
  where lote_id is not null;
