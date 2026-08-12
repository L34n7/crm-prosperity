-- Administradores sempre possuem todas as permissoes operacionais.
-- Os acessos internos permanecem especiais e nao sao distribuidos aqui.
insert into public.perfil_permissoes (perfil_empresa_id, permissao_codigo)
select perfil.id, permissao.codigo
from public.perfis_empresa perfil
cross join public.permissoes permissao
where lower(trim(perfil.nome)) = 'administrador'
  and permissao.codigo not in (
    'empresas.acesso_interno',
    'relatorios_internos.visualizar'
  )
on conflict (perfil_empresa_id, permissao_codigo) do nothing;

-- Uma excecao individual nao pode retirar acesso operacional de Administrador.
-- Permissoes internas, inclusive as da empresa legado, ficam intactas.
delete from public.usuario_permissoes usuario_permissao
using public.usuarios_perfis usuario_perfil,
      public.perfis_empresa perfil
where usuario_perfil.usuario_id = usuario_permissao.usuario_id
  and perfil.id = usuario_perfil.perfil_empresa_id
  and perfil.ativo is not false
  and lower(trim(perfil.nome)) = 'administrador'
  and usuario_permissao.efeito = 'bloquear'
  and usuario_permissao.permissao_codigo not in (
    'empresas.acesso_interno',
    'relatorios_internos.visualizar'
  );
