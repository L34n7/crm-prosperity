-- Filtragem de categorias e entidades na auditoria, sem varreduras desnecessarias.
create index if not exists logs_auditoria_empresa_categoria_entidade_idx
  on public.logs_auditoria (empresa_id, categoria, entidade);
