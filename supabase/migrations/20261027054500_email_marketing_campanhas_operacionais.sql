alter table public.email_campanhas
  add column if not exists html text,
  add column if not exists texto text,
  add column if not exists qstash_message_id text,
  add column if not exists qstash_agendado_em timestamptz,
  add column if not exists erro text;

alter table public.email_campanha_destinatarios
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid(),
  add column if not exists tentativas integer not null default 0,
  add column if not exists max_tentativas integer not null default 3,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists descadastrado_em timestamptz;

create unique index if not exists email_campanha_destinatarios_unsubscribe_token_unico
  on public.email_campanha_destinatarios (unsubscribe_token);

create index if not exists email_campanha_destinatarios_fila_idx
  on public.email_campanha_destinatarios (
    campanha_id,
    status,
    next_attempt_at,
    created_at
  );

create or replace function public.email_marketing_recalcular_campanha(
  p_campanha_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_resultado jsonb;
begin
  with resumo as (
    select
      count(*)::integer as total_destinatarios,
      count(*) filter (where provider_message_id is not null)::integer as total_enviados,
      count(*) filter (where entregue_em is not null)::integer as total_entregues,
      count(*) filter (where aberto_em is not null)::integer as total_abertos,
      count(*) filter (where clicado_em is not null)::integer as total_cliques,
      count(*) filter (where bounce_em is not null)::integer as total_bounces,
      count(*) filter (where reclamacao_em is not null)::integer as total_reclamacoes,
      count(*) filter (where descadastrado_em is not null)::integer as total_descadastros
    from public.email_campanha_destinatarios
    where campanha_id = p_campanha_id
  )
  update public.email_campanhas c
  set
    total_destinatarios = r.total_destinatarios,
    total_enviados = r.total_enviados,
    total_entregues = r.total_entregues,
    total_abertos = r.total_abertos,
    total_cliques = r.total_cliques,
    total_bounces = r.total_bounces,
    total_reclamacoes = r.total_reclamacoes,
    total_descadastros = r.total_descadastros,
    updated_at = now()
  from resumo r
  where c.id = p_campanha_id
  returning jsonb_build_object(
    'campanha_id', c.id,
    'total_destinatarios', c.total_destinatarios,
    'total_enviados', c.total_enviados,
    'total_entregues', c.total_entregues,
    'total_abertos', c.total_abertos,
    'total_cliques', c.total_cliques,
    'total_bounces', c.total_bounces,
    'total_reclamacoes', c.total_reclamacoes,
    'total_descadastros', c.total_descadastros
  ) into v_resultado;

  return coalesce(v_resultado, '{}'::jsonb);
end;
$$;

revoke all on function public.email_marketing_recalcular_campanha(uuid)
  from public, anon, authenticated;
grant execute on function public.email_marketing_recalcular_campanha(uuid)
  to service_role;

create or replace function public.email_marketing_listar_listas_audiencia(
  p_empresa_id uuid
)
returns table (
  id uuid,
  nome text,
  total_contatos bigint,
  total_emails bigint,
  created_at timestamptz
)
language sql
security invoker
set search_path = public
as $$
  select
    l.id,
    l.nome,
    count(m.contato_id) as total_contatos,
    count(m.contato_id) filter (
      where c.email is not null
        and btrim(c.email) <> ''
    ) as total_emails,
    l.created_at
  from public.contatos_listas l
  left join public.contatos_lista_membros m
    on m.lista_id = l.id
  left join public.contatos c
    on c.id = m.contato_id
   and c.empresa_id = p_empresa_id
  where l.empresa_id = p_empresa_id
  group by l.id, l.nome, l.created_at
  order by l.created_at desc;
$$;

revoke all on function public.email_marketing_listar_listas_audiencia(uuid)
  from public, anon, authenticated;
grant execute on function public.email_marketing_listar_listas_audiencia(uuid)
  to service_role;

grant select, insert, update, delete
  on table public.email_campanhas
  to service_role;

grant select, insert, update, delete
  on table public.email_campanha_destinatarios
  to service_role;


create index if not exists email_campanha_destinatarios_contato_idx
  on public.email_campanha_destinatarios (contato_id);

create index if not exists email_campanhas_criado_por_idx
  on public.email_campanhas (criado_por_usuario_id);

create index if not exists email_campanhas_remetente_idx
  on public.email_campanhas (remetente_id);

create index if not exists email_campanhas_template_idx
  on public.email_campanhas (template_id);

create index if not exists email_eventos_destinatario_idx
  on public.email_eventos (destinatario_id);

create index if not exists email_eventos_empresa_idx
  on public.email_eventos (empresa_id);

create index if not exists email_remetentes_criado_por_idx
  on public.email_remetentes (criado_por_usuario_id);

create index if not exists email_remetentes_empresa_idx
  on public.email_remetentes (empresa_id);

create index if not exists email_suppressions_empresa_idx
  on public.email_suppressions (empresa_id);

create index if not exists email_templates_criado_por_idx
  on public.email_templates (criado_por_usuario_id);
