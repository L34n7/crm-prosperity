-- Indices das chaves estrangeiras administrativas da Etapa 3.
create index comercial_documentos_aprovado_por_idx on public.comercial_documentos(aprovado_por) where aprovado_por is not null;
create index comercial_documentos_created_by_idx on public.comercial_documentos(created_by) where created_by is not null;
create index comercial_documentos_updated_by_idx on public.comercial_documentos(updated_by) where updated_by is not null;
create index comercial_pagamentos_created_by_idx on public.comercial_pagamentos(created_by) where created_by is not null;
create index comercial_parceiros_created_by_idx on public.comercial_parceiros(created_by) where created_by is not null;
create index comercial_parceiros_updated_by_idx on public.comercial_parceiros(updated_by) where updated_by is not null;
create index estoque_inventario_itens_contado_por_idx on public.estoque_inventario_itens(contado_por) where contado_por is not null;
create index estoque_inventarios_aprovado_por_idx on public.estoque_inventarios(aprovado_por) where aprovado_por is not null;
create index estoque_inventarios_created_by_idx on public.estoque_inventarios(created_by) where created_by is not null;
create index estoque_inventarios_documento_ajuste_idx on public.estoque_inventarios(documento_ajuste_id) where documento_ajuste_id is not null;

