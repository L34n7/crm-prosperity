alter table public.automacao_intencoes
  add column if not exists palavras_chave text[] not null default '{}'::text[];

comment on column public.automacao_intencoes.palavras_chave is
  'Palavras ou frases que acionam a intenção deterministicamente, sem chamada de IA. A IA fica reservada ao fallback de resposta inválida.';
