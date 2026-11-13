-- Acesso específico para ferramenta interna WhatsApp Web local.
-- Mantém 'whatsapp.disparos.visualizar' exclusivamente para o módulo Disparos.
-- Usuários comuns (inclusive o perfil Prosperidade) não recebem esse acesso.
begin;

insert into public.permissoes (codigo, descricao)
values (
  'whatsapp_web_local.acesso_interno',
  'Acessar ferramenta interna WhatsApp Web local'
)
on conflict (codigo) do update
  set descricao = excluded.descricao;

-- Preserva o acesso administrativo existente, restrito à empresa proprietária.
insert into public.perfil_permissoes (perfil_empresa_id, permissao_codigo)
select p.id, 'whatsapp_web_local.acesso_interno'
from public.perfis_empresa p
join public.empresas e on e.id = p.empresa_id
where lower(trim(e.nome_fantasia)) = 'crm prosperity'
  and lower(trim(p.nome)) = 'administrador'
  and p.ativo = true
on conflict (perfil_empresa_id, permissao_codigo) do nothing;

-- Remove a autorização INDIVIDUAL de Relatórios Internos de usuários cujo
-- perfil operacional é Prosperidade, sem revogar acesso de administradores.
-- Relatórios Internos já está oculto no catálogo dos perfis comuns.
delete from public.usuario_permissoes up
using public.usuarios u, public.empresas e
where up.usuario_id = u.id
  and up.empresa_id = u.empresa_id
  and u.empresa_id = e.id
  and lower(trim(e.nome_fantasia)) = 'crm prosperity'
  and up.permissao_codigo = 'relatorios_internos.visualizar'
  and up.efeito = 'permitir'
  and exists (
    select 1
    from public.usuarios_perfis upl
    join public.perfis_empresa p on p.id = upl.perfil_empresa_id
    where upl.usuario_id = u.id
      and p.empresa_id = u.empresa_id
      and lower(trim(p.nome)) = 'prosperidade'
  )
  and not exists (
    select 1
    from public.usuarios_perfis upl
    join public.perfis_empresa p on p.id = upl.perfil_empresa_id
    where upl.usuario_id = u.id
      and p.empresa_id = u.empresa_id
      and lower(trim(p.nome)) = 'administrador'
  );

commit;
