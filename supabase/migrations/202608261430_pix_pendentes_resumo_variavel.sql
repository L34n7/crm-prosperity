create or replace function public.prosperity_resumo_pix_pendentes_contato(
  p_contato_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_email text;
  v_telefone text;
  v_resumo text := '';
begin
  select
    c.empresa_id,
    lower(trim(coalesce(c.email, ''))),
    regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g')
  into
    v_empresa_id,
    v_email,
    v_telefone
  from public.contatos c
  where c.id = p_contato_id
  limit 1;

  if v_empresa_id is null then
    return jsonb_build_object(
      'autorizado', false,
      'resumo', ''
    );
  end if;

  if not exists (
    select 1
    from public.integracoes_api_externas i
    where i.empresa_id = v_empresa_id
      and i.tipo = 'crm_prosperity'
      and i.status = 'ativa'
  ) then
    return jsonb_build_object(
      'autorizado', false,
      'resumo', ''
    );
  end if;

  with pagamentos_base as (
    select
      p.id,
      p.status,
      p.created_at,
      p.offer_hash,
      o.tipo as oferta_tipo,
      o.nome as oferta_nome,
      o.plano_id,
      pl.nome as plano_nome,
      nullif(trim(coalesce(p.payload #>> '{transaction,pix,code}', '')), '') as pix_copia_cola,
      case
        when o.tipo = 'mensalidade' and o.plano_id is not null
          then 'plano:' || o.plano_id::text
        when o.tipo = 'recarga'
          then 'recarga_tokens'
        else null
      end as grupo_cobranca,
      case
        when o.tipo = 'mensalidade' and o.plano_id is not null then
          case
            when lower(trim(coalesce(pl.nome, ''))) like 'plano %'
              then trim(pl.nome)
            else 'Plano ' || trim(coalesce(pl.nome, ''))
          end
        when o.tipo = 'recarga' then
          coalesce(nullif(trim(o.nome), ''), 'Pacote de tokens de IA')
        else null
      end as item_cobranca
    from public.pagamentos p
    join public.ia_token_ofertas o
      on o.referencia = p.offer_hash
    left join public.planos pl
      on pl.id = o.plano_id
    where p.metodo = 'pix'
      and p.status in ('waiting_payment', 'paid')
      and p.created_at >= now() - interval '12 hours'
      and (
        (
          v_email <> ''
          and lower(trim(coalesce(p.customer_email, ''))) = v_email
        )
        or
        (
          v_telefone <> ''
          and regexp_replace(coalesce(p.customer_telefone, ''), '\D', '', 'g') = v_telefone
        )
      )
  ), pagamentos_rankeados as (
    select
      pb.*,
      row_number() over (
        partition by pb.grupo_cobranca
        order by pb.created_at desc, pb.id desc
      ) as posicao
    from pagamentos_base pb
    where pb.grupo_cobranca is not null
  ), pix_pendentes as (
    select
      pr.item_cobranca,
      pr.created_at,
      pr.pix_copia_cola
    from pagamentos_rankeados pr
    where pr.posicao = 1
      and pr.status = 'waiting_payment'
      and pr.pix_copia_cola is not null
      and nullif(trim(coalesce(pr.item_cobranca, '')), '') is not null
  )
  select coalesce(
    string_agg(
      '*' || pp.item_cobranca || '* — gerado em '
      || to_char(
        pp.created_at at time zone 'America/Sao_Paulo',
        'DD/MM "às" HH24:MI'
      )
      || E'\nPIX Copia e Cola:\n'
      || pp.pix_copia_cola,
      E'\n\n'
      order by pp.created_at desc
    ),
    ''
  )
  into v_resumo
  from pix_pendentes pp;

  return jsonb_build_object(
    'autorizado', true,
    'resumo', coalesce(v_resumo, '')
  );
end;
$$;

revoke all on function public.prosperity_resumo_pix_pendentes_contato(uuid)
  from public, anon, authenticated;
grant execute on function public.prosperity_resumo_pix_pendentes_contato(uuid)
  to service_role;
