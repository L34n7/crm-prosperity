insert into public.permissoes (codigo, descricao)
values
  ('relatorios_internos.visualizar', 'Acessar relatorios internos')
on conflict (codigo) do update
set descricao = excluded.descricao;

insert into public.perfil_permissoes (perfil_empresa_id, permissao_codigo)
select perfil_permissao.perfil_empresa_id, 'relatorios_internos.visualizar'
from public.perfil_permissoes perfil_permissao
where perfil_permissao.permissao_codigo = 'empresas.acesso_interno'
on conflict do nothing;

insert into public.usuario_permissoes (
  empresa_id,
  usuario_id,
  permissao_codigo,
  efeito,
  created_at,
  updated_at
)
select
  usuario_permissao.empresa_id,
  usuario_permissao.usuario_id,
  'relatorios_internos.visualizar',
  usuario_permissao.efeito,
  usuario_permissao.created_at,
  usuario_permissao.updated_at
from public.usuario_permissoes usuario_permissao
where usuario_permissao.permissao_codigo = 'empresas.acesso_interno'
on conflict (usuario_id, permissao_codigo) do update
set
  empresa_id = excluded.empresa_id,
  efeito = excluded.efeito,
  updated_at = excluded.updated_at;
