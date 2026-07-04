-- Segmento comercial detalhado para análise dos leads e nicho funcional
-- genérico para empresas que ainda não definiram sua operação.

alter table public.leads_cadastro
  add column if not exists segmento_codigo text,
  add column if not exists segmento_nome text;

create index if not exists leads_cadastro_segmento_codigo_idx
  on public.leads_cadastro (segmento_codigo, created_at desc);

comment on column public.leads_cadastro.segmento_codigo is
  'Código estável do segmento detalhado selecionado na captação do lead.';

comment on column public.leads_cadastro.segmento_nome is
  'Nome do segmento no momento em que o lead foi captado.';

insert into public.nichos (
  id,
  codigo,
  nome,
  grupo,
  rotulo_cadastro_singular,
  rotulo_cadastro_plural,
  ordem
)
values (
  '10000000-0000-4000-8000-000000000005',
  'outro',
  'Outro / ainda não definido',
  'comercial',
  'Cliente',
  'Clientes',
  50
)
on conflict (codigo) do update
set
  nome = excluded.nome,
  grupo = excluded.grupo,
  rotulo_cadastro_singular = excluded.rotulo_cadastro_singular,
  rotulo_cadastro_plural = excluded.rotulo_cadastro_plural,
  ativo = true,
  ordem = excluded.ordem,
  updated_at = now();

insert into public.nicho_modulos (nicho_id, modulo_codigo, obrigatorio)
values (
  '10000000-0000-4000-8000-000000000005',
  'cadastros.pessoas',
  true
)
on conflict (nicho_id, modulo_codigo) do update
set obrigatorio = excluded.obrigatorio;
