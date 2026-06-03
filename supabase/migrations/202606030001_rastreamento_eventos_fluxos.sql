ALTER TABLE public.rastreamento_eventos
  DROP CONSTRAINT IF EXISTS rastreamento_eventos_tipo_check;

ALTER TABLE public.rastreamento_eventos
  ADD CONSTRAINT rastreamento_eventos_tipo_check CHECK (
    tipo IN (
      'clique_no_link',
      'lead_criado',
      'conversa_iniciada',
      'primeira_mensagem_recebida',
      'lead_qualificado',
      'agendamento_criado',
      'agendamento_confirmado',
      'venda_realizada',
      'venda_perdida',
      'fluxo_iniciado',
      'fluxo_finalizado',
      'fluxo_transferido_atendimento',
      'fluxo_incompleto_timeout'
    )
  );
