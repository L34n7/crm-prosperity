create index if not exists contato_informacoes_captura_contato_idx
  on public.contato_informacoes_captura (
    contato_id,
    ativo,
    capturado_em desc
  );

create index if not exists contato_informacoes_captura_no_idx
  on public.contato_informacoes_captura (no_id)
  where no_id is not null;

create index if not exists contato_informacoes_captura_execucao_idx
  on public.contato_informacoes_captura (execucao_id)
  where execucao_id is not null;

create index if not exists contato_informacoes_captura_criado_por_idx
  on public.contato_informacoes_captura (criado_por)
  where criado_por is not null;

create index if not exists contato_informacoes_captura_atualizado_por_idx
  on public.contato_informacoes_captura (atualizado_por)
  where atualizado_por is not null;

create index if not exists contato_informacoes_captura_excluido_por_idx
  on public.contato_informacoes_captura (excluido_por)
  where excluido_por is not null;
