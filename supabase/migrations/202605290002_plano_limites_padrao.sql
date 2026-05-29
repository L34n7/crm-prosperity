alter table if exists public.planos
  add column if not exists preco_mensal_centavos integer,
  add column if not exists limite_usuarios integer,
  add column if not exists limite_tokens_ia bigint;

update public.planos
set
  nome = 'Básico',
  preco_mensal_centavos = 13700,
  limite_usuarios = 2,
  limite_tokens_ia = 1000000
where lower(coalesce(slug, '')) in ('basic', 'basico')
   or nome ilike 'basic'
   or nome ilike 'basico'
   or nome ilike 'básico';

update public.planos
set
  nome = 'Essencial',
  preco_mensal_centavos = 19700,
  limite_usuarios = 6,
  limite_tokens_ia = 5000000
where lower(coalesce(slug, '')) = 'essencial'
   or nome ilike 'essencial';
