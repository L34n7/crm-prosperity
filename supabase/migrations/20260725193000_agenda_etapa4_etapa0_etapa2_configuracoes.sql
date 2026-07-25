-- Etapa 0: neutraliza a implementação preliminar da Etapa 4.
drop trigger if exists agenda_etapa4_planejar_agendamento_trigger on public.agenda_agendamentos;
drop trigger if exists agenda_etapa4_atualizar_funil_trigger on public.agenda_agendamentos;
drop trigger if exists agenda_etapa4_processar_resposta_whatsapp_trigger on public.mensagens;

drop function if exists public.agenda_etapa4_planejar_agendamento_trigger();
drop function if exists public.agenda_etapa4_atualizar_funil();
drop function if exists public.agenda_etapa4_processar_resposta_whatsapp();
drop function if exists public.agenda_etapa4_planejar_agendamento_id(uuid, uuid, boolean);
drop function if exists public.agenda_etapa4_replanejar_agenda(uuid, uuid);
drop function if exists public.agenda_etapa4_reivindicar_automacoes(integer);

do $block$
begin
  if to_regclass('public.agenda_whatsapp_automacoes') is not null then
    update public.agenda_whatsapp_automacoes
       set status = 'cancelado',
           bloqueado_em = null,
           erro = 'Automação neutralizada durante a revisão estrutural da Etapa 4.',
           updated_at = now()
     where status in ('pendente', 'processando', 'erro', 'aguardando_template');
  end if;
end;
$block$;

-- Persistência das configurações exibidas no modal da agenda.
create table if not exists public.agenda_automacao_regras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  agenda_id uuid not null references public.agenda_calendarios(id) on delete cascade,
  tipo text not null check (tipo = any (array[
    'confirmacao'::text,
    'lembrete'::text,
    'aviso_responsavel'::text,
    'pos_atendimento'::text
  ])),
  canal text not null check (canal = any (array[
    'whatsapp'::text,
    'email'::text,
    'sistema'::text,
    'fluxo'::text
  ])),
  ativo boolean not null default false,
  antecedencia_minutos integer not null default 0
    check (antecedencia_minutos between 0 and 525600),
  momento_referencia text not null default 'antes_inicio'
    check (momento_referencia = any (array['antes_inicio'::text, 'apos_fim'::text])),
  ordem integer not null default 0 check (ordem between 0 and 50),
  integracao_whatsapp_id uuid references public.integracoes_whatsapp(id) on delete set null,
  whatsapp_template_id uuid references public.whatsapp_templates(id) on delete set null,
  fluxo_id uuid references public.automacao_fluxos(id) on delete set null,
  configuracao_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agenda_id, tipo, canal, ordem)
);

create index if not exists agenda_automacao_regras_empresa_agenda_idx
  on public.agenda_automacao_regras(empresa_id, agenda_id, tipo, ordem);
create index if not exists agenda_automacao_regras_ativas_idx
  on public.agenda_automacao_regras(empresa_id, tipo, ativo)
  where ativo = true;

alter table public.agenda_automacao_regras enable row level security;

create or replace function public.agenda_automacao_regras_substituir(
  p_empresa_id uuid,
  p_agenda_id uuid,
  p_regras jsonb
)
returns setof public.agenda_automacao_regras
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if not exists (
    select 1
      from public.agenda_calendarios
     where id = p_agenda_id
       and empresa_id = p_empresa_id
  ) then
    raise exception 'Agenda não encontrada para a empresa informada.';
  end if;

  if jsonb_typeof(coalesce(p_regras, '[]'::jsonb)) <> 'array' then
    raise exception 'As regras devem ser enviadas em formato de lista.';
  end if;

  if jsonb_array_length(coalesce(p_regras, '[]'::jsonb)) > 30 then
    raise exception 'Uma agenda pode possuir no máximo 30 regras de automação.';
  end if;

  delete from public.agenda_automacao_regras
   where empresa_id = p_empresa_id
     and agenda_id = p_agenda_id;

  insert into public.agenda_automacao_regras (
    empresa_id,
    agenda_id,
    tipo,
    canal,
    ativo,
    antecedencia_minutos,
    momento_referencia,
    ordem,
    integracao_whatsapp_id,
    whatsapp_template_id,
    fluxo_id,
    configuracao_json,
    updated_at
  )
  select
    p_empresa_id,
    p_agenda_id,
    item.tipo,
    item.canal,
    coalesce(item.ativo, false),
    least(greatest(coalesce(item.antecedencia_minutos, 0), 0), 525600),
    case when item.tipo = 'pos_atendimento' then 'apos_fim' else 'antes_inicio' end,
    least(greatest(coalesce(item.ordem, 0), 0), 50),
    item.integracao_whatsapp_id,
    item.whatsapp_template_id,
    item.fluxo_id,
    coalesce(item.configuracao_json, '{}'::jsonb),
    now()
  from jsonb_to_recordset(coalesce(p_regras, '[]'::jsonb)) as item(
    tipo text,
    canal text,
    ativo boolean,
    antecedencia_minutos integer,
    momento_referencia text,
    ordem integer,
    integracao_whatsapp_id uuid,
    whatsapp_template_id uuid,
    fluxo_id uuid,
    configuracao_json jsonb
  )
  where item.tipo = any (array[
    'confirmacao'::text,
    'lembrete'::text,
    'aviso_responsavel'::text,
    'pos_atendimento'::text
  ])
    and item.canal = any (array[
      'whatsapp'::text,
      'email'::text,
      'sistema'::text,
      'fluxo'::text
    ]);

  return query
  select regra.*
    from public.agenda_automacao_regras regra
   where regra.empresa_id = p_empresa_id
     and regra.agenda_id = p_agenda_id
   order by regra.tipo, regra.ordem, regra.canal;
end;
$function$;

revoke all on function public.agenda_automacao_regras_substituir(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.agenda_automacao_regras_substituir(uuid, uuid, jsonb)
  to service_role;

comment on table public.agenda_automacao_regras is
  'Configurações por agenda da Etapa 4. Nesta entrega apenas persiste opções; nenhum envio é executado automaticamente.';
