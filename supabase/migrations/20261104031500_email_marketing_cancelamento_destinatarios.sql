-- Permite cancelamento explícito de destinatários de campanhas de e-mail.
-- Itens já processados não devem ser revertidos para cancelado.
ALTER TABLE public.email_campanha_destinatarios
  DROP CONSTRAINT email_campanha_destinatarios_status_check;

ALTER TABLE public.email_campanha_destinatarios
  ADD CONSTRAINT email_campanha_destinatarios_status_check
  CHECK (status IN (
    'pendente', 'processando', 'enviado', 'entregue', 'aberto',
    'clicado', 'bounce', 'reclamacao', 'suprimido', 'falha', 'cancelado'
  ));
