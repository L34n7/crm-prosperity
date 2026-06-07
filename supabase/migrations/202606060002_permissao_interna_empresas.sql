insert into public.permissoes (codigo, descricao)
values
  ('empresas.acesso_interno', 'Acesso interno a pagina de empresas')
on conflict (codigo) do update
set descricao = excluded.descricao;
