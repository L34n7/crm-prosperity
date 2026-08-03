-- Permite cooldown individual para qualquer erro Meta e reconcilia falhas recentes.

alter table public.whatsapp_disparo_cooldowns
  drop constraint if exists whatsapp_disparo_cooldowns_motivo_check;

alter table public.whatsapp_disparo_cooldowns
  add constraint whatsapp_disparo_cooldowns_motivo_check
  check (
    motivo = 'frequencia_marketing'
    or motivo ~ '^meta_[0-9]+$'
  );

insert into public.whatsapp_disparo_cooldowns (
  empresa_id,
  contato_id,
  telefone_normalizado,
  integracao_whatsapp_id,
  categoria,
  motivo,
  ativo,
  bloqueado_em,
  expira_em,
  ocorrencias_janela,
  janela_inicio_em,
  ultima_ocorrencia_em,
  campanha_id,
  item_id,
  mensagem_externa_id,
  erro_codigo_meta,
  metadata_json,
  updated_at
)
select
  i.empresa_id,
  i.contato_id,
  coalesce(
    nullif(i.telefone_normalizado, ''),
    regexp_replace(i.numero, '[^0-9]', '', 'g')
  ),
  i.integracao_whatsapp_id,
  case
    when lower(coalesce(t.categoria, 'marketing')) = 'utility' then 'utility'
    else 'marketing'
  end,
  'meta_' || i.erro_codigo_meta::text,
  true,
  coalesce(i.processed_at, i.updated_at),
  coalesce(i.processed_at, i.updated_at) + interval '24 hours',
  1,
  coalesce(i.processed_at, i.updated_at),
  coalesce(i.processed_at, i.updated_at),
  i.campanha_id,
  i.id,
  i.message_id,
  i.erro_codigo_meta,
  jsonb_build_object(
    'origem', 'reconciliacao_correcao_cooldown',
    'cooldown_escopo', 'contato',
    'cooldown_horas', 24,
    'erro', i.erro
  ),
  now()
from public.whatsapp_disparo_itens i
join public.whatsapp_templates t on t.id = i.template_id
where i.status = 'falha'
  and i.erro_codigo_meta is not null
  and coalesce(i.processed_at, i.updated_at) > now() - interval '24 hours'
  and coalesce(i.processed_at, i.updated_at) + interval '24 hours' > now()
on conflict (empresa_id, telefone_normalizado, categoria, motivo)
where ativo = true
do update set
  contato_id = excluded.contato_id,
  integracao_whatsapp_id = excluded.integracao_whatsapp_id,
  expira_em = greatest(
    public.whatsapp_disparo_cooldowns.expira_em,
    excluded.expira_em
  ),
  ultima_ocorrencia_em = excluded.ultima_ocorrencia_em,
  campanha_id = excluded.campanha_id,
  item_id = excluded.item_id,
  mensagem_externa_id = excluded.mensagem_externa_id,
  erro_codigo_meta = excluded.erro_codigo_meta,
  metadata_json = coalesce(
    public.whatsapp_disparo_cooldowns.metadata_json,
    '{}'::jsonb
  ) || excluded.metadata_json,
  updated_at = now();
