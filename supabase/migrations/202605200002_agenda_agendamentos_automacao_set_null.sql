-- Mantem agendamentos no calendario quando o fluxo, execucao ou bloco de origem for apagado.
ALTER TABLE public.agenda_agendamentos
  DROP CONSTRAINT IF EXISTS agenda_agendamentos_automacao_execucao_id_fkey,
  DROP CONSTRAINT IF EXISTS agenda_agendamentos_automacao_fluxo_id_fkey,
  DROP CONSTRAINT IF EXISTS agenda_agendamentos_automacao_no_id_fkey;

ALTER TABLE public.agenda_agendamentos
  ADD CONSTRAINT agenda_agendamentos_automacao_execucao_id_fkey
    FOREIGN KEY (automacao_execucao_id)
    REFERENCES public.automacao_execucoes(id)
    ON DELETE SET NULL,
  ADD CONSTRAINT agenda_agendamentos_automacao_fluxo_id_fkey
    FOREIGN KEY (automacao_fluxo_id)
    REFERENCES public.automacao_fluxos(id)
    ON DELETE SET NULL,
  ADD CONSTRAINT agenda_agendamentos_automacao_no_id_fkey
    FOREIGN KEY (automacao_no_id)
    REFERENCES public.automacao_nos(id)
    ON DELETE SET NULL;
