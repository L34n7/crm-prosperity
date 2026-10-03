-- Reduz write amplification e cria uma fila de retenção indexável para webhooks.
-- Em produção, o índice novo e as remoções foram executados de forma concorrente
-- antes do registro desta migration para evitar bloqueio de escrita nas tabelas quentes.

alter table public.whatsapp_webhook_eventos
  add column if not exists compactado_at timestamptz;

comment on column public.whatsapp_webhook_eventos.compactado_at is
  'Momento em que body_json/resultado_json foram compactados para retenção operacional.';

update public.whatsapp_webhook_eventos
set compactado_at = coalesce(
  case
    when nullif(body_json->>'archived_at', '') is not null
      then (body_json->>'archived_at')::timestamptz
    else null
  end,
  updated_at
)
where status = 'processado'
  and compactado_at is null
  and coalesce(body_json->>'archived', 'false') = 'true';

create index if not exists whatsapp_webhook_eventos_compactacao_idx
  on public.whatsapp_webhook_eventos (updated_at, id)
  where status = 'processado'
    and compactado_at is null;

-- Índice de texto sem uso e incompatível com conteúdos longos do histórico Coex.
drop index if exists public.idx_mensagens_conteudo_btree;

-- Duplicados exatos: preservamos o índice de constraint ou o exemplar efetivamente usado.
drop index if exists public.idx_automacao_agendamentos_pendentes;
drop index if exists public.automacao_execucoes_uma_ativa_por_conversa_idx;
drop index if exists public.contatos_empresa_telefone_unq;
drop index if exists public.conversa_leituras_conversa_usuario_unq;
drop index if exists public.idx_conversa_leituras_empresa_usuario_conversa;
drop index if exists public.conversa_protocolos_protocolo_unique;
