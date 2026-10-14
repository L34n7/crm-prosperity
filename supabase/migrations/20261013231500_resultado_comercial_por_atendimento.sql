-- Separa o estado atual do lead do histórico de resultados comerciais
-- registrados na conclusão de cada atendimento da agenda.

create table if not exists public.agenda_resultados_comerciais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  contato_id uuid not null references public.contatos(id) on delete cascade,
  agendamento_id uuid not null references public.agenda_agendamentos(id) on delete cascade,
  classificacao text not null,
  valor_venda numeric(14,2),
  criado_por uuid references public.usuarios(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint agenda_resultados_comerciais_classificacao_check
    check (classificacao in ('qualificado', 'convertido', 'perdido')),
  constraint agenda_resultados_comerciais_valor_check
    check (
      (
        classificacao = 'convertido'
        and valor_venda is not null
        and valor_venda > 0
      )
      or (
        classificacao <> 'convertido'
        and valor_venda is null
      )
    ),
  constraint agenda_resultados_comerciais_agendamento_unique
    unique (empresa_id, agendamento_id)
);

create index if not exists agenda_resultados_comerciais_contato_created_idx
  on public.agenda_resultados_comerciais (
    empresa_id,
    contato_id,
    created_at desc
  );

alter table public.agenda_resultados_comerciais enable row level security;

revoke all on table public.agenda_resultados_comerciais
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.agenda_resultados_comerciais
  to service_role;

-- Preserva somente fechamentos legados que ainda são o resultado comercial
-- ativo do contato. Registros inativos não são migrados, pois podem ter sido
-- substituídos posteriormente por Qualificado ou Perdido.
insert into public.agenda_resultados_comerciais (
  empresa_id,
  contato_id,
  agendamento_id,
  classificacao,
  valor_venda,
  criado_por,
  metadata_json,
  created_at
)
select
  cic.empresa_id,
  cic.contato_id,
  aa.id,
  'convertido',
  replace(cic.metadata_json->>'valor_venda', ',', '.')::numeric,
  coalesce(cic.atualizado_por, cic.criado_por),
  coalesce(cic.metadata_json, '{}'::jsonb)
    || jsonb_build_object(
      'migrado_do_resultado_comercial_legado',
      true
    ),
  case
    when coalesce(cic.metadata_json->>'registrado_em', '')
      ~ '^\d{4}-\d{2}-\d{2}T'
      then (cic.metadata_json->>'registrado_em')::timestamptz
    else now()
  end
from public.contato_informacoes_captura cic
join public.agenda_agendamentos aa
  on aa.id::text = cic.metadata_json->>'agendamento_id'
 and aa.empresa_id = cic.empresa_id
where cic.variavel_origem = 'agenda_resultado_comercial'
  and coalesce(cic.ativo, false) = true
  and coalesce(cic.metadata_json->>'valor_venda', '')
    ~ '^[0-9]+([.,][0-9]+)?$'
  and replace(cic.metadata_json->>'valor_venda', ',', '.')::numeric > 0
on conflict (empresa_id, agendamento_id) do nothing;
