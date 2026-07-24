-- Remove referencias de midia de blocos excluidos e de arquivos removidos.
-- A biblioteca de midias continua preservada quando apenas o bloco e excluido.

create or replace function public.automacao_limpar_referencias_midia_config(
  p_configuracao jsonb
)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    coalesce(p_configuracao, '{}'::jsonb)
      - 'midia_url'
      - 'midia_nome'
      - 'midia_id'
      - 'media_url'
      - 'media_nome'
      - 'media_id'
      - 'arquivo_url'
      - 'arquivo_nome'
      - 'arquivo_id'
      - 'storage_path'
      - 'storagePath'
      - 'midia_removida';
$$;

create or replace function public.automacao_limpar_midia_ao_inativar_no()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.ativo = false
     and old.ativo is distinct from false
     and new.tipo_no in (
       'enviar_imagem',
       'enviar_video',
       'enviar_audio',
       'enviar_arquivo'
     ) then
    new.configuracao_json :=
      public.automacao_limpar_referencias_midia_config(new.configuracao_json);
  end if;

  return new;
end;
$$;

drop trigger if exists automacao_nos_limpar_midia_ao_inativar
  on public.automacao_nos;

create trigger automacao_nos_limpar_midia_ao_inativar
before update of ativo on public.automacao_nos
for each row
when (new.ativo = false and old.ativo is distinct from false)
execute function public.automacao_limpar_midia_ao_inativar_no();

create or replace function public.automacao_limpar_midia_antes_exclusao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_agora timestamptz := now();
begin
  update public.automacao_fluxos fluxo
     set status = 'pausado',
         updated_at = v_agora
   where fluxo.empresa_id = old.empresa_id
     and fluxo.status = 'ativo'
     and exists (
       select 1
         from public.automacao_nos no
        where no.empresa_id = old.empresa_id
          and no.fluxo_id = fluxo.id
          and no.ativo = true
          and no.tipo_no in (
            'enviar_imagem',
            'enviar_video',
            'enviar_audio',
            'enviar_arquivo'
          )
          and (
            nullif(btrim(no.configuracao_json->>'midia_id'), '') = old.id::text
            or nullif(btrim(no.configuracao_json->>'media_id'), '') = old.id::text
            or nullif(btrim(no.configuracao_json->>'arquivo_id'), '') = old.id::text
            or (
              old.url is not null
              and nullif(btrim(no.configuracao_json->>'midia_url'), '') = old.url
            )
            or (
              old.url is not null
              and nullif(btrim(no.configuracao_json->>'media_url'), '') = old.url
            )
            or (
              old.url is not null
              and nullif(btrim(no.configuracao_json->>'arquivo_url'), '') = old.url
            )
            or (
              old.storage_path is not null
              and nullif(btrim(no.configuracao_json->>'storage_path'), '') =
                old.storage_path
            )
            or (
              old.storage_path is not null
              and nullif(btrim(no.configuracao_json->>'storagePath'), '') =
                old.storage_path
            )
          )
     );

  update public.automacao_nos no
     set configuracao_json =
           case
             when no.ativo = true then
               jsonb_set(
                 public.automacao_limpar_referencias_midia_config(
                   no.configuracao_json
                 ),
                 '{midia_removida}',
                 jsonb_build_object(
                   'removida_em', v_agora,
                   'motivo', 'midia_excluida_biblioteca'
                 ),
                 true
               )
             else
               public.automacao_limpar_referencias_midia_config(
                 no.configuracao_json
               )
           end,
         updated_at = v_agora
   where no.empresa_id = old.empresa_id
     and no.tipo_no in (
       'enviar_imagem',
       'enviar_video',
       'enviar_audio',
       'enviar_arquivo'
     )
     and (
       nullif(btrim(no.configuracao_json->>'midia_id'), '') = old.id::text
       or nullif(btrim(no.configuracao_json->>'media_id'), '') = old.id::text
       or nullif(btrim(no.configuracao_json->>'arquivo_id'), '') = old.id::text
       or (
         old.url is not null
         and nullif(btrim(no.configuracao_json->>'midia_url'), '') = old.url
       )
       or (
         old.url is not null
         and nullif(btrim(no.configuracao_json->>'media_url'), '') = old.url
       )
       or (
         old.url is not null
         and nullif(btrim(no.configuracao_json->>'arquivo_url'), '') = old.url
       )
       or (
         old.storage_path is not null
         and nullif(btrim(no.configuracao_json->>'storage_path'), '') =
           old.storage_path
       )
       or (
         old.storage_path is not null
         and nullif(btrim(no.configuracao_json->>'storagePath'), '') =
           old.storage_path
       )
     );

  return old;
end;
$$;

drop trigger if exists midias_limpar_referencias_antes_exclusao
  on public.midias;

create trigger midias_limpar_referencias_antes_exclusao
before delete on public.midias
for each row
execute function public.automacao_limpar_midia_antes_exclusao();

-- Normaliza marcadores antigos para nao manter ID ou nome do arquivo removido.
update public.automacao_nos
   set configuracao_json = jsonb_set(
         configuracao_json - 'midia_removida',
         '{midia_removida}',
         jsonb_build_object(
           'removida_em',
           coalesce(
             nullif(configuracao_json->'midia_removida'->>'removida_em', ''),
             now()::text
           ),
           'motivo',
           coalesce(
             nullif(configuracao_json->'midia_removida'->>'motivo', ''),
             'midia_excluida_biblioteca'
           )
         ),
         true
       ),
       updated_at = now()
 where configuracao_json ? 'midia_removida';

-- Fluxos ativos com referencia para arquivo ja removido devem ser pausados.
update public.automacao_fluxos fluxo
   set status = 'pausado',
       updated_at = now()
 where fluxo.status = 'ativo'
   and exists (
     select 1
       from public.automacao_nos no
      where no.fluxo_id = fluxo.id
        and no.empresa_id = fluxo.empresa_id
        and no.ativo = true
        and no.tipo_no in (
          'enviar_imagem',
          'enviar_video',
          'enviar_audio',
          'enviar_arquivo'
        )
        and (
          nullif(btrim(no.configuracao_json->>'midia_id'), '') is not null
          or nullif(btrim(no.configuracao_json->>'media_id'), '') is not null
          or nullif(btrim(no.configuracao_json->>'arquivo_id'), '') is not null
          or nullif(btrim(no.configuracao_json->>'midia_nome'), '') is not null
          or nullif(btrim(no.configuracao_json->>'media_nome'), '') is not null
          or nullif(btrim(no.configuracao_json->>'arquivo_nome'), '') is not null
          or nullif(btrim(no.configuracao_json->>'midia_url'), '') is not null
          or nullif(btrim(no.configuracao_json->>'media_url'), '') is not null
          or nullif(btrim(no.configuracao_json->>'arquivo_url'), '') is not null
          or nullif(btrim(no.configuracao_json->>'storage_path'), '') is not null
          or nullif(btrim(no.configuracao_json->>'storagePath'), '') is not null
        )
        and not exists (
          select 1
            from public.midias midia
           where midia.empresa_id = no.empresa_id
             and (
               nullif(btrim(no.configuracao_json->>'midia_id'), '') =
                 midia.id::text
               or nullif(btrim(no.configuracao_json->>'media_id'), '') =
                 midia.id::text
               or nullif(btrim(no.configuracao_json->>'arquivo_id'), '') =
                 midia.id::text
               or nullif(btrim(no.configuracao_json->>'midia_url'), '') =
                 midia.url
               or nullif(btrim(no.configuracao_json->>'media_url'), '') =
                 midia.url
               or nullif(btrim(no.configuracao_json->>'arquivo_url'), '') =
                 midia.url
               or nullif(btrim(no.configuracao_json->>'storage_path'), '') =
                 midia.storage_path
               or nullif(btrim(no.configuracao_json->>'storagePath'), '') =
                 midia.storage_path
             )
        )
   );

-- Limpa referencias ativas para arquivos que ja nao existem na biblioteca.
update public.automacao_nos no
   set configuracao_json = jsonb_set(
         public.automacao_limpar_referencias_midia_config(
           no.configuracao_json
         ),
         '{midia_removida}',
         jsonb_build_object(
           'removida_em', now(),
           'motivo', 'midia_ausente_higienizada'
         ),
         true
       ),
       updated_at = now()
 where no.ativo = true
   and no.tipo_no in (
     'enviar_imagem',
     'enviar_video',
     'enviar_audio',
     'enviar_arquivo'
   )
   and (
     nullif(btrim(no.configuracao_json->>'midia_id'), '') is not null
     or nullif(btrim(no.configuracao_json->>'media_id'), '') is not null
     or nullif(btrim(no.configuracao_json->>'arquivo_id'), '') is not null
     or nullif(btrim(no.configuracao_json->>'midia_nome'), '') is not null
     or nullif(btrim(no.configuracao_json->>'media_nome'), '') is not null
     or nullif(btrim(no.configuracao_json->>'arquivo_nome'), '') is not null
     or nullif(btrim(no.configuracao_json->>'midia_url'), '') is not null
     or nullif(btrim(no.configuracao_json->>'media_url'), '') is not null
     or nullif(btrim(no.configuracao_json->>'arquivo_url'), '') is not null
     or nullif(btrim(no.configuracao_json->>'storage_path'), '') is not null
     or nullif(btrim(no.configuracao_json->>'storagePath'), '') is not null
   )
   and not exists (
     select 1
       from public.midias midia
      where midia.empresa_id = no.empresa_id
        and (
          nullif(btrim(no.configuracao_json->>'midia_id'), '') =
            midia.id::text
          or nullif(btrim(no.configuracao_json->>'media_id'), '') =
            midia.id::text
          or nullif(btrim(no.configuracao_json->>'arquivo_id'), '') =
            midia.id::text
          or nullif(btrim(no.configuracao_json->>'midia_url'), '') =
            midia.url
          or nullif(btrim(no.configuracao_json->>'media_url'), '') =
            midia.url
          or nullif(btrim(no.configuracao_json->>'arquivo_url'), '') =
            midia.url
          or nullif(btrim(no.configuracao_json->>'storage_path'), '') =
            midia.storage_path
          or nullif(btrim(no.configuracao_json->>'storagePath'), '') =
            midia.storage_path
        )
   );

-- Blocos removidos do fluxo nao devem manter qualquer referencia de midia.
update public.automacao_nos no
   set configuracao_json =
         public.automacao_limpar_referencias_midia_config(
           no.configuracao_json
         ),
       updated_at = now()
 where no.ativo = false
   and no.tipo_no in (
     'enviar_imagem',
     'enviar_video',
     'enviar_audio',
     'enviar_arquivo'
   )
   and (
     no.configuracao_json ? 'midia_url'
     or no.configuracao_json ? 'midia_nome'
     or no.configuracao_json ? 'midia_id'
     or no.configuracao_json ? 'media_url'
     or no.configuracao_json ? 'media_nome'
     or no.configuracao_json ? 'media_id'
     or no.configuracao_json ? 'arquivo_url'
     or no.configuracao_json ? 'arquivo_nome'
     or no.configuracao_json ? 'arquivo_id'
     or no.configuracao_json ? 'storage_path'
     or no.configuracao_json ? 'storagePath'
     or no.configuracao_json ? 'midia_removida'
   );
