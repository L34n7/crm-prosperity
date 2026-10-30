-- Remove seis índices comprovadamente duplicados pelo Advisor.
-- Mantém índices mais consultados e o índice UNIQUE vinculado à constraint.
-- Todos os índices removidos foram verificados como não vinculados a constraints.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DROP INDEX IF EXISTS public.idx_automacao_conexoes_fluxo;
DROP INDEX IF EXISTS public.idx_automacao_gatilhos_fluxo;
DROP INDEX IF EXISTS public.idx_automacao_nos_fluxo;
DROP INDEX IF EXISTS public.idx_conversas_favoritas_empresa_usuario_conversa;
DROP INDEX IF EXISTS public.idx_conversas_listas_itens_empresa_lista_conversa;
DROP INDEX IF EXISTS public.ia_token_renovacoes_empresa_referencia_idx;

-- Índices seletivos para FKs com custo em exclusões/SET NULL.
-- Tabelas pequenas/médias: evita indexação indiscriminada de mensagens (1+ GB)
-- e rastreamento_eventos (386 MB), onde o custo de escrita precisa de estudo.
CREATE INDEX IF NOT EXISTS whatsapp_disparo_itens_usuario_id_fk_idx
  ON public.whatsapp_disparo_itens (usuario_id) WHERE usuario_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS automacao_versoes_created_by_fk_idx
  ON public.automacao_versoes (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS automacao_versoes_criado_por_fk_idx
  ON public.automacao_versoes (criado_por) WHERE criado_por IS NOT NULL;
CREATE INDEX IF NOT EXISTS whatsapp_meta_conversas_iniciadas_usuario_id_fk_idx
  ON public.whatsapp_meta_conversas_iniciadas (usuario_id) WHERE usuario_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS conversa_protocolos_finalizado_por_usuario_id_fk_idx
  ON public.conversa_protocolos (finalizado_por_usuario_id) WHERE finalizado_por_usuario_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS conversa_protocolos_resultado_evento_id_fk_idx
  ON public.conversa_protocolos (resultado_evento_id) WHERE resultado_evento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS automacao_execucoes_no_atual_id_fk_idx
  ON public.automacao_execucoes (no_atual_id) WHERE no_atual_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agenda_automacao_execucoes_agendamento_id_fk_idx
  ON public.agenda_automacao_execucoes (agendamento_id) WHERE agendamento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agenda_automacao_execucoes_regra_id_fk_idx
  ON public.agenda_automacao_execucoes (regra_id) WHERE regra_id IS NOT NULL;
