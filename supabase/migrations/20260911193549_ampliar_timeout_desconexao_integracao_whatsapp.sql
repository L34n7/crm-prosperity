-- A desconexao faz backup e limpa diversos vinculos em uma unica transacao.
-- Empresas com historico grande podem ultrapassar o statement_timeout padrao
-- usado pelas chamadas via API, gerando SQLSTATE 57014 e uma falsa mensagem
-- de que outro processo esta atualizando a integracao.
--
-- Mantemos o lock_timeout curto, definido na migracao anterior, para que
-- conflitos reais de concorrencia continuem falhando rapido e possam ser
-- repetidos pela API. Apenas damos mais tempo para a limpeza atomica concluir.
alter function public.backup_e_excluir_integracao_whatsapp(uuid, uuid, uuid)
  set statement_timeout to '60s';

comment on function public.backup_e_excluir_integracao_whatsapp(uuid, uuid, uuid) is
  'Cria backup e exclui uma integracao Meta atomicamente. Usa lock_timeout curto para conflitos concorrentes e statement_timeout ampliado para empresas com grande volume de dados vinculados.';
