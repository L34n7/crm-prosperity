create unique index if not exists estoque_itens_empresa_codigo_barras_uk
  on public.estoque_itens (empresa_id, lower(btrim(codigo_barras)))
  where nullif(btrim(codigo_barras), '') is not null;

comment on index public.estoque_itens_empresa_codigo_barras_uk is
  'Impede que dois itens ativos ou arquivados da mesma empresa compartilhem o mesmo código de barras.';
