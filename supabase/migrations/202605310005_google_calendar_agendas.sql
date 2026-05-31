-- Integracao das agendas comerciais com o Google Calendar.

CREATE TABLE IF NOT EXISTS public.agenda_google_integracoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  agenda_id uuid NOT NULL REFERENCES public.agenda_calendarios(id) ON DELETE CASCADE,
  conectado_por uuid REFERENCES public.usuarios(id),
  google_email text,
  google_calendar_id text NOT NULL DEFAULT 'primary',
  refresh_token_encrypted text NOT NULL,
  sync_ativo boolean NOT NULL DEFAULT true,
  conectado_em timestamp with time zone NOT NULL DEFAULT now(),
  ultima_sincronizacao_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT agenda_google_integracoes_pkey PRIMARY KEY (id),
  CONSTRAINT agenda_google_integracoes_agenda_unique UNIQUE (agenda_id)
);

CREATE TABLE IF NOT EXISTS public.agenda_google_eventos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  agenda_id uuid NOT NULL REFERENCES public.agenda_calendarios(id) ON DELETE CASCADE,
  agendamento_id uuid NOT NULL REFERENCES public.agenda_agendamentos(id) ON DELETE CASCADE,
  integracao_id uuid NOT NULL REFERENCES public.agenda_google_integracoes(id) ON DELETE CASCADE,
  google_event_id text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT agenda_google_eventos_pkey PRIMARY KEY (id),
  CONSTRAINT agenda_google_eventos_agendamento_unique UNIQUE (agendamento_id)
);

CREATE INDEX IF NOT EXISTS agenda_google_integracoes_empresa_idx
  ON public.agenda_google_integracoes (empresa_id, agenda_id);

CREATE INDEX IF NOT EXISTS agenda_google_eventos_agenda_idx
  ON public.agenda_google_eventos (agenda_id, agendamento_id);
