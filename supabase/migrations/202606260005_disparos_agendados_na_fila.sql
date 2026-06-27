alter table public.whatsapp_disparo_campanhas
  add column if not exists agendamento_chave text;

alter table public.whatsapp_disparo_itens
  add column if not exists automacao_agendamento_id uuid
    references public.automacao_agendamentos(id) on delete set null;

alter table public.automacao_agendamentos
  add column if not exists campanha_disparo_id uuid
    references public.whatsapp_disparo_campanhas(id) on delete set null,
  add column if not exists item_disparo_id uuid
    references public.whatsapp_disparo_itens(id) on delete set null;

create unique index if not exists whatsapp_disparo_campanhas_agendamento_chave_uidx
  on public.whatsapp_disparo_campanhas (empresa_id, agendamento_chave)
  where agendamento_chave is not null;

create unique index if not exists whatsapp_disparo_itens_agendamento_uidx
  on public.whatsapp_disparo_itens (automacao_agendamento_id);

create index if not exists automacao_agendamentos_disparo_fila_idx
  on public.automacao_agendamentos (
    empresa_id,
    tipo_agendamento,
    status,
    executar_em
  )
  where tipo_agendamento = 'disparo_template';

create index if not exists automacao_agendamentos_campanha_disparo_idx
  on public.automacao_agendamentos (campanha_disparo_id)
  where campanha_disparo_id is not null;

create or replace function public.sincronizar_automacao_agendamentos_campanha(
  p_campanha_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atualizados integer := 0;
begin
  update public.automacao_agendamentos a
  set
    status = case
      when i.status = 'enviado' then 'executado'
      when i.status = 'falha' then 'erro'
      when i.status = 'cancelado' then 'cancelado'
      when c.status not in ('pendente', 'enviando') then 'cancelado'
      else 'executando'
    end,
    executed_at = case
      when i.status in ('enviado', 'falha', 'cancelado')
        or c.status not in ('pendente', 'enviando')
        then coalesce(i.processed_at, now())
      else null
    end,
    campanha_disparo_id = i.campanha_id,
    item_disparo_id = i.id,
    payload_json = coalesce(a.payload_json, '{}'::jsonb)
      || jsonb_build_object(
        'processamento_modelo', 'fila_qstash',
        'campanha_disparo_id', i.campanha_id,
        'item_disparo_id', i.id,
        'resultado_envio', jsonb_strip_nulls(
          jsonb_build_object(
            'message_id', i.message_id,
            'conversa_id', i.conversa_id,
            'protocolo_id', i.conversa_protocolo_id,
            'template_nome', c.template_nome,
            'numero_destino', i.numero,
            'variaveis', i.variaveis,
            'status_item', i.status,
            'status_http', i.status_http
          )
        ),
        'erro_execucao', case
          when i.status in ('falha', 'cancelado')
            or c.status not in ('pendente', 'enviando')
            then coalesce(i.erro, c.pausa_motivo, c.erro)
          else null
        end
      )
  from public.whatsapp_disparo_itens i
  join public.whatsapp_disparo_campanhas c
    on c.id = i.campanha_id
  where i.campanha_id = p_campanha_id
    and i.automacao_agendamento_id = a.id;

  get diagnostics v_atualizados = row_count;
  return v_atualizados;
end;
$$;

create or replace function public.falhar_automacao_agendamentos_disparo(
  p_agendamento_ids uuid[],
  p_erro text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atualizados integer := 0;
begin
  update public.automacao_agendamentos
  set
    status = 'erro',
    executed_at = now(),
    payload_json = coalesce(payload_json, '{}'::jsonb)
      || jsonb_build_object(
        'erro_execucao',
        coalesce(nullif(trim(p_erro), ''), 'Erro ao enfileirar disparo agendado.')
      )
  where id = any(p_agendamento_ids)
    and status = 'pendente'
    and tipo_agendamento = 'disparo_template';

  get diagnostics v_atualizados = row_count;
  return v_atualizados;
end;
$$;

grant execute
  on function public.sincronizar_automacao_agendamentos_campanha(uuid)
  to service_role;

grant execute
  on function public.falhar_automacao_agendamentos_disparo(uuid[], text)
  to service_role;
