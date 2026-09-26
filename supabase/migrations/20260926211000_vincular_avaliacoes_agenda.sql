-- Vincula avaliações de atendimento aos agendamentos que originaram o pós-atendimento.
-- Mantém o vínculo opcional para fluxos de avaliação que não vierem da Agenda.

alter table public.atendimento_avaliacoes
  add column if not exists agenda_agendamento_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'atendimento_avaliacoes_agenda_agendamento_id_fkey'
      and conrelid = 'public.atendimento_avaliacoes'::regclass
  ) then
    alter table public.atendimento_avaliacoes
      add constraint atendimento_avaliacoes_agenda_agendamento_id_fkey
      foreign key (agenda_agendamento_id)
      references public.agenda_agendamentos(id)
      on delete set null;
  end if;
end
$$;

create index if not exists idx_atendimento_avaliacoes_agendamento
  on public.atendimento_avaliacoes (agenda_agendamento_id, created_at desc);

-- Retrocompatibilidade: avaliações já criadas por fluxos iniciados pelo
-- pós-atendimento da Agenda recebem o vínculo quando o metadata da execução
-- já contém o agendamento de origem.
update public.atendimento_avaliacoes avaliacao
set
  agenda_agendamento_id = (execucao.metadata_json ->> 'agenda_agendamento_id')::uuid,
  metadata_json = coalesce(avaliacao.metadata_json, '{}'::jsonb)
    || jsonb_build_object(
      'agenda_agendamento_id', execucao.metadata_json ->> 'agenda_agendamento_id',
      'agenda_id', execucao.metadata_json ->> 'agenda_id',
      'agenda_automacao_execucao_id', execucao.metadata_json ->> 'agenda_automacao_execucao_id'
    )
from public.automacao_execucoes execucao
where avaliacao.automacao_execucao_id = execucao.id
  and avaliacao.empresa_id = execucao.empresa_id
  and avaliacao.agenda_agendamento_id is null
  and coalesce(execucao.metadata_json ->> 'agenda_agendamento_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1
    from public.agenda_agendamentos agendamento
    where agendamento.id = (execucao.metadata_json ->> 'agenda_agendamento_id')::uuid
      and agendamento.empresa_id = avaliacao.empresa_id
  );

-- Expõe as avaliações junto dos detalhes do agendamento carregados pela Agenda.
create or replace function public.agenda_etapa1_listar(
  p_agenda_id uuid,
  p_inicio timestamptz,
  p_fim timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_result jsonb;
  v_agendamentos jsonb;
begin
  v_result := public.agenda_etapa2_listar_base(p_agenda_id, p_inicio, p_fim);

  select coalesce(
    jsonb_agg(
      item || jsonb_build_object(
        'catalogo_itens',
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', ai.id,
              'origem_tipo', ai.origem_tipo,
              'entidade_id', coalesce(ai.catalogo_servico_id, ai.imovel_id, ai.imovel_externo_id),
              'catalogo_servico_id', ai.catalogo_servico_id,
              'imovel_id', ai.imovel_id,
              'imovel_externo_id', ai.imovel_externo_id,
              'deposito_id', ai.deposito_id,
              'quantidade_planejada', ai.quantidade_planejada,
              'quantidade_real', ai.quantidade_real,
              'status_estoque', ai.status_estoque,
              'nome', ai.nome_snapshot,
              'tipo', ai.tipo_snapshot,
              'preco', ai.preco_snapshot,
              'custo_previsto', ai.custo_previsto,
              'dente', ai.dente,
              'dados', ai.dados_json
            )
            order by ai.created_at
          )
          from public.agenda_catalogo_itens ai
          where ai.empresa_id = (v_result ->> 'empresa_id')::uuid
            and ai.agendamento_id = (item ->> 'id')::uuid
        ), '[]'::jsonb),
        'avaliacoes',
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', av.id,
              'nota', av.nota,
              'comentario', av.comentario,
              'origem', av.origem,
              'numero_cliente', av.numero_cliente,
              'protocolo', av.protocolo,
              'created_at', av.created_at
            )
            order by av.created_at desc
          )
          from public.atendimento_avaliacoes av
          where av.empresa_id = (v_result ->> 'empresa_id')::uuid
            and av.agenda_agendamento_id = (item ->> 'id')::uuid
        ), '[]'::jsonb)
      )
    ),
    '[]'::jsonb
  )
  into v_agendamentos
  from jsonb_array_elements(coalesce(v_result -> 'agendamentos', '[]'::jsonb)) item;

  return jsonb_set(v_result, '{agendamentos}', v_agendamentos, true);
end;
$function$;
