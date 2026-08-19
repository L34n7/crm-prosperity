-- Atualiza apenas as franquias configuradas para próximas renovações e recargas.
-- Os saldos/limites correntes das empresas são preservados.

-- Preserva o limite vigente do ciclo atual nas empresas que ainda herdavam
-- diretamente o limite do plano. Na próxima renovação, as funções existentes
-- substituem esse valor pela nova franquia configurada.
update public.empresa_tokens_ia et
set limite_mensal_personalizado = et.limite_mensal
from public.empresas e
join public.planos p on p.id = e.plano_id
where et.empresa_id = e.id
  and p.slug in ('basico', 'essencial')
  and et.limite_mensal_personalizado is null
  and et.limite_mensal is not null;

-- Plano Básico: 150 mil tokens/mês.
update public.planos
set
  limite_tokens_ia = 150000,
  recursos_json = jsonb_set(
    jsonb_set(
      recursos_json,
      '{tokens_ia}',
      to_jsonb(150000::bigint),
      true
    ),
    '{recursos}',
    (
      select coalesce(
        jsonb_agg(
          case
            when item.value = to_jsonb('1 milhão de tokens de IA'::text)
              then to_jsonb('150 mil tokens de IA'::text)
            else item.value
          end
          order by item.ordinality
        ),
        '[]'::jsonb
      )
      from jsonb_array_elements(coalesce(recursos_json->'recursos', '[]'::jsonb))
        with ordinality as item(value, ordinality)
    ),
    true
  ),
  updated_at = now()
where slug = 'basico';

-- Plano Essencial: 400 mil tokens/mês.
update public.planos
set
  limite_tokens_ia = 400000,
  recursos_json = jsonb_set(
    jsonb_set(
      recursos_json,
      '{tokens_ia}',
      to_jsonb(400000::bigint),
      true
    ),
    '{recursos}',
    (
      select coalesce(
        jsonb_agg(
          case
            when item.value = to_jsonb('5 milhões de tokens de IA'::text)
              then to_jsonb('400 mil tokens de IA'::text)
            else item.value
          end
          order by item.ordinality
        ),
        '[]'::jsonb
      )
      from jsonb_array_elements(coalesce(recursos_json->'recursos', '[]'::jsonb))
        with ordinality as item(value, ordinality)
    ),
    true
  ),
  updated_at = now()
where slug = 'essencial';

-- Todas as ofertas de mensalidade passam a renovar com a franquia atualizada.
update public.ia_token_ofertas o
set
  quantidade_tokens = 150000,
  updated_at = now()
from public.planos p
where o.plano_id = p.id
  and o.tipo = 'mensalidade'
  and p.slug = 'basico';

update public.ia_token_ofertas o
set
  quantidade_tokens = 400000,
  updated_at = now()
from public.planos p
where o.plano_id = p.id
  and o.tipo = 'mensalidade'
  and p.slug = 'essencial';

-- Pacotes avulsos atualmente comercializados.
update public.ia_token_ofertas
set
  quantidade_tokens = 80000,
  nome = 'Pacote 80 mil tokens',
  updated_at = now()
where gateway = 'atomo'
  and tipo = 'recarga'
  and referencia = 'uoqee';

update public.ia_token_ofertas
set
  quantidade_tokens = 400000,
  nome = 'Pacote 400 mil tokens',
  updated_at = now()
where gateway = 'atomo'
  and tipo = 'recarga'
  and referencia = '8vyyj';
