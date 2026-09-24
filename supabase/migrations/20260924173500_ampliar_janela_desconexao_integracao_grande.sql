-- A WorkManos possui dezenas de milhares de registros dependentes da integração.
-- Depois de remover o trabalho redundante dos triggers, a limpeza ainda pode
-- ultrapassar 120s. Mantemos a operação atômica e ampliamos a janela para 240s,
-- abaixo do limite de 300s da função Vercel.
alter function public.backup_e_excluir_integracao_whatsapp(uuid, uuid, uuid)
  set statement_timeout to '240s';

comment on function public.backup_e_excluir_integracao_whatsapp(uuid, uuid, uuid) is
  'Cria backup e exclui uma integracao Meta atomicamente. Usa lock_timeout curto e statement_timeout de 240s para empresas com historico grande.';
