insert into public.permissoes (codigo, descricao)
values
  ('whatsapp.disparos.individual.enviar', 'Enviar disparo individual por template WhatsApp')
on conflict (codigo) do update
set descricao = excluded.descricao;

insert into public.perfil_permissoes (perfil_empresa_id, permissao_codigo)
select id, 'whatsapp.disparos.individual.enviar'
from public.perfis_empresa
where lower(nome) = 'administrador'
on conflict do nothing;
