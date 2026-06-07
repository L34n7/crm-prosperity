insert into public.permissoes (codigo, descricao)
values
  ('assinaturas.plano.visualizar', 'Visualizar plano atual na barra lateral')
on conflict (codigo) do update
set descricao = excluded.descricao;

insert into public.perfil_permissoes (perfil_empresa_id, permissao_codigo)
select perfil.id, 'assinaturas.plano.visualizar'
from public.perfis_empresa perfil
where lower(perfil.nome) = 'administrador'
on conflict do nothing;
