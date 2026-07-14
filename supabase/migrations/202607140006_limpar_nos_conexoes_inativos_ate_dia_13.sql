-- Migration descontinuada antes de ser aplicada com sucesso.
--
-- A limpeza imediata foi abandonada porque nos e conexoes inativos ainda
-- podem estar associados a execucoes, mensagens, logs, analises de arquivos
-- e agendamentos. A restauracao do soft delete e feita pela migration 007.

DO $$
BEGIN
  RAISE NOTICE
    'Limpeza de nos e conexoes inativos ignorada; a migration 007 restaura o soft delete.';
END;
$$;
