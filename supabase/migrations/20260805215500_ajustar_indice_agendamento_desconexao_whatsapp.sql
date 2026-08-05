-- Ajusta o indice de disparos agendados para corresponder exatamente
-- ao filtro usado pela rotina de desconexao da integracao.

drop index if exists public.automacao_agendamentos_disparo_integracao_idx;

create index automacao_agendamentos_disparo_integracao_idx
  on public.automacao_agendamentos (
    empresa_id,
    ((payload_json ->> 'integracao_whatsapp_id'))
  )
  where tipo_agendamento = 'disparo_template'
    and status = 'pendente';
