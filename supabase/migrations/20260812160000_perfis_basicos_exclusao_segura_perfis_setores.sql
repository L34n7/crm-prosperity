-- Perfis novos recebem um conjunto operacional e conservador de permissoes.
-- Perfis e setores somente podem ser excluidos depois de arquivados e sem
-- vinculos que comprometam usuarios ou historico da operacao.

alter table public.perfis_empresa
  add column if not exists archived_at timestamptz;

alter table public.setores
  add column if not exists archived_at timestamptz;

update public.perfis_empresa
set archived_at = coalesce(updated_at, now())
where ativo is false
  and archived_at is null;

update public.setores
set archived_at = coalesce(updated_at, now())
where ativo is false
  and archived_at is null;

comment on column public.perfis_empresa.archived_at is
  'Data do arquivamento exigida antes da exclusao definitiva do perfil.';

comment on column public.setores.archived_at is
  'Data do arquivamento exigida antes da exclusao definitiva do setor.';

insert into public.permissoes (codigo, descricao)
values
  ('perfis.remover', 'Excluir definitivamente perfis arquivados'),
  ('setores.remover', 'Excluir definitivamente setores arquivados')
on conflict (codigo) do update
set descricao = excluded.descricao;

insert into public.perfil_permissoes (perfil_empresa_id, permissao_codigo)
select perfil.id, permissao.codigo
from public.perfis_empresa perfil
cross join (
  values ('perfis.remover'::text), ('setores.remover'::text)
) as permissao(codigo)
where lower(trim(perfil.nome)) = 'administrador'
on conflict (perfil_empresa_id, permissao_codigo) do nothing;

create or replace function public.aplicar_permissoes_basicas_novo_perfil()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- O Administrador e preenchido pelo bootstrap com todo o catalogo.
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
    'dashboard.visualizar',
    'conversas.visualizar',
    'conversas.assumir',
    'conversas.encerrar',
    'mensagens.visualizar',
    'mensagens.enviar',
    'mensagens.enviar_midia',
    'mensagens.favoritar',
    'contatos.visualizar',
    'contatos.criar',
    'contatos.editar'
  ]::text[])
  on conflict (perfil_empresa_id, permissao_codigo) do nothing;

  return new;
end;
$$;

drop trigger if exists perfis_empresa_aplicar_permissoes_basicas
  on public.perfis_empresa;

create trigger perfis_empresa_aplicar_permissoes_basicas
after insert on public.perfis_empresa
for each row
execute function public.aplicar_permissoes_basicas_novo_perfil();

revoke execute on function public.aplicar_permissoes_basicas_novo_perfil()
  from public, anon, authenticated;

-- Vínculos de usuarios e conversas devem bloquear a exclusao. CASCADE e
-- SET NULL poderiam apagar associacoes ou retirar o setor do historico.
alter table public.usuarios_perfis
  drop constraint if exists usuarios_perfis_perfil_empresa_id_fkey;

alter table public.usuarios_perfis
  add constraint usuarios_perfis_perfil_empresa_id_fkey
  foreign key (perfil_empresa_id)
  references public.perfis_empresa(id)
  on delete restrict;

alter table public.usuarios_setores
  drop constraint if exists usuarios_setores_setor_id_fkey;

alter table public.usuarios_setores
  add constraint usuarios_setores_setor_id_fkey
  foreign key (setor_id)
  references public.setores(id)
  on delete restrict;

alter table public.conversas
  drop constraint if exists conversas_setor_id_fkey;

alter table public.conversas
  add constraint conversas_setor_id_fkey
  foreign key (setor_id)
  references public.setores(id)
  on delete restrict;

create or replace function public.excluir_perfil_empresa_definitivamente(
  p_empresa_id uuid,
  p_perfil_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_perfil public.perfis_empresa%rowtype;
begin
  select perfil.*
  into v_perfil
  from public.perfis_empresa perfil
  where perfil.id = p_perfil_id
    and perfil.empresa_id = p_empresa_id
  for update;

  if not found then
    raise exception 'PERFIL_NAO_ENCONTRADO';
  end if;

  if v_perfil.ativo is true or v_perfil.archived_at is null then
    raise exception 'PERFIL_NAO_ARQUIVADO';
  end if;

  if exists (
    select 1
    from public.usuarios_perfis vinculo
    where vinculo.perfil_empresa_id = p_perfil_id
  ) then
    raise exception 'PERFIL_COM_USUARIOS';
  end if;

  delete from public.perfis_empresa perfil
  where perfil.id = p_perfil_id
    and perfil.empresa_id = p_empresa_id;

  return jsonb_build_object(
    'id', v_perfil.id,
    'nome', v_perfil.nome,
    'descricao', v_perfil.descricao,
    'archived_at', v_perfil.archived_at
  );
end;
$$;

create or replace function public.excluir_setor_definitivamente(
  p_empresa_id uuid,
  p_setor_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_setor public.setores%rowtype;
begin
  select setor.*
  into v_setor
  from public.setores setor
  where setor.id = p_setor_id
    and setor.empresa_id = p_empresa_id
  for update;

  if not found then
    raise exception 'SETOR_NAO_ENCONTRADO';
  end if;

  if v_setor.ativo is true or v_setor.archived_at is null then
    raise exception 'SETOR_NAO_ARQUIVADO';
  end if;

  if exists (
    select 1
    from public.usuarios_setores vinculo
    where vinculo.setor_id = p_setor_id
  ) then
    raise exception 'SETOR_COM_USUARIOS';
  end if;

  if exists (
    select 1
    from public.conversas conversa
    where conversa.empresa_id = p_empresa_id
      and conversa.setor_id = p_setor_id
  ) then
    raise exception 'SETOR_COM_HISTORICO_CONVERSAS';
  end if;

  if exists (
    select 1
    from public.automacao_nos no_fluxo
    join public.automacao_fluxos fluxo_no
      on fluxo_no.id = no_fluxo.fluxo_id
     and fluxo_no.empresa_id = no_fluxo.empresa_id
    where no_fluxo.empresa_id = p_empresa_id
      and no_fluxo.ativo is true
      and fluxo_no.status <> 'arquivado'
      and (
        no_fluxo.configuracao_json ->> 'setor_id' = p_setor_id::text
        or no_fluxo.configuracao_json ->> 'setor_excesso_tentativas' = p_setor_id::text
      )
  ) or exists (
    select 1
    from public.automacao_fluxos fluxo
    where fluxo.empresa_id = p_empresa_id
      and fluxo.status <> 'arquivado'
      and fluxo.configuracao_json::text like '%' || p_setor_id::text || '%'
  ) then
    raise exception 'SETOR_EM_USO_AUTOMACAO';
  end if;

  delete from public.setores setor
  where setor.id = p_setor_id
    and setor.empresa_id = p_empresa_id;

  return jsonb_build_object(
    'id', v_setor.id,
    'nome', v_setor.nome,
    'descricao', v_setor.descricao,
    'archived_at', v_setor.archived_at
  );
end;
$$;

revoke execute on function public.excluir_perfil_empresa_definitivamente(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.excluir_setor_definitivamente(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.excluir_perfil_empresa_definitivamente(uuid, uuid)
  to service_role;
grant execute on function public.excluir_setor_definitivamente(uuid, uuid)
  to service_role;
