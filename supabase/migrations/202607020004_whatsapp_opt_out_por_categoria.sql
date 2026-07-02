alter table public.whatsapp_supressoes
  drop constraint if exists whatsapp_supressoes_escopo_check;

alter table public.whatsapp_supressoes
  add constraint whatsapp_supressoes_escopo_check
  check (escopo in ('todos_disparos', 'marketing', 'utility'));

alter table public.whatsapp_supressoes
  drop constraint if exists whatsapp_supressoes_empresa_id_telefone_normalizado_key;

alter table public.whatsapp_supressoes
  add constraint whatsapp_supressoes_empresa_telefone_escopo_key
  unique (empresa_id, telefone_normalizado, escopo);

alter table public.whatsapp_opt_out_contextos
  add column if not exists template_categoria text;

alter table public.whatsapp_opt_out_contextos
  drop constraint if exists whatsapp_opt_out_contextos_template_categoria_check;

alter table public.whatsapp_opt_out_contextos
  add constraint whatsapp_opt_out_contextos_template_categoria_check
  check (template_categoria is null or template_categoria in ('marketing', 'utility'));

update public.whatsapp_opt_out_contextos contexto
set template_categoria = lower(template.categoria)
from public.whatsapp_templates template
where contexto.template_id = template.id
  and contexto.template_categoria is null
  and upper(template.categoria) in ('MARKETING', 'UTILITY');

update public.whatsapp_opt_out_contextos
set
  status = 'cancelado',
  updated_at = now()
where status = 'aguardando_resposta'
  and template_categoria is null;

alter table public.whatsapp_supressao_eventos
  add column if not exists escopo text not null default 'todos_disparos';

alter table public.whatsapp_supressao_eventos
  drop constraint if exists whatsapp_supressao_eventos_escopo_check;

alter table public.whatsapp_supressao_eventos
  add constraint whatsapp_supressao_eventos_escopo_check
  check (escopo in ('todos_disparos', 'marketing', 'utility'));

drop function if exists public.registrar_whatsapp_opt_out(
  uuid,
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  text,
  text,
  jsonb
);

create or replace function public.registrar_whatsapp_opt_out(
  p_empresa_id uuid,
  p_contato_id uuid,
  p_telefone_normalizado text,
  p_integracao_whatsapp_id uuid,
  p_contexto_id uuid,
  p_mensagem_id uuid,
  p_mensagem_externa_id text,
  p_palavra_chave text,
  p_escopo text,
  p_metadata_json jsonb default '{}'::jsonb
)
returns table (
  supressao_id uuid,
  ja_bloqueado boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supressao_id uuid;
  v_ja_bloqueado boolean := false;
begin
  if p_empresa_id is null or coalesce(trim(p_telefone_normalizado), '') = '' then
    raise exception 'Empresa e telefone sao obrigatorios para registrar opt-out.';
  end if;

  if coalesce(p_escopo, '') not in ('marketing', 'utility') then
    raise exception 'Escopo de opt-out invalido: %.', p_escopo;
  end if;

  if p_contexto_id is null or not exists (
    select 1
    from public.whatsapp_opt_out_contextos contexto
    where contexto.id = p_contexto_id
      and contexto.empresa_id = p_empresa_id
      and contexto.telefone_normalizado = p_telefone_normalizado
      and contexto.integracao_whatsapp_id = p_integracao_whatsapp_id
      and contexto.template_categoria = p_escopo
  ) then
    raise exception 'Contexto de opt-out invalido para a categoria informada.';
  end if;

  select s.id
    into v_supressao_id
  from public.whatsapp_supressoes s
  where s.empresa_id = p_empresa_id
    and s.telefone_normalizado = p_telefone_normalizado
    and s.escopo = p_escopo
    and s.ativo = true
  limit 1;

  v_ja_bloqueado := v_supressao_id is not null;

  insert into public.whatsapp_supressoes (
    empresa_id,
    contato_id,
    telefone_normalizado,
    escopo,
    ativo,
    bloqueado_em,
    bloqueio_origem,
    palavra_chave,
    mensagem_id,
    mensagem_externa_id,
    integracao_whatsapp_id,
    desbloqueado_em,
    desbloqueado_por,
    motivo_desbloqueio,
    metadata_json,
    updated_at
  )
  values (
    p_empresa_id,
    p_contato_id,
    p_telefone_normalizado,
    p_escopo,
    true,
    now(),
    'palavra_chave',
    p_palavra_chave,
    p_mensagem_id,
    p_mensagem_externa_id,
    p_integracao_whatsapp_id,
    null,
    null,
    null,
    coalesce(p_metadata_json, '{}'::jsonb),
    now()
  )
  on conflict (empresa_id, telefone_normalizado, escopo)
  do update set
    contato_id = coalesce(excluded.contato_id, whatsapp_supressoes.contato_id),
    ativo = true,
    bloqueado_em = case
      when whatsapp_supressoes.ativo then whatsapp_supressoes.bloqueado_em
      else excluded.bloqueado_em
    end,
    bloqueio_origem = excluded.bloqueio_origem,
    palavra_chave = excluded.palavra_chave,
    mensagem_id = excluded.mensagem_id,
    mensagem_externa_id = excluded.mensagem_externa_id,
    integracao_whatsapp_id = excluded.integracao_whatsapp_id,
    desbloqueado_em = null,
    desbloqueado_por = null,
    motivo_desbloqueio = null,
    metadata_json = whatsapp_supressoes.metadata_json || excluded.metadata_json,
    updated_at = now()
  returning id into v_supressao_id;

  if p_contexto_id is not null then
    update public.whatsapp_opt_out_contextos
    set
      status = 'opt_out',
      respondido_em = now(),
      resposta_mensagem_id = p_mensagem_id,
      resposta_mensagem_externa_id = p_mensagem_externa_id,
      updated_at = now()
    where id = p_contexto_id
      and empresa_id = p_empresa_id;
  end if;

  insert into public.whatsapp_supressao_eventos (
    empresa_id,
    supressao_id,
    contato_id,
    telefone_normalizado,
    integracao_whatsapp_id,
    contexto_id,
    mensagem_id,
    mensagem_externa_id,
    evento,
    origem,
    palavra_chave,
    escopo,
    metadata_json
  )
  values (
    p_empresa_id,
    v_supressao_id,
    p_contato_id,
    p_telefone_normalizado,
    p_integracao_whatsapp_id,
    p_contexto_id,
    p_mensagem_id,
    p_mensagem_externa_id,
    case when v_ja_bloqueado then 'opt_out_repetido' else 'opt_out' end,
    'webhook_whatsapp',
    p_palavra_chave,
    p_escopo,
    coalesce(p_metadata_json, '{}'::jsonb)
  )
  on conflict (empresa_id, mensagem_externa_id, evento) do nothing;

  return query
  select v_supressao_id, v_ja_bloqueado;
end;
$$;

revoke all on function public.registrar_whatsapp_opt_out(
  uuid,
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb
) from public, anon, authenticated;

grant execute on function public.registrar_whatsapp_opt_out(
  uuid,
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb
) to service_role;
