-- A liberação dos identificadores operacionais passa a ser responsabilidade
-- de src/lib/empresas/encerramento.ts, após o bloqueio administrativo.
-- Aplicar somente depois de implantar o backend atualizado.
drop trigger if exists trg_liberar_numero_integracao_desconectada
  on public.integracoes_whatsapp;

drop function if exists public.liberar_numero_integracao_desconectada();
