-- Índices para acelerar exclusões em cascata/SET NULL ao apagar contatos.
-- Em produção foram criados previamente com CREATE INDEX CONCURRENTLY.
-- A migration usa IF NOT EXISTS para manter idempotência.

create index if not exists agenda_agendamentos_contato_id_idx
  on public.agenda_agendamentos (contato_id)
  where contato_id is not null;

create index if not exists agenda_participantes_contato_id_idx
  on public.agenda_participantes (contato_id)
  where contato_id is not null;

create index if not exists automacao_arquivo_analises_contato_id_idx
  on public.automacao_arquivo_analises (contato_id)
  where contato_id is not null;

create index if not exists automacao_variaveis_contato_id_idx
  on public.automacao_variaveis (contato_id)
  where contato_id is not null;

create index if not exists comercial_documentos_contato_id_idx
  on public.comercial_documentos (contato_id)
  where contato_id is not null;

create index if not exists comercial_parceiros_contato_id_idx
  on public.comercial_parceiros (contato_id)
  where contato_id is not null;

create index if not exists conversa_protocolos_contato_id_idx
  on public.conversa_protocolos (contato_id)
  where contato_id is not null;

create index if not exists pagamento_gateway_transacoes_contato_id_idx
  on public.pagamento_gateway_transacoes (contato_id)
  where contato_id is not null;

create index if not exists rastreamento_cliques_contato_id_idx
  on public.rastreamento_cliques (contato_id)
  where contato_id is not null;

create index if not exists whatsapp_coex_contatos_contato_id_idx
  on public.whatsapp_coex_contatos (contato_id)
  where contato_id is not null;

create index if not exists whatsapp_contatos_opt_in_numeros_contato_id_idx
  on public.whatsapp_contatos_opt_in_numeros (contato_id)
  where contato_id is not null;

create index if not exists whatsapp_disparo_cooldowns_contato_id_idx
  on public.whatsapp_disparo_cooldowns (contato_id)
  where contato_id is not null;

create index if not exists whatsapp_disparo_itens_contato_id_idx
  on public.whatsapp_disparo_itens (contato_id)
  where contato_id is not null;

create index if not exists whatsapp_meta_conversas_iniciadas_contato_id_idx
  on public.whatsapp_meta_conversas_iniciadas (contato_id)
  where contato_id is not null;

create index if not exists whatsapp_opt_out_contextos_contato_id_idx
  on public.whatsapp_opt_out_contextos (contato_id)
  where contato_id is not null;

create index if not exists whatsapp_supressao_eventos_contato_id_idx
  on public.whatsapp_supressao_eventos (contato_id)
  where contato_id is not null;

create index if not exists whatsapp_supressoes_contato_id_idx
  on public.whatsapp_supressoes (contato_id)
  where contato_id is not null;
