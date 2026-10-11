alter table public.automacao_intencoes
  add column if not exists frases_gatilho text[] not null default '{}'::text[];

comment on column public.automacao_intencoes.frases_gatilho is
  'Frases de alta confiança que acionam a intenção sem IA. Devem ser específicas; a IA fica reservada ao fallback quando a resposta do fluxo é inválida.';
