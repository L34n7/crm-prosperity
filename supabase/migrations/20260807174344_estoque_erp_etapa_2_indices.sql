-- Indices de cobertura da Etapa 2, identificados pelo Database Advisor.

create index if not exists catalogo_servicos_estoque_item_idx
  on public.catalogo_servicos (estoque_item_id) where estoque_item_id is not null;
create index if not exists catalogo_servicos_imovel_idx
  on public.catalogo_servicos (imovel_id) where imovel_id is not null;
create index if not exists catalogo_servicos_deposito_idx
  on public.catalogo_servicos (deposito_padrao_id) where deposito_padrao_id is not null;
create index if not exists catalogo_servicos_created_by_idx
  on public.catalogo_servicos (created_by) where created_by is not null;
create index if not exists catalogo_servicos_updated_by_idx
  on public.catalogo_servicos (updated_by) where updated_by is not null;

create index if not exists catalogo_servico_insumos_item_idx
  on public.catalogo_servico_insumos (estoque_item_id);
create index if not exists catalogo_servico_insumos_deposito_idx
  on public.catalogo_servico_insumos (deposito_padrao_id) where deposito_padrao_id is not null;

create index if not exists agenda_catalogo_itens_deposito_idx
  on public.agenda_catalogo_itens (empresa_id, deposito_id) where deposito_id is not null;
create index if not exists agenda_catalogo_itens_imovel_idx
  on public.agenda_catalogo_itens (empresa_id, imovel_id) where imovel_id is not null;
create index if not exists agenda_catalogo_itens_imovel_externo_idx
  on public.agenda_catalogo_itens (empresa_id, imovel_externo_id) where imovel_externo_id is not null;
create index if not exists agenda_catalogo_itens_created_by_idx
  on public.agenda_catalogo_itens (created_by) where created_by is not null;
create index if not exists agenda_catalogo_itens_updated_by_idx
  on public.agenda_catalogo_itens (updated_by) where updated_by is not null;

create index if not exists estoque_reservas_item_idx
  on public.estoque_reservas (estoque_item_id);
create index if not exists estoque_reservas_deposito_idx
  on public.estoque_reservas (empresa_id, deposito_id);
create index if not exists estoque_reservas_lote_idx
  on public.estoque_reservas (empresa_id, lote_id) where lote_id is not null;
create index if not exists estoque_reservas_agenda_catalogo_item_fk_idx
  on public.estoque_reservas (agenda_catalogo_item_id) where agenda_catalogo_item_id is not null;
create index if not exists estoque_reservas_saldo_idx
  on public.estoque_reservas (saldo_id) where saldo_id is not null;
create index if not exists estoque_reservas_created_by_idx
  on public.estoque_reservas (created_by) where created_by is not null;
create index if not exists estoque_reservas_updated_by_idx
  on public.estoque_reservas (updated_by) where updated_by is not null;

create index if not exists estoque_consumos_clinicos_agenda_item_idx
  on public.estoque_consumos_clinicos (empresa_id, agenda_catalogo_item_id);
create index if not exists estoque_consumos_clinicos_item_idx
  on public.estoque_consumos_clinicos (empresa_id, estoque_item_id);
create index if not exists estoque_consumos_clinicos_documento_idx
  on public.estoque_consumos_clinicos (documento_id);
create index if not exists estoque_consumos_clinicos_movimento_idx
  on public.estoque_consumos_clinicos (movimento_id);
create index if not exists estoque_consumos_clinicos_profissional_idx
  on public.estoque_consumos_clinicos (profissional_id) where profissional_id is not null;
create index if not exists estoque_consumos_clinicos_prontuario_atendimento_idx
  on public.estoque_consumos_clinicos (prontuario_atendimento_id)
  where prontuario_atendimento_id is not null;

