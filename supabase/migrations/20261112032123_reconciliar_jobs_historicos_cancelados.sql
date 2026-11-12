-- Saneamento de filas históricas sem afetar os disparos atuais.
-- O gatilho de reserva da Meta procura por telefone, não por ID do item:
-- não deve manipular reservas de OUTROS disparos ao encerrar itens antigos.
-- A desativação é transacional; um erro reverte a atualização e o estado do gatilho.
DO $reconciliacao$
DECLARE
  v_itens_antes integer;
  v_itens_cancelados integer := 0;
  v_jobs_antes integer;
  v_jobs_cancelados integer := 0;
BEGIN
  PERFORM set_config('lock_timeout','3000ms',true);

  SELECT count(*) INTO v_itens_antes
  FROM public.whatsapp_disparo_itens i
  JOIN public.whatsapp_disparo_campanhas c ON c.id=i.campanha_id
  WHERE c.status='cancelada'
    AND i.status IN ('pendente','processando')
    AND i.message_id IS NULL
    AND i.created_at < now()-interval '30 days';

  SELECT count(*) INTO v_jobs_antes
  FROM public.fila_processamento_auto q
  JOIN public.automacao_execucoes x ON x.id=q.execucao_id
  JOIN public.automacao_fluxos f ON f.id=q.fluxo_id
  WHERE q.status='executando'
    AND q.locked_at<now()-interval '30 days'
    AND x.status='finalizado'
    AND f.status='pausado';

  -- Recusa um lote inesperado; no CRM auditado havia 134 + 1.
  IF v_itens_antes NOT IN (0,134) OR v_jobs_antes NOT IN (0,1) THEN
    RAISE EXCEPTION 'Reconciliacao abortada: % itens e % jobs fora do escopo esperado',
      v_itens_antes,v_jobs_antes;
  END IF;

  IF v_itens_antes>0 THEN
    IF (SELECT tgenabled FROM pg_trigger
        WHERE tgrelid='public.whatsapp_disparo_itens'::regclass
        AND tgname='trg_sincronizar_whatsapp_meta_reserva_item_update') <> 'O' THEN
      RAISE EXCEPTION 'Gatilho de reserva nao esta no estado esperado';
    END IF;

    EXECUTE 'ALTER TABLE public.whatsapp_disparo_itens DISABLE TRIGGER trg_sincronizar_whatsapp_meta_reserva_item_update';

    UPDATE public.whatsapp_disparo_itens i
    SET status='cancelado',
        locked_at=NULL,
        processed_at=coalesce(i.processed_at,now()),
        erro=coalesce(nullif(i.erro,''),'Cancelado: campanha encerrada manualmente antes do envio.'),
        metadata_json=coalesce(i.metadata_json,'{}'::jsonb)||
          jsonb_build_object('reconciliado_em',now(),
                             'reconciliacao_motivo','campanha_cancelada_sem_envio'),
        updated_at=now()
    FROM public.whatsapp_disparo_campanhas c
    WHERE c.id=i.campanha_id
      AND c.status='cancelada'
      AND i.status IN ('pendente','processando')
      AND i.message_id IS NULL
      AND i.created_at < now()-interval '30 days';

    GET DIAGNOSTICS v_itens_cancelados=ROW_COUNT;
    IF v_itens_cancelados<>v_itens_antes THEN
      RAISE EXCEPTION 'Mudanca concorrente durante reconciliacao WhatsApp: % vs %',
        v_itens_cancelados,v_itens_antes;
    END IF;

    EXECUTE 'ALTER TABLE public.whatsapp_disparo_itens ENABLE TRIGGER trg_sincronizar_whatsapp_meta_reserva_item_update';
  END IF;

  UPDATE public.fila_processamento_auto q
  SET status='cancelado',locked_at=NULL,
      erro='Job legado encerrado: execucao finalizada e fluxo pausado; nao foi retomado.',
      updated_at=now()
  FROM public.automacao_execucoes x, public.automacao_fluxos f
  WHERE q.execucao_id=x.id AND q.fluxo_id=f.id
    AND q.status='executando'
    AND q.locked_at<now()-interval '30 days'
    AND x.status='finalizado'
    AND f.status='pausado';

  GET DIAGNOSTICS v_jobs_cancelados=ROW_COUNT;
  IF v_jobs_cancelados<>v_jobs_antes THEN
    RAISE EXCEPTION 'Mudanca concorrente durante reconciliacao de jobs: % vs %',
      v_jobs_cancelados,v_jobs_antes;
  END IF;

  RAISE NOTICE 'Reconciliacao concluida: % itens WhatsApp, % jobs',
    v_itens_cancelados,v_jobs_cancelados;
END;
$reconciliacao$;
