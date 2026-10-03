-- Indexes para acelerar exclusões em cascata de conversas e protocolos.
-- Em produção estes índices foram criados CONCURRENTLY antes desta migration.
-- Aqui usamos IF NOT EXISTS para manter a migration transacional e idempotente.

create index if not exists whatsapp_disparo_itens_conversa_id_idx
  on public.whatsapp_disparo_itens (conversa_id)
  where conversa_id is not null;

create index if not exists whatsapp_meta_conversas_iniciadas_conversa_id_idx
  on public.whatsapp_meta_conversas_iniciadas (conversa_id)
  where conversa_id is not null;

create index if not exists whatsapp_opt_out_contextos_conversa_id_idx
  on public.whatsapp_opt_out_contextos (conversa_id)
  where conversa_id is not null;

create index if not exists agente_ia_execucoes_conversa_id_idx
  on public.agente_ia_execucoes (conversa_id)
  where conversa_id is not null;

create index if not exists agente_ia_conversa_estados_conversa_id_idx
  on public.agente_ia_conversa_estados (conversa_id)
  where conversa_id is not null;

create index if not exists agente_ia_pendencias_conversa_id_idx
  on public.agente_ia_pendencias (conversa_id)
  where conversa_id is not null;

create index if not exists automacao_arquivo_analises_conversa_id_idx
  on public.automacao_arquivo_analises (conversa_id)
  where conversa_id is not null;

create index if not exists automacao_intencao_execucoes_conversa_id_idx
  on public.automacao_intencao_execucoes (conversa_id)
  where conversa_id is not null;

create index if not exists agenda_agendamentos_conversa_id_idx
  on public.agenda_agendamentos (conversa_id)
  where conversa_id is not null;

create index if not exists agenda_automacao_respostas_conversa_id_idx
  on public.agenda_automacao_respostas (conversa_id)
  where conversa_id is not null;

create index if not exists pagamento_gateway_transacoes_conversa_id_idx
  on public.pagamento_gateway_transacoes (conversa_id)
  where conversa_id is not null;

create index if not exists rastreamento_cliques_conversa_id_idx
  on public.rastreamento_cliques (conversa_id)
  where conversa_id is not null;

create index if not exists mensagens_conversa_protocolo_id_idx
  on public.mensagens (conversa_protocolo_id)
  where conversa_protocolo_id is not null;

create index if not exists whatsapp_disparos_logs_conversa_protocolo_id_idx
  on public.whatsapp_disparos_logs (conversa_protocolo_id)
  where conversa_protocolo_id is not null;

create index if not exists whatsapp_disparo_itens_conversa_protocolo_id_idx
  on public.whatsapp_disparo_itens (conversa_protocolo_id)
  where conversa_protocolo_id is not null;

create index if not exists rastreamento_eventos_conversa_protocolo_id_idx
  on public.rastreamento_eventos (conversa_protocolo_id)
  where conversa_protocolo_id is not null;

create index if not exists contatos_classificacao_protocolo_id_idx
  on public.contatos (classificacao_protocolo_id)
  where classificacao_protocolo_id is not null;

create index if not exists conversas_agente_ia_protocolo_id_idx
  on public.conversas (agente_ia_protocolo_id)
  where agente_ia_protocolo_id is not null;

create index if not exists automacao_execucoes_conversa_protocolo_id_idx
  on public.automacao_execucoes (conversa_protocolo_id)
  where conversa_protocolo_id is not null;

create index if not exists agenda_agendamentos_conversa_protocolo_id_idx
  on public.agenda_agendamentos (conversa_protocolo_id)
  where conversa_protocolo_id is not null;
