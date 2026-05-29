insert into public.permissoes (codigo, descricao)
values
  ('usuarios.promover_admin', 'Promover usuarios ao perfil Administrador')
on conflict (codigo) do update
set descricao = excluded.descricao;

insert into public.perfil_permissoes (perfil_empresa_id, permissao_codigo)
select id, 'usuarios.promover_admin'
from public.perfis_empresa
where lower(nome) = 'administrador'
on conflict do nothing;
