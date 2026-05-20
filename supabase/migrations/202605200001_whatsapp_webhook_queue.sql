-- Fila de webhooks do WhatsApp para desacoplar resposta da Meta do processamento pesado.

CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_eventos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  body_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pendente' CHECK (
    status = ANY (
      ARRAY[
        'pendente'::text,
        'processando'::text,
        'processado'::text,
        'erro'::text,
        'cancelado'::text
      ]
    )
  ),
  tentativas integer NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  body_json jsonb NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  resultado_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  erro text,
  locked_at timestamp with time zone,
  processed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_webhook_eventos_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS whatsapp_webhook_eventos_status_created_idx
  ON public.whatsapp_webhook_eventos (status, created_at);

CREATE INDEX IF NOT EXISTS whatsapp_webhook_eventos_locked_idx
  ON public.whatsapp_webhook_eventos (locked_at)
  WHERE status = 'processando';
