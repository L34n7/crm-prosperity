create index if not exists contato_atribuicoes_meta_mensagem_id_idx
  on public.contato_atribuicoes_meta (mensagem_id)
  where mensagem_id is not null;

create index if not exists whatsapp_opt_out_contextos_resposta_mensagem_id_idx
  on public.whatsapp_opt_out_contextos (resposta_mensagem_id)
  where resposta_mensagem_id is not null;

create index if not exists automacao_intencao_execucoes_mensagem_id_idx
  on public.automacao_intencao_execucoes (mensagem_id)
  where mensagem_id is not null;

create index if not exists whatsapp_supressao_eventos_mensagem_id_idx
  on public.whatsapp_supressao_eventos (mensagem_id)
  where mensagem_id is not null;

create index if not exists whatsapp_supressoes_mensagem_id_idx
  on public.whatsapp_supressoes (mensagem_id)
  where mensagem_id is not null;

create index if not exists automacao_arquivo_analises_mensagem_id_idx
  on public.automacao_arquivo_analises (mensagem_id)
  where mensagem_id is not null;
