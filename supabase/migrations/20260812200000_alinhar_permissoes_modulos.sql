-- Alinha o perfil padrao com o perfil de referencia validado pela operacao.
-- Tambem fecha as funcoes legadas da agenda que permitiam escrita direta sem
-- conferir agendas.editar.

create or replace function public.aplicar_permissoes_basicas_novo_perfil()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- O Administrador continua sendo preenchido pelo bootstrap da empresa.
  if lower(trim(new.nome)) = 'administrador' then
    return new;
  end if;

  insert into public.perfil_permissoes (
    perfil_empresa_id,
    permissao_codigo
  )
  select
    new.id,
    permissao.codigo
  from public.permissoes permissao
  where permissao.codigo = any(array[
    'agendas.visualizar',
    'contatos.visualizar',
    'conversas.assumir',
    'conversas.editar_contato',
    'conversas.encerrar',
    'conversas.exportar',
    'conversas.gerenciar_etiquetas',
    'conversas.gerenciar_listas',
    'conversas.gerenciar_notas',
    'conversas.visualizar',
    'conversas.visualizar_conversas_setor',
    'conversas.visualizar_encerradas_setor',
    'dashboard.visualizar',
    'fluxos.visualizar',
    'imoveis.visualizar',
    'kanban.visualizar',
    'mensagens.enviar',
    'mensagens.enviar_midia',
    'mensagens.favoritar',
    'mensagens.visualizar',
    'odontograma.visualizar',
    'perfis.visualizar',
    'pessoas.visualizar',
    'prontuarios.visualizar',
    'rastreamento.visualizar',
    'relatorios.visualizar',
    'setores.visualizar',
    'usuarios.visualizar',
    'vendas.visualizar',
    'whatsapp_templates.visualizar',
    'whatsapp.disparos.visualizar'
  ]::text[])
  on conflict (perfil_empresa_id, permissao_codigo) do nothing;

  return new;
end;
$$;

revoke execute on function public.aplicar_permissoes_basicas_novo_perfil()
  from public, anon, authenticated;

create or replace function public.usuario_atual_tem_permissao(
  p_permissao_codigo text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid;
  v_empresa_id uuid;
  v_administrador boolean := false;
begin
  select usuario.id, usuario.empresa_id
  into v_usuario_id, v_empresa_id
  from public.usuarios usuario
  where usuario.auth_user_id = auth.uid()
    and usuario.status = 'ativo'
    and usuario.empresa_id is not null
  limit 1;

  if v_usuario_id is null or v_empresa_id is null then
    return false;
  end if;

  select exists (
    select 1
    from public.usuarios_perfis vinculo
    join public.perfis_empresa perfil
      on perfil.id = vinculo.perfil_empresa_id
    where vinculo.usuario_id = v_usuario_id
      and perfil.empresa_id = v_empresa_id
      and perfil.ativo is true
      and lower(trim(perfil.nome)) = 'administrador'
  )
  into v_administrador;

  if v_administrador then
    return true;
  end if;

  if exists (
    select 1
    from public.usuario_permissoes permissao_usuario
    where permissao_usuario.usuario_id = v_usuario_id
      and permissao_usuario.empresa_id = v_empresa_id
      and permissao_usuario.permissao_codigo = p_permissao_codigo
      and permissao_usuario.efeito = 'bloquear'
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.usuario_permissoes permissao_usuario
    where permissao_usuario.usuario_id = v_usuario_id
      and permissao_usuario.empresa_id = v_empresa_id
      and permissao_usuario.permissao_codigo = p_permissao_codigo
      and permissao_usuario.efeito = 'permitir'
  ) then
    return true;
  end if;

  return exists (
    select 1
    from public.usuarios_perfis vinculo
    join public.perfis_empresa perfil
      on perfil.id = vinculo.perfil_empresa_id
    join public.perfil_permissoes permissao_perfil
      on permissao_perfil.perfil_empresa_id = perfil.id
    where vinculo.usuario_id = v_usuario_id
      and perfil.empresa_id = v_empresa_id
      and perfil.ativo is true
      and permissao_perfil.permissao_codigo = p_permissao_codigo
  );
end;
$$;

revoke execute on function public.usuario_atual_tem_permissao(text)
  from public, anon, authenticated;

create or replace function public.validar_edicao_agenda_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Operacoes internas usam service_role e nao possuem auth.uid(). Chamadas
  -- anonimas nao chegam as funcoes de escrita, cujo EXECUTE e revogado abaixo.
  if auth.uid() is not null
    and not public.usuario_atual_tem_permissao('agendas.editar') then
    raise exception 'Você não tem permissão para editar agendas.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke execute on function public.validar_edicao_agenda_usuario()
  from public, anon, authenticated;

drop trigger if exists agenda_agendamentos_validar_edicao_usuario
  on public.agenda_agendamentos;

create trigger agenda_agendamentos_validar_edicao_usuario
before insert or update or delete on public.agenda_agendamentos
for each row
execute function public.validar_edicao_agenda_usuario();

drop trigger if exists agenda_tipos_validar_edicao_usuario
  on public.agenda_tipos;

create trigger agenda_tipos_validar_edicao_usuario
before insert or update or delete on public.agenda_tipos
for each row
execute function public.validar_edicao_agenda_usuario();

revoke execute on function public.agenda_etapa1_salvar_agendamento(uuid, uuid, jsonb)
  from anon;

revoke execute on function public.agenda_etapa1_salvar_tipo(uuid, text, text, text)
  from anon;
