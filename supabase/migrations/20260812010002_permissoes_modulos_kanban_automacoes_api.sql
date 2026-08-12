insert into public.permissoes (codigo, descricao)
values
  ('kanban.visualizar', 'Visualizar Kanban de leads'),
  ('kanban.mover', 'Mover leads entre etapas do Kanban'),
  ('automacoes_api.visualizar', 'Visualizar automacoes por API'),
  ('automacoes_api.gerenciar', 'Criar e gerenciar automacoes por API')
on conflict (codigo) do update
set descricao = excluded.descricao;

-- Preserva o acesso dos perfis existentes com atribuicoes equivalentes.
insert into public.perfil_permissoes (perfil_empresa_id, permissao_codigo)
select distinct pp.perfil_empresa_id, nova.codigo
from public.perfil_permissoes pp
cross join lateral (
  values
    ('contatos.visualizar', 'kanban.visualizar'),
    ('contatos.editar', 'kanban.mover'),
    ('dashboard.visualizar', 'automacoes_api.visualizar')
) as nova(origem, codigo)
where pp.permissao_codigo = nova.origem
on conflict (perfil_empresa_id, permissao_codigo) do nothing;

insert into public.perfil_permissoes (perfil_empresa_id, permissao_codigo)
select perfil.id, 'automacoes_api.gerenciar'
from public.perfis_empresa perfil
where lower(trim(perfil.nome)) = 'administrador'
on conflict (perfil_empresa_id, permissao_codigo) do nothing;

-- O modulo de Automacoes por API era visivel a qualquer perfil antes desta
-- permissao existir. Mantem o comportamento atual, agora configuravel.
insert into public.perfil_permissoes (perfil_empresa_id, permissao_codigo)
select perfil.id, 'automacoes_api.visualizar'
from public.perfis_empresa perfil
on conflict (perfil_empresa_id, permissao_codigo) do nothing;

-- O Kanban aceitava estes tres perfis pelo nome. Migra exatamente esse acesso
-- para permissoes explicitas, sem manter regras de perfil dentro da API.
insert into public.perfil_permissoes (perfil_empresa_id, permissao_codigo)
select perfil.id, permissao.codigo
from public.perfis_empresa perfil
cross join (
  values ('kanban.visualizar'), ('kanban.mover')
) as permissao(codigo)
where lower(trim(perfil.nome)) in ('administrador', 'supervisor', 'atendente')
on conflict (perfil_empresa_id, permissao_codigo) do nothing;
