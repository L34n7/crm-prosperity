-- Otimiza a desconexao/reconexao de integracoes WhatsApp.
-- Os indices abaixo evitam varreduras completas ao atualizar ou excluir
-- uma integracao referenciada por tabelas operacionais e historicas.

create index if not exists agenda_automacao_regras_integracao_whatsapp_idx
  on public.agenda_automacao_regras (integracao_whatsapp_id)
  where integracao_whatsapp_id is not null;

create index if not exists contato_atribuicoes_meta_integracao_whatsapp_idx
  on public.contato_atribuicoes_meta (integracao_whatsapp_id, empresa_id)
  where integracao_whatsapp_id is not null;

create index if not exists conversas_integracao_whatsapp_empresa_idx
  on public.conversas (integracao_whatsapp_id, empresa_id)
  where integracao_whatsapp_id is not null;

create index if not exists rastreamento_campanhas_integracao_whatsapp_idx
  on public.rastreamento_campanhas (integracao_whatsapp_id, empresa_id)
  where integracao_whatsapp_id is not null;

create index if not exists whatsapp_contatos_opt_in_integracao_idx
  on public.whatsapp_contatos_opt_in_numeros (integracao_whatsapp_id)
  where integracao_whatsapp_id is not null;

create index if not exists whatsapp_disparo_cooldowns_integracao_idx
  on public.whatsapp_disparo_cooldowns (integracao_whatsapp_id)
  where integracao_whatsapp_id is not null;

create index if not exists whatsapp_disparo_itens_integracao_empresa_idx
  on public.whatsapp_disparo_itens (integracao_whatsapp_id, empresa_id)
  where integracao_whatsapp_id is not null;

create index if not exists whatsapp_meta_antispam_integracao_idx
  on public.whatsapp_meta_antispam_bloqueios (integracao_whatsapp_id)
  where integracao_whatsapp_id is not null;

create index if not exists whatsapp_meta_conversas_integracao_idx
  on public.whatsapp_meta_conversas_iniciadas (integracao_whatsapp_id)
  where integracao_whatsapp_id is not null;

create index if not exists whatsapp_opt_out_contextos_integracao_idx
  on public.whatsapp_opt_out_contextos (integracao_whatsapp_id)
  where integracao_whatsapp_id is not null;

create index if not exists whatsapp_supressao_eventos_integracao_idx
  on public.whatsapp_supressao_eventos (integracao_whatsapp_id)
  where integracao_whatsapp_id is not null;

create index if not exists whatsapp_supressoes_integracao_idx
  on public.whatsapp_supressoes (integracao_whatsapp_id)
  where integracao_whatsapp_id is not null;

-- A funcao de desconexao procura disparos agendados pelo ID armazenado no JSON.
create index if not exists automacao_agendamentos_disparo_integracao_idx
  on public.automacao_agendamentos (
    empresa_id,
    ((payload_json ->> 'integracao_whatsapp_id'))
  )
  where tipo_agendamento = 'disparo_template'
    and status = 'pendente'
    and payload_json ? 'integracao_whatsapp_id';

-- Evita que a requisicao permaneça presa por dois minutos aguardando
-- outra operacao que esteja atualizando a mesma integracao. A API faz
-- novas tentativas curtas para conflitos transitorios.
alter function public.backup_e_excluir_integracao_whatsapp(uuid, uuid, uuid)
  set lock_timeout to '5s';

comment on function public.backup_e_excluir_integracao_whatsapp(uuid, uuid, uuid) is
  'Cria backup e exclui uma integracao Meta atomicamente, com espera curta por locks para permitir retentativa segura pela API.';
