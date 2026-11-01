-- Correção idempotente: clientes White Label já cancelados não devem manter
-- fluxos ativos. Preservamos os registros, apenas pausando-os.
UPDATE public.automacao_fluxos AS f
SET status = 'pausado',
    updated_at = now()
WHERE f.status = 'ativo'
  AND EXISTS (
    SELECT 1
    FROM public.empresas AS e
    WHERE e.id = f.empresa_id
      AND e.white_label_tipo = 'cliente'
      AND e.status = 'cancelada'
  );
