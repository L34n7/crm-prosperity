-- Desconectar uma integracao WhatsApp nao deve pausar fluxos da empresa.
--
-- A rotina de desconexao ainda:
-- - cria backup da integracao;
-- - limpa templates pertencentes ao numero removido;
-- - limpa referencias de template nos blocos impactados;
-- - cancela execucoes/agendamentos que dependiam da integracao removida;
-- - preserva o historico.
--
-- Porem o status do fluxo permanece inalterado. Isso permite que fluxos
-- padrao continuem ativos para outras integracoes da empresa e evita que uma
-- futura mensagem deixe de iniciar automacao apenas porque outro numero foi
-- desconectado.

do $do$
declare
  v_oid oid;
  v_def text;
  v_nova text;
begin
  select p.oid
    into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'backup_e_excluir_integracao_whatsapp'
    and pg_get_function_identity_arguments(p.oid) =
      'p_integracao_id uuid, p_empresa_id uuid, p_usuario_id uuid'
  limit 1;

  if v_oid is null then
    raise exception
      'Funcao backup_e_excluir_integracao_whatsapp nao encontrada.';
  end if;

  -- A versao historica da funcao foi criada com CRLF em uma migration.
  -- Normalizamos para garantir que a substituicao seja deterministica.
  v_def := replace(pg_get_functiondef(v_oid), chr(13), '');

  v_nova := replace(
    v_def,
    E'  -- Fluxos que perderao templates deixam de iniciar novas execucoes.\n  update public.automacao_fluxos\n  set\n    status = ''pausado'',\n    updated_at = now()\n  where empresa_id = p_empresa_id\n    and id = any(v_fluxo_ids)\n    and status = ''ativo'';\n\n',
    E'  -- A desconexao de uma integracao nao altera o status dos fluxos.\n  -- O fluxo permanece ativo; apenas referencias operacionais da integracao\n  -- removida sao limpas/canceladas abaixo.\n\n'
  );

  if v_nova = v_def then
    -- Idempotencia: se a regra nova ja estiver presente, nao ha nada a fazer.
    if position(
      'A desconexao de uma integracao nao altera o status dos fluxos'
      in v_def
    ) > 0 then
      return;
    end if;

    raise exception
      'Bloco de pausa de fluxos nao localizado na funcao atual.';
  end if;

  execute v_nova;
end
$do$;

comment on function public.backup_e_excluir_integracao_whatsapp(uuid, uuid, uuid) is
  'Cria backup e exclui uma integracao Meta atomicamente sem alterar o status dos fluxos da empresa. Fluxos permanecem ativos; referencias e execucoes dependentes da integracao removida sao tratadas separadamente.';
