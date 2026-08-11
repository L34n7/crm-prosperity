-- Remove as regras de circuit breaker do banco para manter a decisao no codigo da aplicacao.
-- O worker passa a controlar:
--   * 131042 e 368: cancelar a campanha ao atingir 3 falhas do mesmo codigo.
--   * 131048: pausar a campanha apenas depois de mais de 3 falhas.

drop trigger if exists trg_impedir_pausa_prematura_campanha
  on public.whatsapp_disparo_campanhas;

drop trigger if exists trg_pausar_campanha_apos_quarta_falha
  on public.whatsapp_disparo_itens;

drop function if exists public.impedir_pausa_prematura_campanha();
drop function if exists public.pausar_campanha_apos_quarta_falha();
