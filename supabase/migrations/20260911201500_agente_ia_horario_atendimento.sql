alter table public.agentes_ia
  add column if not exists horarios jsonb not null
  default '{"ativo":false,"dias":[1,2,3,4,5],"inicio":"08:00","fim":"18:00","timezone":"America/Sao_Paulo"}'::jsonb;

create or replace function public.agente_ia_enfileirar_mensagem_agendada(
  p_empresa_id uuid,
  p_agente_id uuid,
  p_conversa_id uuid,
  p_contato_id uuid,
  p_numero_destino text,
  p_mensagem_id uuid,
  p_conteudo text,
  p_processar_em timestamptz
)
returns public.agente_ia_pendencias
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pendencia public.agente_ia_pendencias;
  v_processar_em timestamptz := greatest(coalesce(p_processar_em, now()), now() + interval '1 second');
begin
  if not exists (
    select 1 from public.agentes_ia a
    where a.id = p_agente_id and a.empresa_id = p_empresa_id and a.status = 'ativo'
  ) then raise exception 'Agente ativo nao encontrado para a empresa.'; end if;

  if not exists (
    select 1 from public.conversas c
    where c.id = p_conversa_id and c.empresa_id = p_empresa_id
  ) then raise exception 'Conversa nao encontrada para a empresa.'; end if;

  insert into public.agente_ia_pendencias (
    empresa_id, agente_id, conversa_id, contato_id, numero_destino,
    mensagem_ids, conteudo_agregado, processar_em, status, versao,
    lock_token, locked_at, tentativas, erro, updated_at
  ) values (
    p_empresa_id, p_agente_id, p_conversa_id, p_contato_id,
    nullif(trim(p_numero_destino), ''),
    case when p_mensagem_id is null then '{}'::uuid[] else array[p_mensagem_id] end,
    coalesce(p_conteudo, ''), v_processar_em,
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
    processar_em = v_processar_em,
    status = case
      when public.agente_ia_pendencias.status = 'processando'
        and public.agente_ia_pendencias.locked_at > now() - interval '2 minutes'
        then 'processando' else 'pendente' end,
    versao = public.agente_ia_pendencias.versao + 1,
    lock_token = case
      when public.agente_ia_pendencias.status = 'processando'
        and public.agente_ia_pendencias.locked_at > now() - interval '2 minutes'
        then public.agente_ia_pendencias.lock_token else null end,
    locked_at = case
      when public.agente_ia_pendencias.status = 'processando'
        and public.agente_ia_pendencias.locked_at > now() - interval '2 minutes'
        then public.agente_ia_pendencias.locked_at else null end,
    tentativas = 0,
    erro = null,
    updated_at = now()
  returning * into v_pendencia;

  return v_pendencia;
end;
$function$;

create or replace function public.agente_ia_reagendar_pendencia(
  p_pendencia_id uuid,
  p_versao bigint,
  p_processar_em timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_atual public.agente_ia_pendencias;
begin
  update public.agente_ia_pendencias
  set
    status = 'pendente',
    processar_em = greatest(coalesce(p_processar_em, now()), now() + interval '1 second'),
    lock_token = null,
    locked_at = null,
    erro = null,
    updated_at = now()
  where id = p_pendencia_id
    and versao = p_versao
    and status in ('pendente', 'processando')
    and (status <> 'processando' or locked_at is null or locked_at < now() - interval '2 minutes')
  returning * into v_atual;

  if v_atual.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'pendencia_alterada_ou_em_processamento');
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', v_atual.status,
    'versao', v_atual.versao,
    'processar_em', v_atual.processar_em
  );
end;
$function$;

create or replace function public.agente_ia_cancelar_pendencia_se_versao(
  p_pendencia_id uuid,
  p_versao bigint,
  p_motivo text default 'conversa_ja_respondida'
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rows integer := 0;
begin
  update public.agente_ia_pendencias
  set
    status = 'cancelado',
    mensagem_ids = '{}'::uuid[],
    conteudo_agregado = '',
    lock_token = null,
    locked_at = null,
    erro = coalesce(nullif(trim(p_motivo), ''), 'conversa_ja_respondida'),
    updated_at = now()
  where id = p_pendencia_id
    and versao = p_versao
    and status = 'pendente';

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$function$;

comment on column public.agentes_ia.horarios is
  'Janela semanal de atendimento do agente. Formato: ativo, dias (1=segunda..7=domingo), inicio, fim e timezone.';
comment on function public.agente_ia_enfileirar_mensagem_agendada(uuid, uuid, uuid, uuid, text, uuid, text, timestamptz) is
  'Consolida mensagens do agente por conversa e permite agendar o processamento para a proxima janela de atendimento.';
comment on function public.agente_ia_reagendar_pendencia(uuid, bigint, timestamptz) is
  'Reagenda atomicamente uma pendencia do agente quando a configuracao de horario mudou ou ainda esta fora do expediente.';
comment on function public.agente_ia_cancelar_pendencia_se_versao(uuid, bigint, text) is
  'Cancela uma pendencia ainda nao processada somente se a versao esperada continuar atual.';
