-- Padroniza capturas de nome do contato sem depender do nome da variável configurada no fluxo.

create or replace function public.contato_informacoes_captura_preparar()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_nome_base text;
  v_usuario_id uuid;
  v_variavel_configurada text;
begin
  if tg_op = 'UPDATE' then
    if new.empresa_id <> old.empresa_id
      or new.contato_id <> old.contato_id
      or new.tipo <> old.tipo
      or new.sequencia <> old.sequencia
    then
      raise exception using
        errcode = '23514',
        message = 'Empresa, contato, tipo e sequência da captura não podem ser alterados.';
    end if;

    new.capturado_em := old.capturado_em;
  end if;

  if not exists (
    select 1
    from public.contatos contato
    where contato.id = new.contato_id
      and contato.empresa_id = new.empresa_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'O contato informado não pertence à empresa da captura.';
  end if;

  if new.fluxo_id is not null then
    if tg_op = 'INSERT'
      or (tg_op = 'UPDATE' and new.fluxo_id is distinct from old.fluxo_id)
    then
      if not exists (
        select 1
        from public.automacao_fluxos fluxo
        where fluxo.id = new.fluxo_id
          and fluxo.empresa_id = new.empresa_id
      ) then
        raise exception using
          errcode = '23503',
          message = 'O fluxo informado não pertence à empresa da captura.';
      end if;
    end if;
  end if;

  if new.no_id is not null then
    if tg_op = 'INSERT'
      or (
        tg_op = 'UPDATE'
        and (
          new.no_id is distinct from old.no_id
          or (new.fluxo_id is distinct from old.fluxo_id and new.fluxo_id is not null)
        )
      )
    then
      if not exists (
        select 1
        from public.automacao_nos no_origem
        where no_origem.id = new.no_id
          and no_origem.empresa_id = new.empresa_id
          and (new.fluxo_id is null or no_origem.fluxo_id = new.fluxo_id)
      ) then
        raise exception using
          errcode = '23503',
          message = 'O bloco informado não pertence à empresa ou ao fluxo da captura.';
      end if;
    end if;
  end if;

  if new.execucao_id is not null then
    if tg_op = 'INSERT'
      or (
        tg_op = 'UPDATE'
        and (
          new.execucao_id is distinct from old.execucao_id
          or (new.fluxo_id is distinct from old.fluxo_id and new.fluxo_id is not null)
        )
      )
    then
      if not exists (
        select 1
        from public.automacao_execucoes execucao
        where execucao.id = new.execucao_id
          and execucao.empresa_id = new.empresa_id
          and (execucao.contato_id is null or execucao.contato_id = new.contato_id)
          and (new.fluxo_id is null or execucao.fluxo_id = new.fluxo_id)
      ) then
        raise exception using
          errcode = '23503',
          message = 'A execução informada não pertence à origem da captura.';
      end if;
    end if;
  end if;

  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(
      hashtextextended(
        new.empresa_id::text || ':' || new.contato_id::text || ':' || new.tipo,
        0
      )
    );

    if new.sequencia is null then
      select coalesce(max(informacao.sequencia), -1) + 1
        into new.sequencia
      from public.contato_informacoes_captura informacao
      where informacao.empresa_id = new.empresa_id
        and informacao.contato_id = new.contato_id
        and informacao.tipo = new.tipo;
    end if;
  end if;

  if new.tipo = 'nome' then
    v_variavel_configurada := nullif(trim(coalesce(new.variavel_origem, '')), '');

    if v_variavel_configurada is not null
      and v_variavel_configurada <> 'nome_captura'
    then
      new.metadata_json := coalesce(new.metadata_json, '{}'::jsonb)
        || jsonb_build_object('variavel_configurada', v_variavel_configurada);
    end if;

    new.variavel_origem := 'nome_captura';
  end if;

  v_nome_base := case new.tipo
    when 'nome' then 'Nome captura'
    when 'email' then 'E-mail'
    when 'telefone' then 'Telefone'
    when 'cpf' then 'CPF'
    when 'cnpj' then 'CNPJ'
    when 'data' then 'Data'
    when 'cep' then 'CEP'
    when 'numero' then 'Número'
    when 'moeda' then 'Moeda'
    else 'Observação'
  end;

  if tg_op = 'INSERT' or new.tipo = 'nome' then
    new.nome_campo := case
      when new.sequencia = 0 then v_nome_base
      else v_nome_base || ' ' || new.sequencia::text
    end;
  else
    new.nome_campo := old.nome_campo;
  end if;

  select usuario.id
    into v_usuario_id
  from public.usuarios usuario
  where usuario.auth_user_id = auth.uid()
    and usuario.empresa_id = new.empresa_id
    and usuario.status = 'ativo'
  limit 1;

  if tg_op = 'INSERT' then
    new.criado_por := coalesce(new.criado_por, v_usuario_id);
    new.atualizado_por := coalesce(new.atualizado_por, new.criado_por);
  else
    new.atualizado_por := coalesce(new.atualizado_por, v_usuario_id);
  end if;

  if tg_op = 'UPDATE' and old.ativo = true and new.ativo = false then
    new.excluido_em := coalesce(new.excluido_em, now());
    new.excluido_por := coalesce(new.excluido_por, v_usuario_id);
  elsif tg_op = 'UPDATE' and old.ativo = false and new.ativo = true then
    new.excluido_em := null;
    new.excluido_por := null;
  end if;

  new.atualizado_em := now();
  return new;
end;
$function$;

-- Reprocessa capturas de nome antigas para padronizar rótulo/origem,
-- mantendo o nome configurado no nó em metadata_json.variavel_configurada.
update public.contato_informacoes_captura
set variavel_origem = variavel_origem
where tipo = 'nome';
