insert into public.permissoes (codigo, descricao)
values
  ('perfis.alterar_status', 'Alterar status de perfis')
on conflict (codigo) do update
set descricao = excluded.descricao;

insert into public.perfil_permissoes (perfil_empresa_id, permissao_codigo)
select id, 'perfis.alterar_status'
from public.perfis_empresa
where lower(nome) = 'administrador'
on conflict do nothing;
