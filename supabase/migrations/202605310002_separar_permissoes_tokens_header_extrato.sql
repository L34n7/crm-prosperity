insert into public.permissoes (codigo, descricao)
values
  ('ia.tokens.exibir_header', 'Exibir saldo de tokens de IA no cabecalho'),
  ('ia.tokens.visualizar_extrato', 'Acessar extrato de tokens de IA')
on conflict (codigo) do update
set descricao = excluded.descricao;

insert into public.perfil_permissoes (perfil_empresa_id, permissao_codigo)
select perfil_permissao.perfil_empresa_id, nova_permissao.codigo
from public.perfil_permissoes perfil_permissao
cross join (
  values
    ('ia.tokens.exibir_header'),
    ('ia.tokens.visualizar_extrato')
) as nova_permissao(codigo)
where perfil_permissao.permissao_codigo = 'ia.tokens.visualizar'
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
  nova_permissao.codigo,
  usuario_permissao.efeito,
  usuario_permissao.created_at,
  usuario_permissao.updated_at
from public.usuario_permissoes usuario_permissao
cross join (
  values
    ('ia.tokens.exibir_header'),
    ('ia.tokens.visualizar_extrato')
) as nova_permissao(codigo)
where usuario_permissao.permissao_codigo = 'ia.tokens.visualizar'
on conflict (usuario_id, permissao_codigo) do update
set
  efeito = excluded.efeito,
  updated_at = excluded.updated_at;

insert into public.perfil_permissoes (perfil_empresa_id, permissao_codigo)
select perfil.id, permissao.codigo
from public.perfis_empresa perfil
cross join (
  values
    ('ia.tokens.exibir_header'),
    ('ia.tokens.visualizar_extrato')
) as permissao(codigo)
where lower(perfil.nome) = 'administrador'
on conflict do nothing;

delete from public.perfil_permissoes
where permissao_codigo = 'ia.tokens.visualizar';

delete from public.usuario_permissoes
where permissao_codigo = 'ia.tokens.visualizar';

delete from public.permissoes
where codigo = 'ia.tokens.visualizar';
