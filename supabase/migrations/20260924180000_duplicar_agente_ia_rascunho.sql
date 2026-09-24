-- Duplica a configuracao de um agente de IA sem copiar estado de execucao.
-- O novo agente sempre nasce como rascunho para evitar atendimento acidental.

create or replace function public.duplicar_agente_ia(
  p_empresa_id uuid,
  p_agente_id uuid,
  p_usuario_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_origem public.agentes_ia%rowtype;
  v_novo_id uuid;
  v_novo_nome text;
begin
  select *
    into v_origem
  from public.agentes_ia
  where id = p_agente_id
    and empresa_id = p_empresa_id
    and status <> 'arquivado';

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Agente de IA original nao encontrado.';
  end if;

  v_novo_nome := left(
    case
      when right(lower(trim(v_origem.nome)), 8) = '- cópia' then v_origem.nome || ' 2'
      else v_origem.nome || ' - cópia'
    end,
    180
  );

  insert into public.agentes_ia (
    empresa_id,
    nome,
    descricao,
    status,
    modelo,
    prompt_sistema,
    tom_voz,
    instrucoes,
    max_mensagens_contexto,
    debounce_ms,
    fallback_fluxo_id,
    integracoes_whatsapp_ids,
    metadata_json,
    created_by,
    updated_by,
    modo_atendimento,
    fluxos_ids,
    fallback_exclusivo,
    fallback_tipo,
    fallback_transferencia_json,
    fallback_sem_contingencia_aceito,
    horarios
  )
  values (
    p_empresa_id,
    v_novo_nome,
    v_origem.descricao,
    'rascunho',
    v_origem.modelo,
    v_origem.prompt_sistema,
    v_origem.tom_voz,
    v_origem.instrucoes,
    v_origem.max_mensagens_contexto,
    v_origem.debounce_ms,
    v_origem.fallback_fluxo_id,
    v_origem.integracoes_whatsapp_ids,
    v_origem.metadata_json,
    p_usuario_id,
    p_usuario_id,
    v_origem.modo_atendimento,
    v_origem.fluxos_ids,
    v_origem.fallback_exclusivo,
    v_origem.fallback_tipo,
    v_origem.fallback_transferencia_json,
    v_origem.fallback_sem_contingencia_aceito,
    v_origem.horarios
  )
  returning id into v_novo_id;

  insert into public.agente_ia_ferramentas (
    empresa_id,
    agente_id,
    tipo,
    ativo,
    config_json
  )
  select
    p_empresa_id,
    v_novo_id,
    tipo,
    ativo,
    config_json
  from public.agente_ia_ferramentas
  where empresa_id = p_empresa_id
    and agente_id = p_agente_id;

  insert into public.agente_ia_conhecimentos (
    empresa_id,
    agente_id,
    titulo,
    categoria,
    conteudo,
    palavras_chave,
    prioridade,
    ativo,
    created_by,
    updated_by
  )
  select
    p_empresa_id,
    v_novo_id,
    titulo,
    categoria,
    conteudo,
    palavras_chave,
    prioridade,
    ativo,
    p_usuario_id,
    p_usuario_id
  from public.agente_ia_conhecimentos
  where empresa_id = p_empresa_id
    and agente_id = p_agente_id;

  insert into public.agente_ia_gatilhos (
    empresa_id,
    agente_id,
    tipo_gatilho,
    valor,
    condicao,
    ativo
  )
  select
    p_empresa_id,
    v_novo_id,
    tipo_gatilho,
    valor,
    condicao,
    ativo
  from public.agente_ia_gatilhos
  where empresa_id = p_empresa_id
    and agente_id = p_agente_id;

  return v_novo_id;
end;
$$;

revoke all on function public.duplicar_agente_ia(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.duplicar_agente_ia(uuid, uuid, uuid)
  to service_role;

comment on function public.duplicar_agente_ia(uuid, uuid, uuid) is
  'Duplica configuracao, ferramentas, conhecimentos e gatilhos de um agente de IA da mesma empresa. O novo agente sempre recebe status rascunho.';
