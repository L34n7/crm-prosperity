-- A desconexao de integracoes com milhares de disparos exclui itens,
-- campanhas e templates. As FKs abaixo nao tinham indices nos lados filhos,
-- fazendo o PostgreSQL varrer tabelas inteiras para cada linha excluida.
-- Isso transformava uma limpeza de poucos milhares de registros em minutos.
--
-- Os indices aceleram tanto ON DELETE SET NULL/CASCADE quanto validacoes
-- de RESTRICT durante a remocao da integracao.

create index if not exists automacao_agendamentos_item_disparo_idx
  on public.automacao_agendamentos (item_disparo_id)
  where item_disparo_id is not null;

create index if not exists whatsapp_disparos_logs_item_disparo_idx
  on public.whatsapp_disparos_logs (item_disparo_id)
  where item_disparo_id is not null;

create index if not exists whatsapp_disparo_cooldowns_item_idx
  on public.whatsapp_disparo_cooldowns (item_id)
  where item_id is not null;

create index if not exists whatsapp_meta_antispam_item_idx
  on public.whatsapp_meta_antispam_bloqueios (item_id)
  where item_id is not null;

create index if not exists whatsapp_opt_out_contextos_item_idx
  on public.whatsapp_opt_out_contextos (item_id)
  where item_id is not null;

create index if not exists whatsapp_disparo_cooldowns_campanha_idx
  on public.whatsapp_disparo_cooldowns (campanha_id)
  where campanha_id is not null;

create index if not exists whatsapp_meta_antispam_campanha_idx
  on public.whatsapp_meta_antispam_bloqueios (campanha_id)
  where campanha_id is not null;

create index if not exists whatsapp_opt_out_contextos_campanha_idx
  on public.whatsapp_opt_out_contextos (campanha_id)
  where campanha_id is not null;

create index if not exists agenda_automacao_regras_template_whatsapp_idx
  on public.agenda_automacao_regras (whatsapp_template_id)
  where whatsapp_template_id is not null;

create index if not exists automacoes_api_rotinas_template_idx
  on public.automacoes_api_rotinas (template_id)
  where template_id is not null;

create index if not exists whatsapp_disparo_campanhas_template_idx
  on public.whatsapp_disparo_campanhas (template_id)
  where template_id is not null;

create index if not exists whatsapp_disparo_itens_template_idx
  on public.whatsapp_disparo_itens (template_id)
  where template_id is not null;

create index if not exists whatsapp_meta_conversas_template_idx
  on public.whatsapp_meta_conversas_iniciadas (template_id)
  where template_id is not null;

create index if not exists whatsapp_opt_out_contextos_template_idx
  on public.whatsapp_opt_out_contextos (template_id)
  where template_id is not null;
