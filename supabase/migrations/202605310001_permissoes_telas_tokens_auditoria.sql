insert into public.permissoes (codigo, descricao)
values
  ('ia.tokens.visualizar', 'Visualizar saldo e extrato de tokens de IA'),
  ('auditoria.visualizar', 'Visualizar auditoria')
on conflict (codigo) do update
set descricao = excluded.descricao;

insert into public.perfil_permissoes (perfil_empresa_id, permissao_codigo)
select perfil.id, permissao.codigo
from public.perfis_empresa perfil
cross join (
  values
    ('ia.tokens.visualizar'),
    ('auditoria.visualizar')
) as permissao(codigo)
where lower(perfil.nome) = 'administrador'
on conflict do nothing;
