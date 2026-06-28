update public.permissoes
set descricao = 'Realizar, agendar e cancelar disparos WhatsApp'
where codigo = 'whatsapp.disparos.enviar';

insert into public.perfil_permissoes (
  perfil_empresa_id,
  permissao_codigo
)
select
  perfil.id,
  permissao.codigo
from public.perfis_empresa perfil
cross join (
  values
    ('whatsapp.disparos.visualizar'),
    ('whatsapp.disparos.enviar')
) as permissao(codigo)
where lower(trim(perfil.nome)) = 'administrador'
on conflict do nothing;

delete from public.usuario_permissoes
where permissao_codigo in (
  'whatsapp.disparos.agendar',
  'whatsapp.disparos.cancelar'
);

delete from public.perfil_permissoes
where permissao_codigo in (
  'whatsapp.disparos.agendar',
  'whatsapp.disparos.cancelar'
);

delete from public.permissoes
where codigo in (
  'whatsapp.disparos.agendar',
  'whatsapp.disparos.cancelar'
);
