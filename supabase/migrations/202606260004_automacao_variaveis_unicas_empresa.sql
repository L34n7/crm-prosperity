with variaveis_ativas as (
  select
    id,
    row_number() over (
      partition by empresa_id, chave
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as ordem
  from public.automacao_variaveis
  where execucao_id is null
    and contato_id is null
    and metadata_json ->> 'tipo' = 'global_empresa'
    and coalesce(metadata_json ->> 'ativo', 'true') = 'true'
)
update public.automacao_variaveis as variavel
set
  metadata_json = coalesce(variavel.metadata_json, '{}'::jsonb) ||
    jsonb_build_object(
      'ativo', false,
      'duplicada_inativada_em', now()
    ),
  updated_at = now()
from variaveis_ativas
where variavel.id = variaveis_ativas.id
  and variaveis_ativas.ordem > 1;

create unique index if not exists automacao_variaveis_global_empresa_chave_ativa_uidx
  on public.automacao_variaveis (empresa_id, chave)
  where execucao_id is null
    and contato_id is null
    and metadata_json ->> 'tipo' = 'global_empresa'
    and coalesce(metadata_json ->> 'ativo', 'true') = 'true';
