-- Ajusta o cooldown financeiro da Meta para 3 min -> 6 min -> 10 min.
-- Mantém a fila preservada e uma tentativa controlada por integração após o intervalo.

create or replace function public.claim_whatsapp_meta_payment_block(
  p_empresa_id uuid,
  p_integracao_id uuid,
  p_codigo integer,
  p_detalhe text,
  p_mensagem_externa_id text,
  p_ocorrido_em timestamptz default now()
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_raw jsonb;
  v_bloqueio jsonb;
  v_ativo boolean := false;
  v_mesma_mensagem boolean := false;
  v_nivel integer := 0;
  v_segundos integer := 180;
  v_cooldown_ate timestamptz;
begin
  select coalesce(meta_saude_raw_json, '{}'::jsonb)
    into v_raw
  from public.integracoes_whatsapp
  where id = p_integracao_id
    and empresa_id = p_empresa_id
  for update;

  if not found then
    return false;
  end if;

  v_bloqueio := coalesce(v_raw -> 'bloqueio_financeiro_meta', '{}'::jsonb);
  v_ativo := lower(coalesce(v_bloqueio ->> 'ativo', 'false')) = 'true';
  v_mesma_mensagem :=
    coalesce(v_bloqueio ->> 'mensagem_externa_id', '') <> ''
    and coalesce(v_bloqueio ->> 'mensagem_externa_id', '') =
        coalesce(p_mensagem_externa_id, '');

  if v_ativo and v_mesma_mensagem then
    update public.integracoes_whatsapp
    set
      meta_saude_ultima_verificacao_em = greatest(
        coalesce(meta_saude_ultima_verificacao_em, p_ocorrido_em),
        p_ocorrido_em
      ),
      updated_at = now()
    where id = p_integracao_id
      and empresa_id = p_empresa_id;

    return false;
  end if;

  if v_ativo then
    begin
      v_nivel := greatest(
        1,
        coalesce((v_bloqueio ->> 'cooldown_nivel')::integer, 1)
      );
    exception when others then
      v_nivel := 1;
    end;
    v_nivel := least(3, v_nivel + 1);
  else
    v_nivel := 1;
  end if;

  v_segundos := case v_nivel
    when 1 then 180
    when 2 then 360
    else 600
  end;

  v_cooldown_ate := p_ocorrido_em + make_interval(secs => v_segundos);

  v_bloqueio :=
    v_bloqueio ||
    jsonb_build_object(
      'ativo', true,
      'codigo', p_codigo,
      'detalhe', p_detalhe,
      'ocorrido_em',
        case
          when v_ativo then coalesce(
            v_bloqueio -> 'ocorrido_em',
            to_jsonb(p_ocorrido_em)
          )
          else to_jsonb(p_ocorrido_em)
        end,
      'ultima_falha_em', p_ocorrido_em,
      'mensagem_externa_id', p_mensagem_externa_id,
      'origem', coalesce(v_bloqueio ->> 'origem', 'webhook_status_meta'),
      'cooldown_nivel', v_nivel,
      'cooldown_segundos', v_segundos,
      'cooldown_ate', v_cooldown_ate,
      'probe_em_andamento_ate', null,
      'falhas_consecutivas',
        case
          when v_ativo then
            case
              when coalesce(v_bloqueio ->> 'falhas_consecutivas', '') ~ '^\\d+$'
                then (v_bloqueio ->> 'falhas_consecutivas')::integer + 1
              else 2
            end
          else 1
        end,
      'pausas', coalesce(
        v_bloqueio -> 'pausas',
        jsonb_build_object(
          'conversas_encerradas', 0,
          'execucoes_canceladas', 0,
          'agendamentos_cancelados', 0,
          'pendencias_ia_canceladas', 0,
          'execucoes_ia_canceladas', 0,
          'jobs_fila_cancelados', 0,
          'campanhas_pausadas', 0
        )
      )
    );

  update public.integracoes_whatsapp
  set
    meta_saude_ultima_verificacao_em = p_ocorrido_em,
    meta_saude_raw_json = jsonb_set(
      v_raw,
      '{bloqueio_financeiro_meta}',
      v_bloqueio,
      true
    ),
    updated_at = now()
  where id = p_integracao_id
    and empresa_id = p_empresa_id;

  return not v_ativo;
end;
$$;
