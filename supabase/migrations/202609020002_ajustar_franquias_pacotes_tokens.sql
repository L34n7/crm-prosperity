-- Ajusta as franquias oficiais para as proximas renovacoes e os pacotes avulsos.
-- O saldo do ciclo atual e os tokens avulsos ja comprados nao sao alterados.

-- Planos oficiais: Basico = 100 mil e Essencial = 400 mil tokens Prosperity.
update public.planos
set
  limite_tokens_ia = 100000,
  recursos_json = jsonb_set(
    replace(
      replace(
        coalesce(recursos_json, '{}'::jsonb)::text,
        '150 mil tokens de IA',
        '100 mil tokens de IA'
      ),
      '80 mil tokens de IA',
      '100 mil tokens de IA'
    )::jsonb,
    '{tokens_ia}',
    to_jsonb(100000::bigint),
    true
  ),
  updated_at = now()
where slug = 'basico';

update public.planos
set
  limite_tokens_ia = 400000,
  recursos_json = jsonb_set(
    coalesce(recursos_json, '{}'::jsonb),
    '{tokens_ia}',
    to_jsonb(400000::bigint),
    true
  ),
  updated_at = now()
where slug = 'essencial';

-- A renovacao de mensalidade deve sempre usar a franquia oficial do plano.
-- A funcao aplicar_pagamento_tokens_ia preserva o saldo_avulso ao renovar.
update public.ia_token_ofertas o
set
  quantidade_tokens = 100000,
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

-- Pacotes avulsos: os precos permanecem R$ 25 e R$ 100 no checkout.
-- Apenas compras futuras passam a creditar 50 mil e 200 mil tokens.
update public.ia_token_ofertas
set
  quantidade_tokens = 50000,
  nome = 'Pacote 50 mil tokens',
  updated_at = now()
where gateway = 'atomo'
  and tipo = 'recarga'
  and referencia = 'uoqee';

update public.ia_token_ofertas
set
  quantidade_tokens = 200000,
  nome = 'Pacote 200 mil tokens',
  updated_at = now()
where gateway = 'atomo'
  and tipo = 'recarga'
  and referencia = '8vyyj';
