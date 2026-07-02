alter table public.whatsapp_templates
  add column if not exists opt_out_habilitado boolean not null default false;

comment on column public.whatsapp_templates.opt_out_habilitado is
  'Indica se o template possui um footer de opt-out reconhecido pelo CRM.';

update public.whatsapp_templates template
set
  opt_out_habilitado = (
    upper(coalesce(template.categoria, '')) in ('MARKETING', 'UTILITY')
    and exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(template.payload -> 'components') = 'array'
            then template.payload -> 'components'
          else '[]'::jsonb
        end
      ) component
      where upper(coalesce(component ->> 'type', '')) = 'FOOTER'
        and (
          lower(
            regexp_replace(
              btrim(coalesce(component ->> 'text', '')),
              '[[:space:]]+',
              ' ',
              'g'
            )
          ) = 'para não receber mais mensagens, responda sair.'
          or (
            upper(template.categoria) = 'MARKETING'
            and lower(
              regexp_replace(
                btrim(coalesce(component ->> 'text', '')),
                '[[:space:]]+',
                ' ',
                'g'
              )
            ) = 'para não receber ofertas, responda sair.'
          )
          or (
            upper(template.categoria) = 'UTILITY'
            and lower(
              regexp_replace(
                btrim(coalesce(component ->> 'text', '')),
                '[[:space:]]+',
                ' ',
                'g'
              )
            ) = 'para não receber atualizações, responda sair.'
          )
        )
    )
  );

drop function if exists public.salvar_whatsapp_template_idempotente(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  uuid
);

create or replace function public.salvar_whatsapp_template_idempotente(
  p_empresa_id uuid,
  p_integracao_whatsapp_id uuid,
  p_waba_id text,
  p_meta_template_id text,
  p_nome text,
  p_categoria text,
  p_idioma text,
  p_status text,
  p_payload jsonb,
  p_resposta_meta jsonb,
  p_usuario_id uuid,
  p_opt_out_habilitado boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template public.whatsapp_templates%rowtype;
  v_criado boolean := false;
  v_nome text := nullif(btrim(p_nome), '');
  v_idioma text := nullif(btrim(p_idioma), '');
  v_meta_template_id text := nullif(btrim(p_meta_template_id), '');
begin
  if p_empresa_id is null then
    raise exception 'empresa_id obrigatorio para salvar template WhatsApp';
  end if;

  if p_integracao_whatsapp_id is null then
    raise exception 'integracao_whatsapp_id obrigatorio para salvar template WhatsApp';
  end if;

  if nullif(btrim(p_waba_id), '') is null then
    raise exception 'waba_id obrigatorio para salvar template WhatsApp';
  end if;

  if v_nome is null then
    raise exception 'nome obrigatorio para salvar template WhatsApp';
  end if;

  if v_idioma is null then
    raise exception 'idioma obrigatorio para salvar template WhatsApp';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_empresa_id::text),
    hashtext(v_nome || ':' || v_idioma)
  );

  if v_meta_template_id is not null then
    select *
      into v_template
      from public.whatsapp_templates
     where empresa_id = p_empresa_id
       and integracao_whatsapp_id = p_integracao_whatsapp_id
       and meta_template_id = v_meta_template_id
     order by updated_at desc
     limit 1
     for update;
  end if;

  if v_template.id is null then
    select *
      into v_template
      from public.whatsapp_templates
     where empresa_id = p_empresa_id
       and nome = v_nome
       and idioma = v_idioma
     order by updated_at desc
     limit 1
     for update;
  end if;

  if v_template.id is not null then
    update public.whatsapp_templates
       set integracao_whatsapp_id = p_integracao_whatsapp_id,
           waba_id = btrim(p_waba_id),
           meta_template_id = coalesce(v_meta_template_id, meta_template_id),
           nome = v_nome,
           categoria = coalesce(nullif(btrim(p_categoria), ''), categoria),
           idioma = v_idioma,
           status = coalesce(nullif(btrim(p_status), ''), status),
           payload = coalesce(p_payload, '{}'::jsonb),
           resposta_meta = coalesce(p_resposta_meta, '{}'::jsonb),
           opt_out_habilitado = coalesce(p_opt_out_habilitado, false),
           updated_by = p_usuario_id,
           updated_at = now()
     where id = v_template.id
     returning * into v_template;
  else
    insert into public.whatsapp_templates (
      empresa_id,
      integracao_whatsapp_id,
      waba_id,
      meta_template_id,
      nome,
      categoria,
      idioma,
      status,
      payload,
      resposta_meta,
      opt_out_habilitado,
      created_by,
      updated_by
    )
    values (
      p_empresa_id,
      p_integracao_whatsapp_id,
      btrim(p_waba_id),
      v_meta_template_id,
      v_nome,
      coalesce(nullif(btrim(p_categoria), ''), 'UTILITY'),
      v_idioma,
      coalesce(nullif(btrim(p_status), ''), 'desconhecido'),
      coalesce(p_payload, '{}'::jsonb),
      coalesce(p_resposta_meta, '{}'::jsonb),
      coalesce(p_opt_out_habilitado, false),
      p_usuario_id,
      p_usuario_id
    )
    returning * into v_template;

    v_criado := true;
  end if;

  return jsonb_build_object(
    'criado', v_criado,
    'template', to_jsonb(v_template)
  );
end;
$$;

revoke all on function public.salvar_whatsapp_template_idempotente(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  uuid,
  boolean
) from public, anon, authenticated;

grant execute on function public.salvar_whatsapp_template_idempotente(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  uuid,
  boolean
) to service_role;
