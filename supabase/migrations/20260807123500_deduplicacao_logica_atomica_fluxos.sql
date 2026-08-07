-- Deduplicacao logica atomica de entradas rapidas do WhatsApp.
-- Mantem todas as mensagens no historico, mas impede que duas entradas iguais,
-- consecutivas e sem resposta intermediaria executem o motor duas vezes.

create table if not exists public.automacao_entrada_logica_estado (
  conversa_id uuid primary key,
  empresa_id uuid not null,
  mensagem_id uuid,
  conteudo_hash text not null,
  mensagem_em timestamptz not null,
  execucao_id uuid,
  no_id uuid,
  estado_chave text,
  updated_at timestamptz not null default now()
);

create index if not exists automacao_entrada_logica_estado_empresa_idx
  on public.automacao_entrada_logica_estado (empresa_id, updated_at desc);

alter table public.automacao_entrada_logica_estado enable row level security;

comment on table public.automacao_entrada_logica_estado is
  'Ultima entrada aceita pelo motor por conversa, usada para deduplicacao logica atomica de repeticoes rapidas.';

create or replace function public.claim_automacao_entrada_logica(
  p_empresa_id uuid,
  p_conversa_id uuid,
  p_mensagem_id uuid,
  p_conteudo_normalizado text,
  p_mensagem_em timestamptz,
  p_janela_segundos integer default 4
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_janela_segundos integer := greatest(1, least(coalesce(p_janela_segundos, 4), 10));
  v_conteudo_hash text;
  v_anterior_hash text;
  v_anterior_mensagem_id uuid;
  v_anterior_mensagem_em timestamptz;
  v_anterior_estado_chave text;
  v_execucao_id uuid;
  v_no_id uuid;
  v_metadata_json jsonb;
  v_visita_no text;
  v_agenda_etapa text;
  v_estado_chave text;
  v_intervalo_segundos numeric;
  v_houve_resposta_intermediaria boolean := false;
begin
  if p_empresa_id is null
     or p_conversa_id is null
     or p_mensagem_id is null
     or p_mensagem_em is null
     or nullif(trim(coalesce(p_conteudo_normalizado, '')), '') is null then
    return jsonb_build_object(
      'claimed', true,
      'reason', 'entrada_incompleta_fail_open'
    );
  end if;

  v_conteudo_hash := md5(p_conteudo_normalizado);

  -- Serializa apenas claims da mesma conversa. Nao ha espera artificial:
  -- a trava existe somente durante esta transacao curta.
  perform pg_advisory_xact_lock(hashtextextended(p_conversa_id::text, 0));

  select
    e.id,
    e.no_atual_id,
    e.metadata_json
  into
    v_execucao_id,
    v_no_id,
    v_metadata_json
  from public.automacao_execucoes e
  where e.empresa_id = p_empresa_id
    and e.conversa_id = p_conversa_id
    and e.status in ('rodando', 'aguardando')
  order by e.updated_at desc
  limit 1;

  v_visita_no := case
    when v_no_id is null then ''
    else coalesce(v_metadata_json -> 'visitas_nos' ->> v_no_id::text, '')
  end;

  v_agenda_etapa := case
    when v_no_id is null then ''
    else coalesce(
      v_metadata_json -> 'agenda_estado' -> v_no_id::text ->> 'etapa',
      ''
    )
  end;

  v_estado_chave := concat_ws(
    ':',
    coalesce(v_execucao_id::text, 'sem_execucao'),
    coalesce(v_no_id::text, 'sem_no'),
    coalesce(v_visita_no, ''),
    coalesce(v_agenda_etapa, '')
  );

  select
    s.conteudo_hash,
    s.mensagem_id,
    s.mensagem_em,
    s.estado_chave
  into
    v_anterior_hash,
    v_anterior_mensagem_id,
    v_anterior_mensagem_em,
    v_anterior_estado_chave
  from public.automacao_entrada_logica_estado s
  where s.conversa_id = p_conversa_id
    and s.empresa_id = p_empresa_id;

  if v_anterior_mensagem_em is not null
     and v_anterior_hash = v_conteudo_hash then
    v_intervalo_segundos := abs(
      extract(epoch from (p_mensagem_em - v_anterior_mensagem_em))
    );

    if v_intervalo_segundos <= v_janela_segundos then
      select exists (
        select 1
        from public.mensagens m
        where m.empresa_id = p_empresa_id
          and m.conversa_id = p_conversa_id
          and m.remetente_tipo in ('bot', 'usuario', 'sistema')
          and m.created_at > least(v_anterior_mensagem_em, p_mensagem_em)
          and m.created_at <= greatest(v_anterior_mensagem_em, p_mensagem_em)
      )
      into v_houve_resposta_intermediaria;

      if not v_houve_resposta_intermediaria then
        update public.mensagens
        set metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
          'automacao_processada', true,
          'automacao_processada_em', now(),
          'automacao_resultado', jsonb_build_object(
            'ok', true,
            'status', 'ignorado_repeticao_rapida',
            'deduplicacao_logica', true,
            'mensagem_original_id', v_anterior_mensagem_id,
            'janela_segundos', v_janela_segundos,
            'estado_anterior', v_anterior_estado_chave,
            'estado_atual', v_estado_chave
          )
        )
        where id = p_mensagem_id
          and empresa_id = p_empresa_id
          and conversa_id = p_conversa_id;

        return jsonb_build_object(
          'claimed', false,
          'reason', 'repeticao_rapida_sem_resposta_intermediaria',
          'mensagem_original_id', v_anterior_mensagem_id,
          'execucao_id', v_execucao_id,
          'no_id', v_no_id,
          'estado_chave', v_estado_chave,
          'intervalo_segundos', v_intervalo_segundos
        );
      end if;
    end if;
  end if;

  insert into public.automacao_entrada_logica_estado (
    conversa_id,
    empresa_id,
    mensagem_id,
    conteudo_hash,
    mensagem_em,
    execucao_id,
    no_id,
    estado_chave,
    updated_at
  ) values (
    p_conversa_id,
    p_empresa_id,
    p_mensagem_id,
    v_conteudo_hash,
    p_mensagem_em,
    v_execucao_id,
    v_no_id,
    v_estado_chave,
    now()
  )
  on conflict (conversa_id) do update
  set empresa_id = excluded.empresa_id,
      mensagem_id = excluded.mensagem_id,
      conteudo_hash = excluded.conteudo_hash,
      mensagem_em = excluded.mensagem_em,
      execucao_id = excluded.execucao_id,
      no_id = excluded.no_id,
      estado_chave = excluded.estado_chave,
      updated_at = now();

  return jsonb_build_object(
    'claimed', true,
    'reason', case
      when v_houve_resposta_intermediaria then 'nova_entrada_apos_resposta'
      else 'entrada_aceita'
    end,
    'execucao_id', v_execucao_id,
    'no_id', v_no_id,
    'estado_chave', v_estado_chave
  );
end;
$$;

revoke all on function public.claim_automacao_entrada_logica(
  uuid,
  uuid,
  uuid,
  text,
  timestamptz,
  integer
) from public;

grant execute on function public.claim_automacao_entrada_logica(
  uuid,
  uuid,
  uuid,
  text,
  timestamptz,
  integer
) to service_role;

comment on function public.claim_automacao_entrada_logica(
  uuid,
  uuid,
  uuid,
  text,
  timestamptz,
  integer
) is
  'Claim atomico por conversa para impedir execucao duplicada do motor em mensagens iguais enviadas em sequencia, sem bloquear repeticoes apos uma nova resposta.';