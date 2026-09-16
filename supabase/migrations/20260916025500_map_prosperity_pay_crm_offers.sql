insert into public.ia_token_ofertas (
  gateway,
  referencia,
  tipo,
  nome,
  plano_id,
  quantidade_tokens,
  ativa,
  metadata_json
)
values
  (
    'prosperity_pay',
    'plano-basic-be3817c7',
    'mensalidade',
    'Prosperity Pay Plano Básico',
    '496aa8a6-d977-4223-a9bc-33937b6d0652'::uuid,
    100000,
    true,
    '{"origem":"prosperity_pay","plano_slug":"basico","tipo_oferta":"normal","checkout_url":"https://prosperity-pay.vercel.app/checkout/plano-basic-be3817c7","valor_oferta_centavos":13700}'::jsonb
  ),
  (
    'prosperity_pay',
    'c7074bf9e18e',
    'mensalidade',
    'Prosperity Pay Plano Essencial',
    '611c5987-19c8-457b-a2cd-31563deb6978'::uuid,
    400000,
    true,
    '{"origem":"prosperity_pay","plano_slug":"essencial","tipo_oferta":"normal","checkout_url":"https://prosperity-pay.vercel.app/checkout/c7074bf9e18e","valor_oferta_centavos":26700}'::jsonb
  ),
  (
    'prosperity_pay',
    '248a0b141abf',
    'mensalidade',
    'Prosperity Pay Teste R$ 5 - Plano Básico',
    '496aa8a6-d977-4223-a9bc-33937b6d0652'::uuid,
    100000,
    true,
    '{"origem":"prosperity_pay_teste","plano_slug":"basico","tipo_oferta":"normal","checkout_url":"https://prosperity-pay.vercel.app/checkout/248a0b141abf","valor_teste_centavos":500}'::jsonb
  )
on conflict (gateway, referencia) do update
set tipo = excluded.tipo,
    nome = excluded.nome,
    plano_id = excluded.plano_id,
    quantidade_tokens = excluded.quantidade_tokens,
    ativa = excluded.ativa,
    metadata_json = excluded.metadata_json,
    updated_at = now();
