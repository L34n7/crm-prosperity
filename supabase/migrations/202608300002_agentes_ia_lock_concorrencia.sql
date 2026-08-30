-- Mantém o lock da conversa quando novas mensagens chegam durante uma chamada de IA.
-- A versão é incrementada; o worker atual libera uma nova rodada somente após concluir.

create or replace function public.agente_ia_enfileirar_mensagem(
  p_empresa_id uuid,
  p_agente_id uuid,
  p_conversa_id uuid,
  p_contato_id uuid,
  p_numero_destino text,
  p_mensagem_id uuid,
  p_conteudo text,
  p_debounce_ms integer
)
returns public.agente_ia_pendencias
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pendencia public.agente_ia_pendencias;
  v_debounce integer := least(greatest(coalesce(p_debounce_ms, 1200), 250), 10000);
begin
  if not exists (
    select 1 from public.agentes_ia a
    where a.id = p_agente_id
      and a.empresa_id = p_empresa_id
      and a.status = 'ativo'
  ) then
    raise exception 'Agente ativo nao encontrado para a empresa.';
  end if;

  if not exists (
    select 1 from public.conversas c
    where c.id = p_conversa_id and c.empresa_id = p_empresa_id
  ) then
    raise exception 'Conversa nao encontrada para a empresa.';
  end if;

  insert into public.agente_ia_pendencias (
    empresa_id, agente_id, conversa_id, contato_id, numero_destino,
    mensagem_ids, conteudo_agregado, processar_em, status, versao,
    lock_token, locked_at, tentativas, erro, updated_at
  ) values (
    p_empresa_id, p_agente_id, p_conversa_id, p_contato_id,
    nullif(trim(p_numero_destino), ''),
    case when p_mensagem_id is null then '{}'::uuid[] else array[p_mensagem_id] end,
    coalesce(p_conteudo, ''),
    now() + (v_debounce * interval '1 millisecond'),
    'pendente', 1, null, null, 0, null, now()
  )
  on conflict (empresa_id, conversa_id) do update set
    agente_id = excluded.agente_id,
    contato_id = coalesce(excluded.contato_id, public.agente_ia_pendencias.contato_id),
    numero_destino = coalesce(excluded.numero_destino, public.agente_ia_pendencias.numero_destino),
    mensagem_ids = case
      when p_mensagem_id is null or p_mensagem_id = any(public.agente_ia_pendencias.mensagem_ids)
        then public.agente_ia_pendencias.mensagem_ids
      else array_append(public.agente_ia_pendencias.mensagem_ids, p_mensagem_id)
    end,
    conteudo_agregado = case
      when coalesce(trim(p_conteudo), '') = '' then public.agente_ia_pendencias.conteudo_agregado
      when coalesce(trim(public.agente_ia_pendencias.conteudo_agregado), '') = '' then p_conteudo
      else public.agente_ia_pendencias.conteudo_agregado || E'\n' || p_conteudo
    end,
    processar_em = now() + (v_debounce * interval '1 millisecond'),
    status = case
      when public.agente_ia_pendencias.status = 'processando'
        and public.agente_ia_pendencias.locked_at > now() - interval '2 minutes'
        then 'processando'
      else 'pendente'
    end,
    versao = public.agente_ia_pendencias.versao + 1,
    lock_token = case
      when public.agente_ia_pendencias.status = 'processando'
        and public.agente_ia_pendencias.locked_at > now() - interval '2 minutes'
        then public.agente_ia_pendencias.lock_token
      else null
    end,
    locked_at = case
      when public.agente_ia_pendencias.status = 'processando'
        and public.agente_ia_pendencias.locked_at > now() - interval '2 minutes'
        then public.agente_ia_pendencias.locked_at
      else null
    end,
    erro = null,
    updated_at = now()
  returning * into v_pendencia;

  return v_pendencia;
end;
$$;

revoke all on function public.agente_ia_enfileirar_mensagem(uuid, uuid, uuid, uuid, text, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.agente_ia_enfileirar_mensagem(uuid, uuid, uuid, uuid, text, uuid, text, integer)
  to service_role;
