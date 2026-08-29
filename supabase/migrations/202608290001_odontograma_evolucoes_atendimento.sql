-- Vincula evolucoes do odontograma aos atendimentos e garante gravacao clinica atomica.

create table if not exists public.odontograma_evolucoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  paciente_id uuid not null,
  pessoa_id uuid not null,
  atendimento_id uuid not null references public.prontuario_atendimentos(id) on delete restrict,
  dente text not null,
  status_anterior text not null,
  status_novo text not null,
  procedimento text,
  observacoes text,
  created_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint odontograma_evolucoes_dente_check check (dente ~ '^[0-9]{2}$'),
  constraint odontograma_evolucoes_status_anterior_check check (
    status_anterior in ('saudavel','atencao','carie','restauracao','canal','extraido','implante','planejado','realizado')
  ),
  constraint odontograma_evolucoes_status_novo_check check (
    status_novo in ('saudavel','atencao','carie','restauracao','canal','extraido','implante','planejado','realizado')
  ),
  constraint odontograma_evolucoes_paciente_empresa_fk
    foreign key (empresa_id, paciente_id)
    references public.pacientes (empresa_id, id)
    on delete restrict,
  constraint odontograma_evolucoes_pessoa_empresa_fk
    foreign key (empresa_id, pessoa_id)
    references public.pessoas (empresa_id, id)
    on delete restrict
);

create index if not exists odontograma_evolucoes_paciente_data_idx
  on public.odontograma_evolucoes (empresa_id, paciente_id, created_at desc);

create index if not exists odontograma_evolucoes_atendimento_idx
  on public.odontograma_evolucoes (empresa_id, atendimento_id, created_at asc);

create index if not exists odontograma_evolucoes_dente_data_idx
  on public.odontograma_evolucoes (empresa_id, paciente_id, dente, created_at desc);

alter table public.odontograma_evolucoes enable row level security;

drop policy if exists odontograma_evolucoes_empresa_select
  on public.odontograma_evolucoes;
create policy odontograma_evolucoes_empresa_select
  on public.odontograma_evolucoes
  for select
  to authenticated
  using (empresa_id = public.usuario_empresa_id_atual());

create or replace function public.aplicar_evolucao_odontograma(
  p_empresa_id uuid,
  p_paciente_id uuid,
  p_atendimento_id uuid,
  p_dente text,
  p_status text,
  p_procedimento text,
  p_observacoes text,
  p_usuario_id uuid
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_pessoa_id uuid;
  v_status_anterior text := 'saudavel';
  v_dente public.odontograma_dentes%rowtype;
  v_evolucao public.odontograma_evolucoes%rowtype;
begin
  if p_dente !~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8])$' then
    raise exception 'Dente invalido para o odontograma.';
  end if;

  if p_status not in ('saudavel','atencao','carie','restauracao','canal','extraido','implante','planejado','realizado') then
    raise exception 'Status invalido para o dente.';
  end if;

  select pessoa_id
    into v_pessoa_id
  from public.prontuario_atendimentos
  where id = p_atendimento_id
    and empresa_id = p_empresa_id
    and paciente_id = p_paciente_id
  for update;

  if v_pessoa_id is null then
    raise exception 'Atendimento nao encontrado para o paciente.';
  end if;

  select status
    into v_status_anterior
  from public.odontograma_dentes
  where empresa_id = p_empresa_id
    and paciente_id = p_paciente_id
    and dente = p_dente
  for update;

  v_status_anterior := coalesce(v_status_anterior, 'saudavel');

  insert into public.odontograma_dentes (
    empresa_id,
    paciente_id,
    pessoa_id,
    dente,
    status,
    procedimento,
    observacoes,
    updated_by
  )
  values (
    p_empresa_id,
    p_paciente_id,
    v_pessoa_id,
    p_dente,
    p_status,
    nullif(trim(coalesce(p_procedimento, '')), ''),
    nullif(trim(coalesce(p_observacoes, '')), ''),
    p_usuario_id
  )
  on conflict (empresa_id, paciente_id, dente)
  do update set
    status = excluded.status,
    procedimento = excluded.procedimento,
    observacoes = excluded.observacoes,
    updated_by = excluded.updated_by
  returning * into v_dente;

  insert into public.odontograma_evolucoes (
    empresa_id,
    paciente_id,
    pessoa_id,
    atendimento_id,
    dente,
    status_anterior,
    status_novo,
    procedimento,
    observacoes,
    created_by
  )
  values (
    p_empresa_id,
    p_paciente_id,
    v_pessoa_id,
    p_atendimento_id,
    p_dente,
    v_status_anterior,
    p_status,
    nullif(trim(coalesce(p_procedimento, '')), ''),
    nullif(trim(coalesce(p_observacoes, '')), ''),
    p_usuario_id
  )
  returning * into v_evolucao;

  return jsonb_build_object(
    'dente', to_jsonb(v_dente),
    'evolucao', to_jsonb(v_evolucao)
  );
end;
$$;

create or replace function public.salvar_atendimento_clinico(
  p_empresa_id uuid,
  p_paciente_id uuid,
  p_pessoa_id uuid,
  p_usuario_id uuid,
  p_atendimento_id uuid,
  p_data_atendimento timestamptz,
  p_tipo text,
  p_queixa_principal text,
  p_anamnese text,
  p_diagnostico text,
  p_conduta text,
  p_prescricao text,
  p_observacoes text,
  p_odontograma_alteracoes jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_prontuario_id uuid;
  v_atendimento public.prontuario_atendimentos%rowtype;
  v_alteracao jsonb;
begin
  if jsonb_typeof(coalesce(p_odontograma_alteracoes, '[]'::jsonb)) <> 'array' then
    raise exception 'Alteracoes do odontograma devem ser uma lista.';
  end if;

  insert into public.prontuarios (
    empresa_id,
    paciente_id,
    pessoa_id,
    status,
    updated_by,
    created_by
  )
  values (
    p_empresa_id,
    p_paciente_id,
    p_pessoa_id,
    'ativo',
    p_usuario_id,
    p_usuario_id
  )
  on conflict (empresa_id, paciente_id)
  do update set
    status = 'ativo',
    updated_by = excluded.updated_by
  returning id into v_prontuario_id;

  if p_atendimento_id is null then
    insert into public.prontuario_atendimentos (
      empresa_id,
      prontuario_id,
      paciente_id,
      pessoa_id,
      data_atendimento,
      tipo,
      queixa_principal,
      anamnese,
      diagnostico,
      conduta,
      prescricao,
      observacoes,
      anexos,
      created_by,
      updated_by
    )
    values (
      p_empresa_id,
      v_prontuario_id,
      p_paciente_id,
      p_pessoa_id,
      p_data_atendimento,
      coalesce(nullif(trim(p_tipo), ''), 'consulta'),
      nullif(trim(coalesce(p_queixa_principal, '')), ''),
      nullif(trim(coalesce(p_anamnese, '')), ''),
      nullif(trim(coalesce(p_diagnostico, '')), ''),
      nullif(trim(coalesce(p_conduta, '')), ''),
      nullif(trim(coalesce(p_prescricao, '')), ''),
      nullif(trim(coalesce(p_observacoes, '')), ''),
      '[]'::jsonb,
      p_usuario_id,
      p_usuario_id
    )
    returning * into v_atendimento;
  else
    select *
      into v_atendimento
    from public.prontuario_atendimentos
    where id = p_atendimento_id
      and empresa_id = p_empresa_id
      and paciente_id = p_paciente_id
    for update;

    if v_atendimento.id is null then
      raise exception 'Atendimento nao encontrado.';
    end if;

    update public.prontuario_atendimentos
    set
      data_atendimento = p_data_atendimento,
      tipo = coalesce(nullif(trim(p_tipo), ''), 'consulta'),
      queixa_principal = nullif(trim(coalesce(p_queixa_principal, '')), ''),
      anamnese = nullif(trim(coalesce(p_anamnese, '')), ''),
      diagnostico = nullif(trim(coalesce(p_diagnostico, '')), ''),
      conduta = nullif(trim(coalesce(p_conduta, '')), ''),
      prescricao = nullif(trim(coalesce(p_prescricao, '')), ''),
      observacoes = nullif(trim(coalesce(p_observacoes, '')), ''),
      updated_by = p_usuario_id
    where id = p_atendimento_id
      and empresa_id = p_empresa_id
    returning * into v_atendimento;
  end if;

  for v_alteracao in
    select value
    from jsonb_array_elements(coalesce(p_odontograma_alteracoes, '[]'::jsonb))
  loop
    perform public.aplicar_evolucao_odontograma(
      p_empresa_id,
      p_paciente_id,
      v_atendimento.id,
      trim(v_alteracao->>'dente'),
      coalesce(nullif(trim(v_alteracao->>'status'), ''), 'saudavel'),
      v_alteracao->>'procedimento',
      v_alteracao->>'observacoes',
      p_usuario_id
    );
  end loop;

  return jsonb_build_object(
    'prontuario_id', v_prontuario_id,
    'atendimento', to_jsonb(v_atendimento)
  );
end;
$$;

revoke all on function public.aplicar_evolucao_odontograma(uuid, uuid, uuid, text, text, text, text, uuid) from public;
revoke all on function public.salvar_atendimento_clinico(uuid, uuid, uuid, uuid, uuid, timestamptz, text, text, text, text, text, text, text, jsonb) from public;

grant execute on function public.aplicar_evolucao_odontograma(uuid, uuid, uuid, text, text, text, text, uuid) to service_role;
grant execute on function public.salvar_atendimento_clinico(uuid, uuid, uuid, uuid, uuid, timestamptz, text, text, text, text, text, text, text, jsonb) to service_role;
