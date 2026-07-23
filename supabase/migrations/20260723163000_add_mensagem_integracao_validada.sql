-- Registra quando uma integração recebeu a primeira mensagem real após o onboarding.
ALTER TABLE public.integracoes_whatsapp
  ADD COLUMN IF NOT EXISTS mensagem_integracao_validada timestamptz;

COMMENT ON COLUMN public.integracoes_whatsapp.mensagem_integracao_validada IS
  'Data da primeira mensagem inbound recebida após a conclusão ou reconexão da integração.';

-- Preenche integrações existentes que já receberam mensagens após a conclusão.
UPDATE public.integracoes_whatsapp AS iw
SET mensagem_integracao_validada = origem.primeira_mensagem
FROM (
  SELECT
    c.integracao_whatsapp_id,
    MIN(c.last_inbound_message_at) AS primeira_mensagem
  FROM public.conversas AS c
  INNER JOIN public.integracoes_whatsapp AS i
    ON i.id = c.integracao_whatsapp_id
  WHERE c.last_inbound_message_at IS NOT NULL
    AND c.last_inbound_message_at >= COALESCE(i.setup_completed_at, i.created_at)
  GROUP BY c.integracao_whatsapp_id
) AS origem
WHERE iw.id = origem.integracao_whatsapp_id
  AND iw.mensagem_integracao_validada IS NULL;

-- Preenche a validação somente na primeira mensagem inbound da integração.
CREATE OR REPLACE FUNCTION public.validar_mensagem_integracao_whatsapp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.integracao_whatsapp_id IS NULL
     OR NEW.last_inbound_message_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.last_inbound_message_at IS NOT DISTINCT FROM NEW.last_inbound_message_at THEN
    RETURN NEW;
  END IF;

  UPDATE public.integracoes_whatsapp
  SET mensagem_integracao_validada = NEW.last_inbound_message_at,
      updated_at = now()
  WHERE id = NEW.integracao_whatsapp_id
    AND mensagem_integracao_validada IS NULL
    AND onboarding_status = 'concluido'
    AND status = 'ativa'
    AND NEW.last_inbound_message_at >= COALESCE(setup_completed_at, created_at);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_mensagem_integracao_whatsapp
  ON public.conversas;

CREATE TRIGGER trg_validar_mensagem_integracao_whatsapp
AFTER INSERT OR UPDATE OF last_inbound_message_at, integracao_whatsapp_id
ON public.conversas
FOR EACH ROW
EXECUTE FUNCTION public.validar_mensagem_integracao_whatsapp();

-- Exige uma nova mensagem de teste quando o número é trocado ou o onboarding é refeito.
CREATE OR REPLACE FUNCTION public.resetar_validacao_mensagem_integracao_whatsapp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.phone_number_id IS DISTINCT FROM OLD.phone_number_id
     OR NEW.setup_completed_at IS DISTINCT FROM OLD.setup_completed_at
     OR (
       NEW.onboarding_status = 'concluido'
       AND OLD.onboarding_status IS DISTINCT FROM 'concluido'
     ) THEN
    NEW.mensagem_integracao_validada := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resetar_validacao_mensagem_integracao_whatsapp
  ON public.integracoes_whatsapp;

CREATE TRIGGER trg_resetar_validacao_mensagem_integracao_whatsapp
BEFORE UPDATE OF phone_number_id, setup_completed_at, onboarding_status
ON public.integracoes_whatsapp
FOR EACH ROW
EXECUTE FUNCTION public.resetar_validacao_mensagem_integracao_whatsapp();

-- Garante que as atualizações da integração possam ser acompanhadas pelo Supabase Realtime.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'integracoes_whatsapp'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.integracoes_whatsapp;
  END IF;
END;
$$;
