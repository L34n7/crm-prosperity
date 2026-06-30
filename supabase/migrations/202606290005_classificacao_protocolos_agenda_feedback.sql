-- Classificacao operacional de contatos, historico por protocolo e feedback
-- pos-agendamento. Eventos sao a fonte de verdade; contatos guardam apenas o
-- resumo atual para listagens e filtros.

ALTER TABLE public.rastreamento_eventos
  ADD COLUMN IF NOT EXISTS conversa_protocolo_id uuid
    REFERENCES public.conversa_protocolos(id) ON DELETE SET NULL;

ALTER TABLE public.conversa_protocolos
  ADD COLUMN IF NOT EXISTS contato_id uuid
    REFERENCES public.contatos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contato_novo_no_inicio boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS iniciado_com_bot boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finalizado_com_bot boolean,
  ADD COLUMN IF NOT EXISTS finalizado_por_tipo text,
  ADD COLUMN IF NOT EXISTS finalizado_por_usuario_id uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motivo_encerramento text,
  ADD COLUMN IF NOT EXISTS resultado text NOT NULL DEFAULT 'em_andamento',
  ADD COLUMN IF NOT EXISTS resultado_em timestamptz,
  ADD COLUMN IF NOT EXISTS resultado_evento_id uuid
    REFERENCES public.rastreamento_eventos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS valor_convertido numeric(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.conversa_protocolos
  DROP CONSTRAINT IF EXISTS conversa_protocolos_resultado_check;

ALTER TABLE public.conversa_protocolos
  ADD CONSTRAINT conversa_protocolos_resultado_check CHECK (
    resultado IN (
      'em_andamento',
      'qualificado',
      'convertido',
      'perdido',
      'neutro'
    )
  );

ALTER TABLE public.conversa_protocolos
  DROP CONSTRAINT IF EXISTS conversa_protocolos_finalizado_por_tipo_check;

ALTER TABLE public.conversa_protocolos
  ADD CONSTRAINT conversa_protocolos_finalizado_por_tipo_check CHECK (
    finalizado_por_tipo IS NULL
    OR finalizado_por_tipo IN ('bot', 'atendente', 'sistema')
  );

ALTER TABLE public.contatos
  ADD COLUMN IF NOT EXISTS classificacao text,
  ADD COLUMN IF NOT EXISTS classificacao_atualizada_em timestamptz,
  ADD COLUMN IF NOT EXISTS classificacao_evento_id uuid
    REFERENCES public.rastreamento_eventos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS classificacao_protocolo_id uuid
    REFERENCES public.conversa_protocolos(id) ON DELETE SET NULL;

ALTER TABLE public.contatos
  DROP CONSTRAINT IF EXISTS contatos_classificacao_check;

ALTER TABLE public.contatos
  ADD CONSTRAINT contatos_classificacao_check CHECK (
    classificacao IS NULL
    OR classificacao IN ('qualificado', 'convertido', 'perdido')
  );

ALTER TABLE public.agenda_agendamentos
  ADD COLUMN IF NOT EXISTS feedback_elegivel_em timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS feedback_solicitado_em timestamptz,
  ADD COLUMN IF NOT EXISTS feedback_respondido_em timestamptz,
  ADD COLUMN IF NOT EXISTS feedback_resultado text,
  ADD COLUMN IF NOT EXISTS feedback_respondido_por uuid
    REFERENCES public.usuarios(id) ON DELETE SET NULL;

ALTER TABLE public.agenda_agendamentos
  DROP CONSTRAINT IF EXISTS agenda_agendamentos_feedback_resultado_check;

ALTER TABLE public.agenda_agendamentos
  ADD CONSTRAINT agenda_agendamentos_feedback_resultado_check CHECK (
    feedback_resultado IS NULL
    OR feedback_resultado IN ('realizado', 'faltou', 'cancelado')
  );

CREATE INDEX IF NOT EXISTS rastreamento_eventos_protocolo_ocorrido_idx
  ON public.rastreamento_eventos (
    empresa_id,
    conversa_protocolo_id,
    ocorrido_em DESC,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS rastreamento_eventos_contato_tipo_ocorrido_idx
  ON public.rastreamento_eventos (
    empresa_id,
    contato_id,
    tipo,
    ocorrido_em DESC
  );

CREATE INDEX IF NOT EXISTS conversa_protocolos_contato_inicio_idx
  ON public.conversa_protocolos (
    empresa_id,
    contato_id,
    started_at DESC,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS conversa_protocolos_resultado_periodo_idx
  ON public.conversa_protocolos (
    empresa_id,
    resultado,
    resultado_em DESC
  );

CREATE INDEX IF NOT EXISTS contatos_empresa_classificacao_idx
  ON public.contatos (empresa_id, classificacao, created_at DESC);

CREATE INDEX IF NOT EXISTS contatos_empresa_criado_idx
  ON public.contatos (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS conversas_empresa_contato_atividade_idx
  ON public.conversas (
    empresa_id,
    contato_id,
    last_message_at DESC NULLS LAST,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS agenda_feedback_pendente_idx
  ON public.agenda_agendamentos (fim_at, empresa_id)
  WHERE status IN ('agendado', 'confirmado')
    AND feedback_solicitado_em IS NULL
    AND feedback_respondido_em IS NULL;

ALTER TABLE public.rastreamento_eventos
  DROP CONSTRAINT IF EXISTS rastreamento_eventos_tipo_check;

ALTER TABLE public.rastreamento_eventos
  ADD CONSTRAINT rastreamento_eventos_tipo_check CHECK (
    tipo IN (
      'clique_no_link',
      'lead_criado',
      'conversa_iniciada',
      'protocolo_iniciado',
      'primeira_mensagem_recebida',
      'lead_qualificado',
      'agendamento_criado',
      'agendamento_confirmado',
      'agendamento_remarcado',
      'agendamento_cancelado',
      'agendamento_realizado',
      'agendamento_faltou',
      'venda_realizada',
      'venda_perdida',
      'fluxo_iniciado',
      'fluxo_finalizado',
      'fluxo_transferido_atendimento',
      'fluxo_incompleto_timeout',
      'conversa_encerrada_manual',
      'conversa_encerrada_automacao',
      'conversa_encerrada_24h'
    )
  );

CREATE OR REPLACE FUNCTION public.contato_eh_novo(
  p_created_at timestamptz,
  p_referencia timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    p_created_at IS NOT NULL
    AND p_created_at >= p_referencia - interval '3 days'
    AND p_created_at <= p_referencia;
$$;

CREATE OR REPLACE FUNCTION public.rastreamento_classificacao_evento(
  p_tipo text,
  p_metadata jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_tipo IN (
      'protocolo_iniciado',
      'conversa_iniciada',
      'lead_qualificado'
    ) THEN 'qualificado'
    WHEN p_tipo IN (
      'venda_realizada',
      'agendamento_criado',
      'agendamento_confirmado',
      'agendamento_remarcado',
      'agendamento_realizado'
    ) THEN 'convertido'
    WHEN p_tipo IN (
      'venda_perdida',
      'agendamento_cancelado',
      'agendamento_faltou',
      'fluxo_incompleto_timeout',
      'conversa_encerrada_24h'
    ) THEN 'perdido'
    WHEN p_tipo = 'fluxo_finalizado'
      AND COALESCE(p_metadata->>'resultado_fluxo', '') = 'positivo'
      THEN 'convertido'
    WHEN p_tipo = 'fluxo_finalizado'
      AND COALESCE(p_metadata->>'resultado_fluxo', '') = 'negativo'
      THEN 'perdido'
    WHEN p_tipo = 'fluxo_finalizado'
      AND COALESCE(p_metadata->>'resultado_fluxo', '') = 'neutro'
      THEN 'neutro'
    WHEN p_tipo = 'conversa_encerrada_manual'
      AND COALESCE(p_metadata->>'resultado', '') = 'convertido'
      THEN 'convertido'
    WHEN p_tipo = 'conversa_encerrada_manual'
      AND COALESCE(p_metadata->>'resultado', '') = 'perdido'
      THEN 'perdido'
    WHEN p_tipo = 'conversa_encerrada_manual'
      THEN 'neutro'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.preparar_protocolo_conversa()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_contato_id uuid;
  v_contato_created_at timestamptz;
  v_status text;
  v_bot_ativo boolean;
  v_inicio timestamptz;
BEGIN
  SELECT
    c.contato_id,
    ct.created_at,
    c.status,
    COALESCE(c.bot_ativo, false)
  INTO
    v_contato_id,
    v_contato_created_at,
    v_status,
    v_bot_ativo
  FROM public.conversas c
  LEFT JOIN public.contatos ct ON ct.id = c.contato_id
  WHERE c.id = NEW.conversa_id
    AND c.empresa_id = NEW.empresa_id;

  v_inicio := COALESCE(NEW.started_at, NEW.created_at, now());
  NEW.contato_id := COALESCE(NEW.contato_id, v_contato_id);
  NEW.contato_novo_no_inicio :=
    COALESCE(NEW.contato_novo_no_inicio, false)
    OR COALESCE(
      public.contato_eh_novo(v_contato_created_at, v_inicio),
      false
    );
  NEW.iniciado_com_bot :=
    COALESCE(NEW.iniciado_com_bot, false)
    OR v_status = 'bot'
    OR v_bot_ativo;
  NEW.resultado := COALESCE(NULLIF(NEW.resultado, ''), 'em_andamento');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversa_protocolos_preparar
  ON public.conversa_protocolos;

CREATE TRIGGER conversa_protocolos_preparar
BEFORE INSERT ON public.conversa_protocolos
FOR EACH ROW EXECUTE FUNCTION public.preparar_protocolo_conversa();

CREATE OR REPLACE FUNCTION public.vincular_evento_ao_protocolo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_metadata_protocolo text;
  v_contato_novo boolean;
BEGIN
  IF NEW.conversa_protocolo_id IS NULL THEN
    v_metadata_protocolo :=
      NULLIF(BTRIM(NEW.metadata_json->>'conversa_protocolo_id'), '');

    IF v_metadata_protocolo ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN
      SELECT cp.id
      INTO NEW.conversa_protocolo_id
      FROM public.conversa_protocolos cp
      WHERE cp.id = v_metadata_protocolo::uuid
        AND cp.empresa_id = NEW.empresa_id
      LIMIT 1;
    END IF;
  END IF;

  IF NEW.conversa_protocolo_id IS NULL
    AND NEW.agendamento_id IS NOT NULL
  THEN
    SELECT aa.conversa_protocolo_id
    INTO NEW.conversa_protocolo_id
    FROM public.agenda_agendamentos aa
    WHERE aa.id = NEW.agendamento_id
      AND aa.empresa_id = NEW.empresa_id;
  END IF;

  IF NEW.conversa_protocolo_id IS NULL
    AND NEW.conversa_id IS NOT NULL
  THEN
    SELECT cp.id
    INTO NEW.conversa_protocolo_id
    FROM public.conversa_protocolos cp
    WHERE cp.empresa_id = NEW.empresa_id
      AND cp.conversa_id = NEW.conversa_id
      AND COALESCE(cp.started_at, cp.created_at) <= COALESCE(NEW.ocorrido_em, now())
      AND (
        cp.closed_at IS NULL
        OR cp.closed_at >= COALESCE(NEW.ocorrido_em, now())
      )
    ORDER BY COALESCE(cp.started_at, cp.created_at) DESC, cp.created_at DESC
    LIMIT 1;
  END IF;

  IF NEW.conversa_protocolo_id IS NOT NULL THEN
    SELECT
      COALESCE(NEW.contato_id, cp.contato_id),
      COALESCE(NEW.conversa_id, cp.conversa_id),
      cp.contato_novo_no_inicio
    INTO
      NEW.contato_id,
      NEW.conversa_id,
      v_contato_novo
    FROM public.conversa_protocolos cp
    WHERE cp.id = NEW.conversa_protocolo_id
      AND cp.empresa_id = NEW.empresa_id;

    NEW.metadata_json :=
      COALESCE(NEW.metadata_json, '{}'::jsonb)
      || jsonb_build_object(
        'conversa_protocolo_id',
        NEW.conversa_protocolo_id,
        'contato_novo_no_inicio',
        COALESCE(v_contato_novo, false)
      );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rastreamento_eventos_vincular_protocolo
  ON public.rastreamento_eventos;

CREATE TRIGGER rastreamento_eventos_vincular_protocolo
BEFORE INSERT OR UPDATE OF
  conversa_protocolo_id,
  conversa_id,
  contato_id,
  agendamento_id,
  metadata_json,
  ocorrido_em
ON public.rastreamento_eventos
FOR EACH ROW EXECUTE FUNCTION public.vincular_evento_ao_protocolo();

CREATE OR REPLACE FUNCTION public.recalcular_classificacao_contato(
  p_contato_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_protocolo record;
  v_evento record;
  v_classificacao text;
BEGIN
  IF p_contato_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    cp.id,
    cp.resultado,
    cp.resultado_em,
    cp.resultado_evento_id,
    COALESCE(cp.started_at, cp.created_at) AS iniciado_em
  INTO v_protocolo
  FROM public.conversa_protocolos cp
  WHERE cp.contato_id = p_contato_id
  ORDER BY COALESCE(cp.started_at, cp.created_at) DESC, cp.created_at DESC
  LIMIT 1;

  IF v_protocolo.id IS NOT NULL THEN
    v_classificacao := CASE
      WHEN v_protocolo.resultado = 'convertido' THEN 'convertido'
      WHEN v_protocolo.resultado = 'perdido' THEN 'perdido'
      ELSE 'qualificado'
    END;

    UPDATE public.contatos
    SET
      classificacao = v_classificacao,
      classificacao_atualizada_em =
        COALESCE(v_protocolo.resultado_em, v_protocolo.iniciado_em, now()),
      classificacao_evento_id = v_protocolo.resultado_evento_id,
      classificacao_protocolo_id = v_protocolo.id
    WHERE id = p_contato_id;

    RETURN;
  END IF;

  SELECT
    e.id,
    public.rastreamento_classificacao_evento(e.tipo, e.metadata_json)
      AS classificacao,
    e.ocorrido_em
  INTO v_evento
  FROM public.rastreamento_eventos e
  WHERE e.contato_id = p_contato_id
    AND e.conversa_protocolo_id IS NULL
    AND public.rastreamento_classificacao_evento(
      e.tipo,
      e.metadata_json
    ) IS NOT NULL
  ORDER BY e.ocorrido_em DESC, e.created_at DESC, e.id DESC
  LIMIT 1;

  v_classificacao := CASE
    WHEN v_evento.classificacao IN ('neutro', 'qualificado')
      THEN 'qualificado'
    WHEN v_evento.classificacao IN ('convertido', 'perdido')
      THEN v_evento.classificacao
    ELSE NULL
  END;

  UPDATE public.contatos
  SET
    classificacao = v_classificacao,
    classificacao_atualizada_em = v_evento.ocorrido_em,
    classificacao_evento_id = v_evento.id,
    classificacao_protocolo_id = NULL
  WHERE id = p_contato_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalcular_resultado_protocolo(
  p_protocolo_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_evento record;
  v_contato_id uuid;
  v_valor numeric(14, 2);
BEGIN
  IF p_protocolo_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    e.id,
    public.rastreamento_classificacao_evento(e.tipo, e.metadata_json)
      AS resultado,
    e.ocorrido_em
  INTO v_evento
  FROM public.rastreamento_eventos e
  WHERE e.conversa_protocolo_id = p_protocolo_id
    AND public.rastreamento_classificacao_evento(
      e.tipo,
      e.metadata_json
    ) IS NOT NULL
  ORDER BY e.ocorrido_em DESC, e.created_at DESC, e.id DESC
  LIMIT 1;

  SELECT COALESCE(SUM(COALESCE(e.valor, 0)), 0)
  INTO v_valor
  FROM public.rastreamento_eventos e
  WHERE e.conversa_protocolo_id = p_protocolo_id
    AND public.rastreamento_classificacao_evento(
      e.tipo,
      e.metadata_json
    ) = 'convertido';

  UPDATE public.conversa_protocolos
  SET
    resultado = COALESCE(v_evento.resultado, 'em_andamento'),
    resultado_em = v_evento.ocorrido_em,
    resultado_evento_id = v_evento.id,
    valor_convertido = COALESCE(v_valor, 0),
    updated_at = now()
  WHERE id = p_protocolo_id
  RETURNING contato_id INTO v_contato_id;

  PERFORM public.recalcular_classificacao_contato(v_contato_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.rastreamento_evento_recalcular_resultados()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.recalcular_resultado_protocolo(
      OLD.conversa_protocolo_id
    );

    IF OLD.conversa_protocolo_id IS NULL THEN
      PERFORM public.recalcular_classificacao_contato(OLD.contato_id);
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.recalcular_resultado_protocolo(
      NEW.conversa_protocolo_id
    );

    IF NEW.conversa_protocolo_id IS NULL THEN
      PERFORM public.recalcular_classificacao_contato(NEW.contato_id);
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rastreamento_eventos_recalcular_resultados
  ON public.rastreamento_eventos;

CREATE TRIGGER rastreamento_eventos_recalcular_resultados
AFTER INSERT OR UPDATE OR DELETE ON public.rastreamento_eventos
FOR EACH ROW EXECUTE FUNCTION public.rastreamento_evento_recalcular_resultados();

CREATE OR REPLACE FUNCTION public.registrar_inicio_protocolo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.rastreamento_criar_evento(
    NEW.empresa_id,
    'protocolo_iniciado',
    NEW.contato_id,
    NEW.conversa_id,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    'protocolo',
    'protocolo:' || NEW.id::text || ':iniciado',
    jsonb_build_object(
      'conversa_protocolo_id', NEW.id,
      'protocolo', NEW.protocolo,
      'tipo_protocolo', NEW.tipo,
      'contato_novo_no_inicio', NEW.contato_novo_no_inicio,
      'iniciado_com_bot', NEW.iniciado_com_bot
    ),
    NULL
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversa_protocolos_registrar_inicio
  ON public.conversa_protocolos;

CREATE TRIGGER conversa_protocolos_registrar_inicio
AFTER INSERT ON public.conversa_protocolos
FOR EACH ROW EXECUTE FUNCTION public.registrar_inicio_protocolo();

CREATE OR REPLACE FUNCTION public.registrar_estado_protocolo_conversa()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_protocolo_id uuid;
  v_contato_id uuid;
  v_finalizado_por_tipo text;
  v_finalizado_por_usuario_id uuid;
  v_finalizado_com_bot boolean;
  v_tipo_evento text;
BEGIN
  IF (
    (NEW.status = 'bot' OR COALESCE(NEW.bot_ativo, false))
    AND NOT (OLD.status = 'bot' OR COALESCE(OLD.bot_ativo, false))
  ) THEN
    UPDATE public.conversa_protocolos
    SET
      iniciado_com_bot = true,
      updated_at = now()
    WHERE conversa_id = NEW.id
      AND empresa_id = NEW.empresa_id
      AND ativo = true
      -- A ativacao inicial do fluxo ocorre logo apos a abertura do protocolo.
      -- Ativacoes manuais posteriores nao devem alterar a origem historica.
      AND COALESCE(started_at, created_at) >= now() - interval '5 minutes';
  END IF;

  IF NEW.status IN (
    'encerrado_manual',
    'encerrado_aut',
    'encerrado_24h'
  )
  AND OLD.status NOT IN (
    'encerrado_manual',
    'encerrado_aut',
    'encerrado_24h'
  ) THEN
    SELECT cp.id, cp.contato_id
    INTO v_protocolo_id, v_contato_id
    FROM public.conversa_protocolos cp
    WHERE cp.conversa_id = NEW.id
      AND cp.empresa_id = NEW.empresa_id
      AND cp.ativo = true
    ORDER BY COALESCE(cp.started_at, cp.created_at) DESC
    LIMIT 1;

    v_finalizado_com_bot :=
      OLD.status = 'bot'
      OR COALESCE(OLD.bot_ativo, false)
      OR NEW.status = 'encerrado_aut';

    v_finalizado_por_tipo := CASE
      WHEN NEW.status = 'encerrado_24h' THEN 'sistema'
      WHEN NEW.status = 'encerrado_aut' THEN 'bot'
      WHEN OLD.responsavel_id IS NOT NULL THEN 'atendente'
      ELSE 'sistema'
    END;

    v_finalizado_por_usuario_id := CASE
      WHEN v_finalizado_por_tipo = 'atendente'
        THEN OLD.responsavel_id
      ELSE NULL
    END;

    UPDATE public.conversa_protocolos
    SET
      ativo = false,
      closed_at = COALESCE(NEW.closed_at, now()),
      finalizado_com_bot = v_finalizado_com_bot,
      finalizado_por_tipo = v_finalizado_por_tipo,
      finalizado_por_usuario_id = v_finalizado_por_usuario_id,
      motivo_encerramento = NEW.status,
      updated_at = now()
    WHERE id = v_protocolo_id;

    v_tipo_evento := CASE
      WHEN NEW.status = 'encerrado_24h' THEN 'conversa_encerrada_24h'
      WHEN NEW.status = 'encerrado_aut' THEN 'conversa_encerrada_automacao'
      ELSE 'conversa_encerrada_manual'
    END;

    PERFORM public.rastreamento_criar_evento(
      NEW.empresa_id,
      v_tipo_evento,
      COALESCE(v_contato_id, NEW.contato_id),
      NEW.id,
      NEW.rastreamento_origem_id,
      NEW.rastreamento_campanha_id,
      NEW.rastreamento_link_id,
      NEW.rastreamento_clique_id,
      NULL,
      NULL,
      CASE
        WHEN NEW.status = 'encerrado_manual' THEN 'atendimento'
        ELSE 'sistema'
      END,
      'protocolo:' || COALESCE(v_protocolo_id::text, NEW.id::text)
        || ':encerramento:' || NEW.status,
      jsonb_build_object(
        'conversa_protocolo_id', v_protocolo_id,
        'status_conversa', NEW.status,
        'finalizado_com_bot', v_finalizado_com_bot,
        'finalizado_por_tipo', v_finalizado_por_tipo,
        'finalizado_por_usuario_id', v_finalizado_por_usuario_id,
        'resultado',
          CASE
            WHEN NEW.status = 'encerrado_manual' THEN 'neutro'
            ELSE NULL
          END
      ),
      v_finalizado_por_usuario_id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversas_registrar_estado_protocolo
  ON public.conversas;

CREATE TRIGGER conversas_registrar_estado_protocolo
AFTER UPDATE OF status, bot_ativo, responsavel_id, closed_at
ON public.conversas
FOR EACH ROW EXECUTE FUNCTION public.registrar_estado_protocolo_conversa();

DROP TRIGGER IF EXISTS rastreamento_evento_contato
  ON public.contatos;

CREATE OR REPLACE FUNCTION public.rastreamento_evento_contato_criado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.rastreamento_criar_evento(
    NEW.empresa_id,
    'lead_criado',
    NEW.id,
    NULL,
    NEW.rastreamento_origem_id,
    NEW.rastreamento_campanha_id,
    NEW.rastreamento_link_id,
    NEW.rastreamento_clique_id,
    NULL,
    NULL,
    'contato',
    'contato:' || NEW.id::text || ':lead_criado',
    jsonb_build_object('contato_novo', true),
    NULL
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rastreamento_evento_contato_criado
  ON public.contatos;

CREATE TRIGGER rastreamento_evento_contato_criado
AFTER INSERT ON public.contatos
FOR EACH ROW EXECUTE FUNCTION public.rastreamento_evento_contato_criado();

CREATE OR REPLACE FUNCTION public.preparar_feedback_agendamento()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    NEW.inicio_at IS DISTINCT FROM OLD.inicio_at
    OR NEW.fim_at IS DISTINCT FROM OLD.fim_at
    OR NEW.agenda_id IS DISTINCT FROM OLD.agenda_id
  ) THEN
    NEW.feedback_elegivel_em := now();
    NEW.feedback_solicitado_em := NULL;
    NEW.feedback_respondido_em := NULL;
    NEW.feedback_resultado := NULL;
    NEW.feedback_respondido_por := NULL;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
    AND NEW.status IN ('realizado', 'faltou', 'cancelado')
  THEN
    NEW.feedback_respondido_em :=
      COALESCE(NEW.feedback_respondido_em, now());
    NEW.feedback_resultado := NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agenda_agendamentos_preparar_feedback
  ON public.agenda_agendamentos;

CREATE TRIGGER agenda_agendamentos_preparar_feedback
BEFORE UPDATE OF status, inicio_at, fim_at, agenda_id
ON public.agenda_agendamentos
FOR EACH ROW EXECUTE FUNCTION public.preparar_feedback_agendamento();

CREATE OR REPLACE FUNCTION public.rastreamento_evento_agendamento()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_chave_sufixo text;
BEGIN
  v_chave_sufixo := replace(
    extract(epoch FROM COALESCE(NEW.updated_at, now()))::text,
    '.',
    ''
  );

  IF TG_OP = 'INSERT' THEN
    PERFORM public.rastreamento_criar_evento(
      NEW.empresa_id,
      'agendamento_criado',
      NEW.contato_id,
      NEW.conversa_id,
      NULL,
      NULL,
      NULL,
      NULL,
      NEW.id,
      NULL,
      'agenda',
      'agendamento:' || NEW.id::text || ':criado',
      jsonb_build_object(
        'conversa_protocolo_id', NEW.conversa_protocolo_id,
        'status', NEW.status,
        'inicio_at', NEW.inicio_at,
        'fim_at', NEW.fim_at
      ),
      NEW.created_by
    );
  ELSE
    IF (
      NEW.inicio_at IS DISTINCT FROM OLD.inicio_at
      OR NEW.fim_at IS DISTINCT FROM OLD.fim_at
      OR NEW.agenda_id IS DISTINCT FROM OLD.agenda_id
    ) THEN
      PERFORM public.rastreamento_criar_evento(
        NEW.empresa_id,
        'agendamento_remarcado',
        NEW.contato_id,
        NEW.conversa_id,
        NULL,
        NULL,
        NULL,
        NULL,
        NEW.id,
        NULL,
        COALESCE(NEW.origem, 'agenda'),
        'agendamento:' || NEW.id::text || ':remarcado:' || v_chave_sufixo,
        jsonb_build_object(
          'conversa_protocolo_id', NEW.conversa_protocolo_id,
          'inicio_anterior', OLD.inicio_at,
          'fim_anterior', OLD.fim_at,
          'inicio_at', NEW.inicio_at,
          'fim_at', NEW.fim_at,
          'agenda_anterior_id', OLD.agenda_id,
          'agenda_id', NEW.agenda_id
        ),
        NEW.updated_by
      );
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status = 'confirmado' THEN
        PERFORM public.rastreamento_criar_evento(
          NEW.empresa_id,
          'agendamento_confirmado',
          NEW.contato_id,
          NEW.conversa_id,
          NULL, NULL, NULL, NULL,
          NEW.id,
          NULL,
          COALESCE(NEW.origem, 'agenda'),
          'agendamento:' || NEW.id::text || ':confirmado:' || v_chave_sufixo,
          jsonb_build_object(
            'conversa_protocolo_id', NEW.conversa_protocolo_id
          ),
          NEW.updated_by
        );
      ELSIF NEW.status = 'cancelado' THEN
        PERFORM public.rastreamento_criar_evento(
          NEW.empresa_id,
          'agendamento_cancelado',
          NEW.contato_id,
          NEW.conversa_id,
          NULL, NULL, NULL, NULL,
          NEW.id,
          NULL,
          COALESCE(NEW.origem, 'agenda'),
          'agendamento:' || NEW.id::text || ':cancelado:' || v_chave_sufixo,
          COALESCE(NEW.metadata_json, '{}'::jsonb)
            || jsonb_build_object(
              'conversa_protocolo_id', NEW.conversa_protocolo_id
            ),
          NEW.updated_by
        );
      ELSIF NEW.status = 'realizado' THEN
        PERFORM public.rastreamento_criar_evento(
          NEW.empresa_id,
          'agendamento_realizado',
          NEW.contato_id,
          NEW.conversa_id,
          NULL, NULL, NULL, NULL,
          NEW.id,
          NULL,
          COALESCE(NEW.origem, 'agenda'),
          'agendamento:' || NEW.id::text || ':realizado:' || v_chave_sufixo,
          jsonb_build_object(
            'conversa_protocolo_id', NEW.conversa_protocolo_id
          ),
          NEW.updated_by
        );
      ELSIF NEW.status = 'faltou' THEN
        PERFORM public.rastreamento_criar_evento(
          NEW.empresa_id,
          'agendamento_faltou',
          NEW.contato_id,
          NEW.conversa_id,
          NULL, NULL, NULL, NULL,
          NEW.id,
          NULL,
          COALESCE(NEW.origem, 'agenda'),
          'agendamento:' || NEW.id::text || ':faltou:' || v_chave_sufixo,
          jsonb_build_object(
            'conversa_protocolo_id', NEW.conversa_protocolo_id
          ),
          NEW.updated_by
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rastreamento_evento_agendamento
  ON public.agenda_agendamentos;

CREATE TRIGGER rastreamento_evento_agendamento
AFTER INSERT OR UPDATE OF status, inicio_at, fim_at, agenda_id
ON public.agenda_agendamentos
FOR EACH ROW EXECUTE FUNCTION public.rastreamento_evento_agendamento();

CREATE OR REPLACE FUNCTION public.processar_feedbacks_agendamentos_pendentes(
  p_limite integer DEFAULT 100
)
RETURNS TABLE (
  agendamento_id uuid,
  empresa_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item record;
  v_atualizado uuid;
BEGIN
  FOR v_item IN
    SELECT
      aa.id,
      aa.empresa_id,
      aa.contato_id,
      aa.conversa_id,
      aa.agenda_id,
      aa.nome_cliente,
      aa.inicio_at,
      aa.fim_at,
      COALESCE(ct.nome, aa.nome_cliente, 'Contato') AS contato_nome,
      ac.nome AS agenda_nome
    FROM public.agenda_agendamentos aa
    LEFT JOIN public.contatos ct ON ct.id = aa.contato_id
    LEFT JOIN public.agenda_calendarios ac ON ac.id = aa.agenda_id
    WHERE aa.status IN ('agendado', 'confirmado')
      AND aa.feedback_solicitado_em IS NULL
      AND aa.feedback_respondido_em IS NULL
      AND aa.fim_at + interval '30 minutes' <= now()
      AND aa.fim_at >= aa.feedback_elegivel_em
    ORDER BY aa.fim_at, aa.id
    LIMIT LEAST(GREATEST(COALESCE(p_limite, 100), 1), 500)
    FOR UPDATE OF aa SKIP LOCKED
  LOOP
    v_atualizado := NULL;

    UPDATE public.agenda_agendamentos aa
    SET
      feedback_solicitado_em = now(),
      updated_at = now()
    WHERE aa.id = v_item.id
      AND aa.empresa_id = v_item.empresa_id
      AND aa.status IN ('agendado', 'confirmado')
      AND aa.feedback_solicitado_em IS NULL
      AND aa.feedback_respondido_em IS NULL
    RETURNING aa.id INTO v_atualizado;

    IF v_atualizado IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.notificacoes (
      empresa_id,
      conversa_id,
      contato_id,
      tipo,
      titulo,
      mensagem,
      lida,
      metadata_json
    )
    VALUES (
      v_item.empresa_id,
      v_item.conversa_id,
      v_item.contato_id,
      'automacao',
      'Confirme o resultado do agendamento',
      format(
        'O agendamento de %s na agenda %s terminou. Informe se foi realizado.',
        v_item.contato_nome,
        COALESCE(v_item.agenda_nome, 'Agenda')
      ),
      false,
      jsonb_build_object(
        'tipo_notificacao', 'feedback_agendamento',
        'agenda_agendamento_id', v_item.id,
        'agenda_id', v_item.agenda_id,
        'href', '/agendas?feedback=pendentes',
        'inicio_at', v_item.inicio_at,
        'fim_at', v_item.fim_at
      )
    );

    agendamento_id := v_item.id;
    empresa_id := v_item.empresa_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public.processar_feedbacks_agendamentos_pendentes(integer)
FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION
      public.processar_feedbacks_agendamentos_pendentes(integer)
    FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON FUNCTION
      public.processar_feedbacks_agendamentos_pendentes(integer)
    FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION
      public.processar_feedbacks_agendamentos_pendentes(integer)
    TO service_role;
  END IF;
END
$$;

-- Vincula dados historicos existentes aos protocolos.
UPDATE public.conversa_protocolos cp
SET
  contato_id = c.contato_id,
  contato_novo_no_inicio = public.contato_eh_novo(
    ct.created_at,
    COALESCE(cp.started_at, cp.created_at)
  ),
  iniciado_com_bot = EXISTS (
    SELECT 1
    FROM public.automacao_execucoes ae
    WHERE ae.empresa_id = cp.empresa_id
      AND ae.conversa_protocolo_id = cp.id
      AND ae.created_at <=
        COALESCE(cp.started_at, cp.created_at) + interval '5 minutes'
  )
FROM public.conversas c
LEFT JOIN public.contatos ct ON ct.id = c.contato_id
WHERE c.id = cp.conversa_id
  AND c.empresa_id = cp.empresa_id;

UPDATE public.rastreamento_eventos e
SET conversa_protocolo_id = aa.conversa_protocolo_id
FROM public.agenda_agendamentos aa
WHERE e.conversa_protocolo_id IS NULL
  AND e.agendamento_id = aa.id
  AND e.empresa_id = aa.empresa_id
  AND aa.conversa_protocolo_id IS NOT NULL;

UPDATE public.rastreamento_eventos e
SET conversa_protocolo_id = (
  SELECT protocolo.id
  FROM public.conversa_protocolos protocolo
  WHERE protocolo.empresa_id = e.empresa_id
    AND protocolo.conversa_id = e.conversa_id
    AND COALESCE(protocolo.started_at, protocolo.created_at) <= e.ocorrido_em
    AND (
      protocolo.closed_at IS NULL
      OR protocolo.closed_at >= e.ocorrido_em
    )
  ORDER BY COALESCE(protocolo.started_at, protocolo.created_at) DESC
  LIMIT 1
)
WHERE e.conversa_protocolo_id IS NULL
  AND e.conversa_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.conversa_protocolos protocolo
    WHERE protocolo.empresa_id = e.empresa_id
      AND protocolo.conversa_id = e.conversa_id
      AND COALESCE(protocolo.started_at, protocolo.created_at) <= e.ocorrido_em
      AND (
        protocolo.closed_at IS NULL
        OR protocolo.closed_at >= e.ocorrido_em
      )
  );

INSERT INTO public.rastreamento_eventos (
  empresa_id,
  tipo,
  contato_id,
  conversa_id,
  conversa_protocolo_id,
  origem_id,
  campanha_id,
  link_id,
  clique_id,
  origem_registro,
  idempotency_key,
  metadata_json,
  ocorrido_em
)
SELECT
  cp.empresa_id,
  'protocolo_iniciado',
  cp.contato_id,
  cp.conversa_id,
  cp.id,
  ct.rastreamento_origem_id,
  ct.rastreamento_campanha_id,
  ct.rastreamento_link_id,
  ct.rastreamento_clique_id,
  'migracao',
  'protocolo:' || cp.id::text || ':iniciado',
  jsonb_build_object(
    'conversa_protocolo_id', cp.id,
    'protocolo', cp.protocolo,
    'tipo_protocolo', cp.tipo,
    'contato_novo_no_inicio', cp.contato_novo_no_inicio,
    'iniciado_com_bot', cp.iniciado_com_bot,
    'migrado', true
  ),
  COALESCE(cp.started_at, cp.created_at)
FROM public.conversa_protocolos cp
LEFT JOIN public.contatos ct ON ct.id = cp.contato_id
ON CONFLICT (idempotency_key)
WHERE idempotency_key IS NOT NULL
DO NOTHING;

INSERT INTO public.rastreamento_eventos (
  empresa_id,
  tipo,
  contato_id,
  conversa_id,
  conversa_protocolo_id,
  origem_id,
  campanha_id,
  link_id,
  clique_id,
  origem_registro,
  idempotency_key,
  metadata_json,
  ocorrido_em
)
SELECT
  ct.empresa_id,
  CASE
    WHEN ct.status_lead = 'cliente' THEN 'venda_realizada'
    WHEN ct.status_lead = 'perdido' THEN 'venda_perdida'
    ELSE 'lead_qualificado'
  END,
  ct.id,
  cp.conversa_id,
  cp.id,
  ct.rastreamento_origem_id,
  ct.rastreamento_campanha_id,
  ct.rastreamento_link_id,
  ct.rastreamento_clique_id,
  'migracao',
  'contato:' || ct.id::text || ':classificacao_legada',
  jsonb_build_object(
    'conversa_protocolo_id', cp.id,
    'status_lead_anterior', ct.status_lead,
    'migrado', true
  ),
  COALESCE(ct.updated_at, ct.created_at, now())
FROM public.contatos ct
LEFT JOIN LATERAL (
  SELECT protocolo.id, protocolo.conversa_id
  FROM public.conversa_protocolos protocolo
  WHERE protocolo.contato_id = ct.id
  ORDER BY
    COALESCE(protocolo.started_at, protocolo.created_at) DESC,
    protocolo.created_at DESC
  LIMIT 1
) cp ON true
WHERE ct.status_lead IN ('qualificado', 'cliente', 'perdido')
ON CONFLICT (idempotency_key)
WHERE idempotency_key IS NOT NULL
DO NOTHING;

DO $$
DECLARE
  protocolo_item record;
  contato_item record;
BEGIN
  FOR protocolo_item IN
    SELECT id FROM public.conversa_protocolos
  LOOP
    PERFORM public.recalcular_resultado_protocolo(protocolo_item.id);
  END LOOP;

  FOR contato_item IN
    SELECT id FROM public.contatos
  LOOP
    PERFORM public.recalcular_classificacao_contato(contato_item.id);
  END LOOP;
END
$$;

CREATE OR REPLACE VIEW public.contatos_visao_operacional
WITH (security_invoker = true)
AS
SELECT
  ct.id,
  ct.empresa_id,
  ct.nome,
  ct.whatsapp_profile_name,
  ct.telefone,
  ct.email,
  ct.origem,
  ct.campanha,
  ct.rastreamento_origem_id,
  ct.rastreamento_campanha_id,
  ct.rastreamento_link_id,
  ct.rastreamento_clique_id,
  ct.observacoes,
  ct.telefone_revisar,
  ct.classificacao,
  ct.classificacao_atualizada_em,
  ct.classificacao_evento_id,
  ct.classificacao_protocolo_id,
  ct.created_at,
  ct.updated_at,
  public.contato_eh_novo(ct.created_at) AS contato_novo,
  COALESCE(rc.nome, ct.campanha) AS campanha_exibicao,
  rc.status AS campanha_status,
  ro.nome AS campanha_origem_nome,
  cv.id AS conversa_id,
  cv.status AS conversa_status,
  cv.last_message_at AS conversa_ultima_mensagem_em,
  cv.closed_at AS conversa_encerrada_em,
  cp.protocolo AS protocolo_atual,
  cp.resultado AS protocolo_resultado,
  cp.contato_novo_no_inicio,
  cp.iniciado_com_bot,
  cp.finalizado_com_bot,
  cp.finalizado_por_tipo,
  cp.finalizado_por_usuario_id,
  usuario_finalizador.nome AS finalizado_por_usuario_nome
FROM public.contatos ct
LEFT JOIN public.rastreamento_campanhas rc
  ON rc.id = ct.rastreamento_campanha_id
LEFT JOIN public.rastreamento_origens ro
  ON ro.id = rc.origem_id
LEFT JOIN LATERAL (
  SELECT conversa.*
  FROM public.conversas conversa
  WHERE conversa.empresa_id = ct.empresa_id
    AND conversa.contato_id = ct.id
  ORDER BY
    CASE
      WHEN conversa.status IN (
        'aberta',
        'bot',
        'fila',
        'em_atendimento',
        'aguardando_cliente'
      ) THEN 0
      ELSE 1
    END,
    conversa.last_message_at DESC NULLS LAST,
    conversa.created_at DESC
  LIMIT 1
) cv ON true
LEFT JOIN LATERAL (
  SELECT protocolo.*
  FROM public.conversa_protocolos protocolo
  WHERE protocolo.empresa_id = ct.empresa_id
    AND protocolo.contato_id = ct.id
  ORDER BY
    COALESCE(protocolo.started_at, protocolo.created_at) DESC,
    protocolo.created_at DESC
  LIMIT 1
) cp ON true
LEFT JOIN public.usuarios usuario_finalizador
  ON usuario_finalizador.id = cp.finalizado_por_usuario_id;

CREATE OR REPLACE VIEW public.relatorio_protocolos_contatos
WITH (security_invoker = true)
AS
SELECT
  cp.id AS protocolo_id,
  cp.empresa_id,
  cp.contato_id,
  cp.conversa_id,
  cp.protocolo,
  cp.tipo,
  cp.started_at,
  cp.closed_at,
  cp.resultado,
  cp.resultado_em,
  cp.valor_convertido,
  cp.contato_novo_no_inicio,
  cp.iniciado_com_bot,
  cp.finalizado_com_bot,
  cp.finalizado_por_tipo,
  cp.finalizado_por_usuario_id,
  usuario_finalizador.nome AS finalizado_por_usuario_nome,
  cp.motivo_encerramento,
  ct.nome AS contato_nome,
  ct.telefone AS contato_telefone,
  COUNT(e.id) FILTER (
    WHERE public.rastreamento_classificacao_evento(
      e.tipo,
      e.metadata_json
    ) = 'convertido'
  ) AS total_eventos_conversao,
  COUNT(e.id) FILTER (
    WHERE public.rastreamento_classificacao_evento(
      e.tipo,
      e.metadata_json
    ) = 'perdido'
  ) AS total_eventos_perda
FROM public.conversa_protocolos cp
LEFT JOIN public.contatos ct ON ct.id = cp.contato_id
LEFT JOIN public.usuarios usuario_finalizador
  ON usuario_finalizador.id = cp.finalizado_por_usuario_id
LEFT JOIN public.rastreamento_eventos e
  ON e.conversa_protocolo_id = cp.id
GROUP BY
  cp.id,
  usuario_finalizador.nome,
  ct.nome,
  ct.telefone;
