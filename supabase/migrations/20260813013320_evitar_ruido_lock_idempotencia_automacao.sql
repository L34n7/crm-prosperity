-- Mantem a trava atomica de idempotencia dos nos sem usar violacao de
-- constraint como fluxo normal de concorrencia.
--
-- O indice unico automacao_logs_lock_execucao_no_unico continua sendo a
-- protecao final. A diferenca e que a tentativa concorrente agora usa
-- ON CONFLICT DO NOTHING e retorna false, evitando SQLSTATE 23505 nos logs.

create or replace function public.automacao_tentar_travar_execucao_no(
  p_empresa_id uuid,
  p_execucao_id uuid,
  p_fluxo_id uuid,
  p_no_id uuid,
  p_visita_no integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visita integer := greatest(coalesce(p_visita_no, 1), 1);
  v_inseriu boolean := false;
begin
  insert into public.automacao_execucao_logs (
    empresa_id,
    execucao_id,
    fluxo_id,
    no_id,
    tipo_evento,
    descricao,
    entrada_json,
    saida_json
  )
  values (
    p_empresa_id,
    p_execucao_id,
    p_fluxo_id,
    p_no_id,
    'lock_execucao_no:' || v_visita::text,
    'Trava de idempotência para impedir execução duplicada do nó.',
    jsonb_build_object('visita_no', v_visita),
    '{}'::jsonb
  )
  on conflict do nothing
  returning true into v_inseriu;

  return coalesce(v_inseriu, false);
end;
$$;

revoke all on function public.automacao_tentar_travar_execucao_no(uuid, uuid, uuid, uuid, integer)
  from public, anon, authenticated;

grant execute on function public.automacao_tentar_travar_execucao_no(uuid, uuid, uuid, uuid, integer)
  to service_role;

comment on function public.automacao_tentar_travar_execucao_no(uuid, uuid, uuid, uuid, integer) is
  'Adquire de forma atomica e silenciosa a trava de idempotencia de um no/visita da automacao. Retorna false em concorrencia sem gerar violacao 23505.';
