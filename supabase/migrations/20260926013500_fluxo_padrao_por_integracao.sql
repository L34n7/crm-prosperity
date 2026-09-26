drop index if exists public.automacao_fluxos_um_padrao_ativo_por_empresa;
drop index if exists public.ux_automacao_fluxos_um_padrao_por_empresa;

create or replace function public.crm_automacao_fluxo_ids_integracoes(
  p_config jsonb
)
returns text[]
language sql
immutable
set search_path = public
as $$
  with ids as (
    select nullif(btrim(item.value), '') as id
    from jsonb_array_elements_text(
      case
        when jsonb_typeof(
          coalesce(p_config, '{}'::jsonb)
            -> 'integracoes_whatsapp'
            -> 'ids'
        ) = 'array'
          then coalesce(p_config, '{}'::jsonb)
            -> 'integracoes_whatsapp'
            -> 'ids'
        else '[]'::jsonb
      end
    ) as item(value)

    union all

    select nullif(btrim(item.value), '') as id
    from jsonb_array_elements_text(
      case
        when jsonb_typeof(
          coalesce(p_config, '{}'::jsonb)
            -> 'integracoes_whatsapp_ids'
        ) = 'array'
          then coalesce(p_config, '{}'::jsonb)
            -> 'integracoes_whatsapp_ids'
        else '[]'::jsonb
      end
    ) as item(value)

    union all

    select nullif(
      btrim(
        coalesce(
          coalesce(p_config, '{}'::jsonb)
            ->> 'integracao_whatsapp_id',
          ''
        )
      ),
      ''
    ) as id
  )
  select coalesce(
    array_agg(distinct id) filter (where id is not null),
    array[]::text[]
  )
  from ids;
$$;

create or replace function public.crm_automacao_fluxo_modo_integracoes(
  p_config jsonb
)
returns text
language sql
immutable
set search_path = public
as $$
  select
    case
      when lower(
        coalesce(
          nullif(
            coalesce(p_config, '{}'::jsonb)
              -> 'integracoes_whatsapp'
              ->> 'modo',
            ''
          ),
          coalesce(p_config, '{}'::jsonb)
            ->> 'integracoes_whatsapp_modo',
          ''
        )
      ) = 'selecionadas'
      and cardinality(public.crm_automacao_fluxo_ids_integracoes(p_config)) > 0
        then 'selecionadas'
      else 'todas'
    end;
$$;

create or replace function public.crm_automacao_fluxos_escopos_padrao_conflitam(
  p_config_a jsonb,
  p_config_b jsonb
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    case
      when public.crm_automacao_fluxo_modo_integracoes(p_config_a) <> 'selecionadas'
        or public.crm_automacao_fluxo_modo_integracoes(p_config_b) <> 'selecionadas'
        then true
      else
        public.crm_automacao_fluxo_ids_integracoes(p_config_a)
        && public.crm_automacao_fluxo_ids_integracoes(p_config_b)
    end;
$$;

create or replace function public.crm_validar_fluxo_padrao_por_integracao()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_fluxo_conflitante_id uuid;
  v_fluxo_conflitante_nome text;
begin
  if coalesce(new.fluxo_padrao, false) = false
     or new.status = 'arquivado' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.empresa_id::text));

  select fluxo.id, fluxo.nome
    into v_fluxo_conflitante_id, v_fluxo_conflitante_nome
  from public.automacao_fluxos as fluxo
  where fluxo.empresa_id = new.empresa_id
    and fluxo.fluxo_padrao = true
    and fluxo.status <> 'arquivado'
    and fluxo.id <> new.id
    and public.crm_automacao_fluxos_escopos_padrao_conflitam(
      new.configuracao_json,
      fluxo.configuracao_json
    )
  limit 1;

  if v_fluxo_conflitante_id is not null then
    raise exception
      'Uma ou mais integrações deste fluxo já possuem outro fluxo padrão.'
      using
        errcode = '23505',
        constraint = 'automacao_fluxos_padrao_por_integracao_unique',
        detail = format(
          'Fluxo conflitante: %s (%s)',
          coalesce(v_fluxo_conflitante_nome, 'sem nome'),
          v_fluxo_conflitante_id
        );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_automacao_fluxos_padrao_por_integracao
  on public.automacao_fluxos;

create trigger trg_automacao_fluxos_padrao_por_integracao
before insert or update of empresa_id, fluxo_padrao, status, configuracao_json
on public.automacao_fluxos
for each row
execute function public.crm_validar_fluxo_padrao_por_integracao();
